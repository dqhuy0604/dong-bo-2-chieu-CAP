import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { REDIS_CLIENT } from '../../../libs/shared/src';
import Redis from 'ioredis';
import { RedisToMongoConsumer } from './redis-to-mongo.consumer';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../user-service/src/user.schema';

interface ChangeEvent {
  eventId: string;
  entity: 'user';
  op: 'create' | 'update' | 'delete';
  id: string; // email
  data: any | null;
  updatedAt: number;
  version: number;
  source: 'mongo' | 'redis';
}

@Injectable()
export class SyncServiceService implements OnModuleInit {
  private readonly logger = new Logger(SyncServiceService.name);
  private readonly streamKey = 'mongo_changes';
  private readonly consumerGroup = 'sync_service_group';
  private readonly consumerName = `consumer_${Math.random().toString(36).slice(2, 8)}`;
  private readonly processedSet = 'processed_events';

  private processedCount = 0;
  private conflictCount = 0;
  private retryCount = 0;

  private r2m: RedisToMongoConsumer;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    this.r2m = new RedisToMongoConsumer(redis, this.userModel);
  }

  getMetrics() {
    return {
      stream: this.streamKey,
      processed: this.processedCount,
      conflicts: this.conflictCount,
      retries: this.retryCount,
      r2m: this.r2m.getMetrics(),
    };
  }

  async onModuleInit() {
    await this.ensureGroup();
    await this.r2m.ensureGroup();
    this.poll().catch((err) => this.logger.error('Poll loop error', err as Error));
    this.r2m.poll().catch((err) => this.logger.error('R2M poll error', err as Error));
  }

  private async ensureGroup() {
    try {
      await this.redis.xgroup('CREATE', this.streamKey, this.consumerGroup, '$', 'MKSTREAM');
      this.logger.log(`Consumer group created: ${this.consumerGroup}`);
    } catch (err: any) {
      if (String(err?.message || '').includes('BUSYGROUP')) {
        this.logger.log(`Consumer group exists: ${this.consumerGroup}`);
      } else {
        this.logger.error('Failed to create consumer group', err as Error);
      }
    }
  }

  private async poll() {
    this.logger.log(`Start polling ${this.streamKey} as ${this.consumerName}`);
    for (; ;) {
      try {
        const res = await this.redis.xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          5000,
          'STREAMS',
          this.streamKey,
          '>',
        );
        if (!res) continue;
        for (const [, entries] of res as any[]) {
          for (const [entryId, fields] of entries) {
            await this.handleEntry(entryId, fields);
          }
        }
      } catch (err) {
        this.logger.error('xreadgroup error', err as Error);
      }
    }
  }

  private async handleEntry(entryId: string, fields: any[]) {
    try {
      const obj = this.parsePayload(fields);
      if (!obj) {
        await this.redis.xack(this.streamKey, this.consumerGroup, entryId);
        return;
      }
      const event = obj as ChangeEvent;

      const processed = await this.redis.sismember(this.processedSet, event.eventId);
      if (processed) {
        await this.redis.xack(this.streamKey, this.consumerGroup, entryId);
        return;
      }

      const key = `user:${event.id}`;
      const currentRaw = await this.redis.get(key);
      if (event.op === 'delete') {
        await this.redis.del(key);
      } else {
        const incoming = event.data;
        let shouldApply = true;
        if (currentRaw) {
          const current = JSON.parse(currentRaw);
          if (current.updatedAt > incoming.updatedAt) shouldApply = false;
          else if (current.updatedAt === incoming.updatedAt) {
            if (current.source === 'mongo' && incoming.source !== 'mongo') shouldApply = false;
            if (!shouldApply) this.conflictCount++;
          }
        }
        if (shouldApply) {
          await this.redis.set(key, JSON.stringify(incoming));
        }
      }

      await this.redis.sadd(this.processedSet, event.eventId);
      await this.redis.expire(this.processedSet, 7 * 24 * 3600);
      await this.redis.xack(this.streamKey, this.consumerGroup, entryId);
      this.processedCount++;
    } catch (err) {
      this.logger.error(`Failed to handle entry ${entryId}`, err as Error);
      this.retryCount++;
    }
  }

  private parsePayload(fields: any[]): ChangeEvent | null {
    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] === 'payload') {
        try {
          return JSON.parse(fields[i + 1]);
        } catch { }
      }
    }
    return null;
  }
}
