import { Controller, Get, Post } from '@nestjs/common';
import { SyncServiceService } from './sync-service.service';

@Controller()
export class SyncServiceController {
  constructor(private readonly service: SyncServiceService) { }

  @Get('health')
  health() {
    return 'ok';
  }

  @Get('metrics')
  metrics() {
    return this.service.getMetrics();
  }

  @Get('data-stats')
  async getDataStats() {
    return await this.service.getDataStats();
  }

  @Post('full-sync')
  async triggerFullSync() {
    return await this.service.triggerFullSync();
  }
}
