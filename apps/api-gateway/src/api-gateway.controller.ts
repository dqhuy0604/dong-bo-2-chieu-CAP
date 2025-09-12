import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiGatewayService } from './api-gateway.service';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) { }

  @Get('health')
  getHello(): string {
    return 'ok';
  }

  @Post('redis-first/users')
  async redisFirstUpsert(@Body() body: { email: string; name: string }) {
    return this.apiGatewayService.redisFirstUpsert(body);
  }

  @Post('mongo-first/users')
  async mongoFirstUpsert(@Body() body: { email: string; name: string }) {
    return this.apiGatewayService.mongoFirstUpsert(body);
  }
}
