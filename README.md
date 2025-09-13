# Redis–MongoDB Two-way Sync (NestJS Microservices)

This monorepo demonstrates a CAP-aware, bidirectional synchronization between MongoDB and Redis using NestJS microservices.

- Availability + Partition tolerance prioritized; eventual consistency with Last-Write-Wins (LWW) and a tie-breaker preferring Mongo on equal timestamps.
- Two data paths:
  - Mongo-first: API → user-service (Mongo) → Change Streams → sync-service → Redis
  - Redis-first: API → Redis write + Redis Stream → sync-service → Mongo
- Idempotency via Redis Set `processed_events`; Redis Streams for durable event log.

## Prerequisites
- Node.js 20+
- Docker Desktop (for MongoDB and Redis)

## Start infrastructure
```powershell
cd "workspace/redis-mongo-sync-ms"
docker compose up -d
```

Mongo runs as single-node replica set `rs0` to enable Change Streams; Redis as a single node.

## Install and build
```powershell
npm ci
npm run build:user-service
npm run build:sync-service
npm run build:api-gateway
npm run build:web-dashboard
```

## 🚀 Quick Start (Recommended)
Chạy tất cả services với 1 lệnh:
```powershell
.\scripts\run-dashboard.ps1
```

## Run services (4 terminals)
- user-service (port 3001)
```powershell
$env:port = 3001
node dist/apps/user-service/main.js
```
- sync-service (port 3002)
```powershell
$env:port = 3002
node dist/apps/sync-service/main.js
```
- api-gateway (port 3000)
```powershell
$env:port = 3000
node dist/apps/api-gateway/main.js
```
- web-dashboard (port 3003)
```powershell
$env:port = 3003
node dist/apps/web-dashboard/main.js
```

## Health checks
```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/health
Invoke-RestMethod -Method Get -Uri http://localhost:3001/users/health
Invoke-RestMethod -Method Get -Uri http://localhost:3002/health
```

## 🎨 Web Dashboard
Mở trình duyệt và truy cập: **http://localhost:3003**

Dashboard cung cấp:
- 📊 Xem users từ MongoDB và Redis real-time
- 🚀 Tạo user mới (Mongo-first hoặc Redis-first)
- 📈 Metrics sync (processed, conflicts, retries)
- 🔄 Auto-refresh mỗi 30 giây

## Mongo-first flow (API → Mongo → Redis)
```powershell
$body = @{ email = 'e@example.com'; name = 'Eve' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/mongo-first/users -ContentType 'application/json' -Body $body | ConvertTo-Json
# verify Redis projection
docker exec rms_redis redis-cli GET user:e@example.com
```

## Redis-first flow (API → Redis → Mongo)
```powershell
$body = @{ email = 'f@example.com'; name = 'Frank' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/redis-first/users -ContentType 'application/json' -Body $body | ConvertTo-Json
# verify Mongo sync
docker exec rms_mongo mongosh --eval "db.getSiblingDB('redis_mongo_sync').users.find({email:'f@example.com'},{_id:0}).pretty()"
```

## Metrics & observability
- Sync Service metrics:
```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3002/metrics | ConvertTo-Json
```
- Counters are in-memory; they reset on service restart.

## Consistency & conflict policy
- Eventual consistency with LWW using `updatedAt` (epoch ms).
- Tie-breaker on equal timestamps: prefer Mongo version.
- Idempotency: `eventId = <source>:<id>:<version>` stored in Redis Set `processed_events` (with TTL).

## Notes
- For simplicity, Redis-first version defaults to `1`. In production, maintain a per-user version in Redis to increment.
- Streams:
  - `mongo_changes` (Mongo → Redis)
  - `redis_changes` (Redis → Mongo)
- Consumer groups are created with `MKSTREAM` to handle missing streams.

## Scripts (optional)
See `scripts/` folder for convenience scripts to build and run services on Windows PowerShell.