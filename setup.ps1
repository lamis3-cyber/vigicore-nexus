$ErrorActionPreference = "Stop"
$root = Get-Location

Write-Host "=== Frontend ===" -ForegroundColor Cyan
Set-Location "$root\frontend"
npm install

Write-Host "=== nexus-api ===" -ForegroundColor Cyan
Set-Location "$root\backend\nexus-api"
npm install
npx prisma generate
npx prisma migrate deploy

Write-Host "=== audit-api ===" -ForegroundColor Cyan
Set-Location "$root\backend\audit-api"
npm install
npx prisma generate

Write-Host "=== ai-service ===" -ForegroundColor Cyan
Set-Location "$root\ai-service"
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

Set-Location $root
Write-Host "Installation terminee." -ForegroundColor Green