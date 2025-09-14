import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { REDIS_CLIENT } from '../../../libs/shared/src';
import Redis from 'ioredis';
import { User, UserDocument } from '../../user-service/src/user.schema';

@Injectable()
export class FullSyncService {
    private readonly logger = new Logger(FullSyncService.name);

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    ) { }

    async syncMongoToRedis(): Promise<void> {
        this.logger.log('Starting full sync: MongoDB → Redis');

        try {
            const mongoUsers = await this.userModel.find({}).lean();
            this.logger.log(`Found ${mongoUsers.length} users in MongoDB`);

            for (const user of mongoUsers) {
                const key = `user:${user.email}`;
                const redisData = {
                    email: user.email,
                    name: user.name,
                    updatedAt: user.updatedAt,
                    version: user.version,
                    source: 'mongo'
                };

                await this.redis.set(key, JSON.stringify(redisData));
                this.logger.debug(`Synced user ${user.email} to Redis`);
            }

            this.logger.log('Full sync MongoDB → Redis completed');
        } catch (error) {
            this.logger.error('Failed to sync MongoDB to Redis', error);
            throw error;
        }
    }

    async syncRedisToMongo(): Promise<void> {
        this.logger.log('Starting full sync: Redis → MongoDB');

        try {
            const keys = await this.redis.keys('user:*');
            this.logger.log(`Found ${keys.length} users in Redis`);

            for (const key of keys) {
                const userData = await this.redis.get(key);
                if (!userData) continue;

                try {
                    const user = JSON.parse(userData);
                    if (user.email) {
                        await this.userModel.updateOne(
                            { email: user.email },
                            {
                                $set: {
                                    name: user.name,
                                    updatedAt: user.updatedAt,
                                    source: 'redis',
                                },
                                $inc: { version: 1 },
                            },
                            { upsert: true }
                        );
                        this.logger.debug(`Synced user ${user.email} to MongoDB`);
                    }
                } catch (parseError) {
                    this.logger.warn(`Failed to parse user data for key ${key}`, parseError);
                }
            }

            this.logger.log('Full sync Redis → MongoDB completed');
        } catch (error) {
            this.logger.error('Failed to sync Redis to MongoDB', error);
            throw error;
        }
    }

    async checkAndSyncData(): Promise<void> {
        this.logger.log('Starting data consistency check and sync');

        try {
            const mongoUsers = await this.userModel.find({}).lean();
            const redisKeys = await this.redis.keys('user:*');

            this.logger.log(`MongoDB: ${mongoUsers.length} users, Redis: ${redisKeys.length} users`);

            const mongoMap = new Map();
            const redisMap = new Map();

            for (const user of mongoUsers) {
                mongoMap.set(user.email, {
                    email: user.email,
                    name: user.name,
                    updatedAt: user.updatedAt,
                    version: user.version,
                    source: 'mongo'
                });
            }

            for (const key of redisKeys) {
                const userData = await this.redis.get(key);
                if (userData) {
                    try {
                        const user = JSON.parse(userData);
                        if (user.email) {
                            redisMap.set(user.email, user);
                        }
                    } catch (parseError) {
                        this.logger.warn(`Failed to parse Redis data for key ${key}`);
                    }
                }
            }

            let syncCount = 0;

            for (const [email, mongoUser] of mongoMap) {
                const redisUser = redisMap.get(email);
                if (!redisUser) {
                    const key = `user:${email}`;
                    await this.redis.set(key, JSON.stringify(mongoUser));
                    this.logger.debug(`Added missing user ${email} to Redis`);
                    syncCount++;
                } else {
                    if (this.shouldUpdate(mongoUser, redisUser)) {
                        const key = `user:${email}`;
                        await this.redis.set(key, JSON.stringify(mongoUser));
                        this.logger.debug(`Updated user ${email} in Redis`);
                        syncCount++;
                    }
                }
            }

            for (const [email, redisUser] of redisMap) {
                const mongoUser = mongoMap.get(email);
                if (!mongoUser) {
                    await this.userModel.updateOne(
                        { email: email },
                        {
                            $set: {
                                name: redisUser.name,
                                updatedAt: redisUser.updatedAt,
                                source: 'redis',
                            },
                            $inc: { version: 1 },
                        },
                        { upsert: true }
                    );
                    this.logger.debug(`Added missing user ${email} to MongoDB`);
                    syncCount++;
                } else {
                    if (this.shouldUpdate(redisUser, mongoUser)) {
                        await this.userModel.updateOne(
                            { email: email },
                            {
                                $set: {
                                    name: redisUser.name,
                                    updatedAt: redisUser.updatedAt,
                                    source: 'redis',
                                },
                                $inc: { version: 1 },
                            },
                            { upsert: true }
                        );
                        this.logger.debug(`Updated user ${email} in MongoDB`);
                        syncCount++;
                    }
                }
            }

            this.logger.log(`Data consistency check completed. Synced ${syncCount} records`);
        } catch (error) {
            this.logger.error('Failed to check and sync data', error);
            throw error;
        }
    }

    private shouldUpdate(source: any, target: any): boolean {
        if (source.updatedAt > target.updatedAt) {
            return true;
        }

        if (source.updatedAt === target.updatedAt) {
            return source.source === 'mongo' && target.source !== 'mongo';
        }

        return false;
    }

    async getDataStats(): Promise<any> {
        try {
            const mongoCount = await this.userModel.countDocuments();
            const redisKeys = await this.redis.keys('user:*');
            const redisCount = redisKeys.length;

            return {
                mongo: mongoCount,
                redis: redisCount,
                difference: Math.abs(mongoCount - redisCount),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Failed to get data stats', error);
            return {
                mongo: 0,
                redis: 0,
                difference: 0,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

