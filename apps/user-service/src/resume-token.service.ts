import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../../libs/shared/src';
import Redis from 'ioredis';

@Injectable()
export class ResumeTokenService {
    private readonly logger = new Logger(ResumeTokenService.name);
    private readonly resumeTokenKey = 'mongo_resume_token';

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
    ) { }

    async saveResumeToken(token: any): Promise<void> {
        try {
            const tokenString = JSON.stringify(token);
            await this.redis.set(this.resumeTokenKey, tokenString);
            this.logger.debug(`Saved resume token: ${tokenString}`);
        } catch (error) {
            this.logger.error('Failed to save resume token', error);
        }
    }

    async getResumeToken(): Promise<any> {
        try {
            const tokenString = await this.redis.get(this.resumeTokenKey);
            if (tokenString) {
                const token = JSON.parse(tokenString);
                this.logger.debug(`Retrieved resume token: ${tokenString}`);
                return token;
            }
            return null;
        } catch (error) {
            this.logger.error('Failed to get resume token', error);
            return null;
        }
    }

    async clearResumeToken(): Promise<void> {
        try {
            await this.redis.del(this.resumeTokenKey);
            this.logger.debug('Cleared resume token');
        } catch (error) {
            this.logger.error('Failed to clear resume token', error);
        }
    }
}

