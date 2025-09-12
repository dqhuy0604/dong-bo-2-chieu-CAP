param()
Set-Location "$PSScriptRoot/.."
npm run build:user-service
npm run build:sync-service
npm run build:api-gateway

