
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../user-service/src/user.schema';
import { REDIS_CLIENT } from '../../../libs/shared/src';
import Redis from 'ioredis';
import * as http from 'http';

@Injectable()
export class WebDashboardService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
    ) { }

    async getMongoUsers() {
        try {
            return await this.userModel.find({}, { _id: 0 }).sort({ updatedAt: -1 }).limit(50);
        } catch (error) {
            console.warn('MongoDB unavailable, returning empty array');
            return [];
        }
    }

    async getRedisUsers() {
        try {
            const keys = await this.redis.keys('user:*');
            const users: any[] = [];

            for (const key of keys) {
                const userData = await this.redis.get(key);
                if (userData) {
                    try {
                        users.push(JSON.parse(userData));
                    } catch (e) {
                        console.error('Failed to parse user data:', e);
                    }
                }
            }

            return users.sort((a, b) => b.updatedAt - a.updatedAt);
        } catch (error) {
            console.warn('Redis unavailable, returning empty array');
            return [];
        }
    }

    async getSyncMetrics() {
        try {
            return new Promise((resolve) => {
                const req = http.get('http://localhost:3002/metrics', (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve({ processed: 0, conflicts: 0, retries: 0 });
                        }
                    });
                });
                req.on('error', () => resolve({ processed: 0, conflicts: 0, retries: 0 }));
                req.setTimeout(3000, () => {
                    req.destroy();
                    resolve({ processed: 0, conflicts: 0, retries: 0 });
                });
            });
        } catch (e) {
            return { processed: 0, conflicts: 0, retries: 0 };
        }
    }

    async createUserMongoFirst(userData: { email: string; name: string }) {
        return new Promise((resolve) => {
            const postData = JSON.stringify(userData);
            const options = {
                hostname: 'localhost',
                port: 3000,
                path: '/mongo-first/users',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ error: 'Invalid response' });
                    }
                });
            });

            req.on('error', (e) => resolve({ error: e.message }));
            req.setTimeout(5000, () => {
                req.destroy();
                resolve({ error: 'Request timeout' });
            });

            req.write(postData);
            req.end();
        });
    }

    async createUserRedisFirst(userData: { email: string; name: string }) {
        return new Promise((resolve) => {
            const postData = JSON.stringify(userData);
            const options = {
                hostname: 'localhost',
                port: 3000,
                path: '/redis-first/users',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ error: 'Invalid response' });
                    }
                });
            });

            req.on('error', (e) => resolve({ error: e.message }));
            req.setTimeout(5000, () => {
                req.destroy();
                resolve({ error: 'Request timeout' });
            });

            req.write(postData);
            req.end();
        });
    }
}