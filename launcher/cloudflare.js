const { spawn } = require("child_process");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

let cloudflareProcess = null;
let lastUrl = "";

function getCloudflaredPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "cloudflared.exe");
  }

  return path.join(__dirname, "cloudflared.exe");
}

function startCloudflare({ onUrl, onError, onLog } = {}) {
  if (cloudflareProcess) {
    if (lastUrl && onUrl) {
      onUrl(lastUrl);
    }

    return;
  }

  const cloudflaredPath = getCloudflaredPath();

  if (!fs.existsSync(cloudflaredPath)) {
    const message = `cloudflared.exe를 찾을 수 없습니다.\n${cloudflaredPath}`;

    console.error(message);

    if (onError) {
      onError(message);
    }

    return;
  }

  console.log("Cloudflare 실행 경로:", cloudflaredPath);

  cloudflareProcess = spawn(
    cloudflaredPath,
    ["tunnel", "--url", "http://localhost:5000"],
    {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const parseOutput = (data) => {
    const text = data.toString();

    console.log(text);

    if (onLog) {
      onLog(text);
    }

    const match = text.match(
      /https:\/\/[-a-zA-Z0-9.]+\.trycloudflare\.com/
    );

    if (match && match[0] !== lastUrl) {
      lastUrl = match[0];

      if (onUrl) {
        onUrl(lastUrl);
      }
    }
  };

  cloudflareProcess.stdout.on("data", parseOutput);
  cloudflareProcess.stderr.on("data", parseOutput);

  cloudflareProcess.on("error", (error) => {
    const message = `Cloudflare 실행 실패: ${error.message}`;

    console.error(message);

    if (onError) {
      onError(message);
    }

    cloudflareProcess = null;
    lastUrl = "";
  });

  cloudflareProcess.on("exit", (code, signal) => {
    console.log(
      `Cloudflare 종료: code=${code}, signal=${signal}`
    );

    cloudflareProcess = null;
    lastUrl = "";
  });
}

function stopCloudflare() {
  if (!cloudflareProcess) {
    lastUrl = "";
    return;
  }

  const processToKill = cloudflareProcess;

  cloudflareProcess = null;
  lastUrl = "";

  if (process.platform === "win32" && processToKill.pid) {
    spawn(
      "taskkill",
      ["/PID", String(processToKill.pid), "/T", "/F"],
      {
        shell: true,
        windowsHide: true,
      }
    );

    return;
  }

  try {
    processToKill.kill("SIGTERM");
  } catch (error) {
    console.error("Cloudflare 종료 실패:", error);
  }
}

module.exports = {
  startCloudflare,
  stopCloudflare,
};