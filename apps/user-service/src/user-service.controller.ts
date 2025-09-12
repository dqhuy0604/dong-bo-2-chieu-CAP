import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserServiceService } from './user-service.service';

@Controller('users')
export class UserServiceController {
  constructor(private readonly userServiceService: UserServiceService) { }

  @Get('health')
  getHello(): string {
    return 'ok';
  }

  @Post()
  async upsert(@Body() body: { email: string; name: string }) {
    return this.userServiceService.upsertUserMongoFirst(body);
  }
}
