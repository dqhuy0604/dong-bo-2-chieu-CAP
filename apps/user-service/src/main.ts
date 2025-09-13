import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module';

async function bootstrap() {
  const app = await NestFactory.create(UserServiceModule);
  await app.listen(process.env.port ?? 3001);
  console.log(`User Service running on port ${process.env.port ?? 3001}`);
}
bootstrap();
