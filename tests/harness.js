// 서버 테스트용 가짜 환경
// express / socket.io / multer 를 가짜로 바꿔서, 네트워크 없이 server.js의 게임 로직만 검증합니다.
// makeClient()는 "가짜 브라우저 하나"이고, client.call(이벤트, 데이터)는 실제 socket.emit과 같은 역할을 합니다.
const Module = require("module");
const path = require("path");
const os = require("os");
const fs = require("fs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ql-"));
process.env.QUIZLIVE_DATA_DIR = tmp;
process.env.QUIZLIVE_ADMIN_PIN = "123456";
process.env.QUIZLIVE_PLAYER_GRACE_MS = "40";

const rooms = new Map(); // room -> Set(socket)
const sockets = new Map();
const io = {
  handlers: {},
  on(ev, fn) { this.handlers[ev] = fn; },
  to(room) { return { emit: (ev, d) => (rooms.get(room) || []).forEach(s => s._recv(ev, d)) }; },
  in(room) { return { socketsLeave: () => { (rooms.get(room) || new Set()).forEach(s => s.rooms.delete(room)); rooms.delete(room); } }; },
  emit(ev, d) { sockets.forEach(s => s._recv(ev, d)); },
  of() { return { sockets }; },
};
let n = 0;
function makeClient({ remote = false } = {}) {
  const s = {
    id: "sock" + (++n), data: {}, rooms: new Set(), handlers: {}, inbox: [],
    handshake: { address: "127.0.0.1", headers: remote ? { "cf-connecting-ip": "1.2.3.4" } : {} },
    on(ev, fn) { this.handlers[ev] = fn; },
    emit(ev, d) { this._recv(ev, d); },
    join(r) { this.rooms.add(r); if (!rooms.has(r)) rooms.set(r, new Set()); rooms.get(r).add(this); },
    leave(r) { this.rooms.delete(r); rooms.get(r)?.delete(this); },
    _recv(ev, d) { this.inbox.push([ev, d]); },
    last(ev) { for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i][0] === ev) return this.inbox[i][1]; },
    call(ev, payload, noCb) { return new Promise(r => { const h = this.handlers[ev]; if (!h) throw new Error("no handler " + ev); if (noCb) { h(payload); r(undefined); } else h(payload, r); }); },
    disconnect() { this.rooms.forEach(r => rooms.get(r)?.delete(this)); sockets.delete(this.id); this.handlers.disconnect(); },
  };
  sockets.set(s.id, s);
  io.handlers.connection(s);
  return s;
}
const appStub = () => { const f = (req, res) => {}; Object.assign(f, { use() {}, get() {}, post() {} }); return f; };
appStub.json = () => null; appStub.static = () => null;
const multerStub = () => ({ single: () => (req, res, cb) => cb() }); multerStub.diskStorage = () => ({});
// DB: Node 22.5+ 내장 SQLite를 쓰고, 없으면 서버에 설치된 better-sqlite3를 사용
let DB;
try {
  const { DatabaseSync } = require("node:sqlite");
  DB = class { constructor(p) { this.d = new DatabaseSync(p); } prepare(q) { const s = this.d.prepare(q); return { run: (...a) => s.run(...a), all: (...a) => s.all(...a), get: (...a) => s.get(...a) }; } };
} catch {
  DB = require(path.join(__dirname, "../server/node_modules/better-sqlite3"));
}
const stubs = { express: appStub, cors: () => null, multer: multerStub, "better-sqlite3": DB, "socket.io": { Server: function () { return io; } } };
const origLoad = Module._load;
Module._load = function (req, ...rest) { if (stubs[req]) return stubs[req]; return origLoad.call(this, req, ...rest); };
module.exports = { makeClient, load: (p) => require(p), tmp };
