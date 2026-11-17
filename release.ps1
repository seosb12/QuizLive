# SAFETY QUIZ 업데이트 배포 스크립트
#
# 사용법
#   1) launcher\package.json 의 "version" 을 올립니다 (예: 3.0.1 → 3.0.2)
#   2) v3 폴더에서:  powershell -ExecutionPolicy Bypass -File .\release.ps1
#
# 순서 (v3.0.0 때 문제를 고친 순서)
#   코드 push → 화면 빌드 → 설치 파일 빌드 → latest.yml 생성 → GitHub 릴리스 생성·업로드
#   - 코드를 먼저 올려야 릴리스 태그가 "이번 버전 코드"를 가리킵니다.
#   - 업로드는 electron-builder 대신 gh CLI로 합니다 (대용량 업로드가 더 안정적).

# PowerShell 5.1은 Stop 모드에서 git/gh가 stderr에 쓰는 안내문까지 오류로 처리하므로
# Continue로 두고 각 단계의 종료 코드($LASTEXITCODE)를 직접 확인합니다.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Step($text) { Write-Host "`n▶ $text" -ForegroundColor Green }
function Fail($text) { Write-Host "`n✕ $text" -ForegroundColor Red; exit 1 }

# ── 0. 사전 확인 ─────────────────────────────
gh auth status *> $null
if ($LASTEXITCODE) { Fail "GitHub 로그인이 필요합니다.  gh auth login  을 먼저 실행하세요." }

$remote = git remote get-url origin 2>$null
if (-not $remote -or $remote -notmatch "github\.com[:/]([^/]+)/QuizLive") {
  Fail "git 원격 저장소(origin)가 github.com/<아이디>/QuizLive 로 설정되어 있지 않습니다."
}
$owner = $Matches[1]

# 버전은 node로 읽음 (PowerShell 5.1은 UTF-8 파일의 한글을 깨뜨려 읽음)
$version = (node -p "require('./launcher/package.json').version").Trim()
$tag = "v$version"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()

gh release view $tag *> $null
if ($LASTEXITCODE -eq 0) {
  Fail "$tag 릴리스가 이미 있습니다. launcher\package.json 의 version 숫자를 올린 뒤 다시 실행하세요."
}

Write-Host "배포 버전: $tag  →  github.com/$owner/QuizLive" -ForegroundColor Cyan
$notes = Read-Host "이번 버전에서 바뀐 점 (런처 업데이트 칸에 표시, 엔터만 누르면 생략)"
if (-not $notes) { $notes = "SAFETY QUIZ $tag" }

# 앱 안에 들어가는 업데이트 주소(owner)를 내 저장소로 맞춤
node -e "const f='launcher/package.json';const p=require('./'+f);p.build.publish[0].owner='$owner';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"

# ── 1. 코드 먼저 올리기 ──────────────────────
Step "코드를 GitHub에 올리는 중"
git add -A
git commit -m "$tag" *> $null
git push origin $branch
if ($LASTEXITCODE) { Fail "git push 실패. 인터넷 연결과 gh 로그인을 확인하세요." }

# ── 2. 화면 빌드 ─────────────────────────────
Step "화면 빌드"
Push-Location client
npm.cmd run build
$code = $LASTEXITCODE
Pop-Location
if ($code) { Fail "화면 빌드 실패" }

# ── 3. 설치 파일 빌드 (업로드는 하지 않음) ────
Step "설치 파일 빌드 (몇 분 걸려요)"
Push-Location launcher
npm.cmd run dist
$code = $LASTEXITCODE
Pop-Location
if ($code) { Fail "설치 파일 빌드 실패" }

# ── 4. 자동 업데이트 정보 파일 ───────────────
Step "latest.yml 생성"
node scripts\make-latest-yml.js
if ($LASTEXITCODE) { Fail "latest.yml 생성 실패" }

# ── 5. GitHub 릴리스 만들고 파일 3개 업로드 ──
Step "GitHub 릴리스 업로드 (설치 파일이 커서 몇 분 걸려요)"
$exe = "launcher\dist\SAFETY-QUIZ-Setup-$version.exe"
gh release create $tag $exe "$exe.blockmap" "launcher\dist\latest.yml" --title $version --notes $notes --target $branch
if ($LASTEXITCODE) {
  Write-Host "`n업로드가 중간에 끊겼다면 아래 명령으로 빠진 파일만 다시 올릴 수 있어요:" -ForegroundColor Yellow
  Write-Host "  gh release upload $tag $exe $exe.blockmap launcher\dist\latest.yml --clobber"
  Fail "릴리스 업로드 실패"
}

git fetch --tags *> $null

Write-Host "`n배포 완료! https://github.com/$owner/QuizLive/releases/tag/$tag" -ForegroundColor Green
Write-Host "설치된 런처를 켜면 3초 뒤 업데이트 알림이 떠요."
