const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
} = require("electron");

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");

const archiver = require("archiver");
const extractZip = require("extract-zip");
const QRCode = require("qrcode");

const crypto = require("crypto");
const { autoUpdater } = require("electron-updater");

const cloudflare = require("./cloudflare");

let win = null;
let serverProcess = null;
let cloudflareStarted = false;
let dataOperationRunning = false;

const ROOT = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..");

const SERVER_DIR = path.join(ROOT, "server");

const NODE_EXE = app.isPackaged
  ? path.join(process.resourcesPath, "runtime", "node.exe")
  : "node";

// 문제 데이터 위치: %APPDATA%\SAFETY QUIZ
// (server.js에도 같은 경로를 환경변수로 넘겨서 백업·복원과 실제 데이터가 항상 일치)
const DATA_DIR = path.join(app.getPath("appData"), "SAFETY QUIZ");
const DB_PATH = path.join(DATA_DIR, "quizlive.db");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const LOG_DIR = path.join(DATA_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "server.log");

// 원격 기기에서 방을 만들 때 필요한 관리자 PIN (런처를 켤 때마다 새로 생성)
const ADMIN_PIN = String(crypto.randomInt(100000, 1000000));

function writeLog(text) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });

    // 5MB가 넘으면 새로 시작
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.old`);
    }

    fs.appendFileSync(LOG_FILE, text);
  } catch (error) {
    console.error("로그 기록 실패:", error);
  }
}

function postPublicUrl(url) {
  const body = JSON.stringify({ url });
  const request = http.request(
    "http://127.0.0.1:5000/api/public-url",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 2000,
    },
    (response) => response.resume()
  );
  request.on("error", () => {});
  request.on("timeout", () => request.destroy());
  request.end(body);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sendToLauncher(channel, value) {
  if (!win || win.isDestroyed()) {
    return;
  }

  win.webContents.send(channel, value);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: "SAFETY QUIZ",
    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("launcher.html");

  // 오류 확인이 필요할 때만 주석 해제
  // win.webContents.openDevTools();
}

function checkServerOnce() {
  return new Promise((resolve) => {
    const request = http.get(
      "http://127.0.0.1:5000",
      {
        timeout: 1000,
      },
      (response) => {
        response.resume();
        resolve(true);
      }
    );

    request.on("error", () => {
      resolve(false);
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ready = await checkServerOnce();

    if (ready) {
      return true;
    }

    await delay(500);
  }

  return false;
}

function startCloudflareOnce() {
  if (cloudflareStarted) {
    return;
  }

  cloudflareStarted = true;

  console.log("Cloudflare 실행 시작");

  cloudflare.startCloudflare({
    onUrl: (url) => {
      console.log("Cloudflare 주소:", url);
      postPublicUrl(url);
      sendToLauncher("cloudflare-url", url);
    },

    onError: (message) => {
      console.error(message);

      cloudflareStarted = false;
      sendToLauncher("server-error", message);
    },

    onLog: (message) => {
      sendToLauncher("launcher-log", message);
    },
  });
}

async function startServer() {
  if (serverProcess) {
    console.log("서버가 이미 실행 중입니다.");
    return true;
  }

  const existingServer = await checkServerOnce();

  if (existingServer) {
    console.log("5000번 포트에서 서버가 이미 실행 중입니다.");

    sendToLauncher("server-started");

    if (!cloudflareStarted) {
      startCloudflareOnce();
    }

    return true;
  }

  if (!fs.existsSync(SERVER_DIR)) {
    sendToLauncher(
      "server-error",
      `서버 폴더를 찾을 수 없습니다.\n${SERVER_DIR}`
    );

    return false;
  }

  const serverFile = path.join(SERVER_DIR, "server.js");

  if (!fs.existsSync(serverFile)) {
    sendToLauncher(
      "server-error",
      `server.js를 찾을 수 없습니다.\n${serverFile}`
    );

    return false;
  }

  cloudflareStarted = false;

  console.log("SAFETY QUIZ 서버 실행");
  console.log("서버 경로:", SERVER_DIR);
  console.log("데이터 경로:", DATA_DIR);

  if (!fs.existsSync(NODE_EXE) && app.isPackaged) {
    sendToLauncher(
      "server-error",
      `내장 Node 실행 파일을 찾을 수 없습니다.\n${NODE_EXE}`
    );

    return false;
  }

  serverProcess = spawn(NODE_EXE, [serverFile], {
    cwd: SERVER_DIR,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      QUIZLIVE_DATA_DIR: DATA_DIR,
      QUIZLIVE_ADMIN_PIN: ADMIN_PIN,
    },
  });

  writeLog(`\n===== ${new Date().toISOString()} 서버 시작 =====\n`);

  serverProcess.stdout.on("data", (data) => {
    writeLog(data.toString());
    const text = data.toString();

    console.log(text);
    sendToLauncher("launcher-log", text);
  });

  serverProcess.stderr.on("data", (data) => {
    writeLog(`[오류] ${data.toString()}`);
    const text = data.toString();

    console.error(text);
    sendToLauncher("launcher-log", text);

    if (text.includes("EADDRINUSE")) {
      sendToLauncher(
        "server-error",
        "5000번 포트를 다른 서버가 사용 중입니다."
      );
    }
  });

  serverProcess.on("error", (error) => {
    console.error("서버 실행 실패:", error);

    sendToLauncher(
      "server-error",
      `서버 실행에 실패했습니다.\n${error.message}`
    );

    serverProcess = null;
    cloudflareStarted = false;
  });

  serverProcess.on("exit", (code, signal) => {
    console.log(
      `서버 부모 프로세스 종료: code=${code}, signal=${signal}`
    );

    serverProcess = null;
    cloudflareStarted = false;

    cloudflare.stopCloudflare();
    sendToLauncher("server-stopped");
  });

  sendToLauncher("server-starting");

  const serverReady = await waitForServer();

  if (!serverReady) {
    sendToLauncher(
      "server-error",
      "서버가 5000번 포트에서 시작되지 않았습니다."
    );

    return false;
  }

  console.log("5000번 서버 준비 완료");

  sendToLauncher("server-started");
  startCloudflareOnce();

  return true;
}

function killProcessTree(childProcess) {
  return new Promise((resolve) => {
    if (!childProcess?.pid) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        [
          "/PID",
          String(childProcess.pid),
          "/T",
          "/F",
        ],
        {
          shell: true,
          windowsHide: true,
        }
      );

      killer.on("error", (error) => {
        console.error("프로세스 트리 종료 실패:", error);
        resolve();
      });

      killer.on("exit", () => {
        resolve();
      });

      return;
    }

    try {
      childProcess.kill("SIGTERM");
    } catch (error) {
      console.error("서버 종료 실패:", error);
    }

    resolve();
  });
}

// 5000번에서 응답하는 서버가 SAFETY QUIZ 서버인지 확인
function isOurServerRunning() {
  return new Promise((resolve) => {
    const request = http.get(
      "http://127.0.0.1:5000/api/launcher-status",
      { timeout: 1000 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(Boolean(JSON.parse(body).success));
          } catch {
            resolve(false);
          }
        });
      }
    );
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

function killProcessUsingPort5000() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve();
      return;
    }

    const command = [
      "$processIds = Get-NetTCPConnection",
      "-LocalPort 5000",
      "-State Listen",
      "-ErrorAction SilentlyContinue",
      "| Select-Object -ExpandProperty OwningProcess -Unique;",
      "foreach ($processIdValue in $processIds) {",
      "Stop-Process -Id $processIdValue -Force",
      "-ErrorAction SilentlyContinue",
            "}",
    ].join(" ");

    const powershell = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ],
      {
        shell: false,
        windowsHide: true,
      }
    );

    powershell.on("error", (error) => {
      console.error("5000번 포트 정리 실패:", error);
      resolve();
    });

    powershell.on("exit", () => {
      resolve();
    });
  });
}

async function stopServer() {
  console.log("SAFETY QUIZ 서버 종료 시작");

  cloudflare.stopCloudflare();
  cloudflareStarted = false;

  const currentServerProcess = serverProcess;
  serverProcess = null;

  await killProcessTree(currentServerProcess);
  await delay(500);

  // 이전에 비정상 종료되어 남아 있는 "우리" 서버만 정리합니다.
  // (5000번 포트를 쓰는 다른 프로그램은 건드리지 않음)
  if ((await checkServerOnce()) && (await isOurServerRunning())) {
    await killProcessUsingPort5000();
    await delay(300);
  }

  const serverStillRunning = await checkServerOnce();

  if (serverStillRunning) {
    console.error("5000번 포트가 아직 사용 중입니다.");

    sendToLauncher(
      "server-error",
      "5000번 포트를 다른 프로그램이 사용 중입니다.\n해당 프로그램을 종료한 뒤 다시 시도해주세요."
    );

    return false;
  }

  console.log("SAFETY QUIZ 서버 종료 완료");

  sendToLauncher("server-stopped");

  return true;
}

async function ensureDataFolders() {
  await fsp.mkdir(DATA_DIR, {
    recursive: true,
  });

  await fsp.mkdir(UPLOADS_DIR, {
    recursive: true,
  });
}

function makeBackupFileName() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  return `SAFETY_QUIZ_Backup_${year}-${month}-${day}_${hour}-${minute}-${second}.zip`;
}

function createBackupZip(destinationPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destinationPath);

    const archive = archiver("zip", {
      zlib: {
        level: 9,
      },
    });

    output.on("close", () => {
      resolve();
    });

    output.on("error", (error) => {
      reject(error);
    });

    archive.on("warning", (error) => {
      if (error.code === "ENOENT") {
        console.warn(error);
        return;
      }

      reject(error);
    });

    archive.on("error", (error) => {
      reject(error);
    });

    archive.pipe(output);

    if (fs.existsSync(DB_PATH)) {
      archive.file(DB_PATH, {
        name: "quizlive.db",
      });
    }

    if (fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, "uploads");
    }

    const backupInfo = {
      application: "SAFETY QUIZ",
      version: app.getVersion(),
      createdAt: new Date().toISOString(),
      databaseIncluded: fs.existsSync(DB_PATH),
      uploadsIncluded: fs.existsSync(UPLOADS_DIR),
    };

    archive.append(
      JSON.stringify(backupInfo, null, 2),
      {
        name: "backup-info.json",
      }
    );

    archive.finalize();
  });
}

async function removeDirectoryContents(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  const entries = await fsp.readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    await fsp.rm(entryPath, {
      recursive: true,
      force: true,
    });
  }
}

async function restoreDataFromFolder(extractedFolder) {
  const restoredDbPath = path.join(
    extractedFolder,
    "quizlive.db"
  );

  const restoredUploadsPath = path.join(
    extractedFolder,
    "uploads"
  );

  if (!fs.existsSync(restoredDbPath)) {
    throw new Error(
      "선택한 ZIP 파일에 quizlive.db가 없습니다.\n올바른 SAFETY QUIZ 백업 파일을 선택하세요."
    );
  }

  await ensureDataFolders();

  const safetyFolder = await fsp.mkdtemp(
    path.join(
      app.getPath("temp"),
      "safety-quiz-restore-safety-"
    )
  );

  const safetyDbPath = path.join(
    safetyFolder,
    "quizlive.db"
  );

  const safetyUploadsPath = path.join(
    safetyFolder,
    "uploads"
  );

  try {
    if (fs.existsSync(DB_PATH)) {
      await fsp.copyFile(DB_PATH, safetyDbPath);
    }

    if (fs.existsSync(UPLOADS_DIR)) {
      await fsp.cp(
        UPLOADS_DIR,
        safetyUploadsPath,
        {
          recursive: true,
        }
      );
    }

    await fsp.copyFile(
      restoredDbPath,
      DB_PATH
    );

    await removeDirectoryContents(
      UPLOADS_DIR
    );

    if (fs.existsSync(restoredUploadsPath)) {
      await fsp.cp(
        restoredUploadsPath,
        UPLOADS_DIR,
        {
          recursive: true,
        }
      );
    }
  } catch (error) {
    console.error(
      "복원 실패, 기존 데이터 복구 시도:",
      error
    );

    if (fs.existsSync(safetyDbPath)) {
      await fsp.copyFile(
        safetyDbPath,
        DB_PATH
      );
    }

    await removeDirectoryContents(
      UPLOADS_DIR
    );

    if (fs.existsSync(safetyUploadsPath)) {
      await fsp.cp(
        safetyUploadsPath,
        UPLOADS_DIR,
        {
          recursive: true,
        }
      );
    }

    throw error;
  } finally {
    await fsp.rm(safetyFolder, {
      recursive: true,
      force: true,
    });
  }
}

async function handleBackup() {
  if (dataOperationRunning) {
    return {
      success: false,
      message: "다른 데이터 작업이 진행 중입니다.",
    };
  }

  dataOperationRunning = true;

  let shouldRestartServer = false;
  let backupSucceeded = false;

  try {
    sendToLauncher(
      "backup-status",
      "백업을 준비하고 있습니다..."
    );

    const serverWasRunning =
      Boolean(serverProcess) ||
      (await checkServerOnce());

    shouldRestartServer = serverWasRunning;

    if (serverWasRunning) {
      sendToLauncher(
        "backup-status",
        "안전한 백업을 위해 서버를 종료하고 있습니다..."
      );

      const stopped = await stopServer();

      if (!stopped) {
        throw new Error(
          "서버를 종료하지 못해 백업을 진행할 수 없습니다."
        );
      }
    }

    await ensureDataFolders();

    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `백업할 데이터베이스를 찾을 수 없습니다.\n${DB_PATH}`
      );
    }

    const saveResult = await dialog.showSaveDialog(win, {
      title: "SAFETY QUIZ 백업 저장",
      defaultPath: path.join(
        app.getPath("desktop"),
        makeBackupFileName()
      ),
      filters: [
        {
          name: "SAFETY QUIZ 백업",
          extensions: ["zip"],
        },
      ],
    });

    if (
      saveResult.canceled ||
      !saveResult.filePath
    ) {
      sendToLauncher(
        "backup-status",
        "백업이 취소되었습니다."
      );

      return {
        success: false,
        canceled: true,
        message: "백업이 취소되었습니다.",
      };
    }

    let destinationPath =
      saveResult.filePath;

    if (
      !destinationPath
        .toLowerCase()
        .endsWith(".zip")
    ) {
      destinationPath += ".zip";
    }

    sendToLauncher(
      "backup-status",
      "백업 ZIP 파일을 생성하고 있습니다..."
    );

    await createBackupZip(destinationPath);

    backupSucceeded = true;

    sendToLauncher(
      "backup-status",
      `백업 완료\n${destinationPath}`
    );

    return {
      success: true,
      message: "백업이 완료되었습니다.",
      filePath: destinationPath,
    };
  } catch (error) {
    console.error("백업 실패:", error);

    sendToLauncher(
      "backup-status",
      `백업 실패: ${error.message}`
    );

    return {
      success: false,
      message: error.message,
    };
  } finally {
    if (shouldRestartServer) {
      sendToLauncher(
        "backup-status",
        "서버를 다시 시작하고 있습니다..."
      );

      const started = await startServer();

      if (backupSucceeded && started) {
        sendToLauncher(
          "backup-status",
          "백업이 완료되었고 서버가 다시 시작되었습니다."
        );
      }
    }

    dataOperationRunning = false;
  }
}
async function handleRestore() {
  if (dataOperationRunning) {
    return {
      success: false,
      message: "다른 데이터 작업이 진행 중입니다.",
    };
  }

  const confirmation =
    await dialog.showMessageBox(win, {
      type: "warning",
      title: "데이터 복원",
      message: "백업 데이터를 복원하시겠습니까?",
      detail:
        "현재 문제 데이터와 업로드 파일이 선택한 백업 내용으로 교체됩니다.",
      buttons: [
        "취소",
        "복원",
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

  if (confirmation.response !== 1) {
    return {
      success: false,
      canceled: true,
      message: "복원이 취소되었습니다.",
    };
  }

  const openResult =
    await dialog.showOpenDialog(win, {
      title: "SAFETY QUIZ 백업 파일 선택",
      properties: ["openFile"],
      filters: [
        {
          name: "SAFETY QUIZ 백업",
          extensions: ["zip"],
        },
      ],
    });

  if (
    openResult.canceled ||
    openResult.filePaths.length === 0
  ) {
    return {
      success: false,
      canceled: true,
      message: "복원이 취소되었습니다.",
    };
  }

  dataOperationRunning = true;

  let shouldRestartServer = false;
  let temporaryFolder = null;
  let restoreSucceeded = false;

  try {
    sendToLauncher(
      "backup-status",
      "복원을 준비하고 있습니다..."
    );

    const serverWasRunning =
      Boolean(serverProcess) ||
      (await checkServerOnce());

    shouldRestartServer = serverWasRunning;

    if (serverWasRunning) {
      sendToLauncher(
        "backup-status",
        "안전한 복원을 위해 서버를 종료하고 있습니다..."
      );

      const stopped = await stopServer();

      if (!stopped) {
        throw new Error(
          "서버를 종료하지 못해 복원을 진행할 수 없습니다."
        );
      }
    }

    temporaryFolder = await fsp.mkdtemp(
      path.join(
        app.getPath("temp"),
        "safety-quiz-restore-"
      )
    );

    sendToLauncher(
      "backup-status",
      "백업 ZIP 파일을 확인하고 있습니다..."
    );

    await extractZip(
      openResult.filePaths[0],
      {
        dir: temporaryFolder,
      }
    );

    sendToLauncher(
      "backup-status",
      "데이터를 복원하고 있습니다..."
    );

    await restoreDataFromFolder(
      temporaryFolder
    );

    restoreSucceeded = true;

    sendToLauncher(
      "backup-status",
      "데이터 복원이 완료되었습니다."
    );

    return {
      success: true,
      message:
        "데이터 복원이 완료되었습니다.",
    };
  } catch (error) {
    console.error("복원 실패:", error);

    sendToLauncher(
      "backup-status",
      `복원 실패: ${error.message}`
    );

    return {
      success: false,
      message: error.message,
    };
  } finally {
    if (temporaryFolder) {
      await fsp.rm(temporaryFolder, {
        recursive: true,
        force: true,
      });
    }

    if (shouldRestartServer) {
      sendToLauncher(
        "backup-status",
        "서버를 다시 시작하고 있습니다..."
      );

      const started = await startServer();

      if (restoreSucceeded && started) {
        sendToLauncher(
          "backup-status",
          "복원이 완료되었고 서버가 다시 시작되었습니다."
        );
      }
    }

    dataOperationRunning = false;
  }
}

// ─────────────────────────────────────────────
// 자동 업데이트 (GitHub Releases)
// ─────────────────────────────────────────────
let updateState = { status: "idle" };

function setUpdateState(next) {
  updateState = { ...updateState, ...next };
  sendToLauncher("update-status", updateState);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => writeLog(`[업데이트] ${m}\n`),
    warn: (m) => writeLog(`[업데이트 경고] ${m}\n`),
    error: (m) => writeLog(`[업데이트 오류] ${m}\n`),
    debug: () => {},
  };

  autoUpdater.on("checking-for-update", () => setUpdateState({ status: "checking", error: null }));
  autoUpdater.on("update-not-available", () => setUpdateState({ status: "latest" }));
  autoUpdater.on("update-available", (info) =>
    setUpdateState({
      status: "available",
      version: info.version,
      notes: typeof info.releaseNotes === "string" ? info.releaseNotes.replace(/<[^>]+>/g, "") : "",
    })
  );
  autoUpdater.on("download-progress", (progress) =>
    setUpdateState({ status: "downloading", percent: Math.round(progress.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => setUpdateState({ status: "ready", version: info.version }));
  autoUpdater.on("error", (error) =>
    setUpdateState({ status: "error", error: String(error?.message || error).split("\n")[0] })
  );
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    setUpdateState({ status: "dev" });
    return updateState;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateState({ status: "error", error: String(error?.message || error).split("\n")[0] });
  }

  return updateState;
}

ipcMain.handle("get-app-info", () => ({
  version: app.getVersion(),
  adminPin: ADMIN_PIN,
  dataDir: DATA_DIR,
  update: updateState,
}));

ipcMain.handle("check-update", () => checkForUpdates());

ipcMain.handle("download-update", async () => {
  try {
    setUpdateState({ status: "downloading", percent: 0 });
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    setUpdateState({ status: "error", error: String(error?.message || error).split("\n")[0] });
    return { success: false };
  }
});

ipcMain.handle("install-update", async () => {
  // 서버를 먼저 끄고 설치 (데이터는 %APPDATA%에 있어서 그대로 유지)
  await stopServer().catch(() => {});
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { success: true };
});

ipcMain.on("open-data-folder", () => {
  shell.openPath(DATA_DIR);
});

app.whenReady().then(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  setupAutoUpdater();
  createWindow();

  // 창이 뜨고 3초 뒤 업데이트 확인 (인터넷이 없으면 조용히 실패)
  setTimeout(() => {
    checkForUpdates();
  }, 3000);
});

ipcMain.on("start-server", () => {
  startServer().catch((error) => {
    console.error(error);

    sendToLauncher(
      "server-error",
      error.message
    );
  });
});

ipcMain.on("stop-server", () => {
  stopServer().catch((error) => {
    console.error(error);

    sendToLauncher(
      "server-error",
      error.message
    );
  });
});

ipcMain.on("open-quiz", async () => {
  await shell.openExternal(
    "http://localhost:5000"
  );
});

ipcMain.handle(
  "backup-data",
  async () => {
    return handleBackup();
  }
);

ipcMain.handle(
  "restore-data",
  async () => {
    return handleRestore();
  }
);

ipcMain.handle(
  "make-qr-code",
  async (event, text) => {
    if (
      typeof text !== "string" ||
      text.trim() === ""
    ) {
      throw new Error(
        "QR 코드로 만들 주소가 없습니다."
      );
    }

    return QRCode.toDataURL(
      text.trim(),
      {
        width: 500,
        margin: 2,
        errorCorrectionLevel: "M",
      }
    );
  }
);

app.on("window-all-closed", () => {
  stopServer()
    .catch(console.error)
    .finally(() => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
});