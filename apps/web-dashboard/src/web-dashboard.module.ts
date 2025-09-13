import { Module } from '@nestjs/common';
import { WebDashboardController } from './web-dashboard.controller';
import { WebDashboardService } from './web-dashboard.service';
import { RedisModule, MongoDbModule } from '../../../libs/shared/src';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../user-service/src/user.schema';

@Module({
    imports: [
        RedisModule,
        MongoDbModule,
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    ],
    controllers: [WebDashboardController],
    providers: [WebDashboardService],
})
export class WebDashboardModule { }
