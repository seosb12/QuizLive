import { io } from "socket.io-client";

export const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:5000`
  : "";

const socket = io(API_BASE || "/", {
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

// ── 탭별 접속 정보 ───────────────────────────
// sessionStorage는 새로고침해도 유지되고, 탭마다 따로라서
// 같은 PC에서 여러 탭으로 테스트해도 서로 섞이지 않습니다.
const KEY_STORAGE = "ql.clientKey";
const SESSION_STORAGE = "ql.session";
const ADMIN_TOKEN_STORAGE = "ql.adminToken";

function readStorage(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null || value === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // 시크릿 모드 등에서 저장이 막혀도 게임은 계속 가능
  }
}

function makeKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getClientKey() {
  let key = readStorage(KEY_STORAGE);
  if (!key) {
    key = makeKey();
    writeStorage(KEY_STORAGE, key);
  }
  return key;
}

export function getSavedRoom() {
  try {
    return JSON.parse(readStorage(SESSION_STORAGE) || "null");
  } catch {
    return null;
  }
}

export function saveRoom(roomCode) {
  writeStorage(SESSION_STORAGE, roomCode ? JSON.stringify({ roomCode }) : null);
}

export function getAdminToken() {
  return readStorage(ADMIN_TOKEN_STORAGE);
}

export function setAdminToken(token) {
  writeStorage(ADMIN_TOKEN_STORAGE, token);
}

// 콜백 대신 await로 쓸 수 있는 emit (응답이 없으면 시간초과 처리)
export function request(eventName, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        resolve({ success: false, message: "서버 응답이 없습니다. 연결 상태를 확인하세요." });
        return;
      }
      resolve(response || { success: false, message: "알 수 없는 응답입니다." });
    });
  });
}

export function mediaSrc(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE}${url}`;
}

export default socket;
