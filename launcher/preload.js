const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  startServer() {
    ipcRenderer.send("start-server");
  },

  stopServer() {
    ipcRenderer.send("stop-server");
  },

  openQuiz() {
    ipcRenderer.send("open-quiz");
  },

  backupData() {
    return ipcRenderer.invoke(
      "backup-data"
    );
  },

  restoreData() {
    return ipcRenderer.invoke(
      "restore-data"
    );
  },

  getAppInfo() {
    return ipcRenderer.invoke("get-app-info");
  },

  checkUpdate() {
    return ipcRenderer.invoke("check-update");
  },

  downloadUpdate() {
    return ipcRenderer.invoke("download-update");
  },

  installUpdate() {
    return ipcRenderer.invoke("install-update");
  },

  openDataFolder() {
    ipcRenderer.send("open-data-folder");
  },

  onUpdateStatus(callback) {
    ipcRenderer.on("update-status", (event, state) => {
      callback(state);
    });
  },

  makeQrCode(text) {
    return ipcRenderer.invoke(
      "make-qr-code",
      text
    );
  },

  onServerStarting(callback) {
    ipcRenderer.on(
      "server-starting",
      () => {
        callback();
      }
    );
  },

  onServerStarted(callback) {
    ipcRenderer.on(
      "server-started",
      () => {
        callback();
      }
    );
  },

  onCloudflareUrl(callback) {
    ipcRenderer.on(
      "cloudflare-url",
      (event, url) => {
        callback(url);
      }
    );
  },

  onServerError(callback) {
    ipcRenderer.on(
      "server-error",
      (event, message) => {
        callback(message);
      }
    );
  },

  onServerStopped(callback) {
    ipcRenderer.on(
      "server-stopped",
      () => {
        callback();
      }
    );
  },

  onBackupStatus(callback) {
    ipcRenderer.on(
      "backup-status",
      (event, message) => {
        callback(message);
      }
    );
  },

  onLauncherLog(callback) {
    ipcRenderer.on(
      "launcher-log",
      (event, message) => {
        callback(message);
      }
    );
  },
});