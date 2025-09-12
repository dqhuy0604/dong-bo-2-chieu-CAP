import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/redis_mongo_sync?replicaSet=rs0',
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
}));

