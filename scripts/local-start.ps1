# 冒险者酒馆 —— 本地一键启动（Windows）
# 用法：右键"使用 PowerShell 运行"，或 powershell -ExecutionPolicy Bypass -File scripts/local-start.ps1
# 首次运行会自动安装依赖并建表，随后打开 3 个窗口（数据库/后端/前端）+ 浏览器

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "🍶 《冒险者酒馆》本地启动中…" -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "❌ 未检测到 Node.js，请先安装：https://nodejs.org（20 以上版本）" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

# 1. 首次运行：安装依赖
if (-not (Test-Path "node_modules")) {
  Write-Host "📦 首次运行，安装依赖中（约 2~5 分钟）…"
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Host "依赖安装失败" -ForegroundColor Red; Read-Host "按回车退出"; exit 1 }
}

# 2. 启动数据库（PGlite，数据存 .pgdata，删除即可重置）
Write-Host "🗄️  启动本地数据库…"
Start-Process -WindowStyle Minimized powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Write-Host '数据库窗口（Ctrl+C 关闭）' -ForegroundColor Green; npm run db:local"

Start-Sleep -Seconds 4

# 3. 建表（幂等，已建过会跳过）
Write-Host "📐 检查数据库表结构…"
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
npm run db:deploy 2>$null | Out-Null

# 4. 启动后端
Write-Host "⚙️  启动后端（http://localhost:4000）…"
Start-Process -WindowStyle Minimized powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Write-Host '后端窗口（Ctrl+C 关闭）' -ForegroundColor Green; npm run dev:server"

# 5. 启动前端
Write-Host "🎮 启动前端（http://localhost:5173）…"
Start-Process -WindowStyle Minimized powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Write-Host '前端窗口（Ctrl+C 关闭）' -ForegroundColor Green; npm run dev:web"

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "✅ 启动完成！浏览器即将打开游戏：" -ForegroundColor Green
Write-Host "   🎮 游戏     http://localhost:5173" -ForegroundColor Cyan
Write-Host "   🖥️  管理后台 http://localhost:5174  （npm run dev:admin 另开窗口）" -ForegroundColor Cyan
Write-Host ""
Write-Host "关闭游戏：分别关闭三个最小化窗口即可；下次再玩直接重跑本脚本。" -ForegroundColor Yellow
Start-Process "http://localhost:5173"
