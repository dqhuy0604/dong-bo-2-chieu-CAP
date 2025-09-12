import { Test, TestingModule } from '@nestjs/testing';
import { SyncServiceController } from './sync-service.controller';
import { SyncServiceService } from './sync-service.service';

describe('SyncServiceController', () => {
  let syncServiceController: SyncServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SyncServiceController],
      providers: [SyncServiceService],
    }).compile();

    syncServiceController = app.get<SyncServiceController>(SyncServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(syncServiceController.getHello()).toBe('Hello World!');
    });
  });
});
