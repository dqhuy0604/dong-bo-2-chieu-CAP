# Enhanced Partition Tolerance Test
Write-Host "=== Enhanced Partition Tolerance Test ===" -ForegroundColor Green

# Start services
Write-Host "`n1. Starting services..." -ForegroundColor Yellow

# Start sync-service
Write-Host "Starting sync-service..." -ForegroundColor Cyan
$syncJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\HUY\OneDrive - ut.edu.vn\Máy tính\Do-An-Thuc-Tap\workspace\redis-mongo-sync-ms"
    $env:port = 3002
    node dist/apps/sync-service/apps/sync-service/src/main.js
}

# Start user-service
Write-Host "Starting user-service..." -ForegroundColor Cyan
$userJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\HUY\OneDrive - ut.edu.vn\Máy tính\Do-An-Thuc-Tap\workspace\redis-mongo-sync-ms"
    $env:port = 3001
    node dist/apps/user-service/apps/user-service/src/main.js
}

# Start api-gateway
Write-Host "Starting api-gateway..." -ForegroundColor Cyan
$apiJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\HUY\OneDrive - ut.edu.vn\Máy tính\Do-An-Thuc-Tap\workspace\redis-mongo-sync-ms"
    $env:port = 3000
    node dist/apps/api-gateway/apps/api-gateway/src/main.js
}

# Wait for services to start
Write-Host "`nWaiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

# Test 1: Check initial data consistency
Write-Host "`n2. Testing initial data consistency..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Method Get -Uri "http://localhost:3002/data-stats" -TimeoutSec 10
    Write-Host "Initial data stats: $($stats | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Failed to get initial stats: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Create test data via Mongo-first
Write-Host "`n3. Creating test data via Mongo-first..." -ForegroundColor Yellow
$testData1 = @{ email = 'mongo-test@example.com'; name = 'Mongo Test User' } | ConvertTo-Json
try {
    $response1 = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/mongo-first/users" -ContentType 'application/json' -Body $testData1 -TimeoutSec 10
    Write-Host "Created Mongo-first user: $($response1.email)" -ForegroundColor Green
} catch {
    Write-Host "Failed to create Mongo-first user: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Create test data via Redis-first
Write-Host "`n4. Creating test data via Redis-first..." -ForegroundColor Yellow
$testData2 = @{ email = 'redis-test@example.com'; name = 'Redis Test User' } | ConvertTo-Json
try {
    $response2 = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/redis-first/users" -ContentType 'application/json' -Body $testData2 -TimeoutSec 10
    Write-Host " Created Redis-first user: $($response2.email)" -ForegroundColor Green
} catch {
    Write-Host " Failed to create Redis-first user: $($_.Exception.Message)" -ForegroundColor Red
}

# Wait for sync
Write-Host "`nWaiting for initial sync..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Test 4: Redis restart test (Mongo→Redis)
Write-Host "`n5. Testing Redis restart (Mongo→Redis sync)..." -ForegroundColor Yellow
Write-Host "Stopping Redis..." -ForegroundColor Red
docker stop rms_redis
Start-Sleep -Seconds 3

# Create data while Redis is down
Write-Host "`nCreating data while Redis is down..." -ForegroundColor Yellow
$testData3 = @{ email = 'redis-down-test@example.com'; name = 'Redis Down Test User' } | ConvertTo-Json
try {
    $response3 = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/mongo-first/users" -ContentType 'application/json' -Body $testData3 -TimeoutSec 10
    Write-Host " Created user while Redis down: $($response3.email)" -ForegroundColor Green
} catch {
    Write-Host " Failed to create user while Redis down: $($_.Exception.Message)" -ForegroundColor Red
}

# Wait a bit
Start-Sleep -Seconds 5

Write-Host "`nStarting Redis..." -ForegroundColor Green
docker start rms_redis
Start-Sleep -Seconds 10

# Check if data was synced to Redis
Write-Host "`nChecking if data was synced to Redis..." -ForegroundColor Yellow
try {
    $redisData = docker exec rms_redis redis-cli GET "user:redis-down-test@example.com"
    if ($redisData) {
        Write-Host " Data synced to Redis: $redisData" -ForegroundColor Green
    } else {
        Write-Host " Data not found in Redis" -ForegroundColor Red
    }
} catch {
    Write-Host " Failed to check Redis data: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: MongoDB restart test (Redis→Mongo)
Write-Host "`n6. Testing MongoDB restart (Redis→Mongo sync)..." -ForegroundColor Yellow
Write-Host "Stopping MongoDB..." -ForegroundColor Red
docker stop rms_mongo
Start-Sleep -Seconds 3

# Create data while MongoDB is down
Write-Host "`nCreating data while MongoDB is down..." -ForegroundColor Yellow
$testData4 = @{ email = 'mongo-down-test@example.com'; name = 'Mongo Down Test User' } | ConvertTo-Json
try {
    $response4 = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/redis-first/users" -ContentType 'application/json' -Body $testData4 -TimeoutSec 10
    Write-Host " Created user while MongoDB down: $($response4.email)" -ForegroundColor Green
} catch {
    Write-Host " Failed to create user while MongoDB down: $($_.Exception.Message)" -ForegroundColor Red
}

# Wait a bit
Start-Sleep -Seconds 5

Write-Host "`nStarting MongoDB..." -ForegroundColor Green
docker start rms_mongo
Start-Sleep -Seconds 10

# Initialize replica set
docker exec rms_mongo mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})" 2>$null
Start-Sleep -Seconds 5

# Check if data was synced to MongoDB
Write-Host "`nChecking if data was synced to MongoDB..." -ForegroundColor Yellow
try {
    $mongoData = docker exec rms_mongo mongosh --eval "db.getSiblingDB('redis_mongo_sync').users.findOne({email:'mongo-down-test@example.com'},{_id:0,email:1,name:1,source:1})" --quiet
    if ($mongoData -and $mongoData -ne "null") {
        Write-Host " Data synced to MongoDB: $mongoData" -ForegroundColor Green
    } else {
        Write-Host " Data not found in MongoDB" -ForegroundColor Red
    }
} catch {
    Write-Host " Failed to check MongoDB data: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Manual full sync
Write-Host "`n7. Testing manual full sync..." -ForegroundColor Yellow
try {
    $syncResult = Invoke-RestMethod -Method Post -Uri "http://localhost:3002/full-sync" -ContentType 'application/json' -TimeoutSec 30
    Write-Host " Manual sync result: $($syncResult | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host " Failed to trigger manual sync: $($_.Exception.Message)" -ForegroundColor Red
}

# Final consistency check
Write-Host "`n8. Final consistency check..." -ForegroundColor Yellow
try {
    $finalStats = Invoke-RestMethod -Method Get -Uri "http://localhost:3002/data-stats" -TimeoutSec 10
    Write-Host " Final data stats: $($finalStats | ConvertTo-Json)" -ForegroundColor Green
    
    if ($finalStats.difference -eq 0) {
        Write-Host " SUCCESS: Data is fully consistent! Enhanced Partition tolerance achieved!" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: Data difference detected: $($finalStats.difference)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " Failed to get final stats: $($_.Exception.Message)" -ForegroundColor Red
}

# Cleanup
Write-Host "`n9. Cleaning up..." -ForegroundColor Yellow
Stop-Job $syncJob, $userJob, $apiJob -ErrorAction SilentlyContinue
Remove-Job $syncJob, $userJob, $apiJob -ErrorAction SilentlyContinue

Write-Host "`n=== Enhanced Partition Tolerance Test Completed ===" -ForegroundColor Green
