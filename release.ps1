# SAFETY QUIZ 업데이트 배포 스크립트
# 1) launcher\package.json 의 "version" 숫자를 올린 뒤 (예: 3.0.0 → 3.0.1)
# 2) v3 폴더에서  .\release.ps1
# 화면 빌드 → 설치 파일 빌드 → GitHub Releases 업로드까지 한 번에 합니다.
# 업로드가 끝나면 사용자 런처에 업데이트 알림이 뜹니다.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Step($text) { Write-Host "`n▶ $text" -ForegroundColor Green }

# GitHub 저장소 주인(아이디)을 git 원격 주소에서 읽어 설정
$remote = git remote get-url origin 2>$null
if (-not $remote -or $remote -notmatch "github\.com[:/]([^/]+)/QuizLive") {
  Write-Host "git 원격 저장소(origin)가 github.com/<아이디>/QuizLive 로 설정되어 있지 않습니다." -ForegroundColor Red
  exit 1
}
$owner = $Matches[1]
node -e "const f='launcher/package.json';const p=require('./'+f);p.build.publish[0].owner='$owner';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"

$version = (Get-Content launcher\package.json -Raw | ConvertFrom-Json).version
Write-Host "배포 버전: v$version  →  github.com/$owner/QuizLive" -ForegroundColor Cyan

# 업로드 권한 토큰: 환경변수 → gh CLI → 직접 입력 순서로 찾음
if (-not $env:GH_TOKEN) {
  $ghToken = $null
  try { $ghToken = (gh auth token 2>$null) } catch {}
  if ($ghToken) {
    $env:GH_TOKEN = $ghToken.Trim()
  } else {
    $secure = Read-Host "GitHub 토큰을 붙여넣으세요 (화면에 보이지 않음)" -AsSecureString
    $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  }
}

Step "화면 빌드"
Push-Location client; npm run build; if ($LASTEXITCODE) { throw "client 빌드 실패" }; Pop-Location

Step "설치 파일 빌드 + GitHub 업로드 (몇 분 걸려요)"
Push-Location launcher; npm run release; if ($LASTEXITCODE) { throw "배포 실패" }; Pop-Location

Step "코드도 GitHub에 올리기"
git add -A
git commit -m "v$version 배포" 2>$null | Out-Null
git tag "v$version" 2>$null
git push origin HEAD --tags

Write-Host "`n배포 완료! https://github.com/$owner/QuizLive/releases" -ForegroundColor Green
