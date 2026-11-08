const { io } = require("socket.io-client");

const targetUrl = process.argv[2];
const roomCode = process.argv[3];
const botCount = Number(process.argv[4] || 499);
const joinIntervalMs = Number(process.argv[5] || 100);

if (!targetUrl || !roomCode) {
  console.log(
    "사용법: node load-test.js <사이트주소> <방코드> [인원수] [입장간격ms]"
  );

  console.log(
    '예시: node load-test.js "https://xxxx.trycloudflare.com" 388938 499 100'
  );

  process.exit(1);
}

if (
  !Number.isInteger(botCount) ||
  botCount < 1 ||
  botCount > 2000
) {
  console.error("봇 수는 1명 이상 2000명 이하로 입력하세요.");
  process.exit(1);
}

if (
  !Number.isFinite(joinIntervalMs) ||
  joinIntervalMs < 0 ||
  joinIntervalMs > 10000
) {
  console.error("입장 간격은 0ms 이상 10000ms 이하로 입력하세요.");
  process.exit(1);
}

const sockets = [];

let connectedCount = 0;
let joinedCount = 0;
let failedCount = 0;
let disconnectedCount = 0;
let completedCount = 0;

function printStatus() {
  process.stdout.write(
    `\r연결 ${connectedCount}/${botCount} | ` +
      `입장 성공 ${joinedCount} | ` +
      `실패 ${failedCount} | ` +
      `연결 종료 ${disconnectedCount}`
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createBot(index) {
  return new Promise((resolve) => {
    const nickname = `테스트봇_${String(index).padStart(3, "0")}`;

    const socket = io(targetUrl, {
      transports: ["polling", "websocket"],
      reconnection: false,
      timeout: 60000,
      forceNew: true,
    });

    sockets.push(socket);

    let finished = false;
    let connected = false;
    let joined = false;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      completedCount += 1;

      printStatus();
      resolve();
    };

    const fail = (message) => {
      if (finished) {
        return;
      }

      failedCount += 1;

      console.log(`\n${nickname} 실패: ${message}`);

      if (socket.connected) {
        socket.disconnect();
      }

      finish();
    };

    socket.on("connect", () => {
      connected = true;
      connectedCount += 1;

      printStatus();

      socket.timeout(60000).emit(
        "joinRoom",
        {
          roomCode: String(roomCode),
          nickname,
          clientKey: `loadtest-${process.pid}-${index}`,
        },
        (error, response) => {
          if (error) {
            fail("서버 입장 응답 시간 초과");
            return;
          }

          if (response?.success) {
            joined = true;
            joinedCount += 1;

            finish();
            return;
          }

          fail(response?.message || "알 수 없는 입장 오류");
        }
      );
    });

    socket.on("connect_error", (error) => {
      fail(`연결 실패: ${error.message}`);
    });

    socket.on("disconnect", (reason) => {
      disconnectedCount += 1;

      if (!finished && connected && !joined) {
        fail(`입장 전 연결 종료: ${reason}`);
        return;
      }

      printStatus();
    });

    setTimeout(() => {
      if (!finished) {
        fail("전체 입장 시간 초과");
      }
    }, 70000);
  });
}

async function runTest() {
  console.log("========================================");
  console.log("SAFETY QUIZ 가상 참가자 테스트");
  console.log("========================================");
  console.log(`주소: ${targetUrl}`);
  console.log(`방 코드: ${roomCode}`);
  console.log(`목표 인원: ${botCount}명`);
  console.log(`입장 간격: ${joinIntervalMs}ms`);
  console.log("========================================");

  const botPromises = [];

  for (let index = 1; index <= botCount; index += 1) {
    botPromises.push(createBot(index));

    await wait(joinIntervalMs);
  }

  await Promise.all(botPromises);

  console.log("\n\n========================================");
  console.log("입장 테스트 완료");
  console.log(`연결 성공: ${connectedCount}명`);
  console.log(`방 입장 성공: ${joinedCount}명`);
  console.log(`실패: ${failedCount}명`);
  console.log(`처리 완료: ${completedCount}명`);
  console.log("========================================");

  if (joinedCount > 0) {
    console.log("봇은 계속 방에 접속된 상태입니다.");
    console.log("종료하려면 Ctrl + C를 누르세요.");
  } else {
    console.log("입장에 성공한 봇이 없습니다.");
    console.log("Cloudflare 주소와 방 코드를 다시 확인하세요.");
  }
}

process.on("SIGINT", async () => {
  console.log("\n가상 참가자 연결을 종료합니다...");

  for (const socket of sockets) {
    if (socket.connected) {
      socket.disconnect();
    }
  }

  await wait(500);
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("\n예상하지 못한 오류:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("\n처리되지 않은 오류:", error);
});

runTest().catch((error) => {
  console.error("\n테스트 실행 오류:", error);
  process.exit(1);
});