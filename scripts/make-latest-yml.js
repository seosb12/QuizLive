// 자동 업데이트용 latest.yml 생성
// 런처(electron-updater)는 GitHub 최신 릴리스의 latest.yml을 읽어서
// "새 버전이 있는지, 설치 파일이 맞는 파일인지(sha512)"를 확인합니다.
// electron-builder가 업로드 중 실패해도 배포가 되도록 직접 만듭니다.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const { version } = require(path.join(root, "launcher", "package.json"));
const fileName = `SAFETY-QUIZ-Setup-${version}.exe`;
const exePath = path.join(root, "launcher", "dist", fileName);

if (!fs.existsSync(exePath)) {
  console.error(`설치 파일이 없습니다: ${exePath}`);
  process.exit(1);
}

const sha512 = crypto.createHash("sha512").update(fs.readFileSync(exePath)).digest("base64");
const size = fs.statSync(exePath).size;

const yml = [
  `version: ${version}`,
  "files:",
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");

fs.writeFileSync(path.join(root, "launcher", "dist", "latest.yml"), yml);
console.log(`latest.yml 생성 완료 (v${version}, ${(size / 1024 / 1024).toFixed(1)}MB)`);
