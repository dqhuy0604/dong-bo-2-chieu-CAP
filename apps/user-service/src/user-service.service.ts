import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { REDIS_CLIENT } from 'rms/shared';
import Redis from 'ioredis';

interface UpsertUserDto {
  email: string;
  name: string;
}

@Injectable()
export class UserServiceService implements OnModuleInit {
  private readonly logger = new Logger(UserServiceService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) { }

  async onModuleInit() {
    this.startChangeStream().catch((err) =>
      this.logger.error('Change stream failed to start', err as Error),
    );
  }

  async upsertUserMongoFirst(dto: UpsertUserDto) {
    const now = Date.now();
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
  }

  private async startChangeStream() {
    const conn = this.userModel.db;
    const collection = conn.collection('users');
    const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
    this.logger.log('Mongo change stream started for users');
    changeStream.on('change', async (change: any) => {
      try {
        if (!change.fullDocument) return;
        const user = change.fullDocument as User;
        const event = {
          eventId: `mongo:${user.email}:${user.version}`,
          entity: 'user',
          op: change.operationType === 'delete' ? 'delete' : 'update',
          id: user.email,
          data: change.operationType === 'delete' ? null : user,
          updatedAt: user.updatedAt,
          version: user.version,
          source: 'mongo',
        };
        await this.redis.xadd(
          'mongo_changes',
          '*',
          'payload',
          JSON.stringify(event),
        );
        this.logger.debug(`Emitted mongo_changes ${event.eventId}`);
      } catch (err) {
        this.logger.error('Failed to emit mongo change', err as Error);
      }
    });
  }
}
