import { Module } from '@nestjs/common';
import { UserServiceController } from './user-service.controller';
import { UserServiceService } from './user-service.service';
import { MongoDbModule, RedisModule } from '../../../libs/shared/src';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';

@Module({
  imports: [
    MongoDbModule,
    RedisModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UserServiceController],
  providers: [UserServiceService],
})
export class UserServiceModule { }
