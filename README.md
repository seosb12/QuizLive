# SAFETY QUIZ (QuizLive)

실시간 참여형 퀴즈. 진행자 PC에서 런처로 서버를 켜고, 참가자는 휴대폰으로 QR 코드를 찍어 참여합니다.

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `client` | 퀴즈 화면 (React + Vite) |
| `server` | 게임 서버 (Express + Socket.IO + SQLite) |
| `launcher` | 윈도우 런처 (Electron) · 서버 실행, Cloudflare 링크, 백업, 자동 업데이트 |
| `load-test` | 접속 부하 테스트 |

## 처음 준비 (한 번만)

v2 폴더와 같은 위치에 v3 폴더를 두고, v3 폴더에서 PowerShell을 연 뒤:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-v3.ps1
```

v2에서 `node.exe`, `cloudflared.exe`, 서버 패키지를 복사하고 나머지 패키지를 설치합니다.

## 개발 중 실행

```powershell
cd launcher
npm start
```

화면만 고칠 때는 `cd server; node server.js` 와 `cd client; npm run dev` 를 각각 실행하세요.

## 업데이트 배포

1. `launcher/package.json` 의 `"version"` 을 올립니다 (예: `3.0.0` → `3.0.1`).
2. v3 폴더에서:

```powershell
powershell -ExecutionPolicy Bypass -File .\release.ps1
```

설치 파일이 GitHub Releases에 올라가고, 사용자 런처에 업데이트 알림이 뜹니다.

## 데이터 위치

문제와 업로드 파일은 `%APPDATA%\SAFETY QUIZ` 에 저장됩니다. 업데이트·재설치해도 유지됩니다.

## 관리자

- 서버를 켠 PC에서 접속하면 자동으로 관리자입니다.
- 다른 기기에서 방을 만들려면 런처에 표시된 **관리자 PIN** 을 입력합니다.
- 참가자는 문제를 보거나 수정·삭제할 수 없습니다.
