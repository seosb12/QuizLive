const status =
  document.getElementById("status");

const cloud =
  document.getElementById("cloudStatus");

const url =
  document.getElementById("url");

const people =
  document.getElementById("people");

const backupStatus =
  document.getElementById("backupStatus");

const qrBox =
  document.getElementById("qrBox");

const qrImage =
  document.getElementById("qrImage");

const qrSaveStatus =
  document.getElementById("qrSaveStatus");

const startButton =
  document.querySelector(".start");

const stopButton =
  document.querySelector(".stop");

const openButton =
  document.querySelector(".open");

const backupButton =
  document.querySelector(".backup");

const restoreButton =
  document.querySelector(".restore");

const saveQrButton =
  document.querySelector(".save-qr");

const adminPinEl =
  document.getElementById("adminPin");

const versionEl =
  document.getElementById("appVersion");

const updateText =
  document.getElementById("updateText");

const updateButton =
  document.querySelector(".update");

const dataFolderButton =
  document.querySelector(".data-folder");

let statusTimer = null;
let dataOperationRunning = false;
let currentCloudflareUrl = "";

function hideQrCode() {
  currentCloudflareUrl = "";

  if (qrBox) {
    qrBox.style.display = "none";
  }

  if (qrImage) {
    qrImage.removeAttribute("src");
  }

  if (qrSaveStatus) {
    qrSaveStatus.textContent = "";
  }
}

async function showQrCode(link) {
  if (!qrBox || !qrImage) {
    console.error(
      "QR 표시 요소를 찾을 수 없습니다."
    );

    return;
  }

  try {
    const qrDataUrl =
      await window.launcher.makeQrCode(
        link
      );

    currentCloudflareUrl = link;
    qrImage.src = qrDataUrl;
    qrBox.style.display = "block";

    if (qrSaveStatus) {
      qrSaveStatus.textContent = "";
    }
  } catch (error) {
    console.error(
      "QR 코드 생성 실패:",
      error
    );

    hideQrCode();
  }
}

function makeQrFileName() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  const hour = String(
    now.getHours()
  ).padStart(2, "0");

  const minute = String(
    now.getMinutes()
  ).padStart(2, "0");

  const second = String(
    now.getSeconds()
  ).padStart(2, "0");

  return (
    `SAFETY_QUIZ_QR_` +
    `${year}-${month}-${day}_` +
    `${hour}-${minute}-${second}.png`
  );
}

function saveQrCode() {
  if (
    !qrImage ||
    !qrImage.src ||
    !currentCloudflareUrl
  ) {
    if (qrSaveStatus) {
      qrSaveStatus.textContent =
        "저장할 QR 코드가 없습니다.";

      qrSaveStatus.style.color =
        "#FF5C7A";
    }

    return;
  }

  try {
    const downloadLink =
      document.createElement("a");

    downloadLink.href = qrImage.src;
    downloadLink.download =
      makeQrFileName();

    document.body.appendChild(
      downloadLink
    );

    downloadLink.click();
    downloadLink.remove();

    if (qrSaveStatus) {
      qrSaveStatus.textContent =
        "QR 코드 저장을 시작했습니다.";

      qrSaveStatus.style.color =
        "#C6FF3D";
    }
  } catch (error) {
    console.error(
      "QR 코드 저장 실패:",
      error
    );

    if (qrSaveStatus) {
      qrSaveStatus.textContent =
        "QR 코드 저장에 실패했습니다.";

      qrSaveStatus.style.color =
        "#FF5C7A";
    }
  }
}

function updateParticipantStatus(data) {
  if (!people) {
    return;
  }

  const totalPlayers =
    Number(data.totalPlayers) || 0;

  const roomCount =
    Number(data.roomCount) || 0;

  people.innerHTML =
    roomCount > 0
      ? `참가자 ${totalPlayers}명 · 방 ${roomCount}개`
      : "참가자 0명";

  people.style.color =
    totalPlayers > 0
      ? "#C6FF3D"
      : "#F2F3FF";
}

async function fetchLauncherStatus() {
  try {
    const response = await fetch(
      "http://127.0.0.1:5000/api/launcher-status",
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    if (!data.success) {
      throw new Error(
        "상태 조회 실패"
      );
    }

    updateParticipantStatus(data);

    if (adminPinEl) {
      adminPinEl.textContent = data.adminPin || "------";
    }
  } catch (error) {
    if (people) {
      people.innerHTML =
        "서버 연결 대기 중";

      people.style.color =
        "#FFB23D";
    }
  }
}

function startStatusPolling() {
  stopStatusPolling();

  fetchLauncherStatus();

  statusTimer = setInterval(() => {
    fetchLauncherStatus();
  }, 1000);
}

function stopStatusPolling() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function setStoppedUi() {
  stopStatusPolling();
  hideQrCode();

  if (adminPinEl) {
    adminPinEl.textContent = "------";
  }

  status.innerHTML =
    "● 서버 중지";

  status.style.color =
    "#FF5C7A";

  cloud.innerHTML =
    "Cloudflare 연결 안 됨";

  cloud.style.color =
    "#FFB23D";

  url.innerHTML =
    "아직 링크가 생성되지 않았습니다.";

  if (people) {
    people.innerHTML =
      "참가자 0명";

    people.style.color =
      "#F2F3FF";
  }
}

function setDataButtonsDisabled(
  disabled
) {
  dataOperationRunning = disabled;

  if (backupButton) {
    backupButton.disabled =
      disabled;
  }

  if (restoreButton) {
    restoreButton.disabled =
      disabled;
  }

  if (startButton) {
    startButton.disabled =
      disabled;
  }

  if (stopButton) {
    stopButton.disabled =
      disabled;
  }

  if (openButton) {
    openButton.disabled =
      disabled;
  }

  if (saveQrButton) {
    saveQrButton.disabled =
      disabled;
  }
}

if (startButton) {
  startButton.onclick = () => {
    window.launcher.startServer();

    hideQrCode();

    status.innerHTML =
      "● 서버 시작 중…";

    status.style.color =
      "#FFB23D";

    cloud.innerHTML =
      "Cloudflare 연결 준비 중…";

    cloud.style.color =
      "#FFB23D";

    url.innerHTML =
      "링크 생성 준비 중…";

    if (people) {
      people.innerHTML =
        "서버 연결 대기 중";

      people.style.color =
        "#FFB23D";
    }

    startStatusPolling();
  };
}

if (stopButton) {
  stopButton.onclick = () => {
    window.launcher.stopServer();

    hideQrCode();

    status.innerHTML =
      "● 서버 종료 중…";

    status.style.color =
      "#FFB23D";

    cloud.innerHTML =
      "Cloudflare 연결 종료 중…";

    cloud.style.color =
      "#FFB23D";
  };
}

if (openButton) {
  openButton.onclick = () => {
    window.launcher.openQuiz();
  };
}

if (saveQrButton) {
  saveQrButton.onclick = () => {
    saveQrCode();
  };
}

if (backupButton) {
  backupButton.onclick =
    async () => {
      if (dataOperationRunning) {
        return;
      }

      setDataButtonsDisabled(true);

      backupStatus.innerHTML =
        "백업을 시작합니다…";

      backupStatus.style.color =
        "#FFB23D";

      try {
        const result =
          await window.launcher.backupData();

        if (result?.success) {
          backupStatus.innerHTML =
            `백업 완료<br>${
              result.filePath || ""
            }`;

          backupStatus.style.color =
            "#C6FF3D";

          return;
        }

        if (result?.canceled) {
          backupStatus.innerHTML =
            "백업이 취소되었습니다.";

          backupStatus.style.color =
            "#8A8DB3";

          return;
        }

        backupStatus.innerHTML =
          `백업 실패<br>${
            result?.message ||
            "알 수 없는 오류"
          }`;

        backupStatus.style.color =
          "#FF5C7A";
      } catch (error) {
        backupStatus.innerHTML =
          `백업 실패<br>${
            error.message
          }`;

        backupStatus.style.color =
          "#FF5C7A";
      } finally {
        setDataButtonsDisabled(false);
      }
    };
}

if (restoreButton) {
  restoreButton.onclick =
    async () => {
      if (dataOperationRunning) {
        return;
      }

      setDataButtonsDisabled(true);

      backupStatus.innerHTML =
        "복원을 준비하고 있습니다…";

      backupStatus.style.color =
        "#FFB23D";

      try {
        const result =
          await window.launcher.restoreData();

        if (result?.success) {
          backupStatus.innerHTML =
            "데이터 복원이 완료되었습니다.";

          backupStatus.style.color =
            "#C6FF3D";

          return;
        }

        if (result?.canceled) {
          backupStatus.innerHTML =
            "복원이 취소되었습니다.";

          backupStatus.style.color =
            "#8A8DB3";

          return;
        }

        backupStatus.innerHTML =
          `복원 실패<br>${
            result?.message ||
            "알 수 없는 오류"
          }`;

        backupStatus.style.color =
          "#FF5C7A";
      } catch (error) {
        backupStatus.innerHTML =
          `복원 실패<br>${
            error.message
          }`;

        backupStatus.style.color =
          "#FF5C7A";
      } finally {
        setDataButtonsDisabled(false);
      }
    };
}

window.launcher.onServerStarting(
  () => {
    status.innerHTML =
      "● 서버 시작 중…";

    status.style.color =
      "#FFB23D";
  }
);

window.launcher.onServerStarted(
  () => {
    status.innerHTML =
      "● 서버 실행 중";

    status.style.color =
      "#C6FF3D";

    startStatusPolling();
  }
);

window.launcher.onCloudflareUrl(
  async (link) => {
    cloud.innerHTML =
      "Cloudflare 연결 완료";

    cloud.style.color =
      "#C6FF3D";

    url.textContent = link;

    await showQrCode(link);

    navigator.clipboard
      .writeText(link)
      .then(() => {
        console.log(
          "Cloudflare 링크 자동 복사 완료"
        );
      })
      .catch((error) => {
        console.error(
          "링크 자동 복사 실패:",
          error
        );
      });
  }
);

window.launcher.onServerError(
  (message) => {
    stopStatusPolling();
    hideQrCode();

    status.innerHTML =
      "● 서버 실행 실패";

    status.style.color =
      "#FF5C7A";

    cloud.innerHTML =
      "Cloudflare 연결 안 됨";

    cloud.style.color =
      "#FFB23D";

    url.textContent = message;

    if (people) {
      people.innerHTML =
        "참가자 0명";

      people.style.color =
        "#F2F3FF";
    }

    alert(message);
  }
);

window.launcher.onServerStopped(
  () => {
    setStoppedUi();
  }
);

window.launcher.onBackupStatus(
  (message) => {
    if (!backupStatus) {
      return;
    }

    backupStatus.innerHTML =
      String(message).replace(
        /\n/g,
        "<br>"
      );

    backupStatus.style.color =
      "#FFB23D";
  }
);

// ── 자동 업데이트 ─────────────────────────
let currentUpdate = { status: "idle" };

function renderUpdate(state) {
  currentUpdate = state || { status: "idle" };

  if (!updateText || !updateButton) {
    return;
  }

  const map = {
    idle: ["업데이트를 확인하지 않았습니다.", "업데이트 확인", false],
    dev: ["개발 모드에서는 업데이트를 확인하지 않습니다.", "업데이트 확인", true],
    checking: ["새 버전을 확인하는 중…", "확인 중…", true],
    latest: ["최신 버전을 사용 중입니다.", "다시 확인", false],
    available: [`새 버전 v${currentUpdate.version}이 있습니다.`, "업데이트 받기", false],
    downloading: [`내려받는 중… ${currentUpdate.percent || 0}%`, "내려받는 중…", true],
    ready: [`v${currentUpdate.version} 준비 완료. 설치하면 런처가 다시 시작됩니다.`, "지금 설치하고 재시작", false],
    error: [`업데이트 확인 실패: ${currentUpdate.error || "인터넷 연결을 확인하세요."}`, "다시 시도", false],
  };

  const [text, label, disabled] = map[currentUpdate.status] || map.idle;

  updateText.textContent = text;
  updateButton.textContent = label;
  updateButton.disabled = disabled;
  updateButton.classList.toggle(
    "highlight",
    currentUpdate.status === "available" || currentUpdate.status === "ready"
  );
}

if (updateButton) {
  updateButton.onclick = async () => {
    if (currentUpdate.status === "available") {
      await window.launcher.downloadUpdate();
      return;
    }

    if (currentUpdate.status === "ready") {
      const ok = confirm(
        "서버를 종료하고 업데이트를 설치합니다.\n진행 중인 게임이 있다면 끝난 뒤에 설치하세요.\n\n지금 설치할까요?"
      );

      if (ok) {
        await window.launcher.installUpdate();
      }

      return;
    }

    await window.launcher.checkUpdate();
  };
}

if (dataFolderButton) {
  dataFolderButton.onclick = () => {
    window.launcher.openDataFolder();
  };
}

window.launcher.onUpdateStatus(renderUpdate);

window.launcher.getAppInfo().then((info) => {
  if (versionEl) {
    versionEl.textContent = `v${info.version}`;
  }

  renderUpdate(info.update);
});

// 서버가 이미 켜져 있을 가능성 확인
fetchLauncherStatus();