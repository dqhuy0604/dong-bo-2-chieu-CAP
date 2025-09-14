import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { REDIS_CLIENT } from '../../../libs/shared/src';
import Redis from 'ioredis';
import { OutboxEventDocument } from './outbox.schema';

export interface OutboxEvent {
    _id?: string;
    eventId: string;
    entity: string;
    op: 'create' | 'update' | 'delete';
    id: string;
    data: any;
    updatedAt: number;
    version: number;
    source: 'mongo' | 'redis';
    status: 'pending' | 'sent' | 'failed';
    retryCount: number;
    createdAt: Date;
    lastAttemptAt?: Date;
}

@Injectable()
export class OutboxService {
    private readonly logger = new Logger(OutboxService.name);
    private readonly streamKey = 'mongo_changes';
    private readonly maxRetries = 5;
    private readonly retryDelay = 5000;

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        @InjectModel('OutboxEvent') private readonly outboxModel: Model<OutboxEventDocument>,
    ) { }

    async saveEvent(event: Omit<OutboxEvent, '_id' | 'createdAt' | 'status' | 'retryCount'>): Promise<void> {
        try {
            const outboxEvent = new this.outboxModel({
                ...event,
                status: 'pending',
                retryCount: 0,
                createdAt: new Date(),
            });

            await outboxEvent.save();
            this.logger.debug(`Saved event to outbox: ${event.eventId}`);
        } catch (error) {
            this.logger.error('Failed to save event to outbox', error);
        }
    }

    async processOutbox(): Promise<void> {
        try {
            const pendingEvents = await this.outboxModel.find({
                status: { $in: ['pending', 'failed'] },
                retryCount: { $lt: this.maxRetries }
            }).sort({ createdAt: 1 }).limit(100);

            this.logger.debug(`Processing ${pendingEvents.length} outbox events`);

            for (const event of pendingEvents) {
                try {
                    await this.sendEventToRedis(event);

                    await this.outboxModel.updateOne(
                        { _id: event._id },
                        {
                            status: 'sent',
                            lastAttemptAt: new Date()
                        }
                    );

                    this.logger.debug(`Successfully sent outbox event: ${event.eventId}`);
                } catch (error) {
                    const newRetryCount = event.retryCount + 1;
                    const status = newRetryCount >= this.maxRetries ? 'failed' : 'failed';

                    await this.outboxModel.updateOne(
                        { _id: event._id },
                        {
                            retryCount: newRetryCount,
                            status: status,
                            lastAttemptAt: new Date()
                        }
                    );

                    this.logger.warn(`Failed to send outbox event ${event.eventId}, retry ${newRetryCount}/${this.maxRetries}`, error);
                }
            }
        } catch (error) {
            this.logger.error('Failed to process outbox', error);
        }
    }

    private async sendEventToRedis(event: OutboxEventDocument): Promise<void> {
        const eventData = {
            eventId: event.eventId,
            entity: event.entity,
            op: event.op,
            id: event.id,
            data: event.data,
            updatedAt: event.updatedAt,
            version: event.version,
            source: event.source,
        };

        await this.redis.xadd(
            this.streamKey,
            '*',
            'payload',
            JSON.stringify(eventData),
            'MAXLEN',
            '~100000'
        );
    }

    async cleanupSentEvents(): Promise<void> {
        try {
            const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const result = await this.outboxModel.deleteMany({
                status: 'sent',
                lastAttemptAt: { $lt: cutoffDate }
            });

            if (result.deletedCount > 0) {
                this.logger.debug(`Cleaned up ${result.deletedCount} sent outbox events`);
            }
        } catch (error) {
            this.logger.error('Failed to cleanup sent events', error);
        }
    }

    async getOutboxStats(): Promise<any> {
        try {
            const stats = await this.outboxModel.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            return {
                total: await this.outboxModel.countDocuments(),
                byStatus: stats.reduce((acc, stat) => {
                    acc[stat._id] = stat.count;
                    return acc;
                }, {}),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Failed to get outbox stats', error);
            return { total: 0, byStatus: {}, error: error.message };
        }
    }
}
