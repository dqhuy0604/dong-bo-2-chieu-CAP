import { Controller, Get } from '@nestjs/common';
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
}
