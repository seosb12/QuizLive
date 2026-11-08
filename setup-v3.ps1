# SAFETY QUIZ v3 처음 준비 스크립트
# 사용법: v3 폴더에서 PowerShell을 열고  .\setup-v3.ps1
# v2 폴더에서 큰 실행 파일과 서버 패키지를 복사하고, 필요한 패키지를 설치합니다.

param(
  [string]$V2 = (Join-Path (Split-Path $PSScriptRoot -Parent) "QuizLive_v2")
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Step($text) { Write-Host "`n▶ $text" -ForegroundColor Green }

if (-not (Test-Path $V2)) {
  Write-Host "v2 폴더를 찾을 수 없습니다: $V2" -ForegroundColor Red
  Write-Host '다른 위치라면:  .\setup-v3.ps1 -V2 "C:\경로\QuizLive_v2"'
  exit 1
}

Step "v2에서 실행 파일 복사 (node.exe, cloudflared.exe)"
New-Item -ItemType Directory -Force "launcher\runtime" | Out-Null
Copy-Item "$V2\launcher\runtime\node.exe" "launcher\runtime\node.exe" -Force
Copy-Item "$V2\launcher\cloudflared.exe" "launcher\cloudflared.exe" -Force

Step "v2에서 서버 패키지 복사 (better-sqlite3가 내장 node.exe와 맞도록 그대로 사용)"
robocopy "$V2\server\node_modules" "server\node_modules" /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "server\node_modules 복사 실패" }
if (Test-Path "$V2\server\package-lock.json") { Copy-Item "$V2\server\package-lock.json" "server\" -Force }

Step "client 패키지 설치 (새 폰트·QR 패키지 포함)"
Push-Location client; npm install; if ($LASTEXITCODE) { throw "client npm install 실패" }; Pop-Location

Step "launcher 패키지 설치 (자동 업데이트 패키지 포함)"
Push-Location launcher; npm install; if ($LASTEXITCODE) { throw "launcher npm install 실패" }; Pop-Location

Step "화면 빌드"
Push-Location client; npm run build; if ($LASTEXITCODE) { throw "client 빌드 실패" }; Pop-Location

Write-Host "`n준비 완료!" -ForegroundColor Green
Write-Host "런처 테스트:  cd launcher; npm start"
