const assert = require("assert");
const { makeClient, load } = require("./harness");
// 실행:  node tests/server.test.js   (v3 폴더에서)
const path = require("path");
const srv = load(path.join(__dirname, "../server/server.js"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log("  ✓", m); };

(async () => {
  // 채점 함수
  ok(srv.checkAnswer({ quizType: "short", shortAnswer: "회복자세 | 회복 자세를 취한다" }, "회복 자세") === true, "주관식: 띄어쓰기 달라도 정답");
  ok(srv.checkAnswer({ quizType: "short", shortAnswer: "119" }, "119!") === true, "주관식: 문장부호 무시");
  ok(srv.checkAnswer({ quizType: "short", shortAnswer: "119" }, "") === false, "주관식: 빈 답은 오답");
  ok(srv.checkAnswer({ quizType: "balance", correctAnswer: 0 }, 1) === null, "밸런스게임은 채점 안 함");

  const remote = makeClient({ remote: true });
  ok(remote.last("adminStatus").isAdmin === false, "Cloudflare 경유 접속은 관리자가 아님");
  let r = await remote.call("deleteAllQuizzes", {});
  ok(r.success === false && r.needAdmin, "원격 참가자는 전체 삭제 불가");
  r = await remote.call("addQuiz", { quiz: { question: "x", quizType: "ox", correctAnswer: 1 } });
  ok(r.success === false, "원격 참가자는 문제 추가 불가");
  r = await remote.call("getQuizzes", {});
  ok(r.success === false, "원격 참가자는 정답 포함 문제 목록 조회 불가");
  r = await remote.call("createRoom", { nickname: "해커", clientKey: "remote-key-1" });
  ok(r.success === false, "원격은 PIN 없이 방 생성 불가");
  r = await remote.call("adminLogin", { pin: "000000" });
  ok(r.success === false, "틀린 PIN 거부");

  // 콜백 없이 보내도 서버가 죽지 않아야 함
  await remote.call("joinRoom", { roomCode: "000000" }, true);
  await remote.call("deleteAllQuizzes", undefined, true);
  ok(true, "콜백 없는 요청에도 예외 없음");

  // 관리자(로컬)
  const host = makeClient();
  ok(host.last("adminStatus").isAdmin === true, "서버 PC 접속은 자동 관리자");
  const add = (quiz) => host.call("addQuiz", { quiz });
  r = await add({ quizType: "multiple", question: "Q1", choice1: "a", choice2: "b", choice3: "c", choice4: "d", correctAnswer: 3, timeLimit: 30 });
  ok(r.success, "객관식 추가");
  r = await add({ quizType: "balance", question: "짜장 vs 짬뽕", choice1: "짜장", choice2: "짬뽕" });
  ok(r.success, "밸런스 추가");
  r = await add({ quizType: "short", question: "Q3", shortAnswer: "회복자세|회복 자세" });
  ok(r.success, "주관식 추가");
  r = await add({ quizType: "multiple", question: "bad", choice1: "a" });
  ok(!r.success, "보기 비면 거부");

  r = await host.call("createRoom", { nickname: "선생님", clientKey: "host-key-0001" });
  ok(r.success && r.isHost, "방 생성");
  const code = r.roomCode;
  await host.call("updateRoomSettings", { settings: { ...r.settings, questionTime: 10, noSubmitPenaltyEnabled: true, noSubmitPenalty: 20, speedBonusEnabled: true } });

  const p1 = makeClient({ remote: true });
  const p2 = makeClient({ remote: true });
  r = await p1.call("joinRoom", { roomCode: code, nickname: "철수", clientKey: "p1-key-0001" });
  ok(r.success && !r.isHost, "참가자1 입장");
  const p1Id = r.userId;
  ok(p1Id !== "p1-key-0001", "공개 ID와 비밀 키가 분리됨");
  await p2.call("joinRoom", { roomCode: code, nickname: "영희", clientKey: "p2-key-0001" });
  r = await p1.call("startGame", {});
  ok(!r.success, "참가자는 게임 시작 불가");

  r = await host.call("startGame", {});
  ok(r.success, "게임 시작");
  const q1 = p1.last("showQuiz");
  ok(q1.timeLimit === 30 && q1.endsAt - q1.serverNow > 29000, "문제별 제한시간(30초)이 서버 타이머에도 적용");
  ok(q1.correctAnswer === undefined && q1.shortAnswer === undefined, "참가자에게 정답 미전송");

  r = await p1.call("submitAnswer", { selectedAnswer: 3 });
  ok(r.success && r.isCorrect === undefined, "제출 성공, 정답 여부는 공개 전 비공개");
  r = await p1.call("submitAnswer", { selectedAnswer: 3 });
  ok(!r.success, "중복 제출 거부");

  // p2 새로고침(끊김 → 재접속)
  p2.disconnect();
  ok(host.last("updateUsers").find((u) => u.nickname === "영희").connected === false, "끊긴 참가자는 연결 끊김 표시만");
  const p2b = makeClient({ remote: true });
  r = await p2b.call("rejoinRoom", { roomCode: code, clientKey: "p2-key-0001" });
  ok(r.success && r.phase === "quiz" && r.currentQuiz.id === q1.id, "재접속하면 진행 중인 문제로 복귀");

  await host.call("revealAnswer", {});
  const res1 = p1.last("showResult");
  const me = res1.users.find((u) => u.id === p1Id);
  ok(me.isCorrect && me.earnedScore > 100, "정답 + 속도 보너스");
  ok(res1.users.find((u) => u.nickname === "영희").penaltyScore === 20, "미제출 감점 적용");

  // 게임 중 전체 삭제해도 진행 중 게임 유지
  await host.call("deleteAllQuizzes", {});
  r = await host.call("nextQuiz", {});
  ok(r.success && !r.gameEnd, "게임 중 문제 전체 삭제해도 다음 문제 진행");
  const q2 = p1.last("showQuiz");
  ok(q2.quizType === "balance", "두 번째 문제는 밸런스");
  r = await p1.call("submitAnswer", { selectedAnswer: 1 });
  ok(r.success, "밸런스 선택 제출");
  await host.call("revealAnswer", {});
  const res2 = p1.last("showResult");
  ok(res2.users.find((u) => u.id === p1Id).earnedScore === 0, "밸런스게임 A 선택해도 점수 없음");
  ok(res2.users.find((u) => u.nickname === "영희").penaltyScore === 0, "밸런스게임은 미제출 감점 없음");
  ok(res2.answerStats[1] === 1, "밸런스 선택 통계");

  await host.call("nextQuiz", {});
  r = await p2b.call("submitAnswer", { selectedAnswer: "회복 자세." });
  await host.call("revealAnswer", {});
  ok(p1.last("showResult").users.find((u) => u.nickname === "영희").isCorrect, "주관식 유연 채점");
  r = await host.call("nextQuiz", {});
  ok(r.gameEnd && p1.last("gameEnd").ranking.length === 2, "게임 종료 + 최종 순위");

  // ── v3.0.1 추가 검증 ──
  ok(!JSON.stringify(p1.inbox).includes("host-key-0001"), "방장 비밀 키가 참가자에게 전송되지 않음");
  const hostPublicId = p1.last("updateUsers").find((u) => u.role === "host").id;
  const evil = makeClient({ remote: true });
  r = await evil.call("rejoinRoom", { roomCode: code, clientKey: hostPublicId });
  ok(!r.success, "공개 ID로는 방장 자리 탈취 불가");

  // 게임 중 연결 끊김 → 유예시간이 지나도 자리 유지
  await host.call("returnToLobby", {});
  await add({ quizType: "ox", question: "OX", correctAnswer: 1 });
  await host.call("startGame", {});
  const p3 = makeClient({ remote: true });
  r = await p3.call("joinRoom", { roomCode: code, nickname: "졸린애", clientKey: "p3-key-0001" });
  // (테스트에서는 대기시간을 40ms로 줄여 실제 타이머가 여러 번 돌게 함)
  p3.disconnect();
  await wait(150);
  ok(srv.rooms[code].users.some((u) => u.nickname === "졸린애"), "게임 중에는 대기시간이 지나도 자리 유지");
  const p3b = makeClient({ remote: true });
  r = await p3b.call("rejoinRoom", { roomCode: code, clientKey: "p3-key-0001" });
  ok(r.success && r.phase === "quiz", "돌아오면 게임 화면으로 복귀");

  // 강퇴
  r = await p1.call("kickPlayer", { userId: r.userId });
  ok(!r.success, "참가자는 강퇴 불가");
  r = await host.call("kickPlayer", { userId: p3b.last("updateUsers").find((u) => u.nickname === "졸린애").id });
  ok(r.success && p3b.last("kicked"), "방장이 강퇴하면 당사자에게 알림");
  ok(!srv.rooms[code].users.some((u) => u.nickname === "졸린애"), "강퇴된 참가자는 목록에서 제거");
  r = await makeClient({ remote: true }).call("joinRoom", { roomCode: code, nickname: "다시옴", clientKey: "p3-key-0001" });
  ok(!r.success, "강퇴된 브라우저는 재입장 불가");

  // 탭 복제(같은 키로 두 번째 접속) → 이전 탭에 알림
  const dupA = makeClient({ remote: true });
  r = await dupA.call("joinRoom", { roomCode: code, nickname: "복제", clientKey: "dup-key-0001" });
  const dupB = makeClient({ remote: true });
  await dupB.call("rejoinRoom", { roomCode: code, clientKey: "dup-key-0001" });
  ok(dupA.last("sessionMoved"), "같은 자리를 다른 탭이 가져가면 이전 탭에 알림");
  await host.call("endGameNow", {});
  await host.call("returnToLobby", {});
  const lobbyGuy = makeClient({ remote: true });
  await lobbyGuy.call("joinRoom", { roomCode: code, nickname: "대기실이탈", clientKey: "lobby-key-01" });
  lobbyGuy.disconnect();
  await wait(150);
  ok(!srv.rooms[code].users.some((u) => u.nickname === "대기실이탈"), "대기실에서는 대기시간 후 제거");

  // 시간 초과 제출
  // (endsAt 조작으로 확인)
  // 원격 관리자 PIN 로그인
  const tablet = makeClient({ remote: true });
  r = await tablet.call("adminLogin", { pin: "123456" });
  ok(r.success && r.adminToken, "올바른 PIN이면 원격 관리자 허용");
  r = await tablet.call("getQuizzes", {});
  ok(r.success, "PIN 로그인 후 문제 관리 가능");

  // 방장 나가면 방 종료
  await host.call("leaveRoom", {});
  ok(p1.last("roomClosed"), "방장이 나가면 방 종료 알림");
  ok(Object.keys(srv.rooms).length === 0, "방 정리됨");

  console.log(`\n모두 통과: ${pass}개`);
  process.exit(0);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
