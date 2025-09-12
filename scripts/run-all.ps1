param()
$root = Resolve-Path "$PSScriptRoot/.."
Start-Process powershell -ArgumentList "-NoExit -Command Set-Location '$root'; `n $env:port=3001; node dist/apps/user-service/main.js"
Start-Process powershell -ArgumentList "-NoExit -Command Set-Location '$root'; `n $env:port=3002; node dist/apps/sync-service/main.js"
Start-Process powershell -ArgumentList "-NoExit -Command Set-Location '$root'; `n $env:port=3000; node dist/apps/api-gateway/main.js"}  👍🏻```

