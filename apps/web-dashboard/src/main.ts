import { NestFactory } from '@nestjs/core';
import { WebDashboardModule } from './web-dashboard.module';

async function bootstrap() {
    const app = await NestFactory.create(WebDashboardModule);
    await app.listen(process.env.port ?? 3003);
    console.log(`Web Dashboard running on port ${process.env.port ?? 3003}`);
}
bootstrap();