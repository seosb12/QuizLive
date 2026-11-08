const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const multer = require("multer");

// ─────────────────────────────────────────────
// 데이터 위치
// v2와 같은 위치(%APPDATA%\SAFETY QUIZ)를 그대로 써서 기존 문제가 유지됩니다.
// 런처는 QUIZLIVE_DATA_DIR 환경변수로 같은 경로를 넘겨줍니다.
// ─────────────────────────────────────────────
const dataDir =
  process.env.QUIZLIVE_DATA_DIR ||
  path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "SAFETY QUIZ"
  );

const dbPath = path.join(dataDir, "quizlive.db");
const uploadDir = path.join(dataDir, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(dbPath);

// ─────────────────────────────────────────────
// 관리자 인증
// - 서버를 켠 PC에서 직접 접속(localhost)하면 자동으로 관리자
// - 다른 기기에서는 런처에 표시되는 관리자 PIN을 입력해야 관리자
// Cloudflare 터널을 거친 접속은 localhost처럼 보이지만
// cf-connecting-ip / x-forwarded-for 헤더가 붙으므로 원격으로 판단합니다.
// ─────────────────────────────────────────────
const ADMIN_PIN =
  process.env.QUIZLIVE_ADMIN_PIN ||
  String(crypto.randomInt(100000, 1000000));

const adminTokens = new Set();
const MAX_PIN_ATTEMPTS = 5;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLocalRequest(address, headers = {}) {
  if (!LOOPBACK.has(String(address || ""))) return false;

  return !(
    headers["cf-connecting-ip"] ||
    headers["cf-ray"] ||
    headers["x-forwarded-for"] ||
    headers["x-real-ip"]
  );
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAdminHttp(req) {
  if (isLocalRequest(req.socket.remoteAddress, req.headers)) return true;

  const token = req.headers["x-admin-token"];
  return Boolean(token) && adminTokens.has(String(token));
}

// ─────────────────────────────────────────────
// Express / Socket.IO
// ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6,
  pingInterval: 20000,
  pingTimeout: 25000,
});

app.use("/uploads", express.static(uploadDir));

// ─────────────────────────────────────────────
// 파일 업로드
// ─────────────────────────────────────────────
const ALLOWED_MEDIA = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const allowedExt = ALLOWED_MEDIA[file.mimetype] || [];
      const ext = path.extname(file.originalname).toLowerCase();
      const finalExt = allowedExt.includes(ext) ? ext : allowedExt[0] || "";
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${finalExt}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MEDIA[file.mimetype]) {
      cb(new Error("이미지 또는 동영상 파일만 업로드할 수 있습니다."));
      return;
    }
    cb(null, true);
  },
});

app.post(
  "/api/upload",
  (req, res, next) => {
    if (!isAdminHttp(req)) {
      res.status(403).json({ success: false, message: "관리자만 파일을 올릴 수 있습니다." });
      return;
    }
    next();
  },
  (req, res) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "파일이 너무 큽니다. 100MB 이하로 올려주세요."
            : error.message || "파일 업로드에 실패했습니다.";
        res.status(400).json({ success: false, message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, message: "업로드된 파일이 없습니다." });
        return;
      }

      res.json({
        success: true,
        mediaUrl: `/uploads/${req.file.filename}`,
        mediaType: req.file.mimetype.startsWith("video/") ? "video" : "image",
      });
    });
  }
);

// ─────────────────────────────────────────────
// DB
// ─────────────────────────────────────────────
db.prepare(`
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    choice1 TEXT NOT NULL,
    choice2 TEXT NOT NULL,
    choice3 TEXT NOT NULL,
    choice4 TEXT NOT NULL,
    correctAnswer INTEGER NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
  }
}

addColumnIfNotExists("quizzes", "quizType", "TEXT DEFAULT 'multiple'");
addColumnIfNotExists("quizzes", "shortAnswer", "TEXT DEFAULT ''");
addColumnIfNotExists("quizzes", "category", "TEXT DEFAULT ''");
addColumnIfNotExists("quizzes", "mediaUrl", "TEXT DEFAULT ''");
addColumnIfNotExists("quizzes", "mediaType", "TEXT DEFAULT ''");
addColumnIfNotExists("quizzes", "timeLimit", "INTEGER DEFAULT 0");

db.prepare(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`).run();

const QUIZ_TYPES = ["multiple", "ox", "short", "balance"];

const DEFAULT_SETTINGS = {
  questionTime: 20,
  maxPlayers: 30,
  allowLateJoin: true,
  allowDuplicateNicknames: true,
  autoNext: false,
  autoNextDelay: 5,
  baseScore: 100,
  speedBonusEnabled: false,
  speedBonusMax: 50,
  noSubmitPenaltyEnabled: false,
  noSubmitPenalty: 20,
  randomQuestionOrder: false,
  questionLimit: 0,
  excludeUsedQuestions: false,
  resetUsedQuestionsOnLobby: false,
};

function loadSavedGameSettings() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("gameSettings");
  if (!row) return { ...DEFAULT_SETTINGS };

  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch (error) {
    console.error("저장된 게임 설정을 읽지 못했습니다:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveGameSettings(settings) {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run("gameSettings", JSON.stringify(settings));
}

let savedGameSettings = loadSavedGameSettings();

function getAllQuizzes() {
  return db.prepare("SELECT * FROM quizzes ORDER BY id ASC").all();
}

// ─────────────────────────────────────────────
// 문제 검증
// ─────────────────────────────────────────────
function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeQuizInput(quiz = {}) {
  const quizType = QUIZ_TYPES.includes(quiz.quizType) ? quiz.quizType : "multiple";
  const question = cleanText(quiz.question, 1000);

  if (!question) return { error: "문제를 입력하세요." };

  const mediaUrl = cleanText(quiz.mediaUrl, 300);
  if (mediaUrl && !/^\/uploads\/[\w.-]+$/.test(mediaUrl) && !/^https?:\/\//.test(mediaUrl)) {
    return { error: "시각자료 주소가 올바르지 않습니다." };
  }

  const timeLimit = Number(quiz.timeLimit) || 0;
  if (timeLimit !== 0 && (timeLimit < 5 || timeLimit > 300)) {
    return { error: "문제별 제한시간은 5초~300초 사이로 입력하세요. (0 = 기본값)" };
  }

  const data = {
    category: cleanText(quiz.category, 40),
    quizType,
    mediaUrl,
    mediaType: ["image", "video"].includes(quiz.mediaType) ? quiz.mediaType : "",
    question,
    choice1: "",
    choice2: "",
    choice3: "",
    choice4: "",
    correctAnswer: 1,
    shortAnswer: "",
    timeLimit: Math.round(timeLimit),
  };

  if (quizType === "multiple") {
    data.choice1 = cleanText(quiz.choice1, 200);
    data.choice2 = cleanText(quiz.choice2, 200);
    data.choice3 = cleanText(quiz.choice3, 200);
    data.choice4 = cleanText(quiz.choice4, 200);
    if (!data.choice1 || !data.choice2 || !data.choice3 || !data.choice4) {
      return { error: "객관식 보기를 모두 입력하세요." };
    }
    const answer = Number(quiz.correctAnswer);
    if (![1, 2, 3, 4].includes(answer)) return { error: "정답 번호를 선택하세요." };
    data.correctAnswer = answer;
  }

  if (quizType === "ox") {
    data.choice1 = "O";
    data.choice2 = "X";
    const answer = Number(quiz.correctAnswer);
    if (![1, 2].includes(answer)) return { error: "O 또는 X 정답을 선택하세요." };
    data.correctAnswer = answer;
  }

  if (quizType === "balance") {
    data.choice1 = cleanText(quiz.choice1, 200);
    data.choice2 = cleanText(quiz.choice2, 200);
    if (!data.choice1 || !data.choice2) {
      return { error: "밸런스게임 선택지 A와 B를 모두 입력하세요." };
    }
    data.correctAnswer = 0;
  }

  if (quizType === "short") {
    data.shortAnswer = cleanText(quiz.shortAnswer, 500);
    if (!data.shortAnswer) return { error: "주관식 정답을 입력하세요." };
  }

  return { data };
}

// ─────────────────────────────────────────────
// 채점
// ─────────────────────────────────────────────
function normalizeTextAnswer(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\s.,!?·~'"`()[\]{}<>\-_/\\:;]/g, "");
}

// 주관식 정답은 | 또는 줄바꿈으로 여러 개를 등록할 수 있습니다.
// 띄어쓰기·문장부호·대소문자는 무시하고 비교합니다.
function getAcceptedAnswers(shortAnswer) {
  return String(shortAnswer ?? "")
    .split(/[|\n]/)
    .map(normalizeTextAnswer)
    .filter(Boolean);
}

function checkAnswer(quiz, selectedAnswer) {
  const quizType = quiz.quizType || "multiple";

  if (quizType === "balance") return null;

  if (quizType === "short") {
    const given = normalizeTextAnswer(selectedAnswer);
    return Boolean(given) && getAcceptedAnswers(quiz.shortAnswer).includes(given);
  }

  return Number(selectedAnswer) === Number(quiz.correctAnswer);
}

// ─────────────────────────────────────────────
// 방 / 게임 상태
// ─────────────────────────────────────────────
const rooms = {};

const PLAYER_RECONNECT_GRACE_MS = 90 * 1000;
const HOST_RECONNECT_GRACE_MS = 3 * 60 * 1000;
const SUBMIT_GRACE_MS = 800;

function makeRoomCode() {
  for (let i = 0; i < 50; i += 1) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!rooms[code]) return code;
  }
  throw new Error("방 코드를 만들 수 없습니다.");
}

function cleanNickname(nickname) {
  return String(nickname ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
}

function cleanClientKey(key) {
  const value = String(key ?? "");
  return /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

function normalizeNickname(nickname) {
  return cleanNickname(nickname).toLowerCase();
}

function getPlayers(room) {
  return room.users.filter((user) => user.role === "player");
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    role: user.role,
    score: user.score,
    submitted: user.submitted,
    connected: user.connected,
  };
}

function publicUsers(room) {
  return room.users.map(publicUser);
}

function getRanking(room) {
  return getPlayers(room)
    .map(publicUser)
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "ko"));
}

function findUser(room, userId) {
  return room.users.find((user) => user.id === userId);
}

function broadcastUsers(roomCode) {
  const room = rooms[roomCode];
  if (room) io.to(roomCode).emit("updateUsers", publicUsers(room));
}

function clearAutoNextTimer(room) {
  if (room.autoNextTimer) {
    clearTimeout(room.autoNextTimer);
    room.autoNextTimer = null;
  }
}

function shuffleArray(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function makeGameQuizList(allQuizzes, settings, usedQuizIds = []) {
  let quizList = [...allQuizzes];

  if (settings.excludeUsedQuestions) {
    const usedSet = new Set(usedQuizIds.map(String));
    quizList = quizList.filter((quiz) => !usedSet.has(String(quiz.id)));
  }

  if (settings.randomQuestionOrder) quizList = shuffleArray(quizList);

  const limit = Number(settings.questionLimit) || 0;
  if (limit > 0) quizList = quizList.slice(0, limit);

  // 게임 중 문제를 수정·삭제해도 진행 중인 게임은 영향받지 않도록 복사본 사용
  return quizList.map((quiz) => ({ ...quiz }));
}

function getQuizTime(quiz, room) {
  const own = Number(quiz.timeLimit) || 0;
  return own > 0 ? own : room.settings.questionTime;
}

function getSafeQuiz(room) {
  const quiz = room.quizList[room.currentQuizIndex];

  return {
    id: quiz.id,
    quizType: quiz.quizType || "multiple",
    category: quiz.category || "",
    mediaUrl: quiz.mediaUrl || "",
    mediaType: quiz.mediaType || "",
    question: quiz.question,
    choice1: quiz.choice1,
    choice2: quiz.choice2,
    choice3: quiz.choice3,
    choice4: quiz.choice4,
    quizNumber: room.currentQuizIndex + 1,
    totalQuiz: room.quizList.length,
    timeLimit: room.currentTimeLimit,
    endsAt: room.currentQuizEndAt,
  };
}

// 클라이언트가 자기 시계와 서버 시계 차이를 보정할 수 있도록 serverNow를 함께 보냅니다.
function quizPayload(room) {
  return { ...room.currentQuiz, serverNow: Date.now() };
}

function startCurrentQuiz(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const quiz = room.quizList[room.currentQuizIndex];
  if (!quiz) return;

  if (!room.usedQuizIds.some((id) => String(id) === String(quiz.id))) {
    room.usedQuizIds.push(quiz.id);
  }

  clearAutoNextTimer(room);

  room.phase = "quiz";
  room.answers = {};
  room.penalties = {};
  room.penaltyApplied = false;
  room.currentTimeLimit = getQuizTime(quiz, room);
  room.currentQuizStartedAt = Date.now();
  room.currentQuizEndAt = room.currentQuizStartedAt + room.currentTimeLimit * 1000;

  room.users.forEach((user) => {
    user.submitted = false;
  });

  room.currentQuiz = getSafeQuiz(room);

  io.to(roomCode).emit("updateQuizUsage", room.usedQuizIds);
  broadcastUsers(roomCode);
  io.to(roomCode).emit("showQuiz", quizPayload(room));
}

function applyNoSubmitPenalty(room, quiz) {
  if (room.penaltyApplied) return;
  room.penaltyApplied = true;
  room.penalties = {};

  if (!room.settings.noSubmitPenaltyEnabled) return;
  if ((quiz.quizType || "multiple") === "balance") return;

  const penalty = Number(room.settings.noSubmitPenalty) || 0;
  if (penalty <= 0) return;

  getPlayers(room).forEach((user) => {
    if (!room.answers[user.id]) {
      room.penalties[user.id] = penalty;
      user.score = Math.max(0, user.score - penalty);
    }
  });
}

function getResultData(room) {
  const quiz = room.quizList[room.currentQuizIndex];
  if (!quiz) return null;

  const answerStats = { 1: 0, 2: 0, 3: 0, 4: 0 };

  Object.values(room.answers).forEach((answer) => {
    if (answerStats[answer.selectedAnswer] !== undefined) {
      answerStats[answer.selectedAnswer] += 1;
    }
  });

  const users = getPlayers(room).map((user) => {
    const answer = room.answers[user.id];
    return {
      id: user.id,
      nickname: user.nickname,
      score: user.score,
      connected: user.connected,
      submitted: Boolean(answer),
      selectedAnswer: answer ? answer.selectedAnswer : null,
      isCorrect: answer ? answer.isCorrect : false,
      earnedScore: answer ? answer.earnedScore : 0,
      speedBonus: answer ? answer.speedBonus : 0,
      penaltyScore: room.penalties[user.id] || 0,
    };
  });

  return {
    quizNumber: room.currentQuizIndex + 1,
    totalQuiz: room.quizList.length,
    quizType: quiz.quizType || "multiple",
    category: quiz.category || "",
    mediaUrl: quiz.mediaUrl || "",
    mediaType: quiz.mediaType || "",
    question: quiz.question,
    shortAnswer: (quiz.shortAnswer || "").split(/[|\n]/)[0].trim(),
    choice1: quiz.choice1,
    choice2: quiz.choice2,
    choice3: quiz.choice3,
    choice4: quiz.choice4,
    correctAnswer: quiz.correctAnswer,
    answerStats,
    users,
    ranking: getRanking(room),
    isLastQuiz: room.currentQuizIndex >= room.quizList.length - 1,
    autoNext: room.settings.autoNext,
    autoNextDelay: room.settings.autoNextDelay,
    autoNextAt: room.autoNextAt || null,
    serverNow: Date.now(),
  };
}

function endGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearAutoNextTimer(room);
  room.phase = "final";
  room.gameStarted = false;
  room.currentQuiz = null;
  room.finalRanking = getRanking(room);

  io.to(roomCode).emit("gameEnd", { ranking: room.finalRanking });
}

function moveToNextQuiz(roomCode) {
  const room = rooms[roomCode];
  if (!room) return { success: false, message: "방이 존재하지 않습니다." };

  clearAutoNextTimer(room);
  room.autoNextAt = null;
  room.currentQuizIndex += 1;

  if (room.currentQuizIndex >= room.quizList.length) {
    endGame(roomCode);
    return { success: true, gameEnd: true };
  }

  startCurrentQuiz(roomCode);
  return { success: true, gameEnd: false };
}

function closeRoom(roomCode, message) {
  const room = rooms[roomCode];
  if (!room) return;

  clearAutoNextTimer(room);
  room.users.forEach((user) => clearTimeout(user.removeTimer));
  io.to(roomCode).emit("roomClosed", { message });
  io.in(roomCode).socketsLeave(roomCode);
  delete rooms[roomCode];
}

function removeUser(roomCode, userId) {
  const room = rooms[roomCode];
  if (!room) return;

  const user = findUser(room, userId);
  if (!user) return;

  clearTimeout(user.removeTimer);

  if (user.role === "host") {
    closeRoom(roomCode, "방장이 나가서 방이 종료되었습니다.");
    return;
  }

  room.users = room.users.filter((item) => item.id !== userId);
  delete room.answers[userId];
  broadcastUsers(roomCode);
}

// 접속 직후/재접속 시 현재 화면을 맞춰주기 위한 상태
function getRoomSnapshot(room, user) {
  return {
    roomCode: room.code,
    userId: user.id,
    nickname: user.nickname,
    isHost: user.role === "host",
    settings: room.settings,
    users: publicUsers(room),
    phase: room.phase,
    currentQuiz: room.phase === "quiz" && room.currentQuiz ? quizPayload(room) : null,
    myAnswer: room.answers[user.id] || null,
    result: room.phase === "result" ? getResultData(room) : null,
    ranking: room.phase === "final" ? room.finalRanking || getRanking(room) : null,
  };
}

const SETTING_RULES = {
  questionTime: [5, 300, "제한시간은 5초 이상 300초 이하로 설정하세요."],
  maxPlayers: [1, 1000, "최대 참가자 수는 1명 이상 1000명 이하로 설정하세요."],
  autoNextDelay: [1, 60, "자동 넘김 대기시간은 1초 이상 60초 이하로 설정하세요."],
  baseScore: [1, 10000, "문제당 점수는 1점 이상 10000점 이하로 설정하세요."],
  speedBonusMax: [0, 10000, "빠른 정답 추가점수는 0점 이상 10000점 이하로 설정하세요."],
  noSubmitPenalty: [0, 10000, "미제출 감점은 0점 이상 10000점 이하로 설정하세요."],
  questionLimit: [0, 300, "출제 문제 수는 0개 이상 300개 이하로 설정하세요."],
};

const BOOLEAN_SETTINGS = [
  "allowLateJoin",
  "allowDuplicateNicknames",
  "autoNext",
  "speedBonusEnabled",
  "noSubmitPenaltyEnabled",
  "randomQuestionOrder",
  "excludeUsedQuestions",
  "resetUsedQuestionsOnLobby",
];

function validateSettings(input = {}) {
  const settings = {};

  for (const [key, [min, max, message]] of Object.entries(SETTING_RULES)) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max) return { error: message };
    settings[key] = Math.round(value);
  }

  BOOLEAN_SETTINGS.forEach((key) => {
    settings[key] = Boolean(input[key]);
  });

  return { settings };
}

// ─────────────────────────────────────────────
// HTTP: 런처 전용 상태 조회 (서버 PC에서만)
// ─────────────────────────────────────────────
app.get("/api/launcher-status", (req, res) => {
  if (!isLocalRequest(req.socket.remoteAddress, req.headers)) {
    res.status(404).end();
    return;
  }

  const roomList = Object.values(rooms).map((room) => ({
    roomCode: room.code,
    phase: room.phase,
    gameStarted: room.gameStarted,
    playerCount: getPlayers(room).length,
  }));

  res.json({
    success: true,
    adminPin: ADMIN_PIN,
    totalPlayers: roomList.reduce((sum, room) => sum + room.playerCount, 0),
    roomCount: roomList.length,
    rooms: roomList,
  });
});

// 런처가 Cloudflare 주소를 알려주면 방장 화면에 QR로 보여줍니다 (서버 PC에서만)
let publicUrl = "";

app.post("/api/public-url", (req, res) => {
  if (!isLocalRequest(req.socket.remoteAddress, req.headers)) {
    res.status(404).end();
    return;
  }

  const url = String(req.body?.url || "");
  publicUrl = /^https:\/\/[\w.-]+$/.test(url) ? url : "";

  for (const [, client] of io.of("/").sockets) {
    if (client.data.isAdmin) client.emit("publicUrl", publicUrl);
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.data.isAdmin = isLocalRequest(socket.handshake.address, socket.handshake.headers);
  socket.data.pinAttempts = 0;
  socket.emit("adminStatus", { isAdmin: socket.data.isAdmin });
  if (socket.data.isAdmin) socket.emit("publicUrl", publicUrl);

  // 모든 이벤트를 안전하게 감싸서, 잘못된 요청 하나로 서버 전체가 꺼지지 않게 합니다.
  const on = (eventName, handler, { admin = false } = {}) => {
    socket.on(eventName, (...args) => {
      const callback = typeof args[args.length - 1] === "function" ? args.pop() : () => {};
      const payload = args[0] && typeof args[0] === "object" ? args[0] : {};
      let replied = false;
      const reply = (data) => {
        if (replied) return;
        replied = true;
        try {
          callback(data);
        } catch (error) {
          console.error(`[${eventName}] 응답 실패`, error);
        }
      };

      if (admin && !socket.data.isAdmin) {
        reply({ success: false, needAdmin: true, message: "관리자 PIN이 필요합니다." });
        return;
      }

      try {
        handler(payload, reply);
      } catch (error) {
        console.error(`[${eventName}] 처리 중 오류`, error);
        reply({ success: false, message: "서버에서 오류가 발생했습니다. 다시 시도해주세요." });
      }
    });
  };

  // 현재 소켓이 들어가 있는 방과 사용자
  const current = () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return {};
    const user = findUser(room, socket.data.userId);
    if (!user || user.socketId !== socket.id) return {};
    return { room, user, roomCode: room.code };
  };

  const requireHost = (reply) => {
    const ctx = current();
    if (!ctx.room) {
      reply({ success: false, message: "방이 존재하지 않습니다." });
      return null;
    }
    if (ctx.user.role !== "host") {
      reply({ success: false, message: "방장만 할 수 있는 작업입니다." });
      return null;
    }
    return ctx;
  };

  const attach = (room, user) => {
    // 다른 방에 들어가 있던 소켓이면 이전 방에서 먼저 나갑니다
    const previous = current();
    if (previous.room && previous.roomCode !== room.code) {
      socket.leave(previous.roomCode);
      removeUser(previous.roomCode, previous.user.id);
    }

    clearTimeout(user.removeTimer);
    user.removeTimer = null;
    user.socketId = socket.id;
    user.connected = true;
    socket.data.roomCode = room.code;
    socket.data.userId = user.id;
    socket.join(room.code);
  };

  on("adminLogin", ({ pin }, reply) => {
    if (socket.data.isAdmin) {
      reply({ success: true, adminToken: socket.data.adminToken || null });
      return;
    }

    if (socket.data.pinAttempts >= MAX_PIN_ATTEMPTS) {
      reply({ success: false, message: "시도 횟수를 초과했습니다. 새로고침 후 다시 시도하세요." });
      return;
    }

    socket.data.pinAttempts += 1;

    if (!safeEqual(String(pin ?? "").trim(), ADMIN_PIN)) {
      reply({
        success: false,
        message: `PIN이 맞지 않습니다. (${socket.data.pinAttempts}/${MAX_PIN_ATTEMPTS})`,
      });
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");
    adminTokens.add(token);
    socket.data.isAdmin = true;
    socket.data.adminToken = token;
    socket.emit("adminStatus", { isAdmin: true });
    socket.emit("publicUrl", publicUrl);
    reply({ success: true, adminToken: token });
  });

  on(
    "createRoom",
    ({ nickname, clientKey }, reply) => {
      const name = cleanNickname(nickname);
      const key = cleanClientKey(clientKey);

      if (!name) return reply({ success: false, message: "닉네임을 입력하세요." });
      if (!key) return reply({ success: false, message: "잘못된 접속 정보입니다. 새로고침해주세요." });

      const roomCode = makeRoomCode();

      const room = {
        code: roomCode,
        users: [],
        currentQuizIndex: 0,
        currentQuiz: null,
        currentTimeLimit: 0,
        currentQuizStartedAt: null,
        currentQuizEndAt: null,
        answers: {},
        penalties: {},
        penaltyApplied: false,
        gameStarted: false,
        phase: "lobby",
        settings: { ...savedGameSettings },
        autoNextTimer: null,
        autoNextAt: null,
        quizList: [],
        usedQuizIds: [],
        finalRanking: null,
      };

      const host = { id: key, nickname: name, role: "host", score: 0, submitted: false };
      room.users.push(host);
      rooms[roomCode] = room;
      attach(room, host);

      reply({ success: true, ...getRoomSnapshot(room, host) });
      broadcastUsers(roomCode);
    },
    { admin: true }
  );

  on("joinRoom", ({ roomCode, nickname, clientKey }, reply) => {
    const code = String(roomCode ?? "").trim();
    const room = rooms[code];
    const name = cleanNickname(nickname);
    const key = cleanClientKey(clientKey);

    if (!room) return reply({ success: false, message: "방이 존재하지 않습니다. 참여코드를 확인하세요." });
    if (!name) return reply({ success: false, message: "닉네임을 입력하세요." });
    if (!key) return reply({ success: false, message: "잘못된 접속 정보입니다. 새로고침해주세요." });

    // 같은 기기(같은 탭)가 다시 들어오면 기존 자리로 복귀
    const existing = findUser(room, key);
    if (existing) {
      attach(room, existing);
      reply({ success: true, ...getRoomSnapshot(room, existing) });
      broadcastUsers(code);
      return;
    }

    if (room.gameStarted && !room.settings.allowLateJoin) {
      return reply({ success: false, message: "이미 게임이 시작되어 중간 입장이 불가능합니다." });
    }

    if (getPlayers(room).length >= room.settings.maxPlayers) {
      return reply({ success: false, message: "참가 인원이 가득 찼습니다." });
    }

    if (
      !room.settings.allowDuplicateNicknames &&
      room.users.some((user) => normalizeNickname(user.nickname) === normalizeNickname(name))
    ) {
      return reply({ success: false, message: "이미 사용 중인 닉네임입니다." });
    }

    const player = { id: key, nickname: name, role: "player", score: 0, submitted: false };
    room.users.push(player);
    attach(room, player);

    reply({ success: true, ...getRoomSnapshot(room, player) });
    broadcastUsers(code);
  });

  // 새로고침·화면 꺼짐 등으로 끊겼다가 돌아온 경우
  on("rejoinRoom", ({ roomCode, clientKey }, reply) => {
    const room = rooms[String(roomCode ?? "")];
    const key = cleanClientKey(clientKey);
    const user = room && key ? findUser(room, key) : null;

    if (!user) return reply({ success: false, message: "이전 방에 다시 들어갈 수 없습니다." });

    attach(room, user);
    if (user.role === "host") {
      socket.data.isAdmin = true;
      socket.emit("adminStatus", { isAdmin: true });
      socket.emit("publicUrl", publicUrl);
      io.to(room.code).emit("hostStatus", { connected: true });
    }

    reply({ success: true, ...getRoomSnapshot(room, user) });
    broadcastUsers(room.code);
  });

  on("updateRoomSettings", ({ settings }, reply) => {
    const ctx = requireHost(reply);
    if (!ctx) return;

    const { settings: next, error } = validateSettings(settings);
    if (error) return reply({ success: false, message: error });

    const playerCount = getPlayers(ctx.room).length;
    if (next.maxPlayers < playerCount) {
      return reply({
        success: false,
        message: `현재 참가자가 ${playerCount}명이라 최대 인원을 그보다 낮게 설정할 수 없습니다.`,
      });
    }

    ctx.room.settings = next;
    savedGameSettings = { ...next };
    saveGameSettings(savedGameSettings);

    reply({ success: true, settings: next });
    io.to(ctx.roomCode).emit("updateSettings", next);
  });

  on(
    "getQuizzes",
    (payload, reply) => {
      const room = rooms[socket.data.roomCode];
      reply({ success: true, quizzes: getAllQuizzes(), usedQuizIds: room?.usedQuizIds || [] });
    },
    { admin: true }
  );

  on(
    "resetUsedQuizHistory",
    (payload, reply) => {
      const ctx = requireHost(reply);
      if (!ctx) return;

      ctx.room.usedQuizIds = [];
      reply({ success: true, usedQuizIds: [] });
      io.to(ctx.roomCode).emit("updateQuizUsage", []);
    },
    { admin: true }
  );

  const emitQuizzesToAdmins = () => {
    const quizzes = getAllQuizzes();
    for (const [, client] of io.of("/").sockets) {
      if (client.data.isAdmin) client.emit("updateQuizzes", quizzes);
    }
    return quizzes;
  };

  on(
    "addQuiz",
    ({ quiz }, reply) => {
      const { data, error } = normalizeQuizInput(quiz);
      if (error) return reply({ success: false, message: error });

      const result = db
        .prepare(`
          INSERT INTO quizzes
          (category, quizType, mediaUrl, mediaType, question, choice1, choice2, choice3, choice4, correctAnswer, shortAnswer, timeLimit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          data.category,
          data.quizType,
          data.mediaUrl,
          data.mediaType,
          data.question,
          data.choice1,
          data.choice2,
          data.choice3,
          data.choice4,
          data.correctAnswer,
          data.shortAnswer,
          data.timeLimit
        );

      reply({ success: true, id: Number(result.lastInsertRowid), quizzes: emitQuizzesToAdmins() });
    },
    { admin: true }
  );

  on(
    "updateQuiz",
    ({ quiz }, reply) => {
      const id = Number(quiz?.id);
      if (!Number.isInteger(id)) return reply({ success: false, message: "수정할 문제 ID가 없습니다." });

      const { data, error } = normalizeQuizInput(quiz);
      if (error) return reply({ success: false, message: error });

      db.prepare(`
        UPDATE quizzes SET
          category = ?, quizType = ?, mediaUrl = ?, mediaType = ?, question = ?,
          choice1 = ?, choice2 = ?, choice3 = ?, choice4 = ?,
          correctAnswer = ?, shortAnswer = ?, timeLimit = ?
        WHERE id = ?
      `).run(
        data.category,
        data.quizType,
        data.mediaUrl,
        data.mediaType,
        data.question,
        data.choice1,
        data.choice2,
        data.choice3,
        data.choice4,
        data.correctAnswer,
        data.shortAnswer,
        data.timeLimit,
        id
      );

      reply({ success: true, quizzes: emitQuizzesToAdmins() });
    },
    { admin: true }
  );

  on(
    "deleteQuiz",
    ({ quizId }, reply) => {
      db.prepare("DELETE FROM quizzes WHERE id = ?").run(Number(quizId));

      Object.values(rooms).forEach((room) => {
        room.usedQuizIds = room.usedQuizIds.filter((id) => String(id) !== String(quizId));
      });

      reply({ success: true, quizzes: emitQuizzesToAdmins() });
    },
    { admin: true }
  );

  on(
    "deleteAllQuizzes",
    (payload, reply) => {
      db.prepare("DELETE FROM quizzes").run();

      Object.values(rooms).forEach((room) => {
        room.usedQuizIds = [];
        io.to(room.code).emit("updateQuizUsage", []);
      });

      reply({ success: true, quizzes: emitQuizzesToAdmins() });
    },
    { admin: true }
  );

  on("startGame", (payload, reply) => {
    const ctx = requireHost(reply);
    if (!ctx) return;
    const { room, roomCode } = ctx;

    const quizzes = getAllQuizzes();
    if (quizzes.length === 0) {
      return reply({ success: false, message: "저장된 문제가 없습니다. 문제를 먼저 만들어주세요." });
    }

    const quizList = makeGameQuizList(quizzes, room.settings, room.usedQuizIds);
    if (quizList.length === 0) {
      return reply({
        success: false,
        message: "출제 가능한 새 문제가 없습니다. 출제 기록을 초기화하거나 '이미 출제한 문제 제외'를 꺼주세요.",
      });
    }

    clearAutoNextTimer(room);
    room.gameStarted = true;
    room.currentQuizIndex = 0;
    room.quizList = quizList;
    room.finalRanking = null;
    room.users.forEach((user) => {
      user.score = 0;
      user.submitted = false;
    });

    reply({ success: true });
    startCurrentQuiz(roomCode);
  });

  on("submitAnswer", ({ selectedAnswer }, reply) => {
    const { room, user, roomCode } = current();

    if (!room) return reply({ success: false, message: "방이 존재하지 않습니다." });
    if (user.role === "host") return reply({ success: false, message: "관리자는 답안을 제출할 수 없습니다." });
    if (room.phase !== "quiz") return reply({ success: false, message: "지금은 답안을 제출할 수 없습니다." });
    if (Date.now() > room.currentQuizEndAt + SUBMIT_GRACE_MS) {
      return reply({ success: false, message: "시간이 종료되었습니다." });
    }
    if (room.answers[user.id]) return reply({ success: false, message: "이미 제출했습니다." });

    const quiz = room.quizList[room.currentQuizIndex];
    const quizType = quiz.quizType || "multiple";
    let answer;

    if (quizType === "short") {
      answer = cleanText(selectedAnswer, 200);
      if (!answer) return reply({ success: false, message: "답안을 입력하세요." });
    } else {
      answer = Number(selectedAnswer);
      const allowed = quizType === "multiple" ? [1, 2, 3, 4] : [1, 2];
      if (!allowed.includes(answer)) return reply({ success: false, message: "올바른 답안을 선택하세요." });
    }

    const isCorrect = checkAnswer(quiz, answer);
    let speedBonus = 0;

    if (isCorrect && room.settings.speedBonusEnabled) {
      const totalMs = room.currentTimeLimit * 1000;
      const remainingMs = Math.max(0, room.currentQuizEndAt - Date.now());
      speedBonus = Math.round((remainingMs / totalMs) * room.settings.speedBonusMax);
    }

    const earnedScore = isCorrect ? room.settings.baseScore + speedBonus : 0;

    room.answers[user.id] = { selectedAnswer: answer, isCorrect, earnedScore, speedBonus };
    user.submitted = true;
    user.score += earnedScore;

    // 정답 여부는 정답 공개 때 알려줍니다 (제출 직후 결과가 다른 사람에게 새지 않도록)
    reply({ success: true });
    broadcastUsers(roomCode);
  });

  on("revealAnswer", (payload, reply) => {
    const ctx = requireHost(reply);
    if (!ctx) return;
    const { room, roomCode } = ctx;

    if (room.phase !== "quiz") return reply({ success: false, message: "지금은 정답을 공개할 수 없습니다." });

    const quiz = room.quizList[room.currentQuizIndex];
    room.phase = "result";
    applyNoSubmitPenalty(room, quiz);

    clearAutoNextTimer(room);
    room.autoNextAt = null;

    if (room.settings.autoNext) {
      room.autoNextAt = Date.now() + room.settings.autoNextDelay * 1000;
      room.autoNextTimer = setTimeout(() => {
        try {
          moveToNextQuiz(roomCode);
        } catch (error) {
          console.error("자동 넘김 오류", error);
        }
      }, room.settings.autoNextDelay * 1000);
    }

    reply({ success: true });
    broadcastUsers(roomCode);
    io.to(roomCode).emit("showResult", getResultData(room));
  });

  on("nextQuiz", (payload, reply) => {
    const ctx = requireHost(reply);
    if (!ctx) return;
    if (ctx.room.phase !== "result") return reply({ success: false, message: "먼저 정답을 공개하세요." });
    reply(moveToNextQuiz(ctx.roomCode));
  });

  on("endGameNow", (payload, reply) => {
    const ctx = requireHost(reply);
    if (!ctx) return;
    if (!ctx.room.gameStarted) return reply({ success: false, message: "진행 중인 게임이 없습니다." });
    endGame(ctx.roomCode);
    reply({ success: true });
  });

  on("returnToLobby", (payload, reply) => {
    const ctx = requireHost(reply);
    if (!ctx) return;
    const { room, roomCode } = ctx;

    clearAutoNextTimer(room);
    room.gameStarted = false;
    room.phase = "lobby";
    room.currentQuiz = null;
    room.currentQuizStartedAt = null;
    room.currentQuizEndAt = null;
    room.answers = {};
    room.penalties = {};
    room.penaltyApplied = false;
    room.quizList = [];
    room.finalRanking = null;
    room.autoNextAt = null;

    if (room.settings.resetUsedQuestionsOnLobby) room.usedQuizIds = [];

    room.users.forEach((user) => {
      user.score = 0;
      user.submitted = false;
    });

    reply({ success: true });
    broadcastUsers(roomCode);
    io.to(roomCode).emit("updateQuizUsage", room.usedQuizIds);
    io.to(roomCode).emit("backToLobby");
  });

  on("leaveRoom", (payload, reply) => {
    const { room, user, roomCode } = current();
    if (room) {
      socket.leave(roomCode);
      removeUser(roomCode, user.id);
    }
    socket.data.roomCode = null;
    socket.data.userId = null;
    reply({ success: true });
  });

  socket.on("disconnect", () => {
    const { room, user, roomCode } = current();
    if (!room) return;

    user.connected = false;
    user.socketId = null;
    broadcastUsers(roomCode);

    if (user.role === "host") {
      io.to(roomCode).emit("hostStatus", { connected: false });
    }

    // 바로 내보내지 않고 잠시 기다립니다 (새로고침·화면 꺼짐 대비)
    const grace = user.role === "host" ? HOST_RECONNECT_GRACE_MS : PLAYER_RECONNECT_GRACE_MS;
    user.removeTimer = setTimeout(() => {
      const latestRoom = rooms[roomCode];
      const latestUser = latestRoom && findUser(latestRoom, user.id);
      if (latestUser && !latestUser.connected) removeUser(roomCode, user.id);
    }, grace);
  });
});

// ─────────────────────────────────────────────
// 화면 파일 제공
// ─────────────────────────────────────────────
const clientDistPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientDistPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

process.on("uncaughtException", (error) => {
  console.error("처리되지 않은 오류:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("처리되지 않은 Promise 오류:", error);
});

const PORT = Number(process.env.PORT) || 5000;

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`데이터 폴더: ${dataDir}`);
    console.log(`관리자 PIN: ${ADMIN_PIN}`);
  });
}

module.exports = { server, io, rooms, ADMIN_PIN, normalizeTextAnswer, getAcceptedAnswers, checkAnswer };
