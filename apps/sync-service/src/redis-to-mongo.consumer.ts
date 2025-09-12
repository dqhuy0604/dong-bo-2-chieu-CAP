import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { REDIS_CLIENT } from 'rms/shared';
import Redis from 'ioredis';
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

export class RedisToMongoConsumer {
    private readonly logger = new Logger(RedisToMongoConsumer.name);
    private readonly streamKey = 'redis_changes';
    private readonly consumerGroup = 'sync_service_group_r2m';
    private readonly consumerName = `consumer_${Math.random().toString(36).slice(2, 8)}`;
    private readonly processedSet = 'processed_events';

    private processedCount = 0;
    private conflictCount = 0;
    private retryCount = 0;

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    ) { }

    getMetrics() {
        return {
            stream: this.streamKey,
            processed: this.processedCount,
            conflicts: this.conflictCount,
            retries: this.retryCount,
        };
    }

    async ensureGroup() {
        try {
            await this.redis.xgroup('CREATE', this.streamKey, this.consumerGroup, '$', 'MKSTREAM');
        } catch (err: any) {
            if (!String(err?.message || '').includes('BUSYGROUP')) {
                this.logger.error('Failed to create consumer group', err as Error);
            }
        }
    }

    async poll() {
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
            const event = this.parsePayload(fields);
            if (!event) {
                await this.redis.xack(this.streamKey, this.consumerGroup, entryId);
                return;
            }

            const processed = await this.redis.sismember(this.processedSet, event.eventId);
            if (processed) {
                await this.redis.xack(this.streamKey, this.consumerGroup, entryId);
                return;
            }

            if (event.op === 'delete') {
                await this.userModel.deleteOne({ email: event.id });
            } else if (event.data) {
                const current = await this.userModel.findOne({ email: event.id }).lean();
                let shouldApply = true;
                if (current) {
                    if (current.updatedAt > event.updatedAt) shouldApply = false;
                    else if (current.updatedAt === event.updatedAt) {
                        // tiebreaker: prefer mongo → reject equal
                        shouldApply = false;
                        this.conflictCount++;
                    }
                }
                if (shouldApply) {
                    await this.userModel.updateOne(
                        { email: event.id },
                        {
                            $set: {
                                name: event.data.name,
                                updatedAt: event.updatedAt,
                                source: 'redis',
                            },
                            $inc: { version: 1 },
                        },
                        { upsert: true },
                    );
                }
            }

            await this.redis.sadd(this.processedSet, event.eventId);
            await this.redis.expire(this.processedSet, 7 * 24 * 3600);
            await this.redis.xack(this.streamKey, this.consumerGroup, entryId);
            this.processedCount++;
        } catch (err) {
            this.logger.error(`Failed to handle entry ${entryId}`, err as Error);
            this.retryCount++;
            // Do not ack on failure; it will remain pending for retry
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
