import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { appConfig } from './shared.config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
    providers: [
        {
            provide: REDIS_CLIENT,
            useFactory: async (configService: ConfigService) => {
                const host = configService.get<string>('app.redisHost')!;
                const port = configService.get<number>('app.redisPort')!;
                return new Redis({ host, port });
            },
            inject: [ConfigService],
        },
    ],
    exports: [REDIS_CLIENT],
})
export class RedisModule { }






