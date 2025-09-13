import { Module } from '@nestjs/common';
import { SyncServiceController } from './sync-service.controller';
import { SyncServiceService } from './sync-service.service';
import { RedisModule, MongoDbModule } from '../../../libs/shared/src';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../user-service/src/user.schema';

@Module({
  imports: [
    RedisModule,
    MongoDbModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [SyncServiceController],
  providers: [SyncServiceService],
})
export class SyncServiceModule { }
