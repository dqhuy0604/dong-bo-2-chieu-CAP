import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from 'rms/shared/redis.module';
import Redis from 'ioredis';

@Injectable()
export class ApiGatewayService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) { }

  getHello(): string {
    return 'Hello World!';
  }

  async redisFirstUpsert(body: { email: string; name: string }) {
    const now = Date.now();
    const user = {
      email: body.email,
      name: body.name,
      updatedAt: now,
      source: 'redis',
      version: 1, // Simplified; in real case, track per-id version in Redis
    } as const;

    await this.redis.set(`user:${user.email}`, JSON.stringify(user));

    const event = {
      eventId: `redis:${user.email}:${user.version}`,
      entity: 'user',
      op: 'update',
      id: user.email,
      data: user,
      updatedAt: user.updatedAt,
      version: user.version,
      source: 'redis' as const,
    };

    await this.redis.xadd('redis_changes', '*', 'payload', JSON.stringify(event));

    return { ok: true, user };
  }

  async mongoFirstUpsert(body: { email: string; name: string }) {
    const res = await fetch('http://localhost:3001/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`user-service error ${res.status}: ${text}`);
    }
    return res.json();
  }
}
