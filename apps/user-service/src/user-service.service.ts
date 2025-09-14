import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { OutboxEvent, OutboxEventDocument } from './outbox.schema';
import { REDIS_CLIENT } from '../../../libs/shared/src';
import Redis from 'ioredis';
import { ResumeTokenService } from './resume-token.service';
import { OutboxService } from './outbox.service';

interface UpsertUserDto {
  email: string;
  name: string;
}

@Injectable()
export class UserServiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserServiceService.name);
  private changeStream: any = null;
  private isConnected = false;
  private retryCount = 0;
  private readonly maxRetries = 10;
  private readonly retryDelay = 5000; // 5 seconds
  private connectionCheckInterval: NodeJS.Timeout | null = null;

  private resumeTokenService: ResumeTokenService;
  private outboxService: OutboxService;
  private outboxProcessingInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(OutboxEvent.name) private readonly outboxModel: Model<OutboxEventDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.resumeTokenService = new ResumeTokenService(redis);
    this.outboxService = new OutboxService(redis, this.outboxModel);
  }

  async onModuleInit() {
    this.logger.log('User service starting without waiting for MongoDB...');

    this.startConnectionMonitoring();

    this.startOutboxProcessing();

    this.waitForMongoConnection().then(() => {
      this.startChangeStream();
    }).catch(err => {
      this.logger.warn('Initial MongoDB connection failed, will retry via monitoring', err);
    });
  }

  private async waitForMongoConnection() {
    this.logger.log('Waiting for MongoDB connection...');

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        await Promise.race([
          this.userModel.db.db.command({ ping: 1 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
        this.isConnected = true;
        this.logger.log('MongoDB connection established');
        return;
      } catch (error) {
        this.logger.warn(`MongoDB connection attempt ${i + 1}/${this.maxRetries} failed: ${error.message}`);
        if (i < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    this.logger.warn('Failed to connect to MongoDB after maximum retries, continuing without MongoDB');
    this.isConnected = false;
  }

  async upsertUserMongoFirst(dto: UpsertUserDto) {
    const now = Date.now();

    try {
      const doc = await this.userModel.findOneAndUpdate(
        { email: dto.email },
        {
          $set: {
            name: dto.name,
            updatedAt: now,
            source: 'mongo',
          },
          $inc: { version: 1 },
        },
        { upsert: true, new: true },
      );
      return doc;
    } catch (error) {
      this.logger.warn('MongoDB not available - storing data in Redis only');
      return {
        email: dto.email,
        name: dto.name,
        source: 'redis',
        updatedAt: now,
        version: 1
      };
    }
  }

  private async startChangeStream() {
    try {
      const conn = this.userModel.db;
      const collection = conn.collection('users');

      const resumeToken = await this.resumeTokenService.getResumeToken();
      const watchOptions: any = { fullDocument: 'updateLookup' };
      if (resumeToken) {
        watchOptions.resumeAfter = resumeToken;
        this.logger.log('Resuming change stream from token');
      }

      this.changeStream = collection.watch([], watchOptions);
      this.logger.log('Mongo change stream started for users');

      this.changeStream.on('change', async (change: any) => {
        try {
          if (change._id) {
            await this.resumeTokenService.saveResumeToken(change._id);
          }

          if (!change.fullDocument) return;
          const user = change.fullDocument as User;
          const event = {
            eventId: `mongo:${user.email}:${user.version}`,
            entity: 'user',
            op: (change.operationType === 'delete' ? 'delete' : 'update') as 'create' | 'update' | 'delete',
            id: user.email,
            data: change.operationType === 'delete' ? null : user,
            updatedAt: user.updatedAt,
            version: user.version,
            source: 'mongo' as 'mongo' | 'redis',
          };

          try {
            await this.redis.xadd(
              'mongo_changes',
              '*',
              'payload',
              JSON.stringify(event),
              'MAXLEN',
              '~100000'
            );
            this.logger.debug(`Emitted mongo_changes ${event.eventId}`);
          } catch (redisError) {
            this.logger.warn('Redis unavailable, saving to outbox', redisError);
            await this.outboxService.saveEvent(event);
          }
        } catch (err) {
          this.logger.error('Failed to emit mongo change', err as Error);
        }
      });

      this.changeStream.on('error', async (error: any) => {
        this.logger.error('Change stream error:', error);
        this.isConnected = false;
        this.retryCount++;

        if (this.retryCount < this.maxRetries) {
          this.logger.log(`Retrying change stream in ${this.retryDelay}ms...`);
          setTimeout(() => {
            this.startChangeStream().catch(err =>
              this.logger.error('Failed to restart change stream', err)
            );
          }, this.retryDelay);
        } else {
          this.logger.error('Max retries reached for change stream');
        }
      });

      this.changeStream.on('close', () => {
        this.logger.warn('Change stream closed');
        this.isConnected = false;
      });

    } catch (error) {
      this.logger.error('Failed to start change stream:', error);
      this.isConnected = false;
    }
  }

  private startConnectionMonitoring() {
    this.connectionCheckInterval = setInterval(async () => {
      if (!this.isConnected) {
        this.logger.log('Connection monitoring: Attempting to reconnect to MongoDB...');
        try {
          await this.waitForMongoConnection();
          await this.startChangeStream();
          this.logger.log('Connection monitoring: Successfully reconnected to MongoDB');

          await this.triggerFullSyncAfterReconnect();
        } catch (error) {
          this.logger.warn('Connection monitoring: Failed to reconnect to MongoDB', error);
        }
      } else {
        try {
          await this.userModel.db.db.command({ ping: 1 });
        } catch (error) {
          this.logger.warn('Connection monitoring: MongoDB connection lost', error);
          this.isConnected = false;
        }
      }
    }, 30000);
  }

  private async triggerFullSyncAfterReconnect() {
    try {
      this.logger.log('Triggering full sync after MongoDB reconnection...');

      const syncServiceUrl = process.env.SYNC_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${syncServiceUrl}/full-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const result = await response.json();
        this.logger.log('Full sync after reconnection completed', result);
      } else {
        this.logger.warn('Failed to trigger full sync after reconnection');
      }
    } catch (error) {
      this.logger.warn('Error triggering full sync after reconnection', error);
    }
  }

  private startOutboxProcessing() {
    this.outboxProcessingInterval = setInterval(async () => {
      try {
        await this.outboxService.processOutbox();
        await this.outboxService.cleanupSentEvents();
      } catch (error) {
        this.logger.error('Outbox processing failed', error);
      }
    }, 10000);
  }

  async onModuleDestroy() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    if (this.outboxProcessingInterval) {
      clearInterval(this.outboxProcessingInterval);
    }
    if (this.changeStream) {
      this.changeStream.close();
    }
  }
}