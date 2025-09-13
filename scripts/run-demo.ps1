# Redis-MongoDB Sync Demo - Final Script
Write-Host "Redis-MongoDB Sync Demo - Starting..." -ForegroundColor Green

# Step 1: Clean and start infrastructure
Write-Host "`nStep 1: Starting infrastructure..." -ForegroundColor Yellow
docker stop rms_mongo rms_redis 2>$null
docker rm rms_mongo rms_redis 2>$null

docker run -d --name rms_mongo -p 27017:27017 -v "${PWD}/docker/mongo-data:/data/db" mongo:7 --replSet rs0 --bind_ip_all
docker run -d --name rms_redis -p 6379:6379 -v "${PWD}/docker/redis-data:/data" redis:7-alpine redis-server --appendonly yes

Write-Host "Waiting for infrastructure..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Initialize MongoDB replica set
docker exec rms_mongo mongosh --eval "rs.initiate()" 2>$null
Start-Sleep -Seconds 5

# Step 2: Build all services
Write-Host "`nStep 2: Building services..." -ForegroundColor Yellow
npm run build:user-service
npm run build:sync-service
npm run build:api-gateway
npm run build:web-dashboard

# Step 3: Start services with correct paths
Write-Host "`nStep 3: Starting services..." -ForegroundColor Yellow

Write-Host "Starting user-service (port 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:port = 3001; node dist/apps/user-service/apps/user-service/src/main.js"

Start-Sleep -Seconds 3

Write-Host "Starting sync-service (port 3002)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:port = 3002; node dist/apps/sync-service/apps/sync-service/src/main.js"

Start-Sleep -Seconds 3

Write-Host "Starting api-gateway (port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:port = 3000; node dist/apps/api-gateway/apps/api-gateway/src/main.js"

Start-Sleep -Seconds 3

Write-Host "Starting web-dashboard (port 3003)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:port = 3003; node dist/apps/web-dashboard/apps/web-dashboard/src/main.js"

Write-Host "`nAll services started!" -ForegroundColor Green
Write-Host "Web Dashboard: http://localhost:3003" -ForegroundColor Magenta
Write-Host "API Gateway: http://localhost:3000" -ForegroundColor Magenta
Write-Host "User Service: http://localhost:3001" -ForegroundColor Magenta
Write-Host "Sync Service: http://localhost:3002" -ForegroundColor Magenta

Write-Host "`nPress any key to stop all services..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Stop all services
Write-Host "`nStopping all services..." -ForegroundColor Red
docker stop rms_mongo rms_redis
docker rm rms_mongo rms_redis
Write-Host "All services stopped!" -ForegroundColor Green

