import { NestFactory } from '@nestjs/core';
import { SyncServiceModule } from './sync-service.module';

async function bootstrap() {
  const app = await NestFactory.create(SyncServiceModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
