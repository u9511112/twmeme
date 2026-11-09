# Daily pipeline (Windows scheduled task, 12:00 local): scrape PTT -> AI text via local Ollama -> build -> deploy.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PYTHONUTF8 = '1'
$py = "$root\scraper\.venv\Scripts\python.exe"
function Step($name, $block) { Write-Host "[$(Get-Date -Format s)] $name"; $global:LASTEXITCODE = 0; & $block; if ($LASTEXITCODE) { throw "$name failed ($LASTEXITCODE)" } }
# Scrape / AI problems must not block building and deploying what is already in the DB.
function Soft($name, $block) { try { Step $name $block } catch { Write-Warning $_ } }

# Node build scripts read NEON_DATABASE_URL from the environment; the scraper loads it from .env itself.
$env:NEON_DATABASE_URL = ((Get-Content "$root\scraper\.env") -match '^NEON_DATABASE_URL=') -replace '^NEON_DATABASE_URL=', '' | Select-Object -First 1

Soft 'scrape ptt' { Push-Location scraper; & $py main.py --platforms ptt; Pop-Location }

# Make sure Ollama answers; start it if the tray app is not running.
try { Invoke-RestMethod http://localhost:11434/api/tags | Out-Null }
catch { Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden; Start-Sleep 15 }
$env:VISION_PROVIDER = 'ollama'; $env:GEMINI_DELAY_SEC = '0'
Soft 'ai text (ollama)' { Push-Location scraper; & $py scripts\backfill_gemini_metadata.py; Pop-Location }

Step 'build main' { npm run build }
Step 'build adult' { npm run build:adult }
Step 'deploy main' { doppler run --project hermes --config prd -- npx wrangler pages deploy web --project-name twmeme --branch master --commit-dirty=true }
Step 'deploy adult' { doppler run --project hermes --config prd -- npx wrangler pages deploy web-adult --project-name twmeme-adult --branch master --commit-dirty=true }
Write-Host "[$(Get-Date -Format s)] done"
