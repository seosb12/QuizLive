import { useCallback, useEffect, useRef, useState } from "react";
import socket, { getClientKey, getSavedRoom, request, saveRoom, setAdminToken } from "./socket";
import { askAdminPin, confirmDialog, notify, toast } from "./utils/dialog";

import Home from "./components/Home";
import Lobby from "./components/Lobby";
import CreateQuiz from "./components/CreateQuiz";
import GameSettings from "./components/GameSettings";
import Quiz from "./components/Quiz";
import Result from "./components/Result";
import Final from "./components/Final";

function App() {
  const [page, setPage] = useState("home");
  const [roomCode, setRoomCode] = useState("");
  const [myId, setMyId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);

  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [myAnswer, setMyAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [ranking, setRanking] = useState([]);

  const [connected, setConnected] = useState(socket.connected);
  const [hostOnline, setHostOnline] = useState(true);
  const [publicUrl, setPublicUrl] = useState("");

  const roomRef = useRef("");

  const resetToHome = useCallback(() => {
    saveRoom(null);
    roomRef.current = "";
    setPage("home");
    setRoomCode("");
    setMyId("");
    setIsHost(false);
    setUsers([]);
    setCurrentQuiz(null);
    setMyAnswer(null);
    setResult(null);
    setRanking([]);
    setHostOnline(true);
  }, []);

  // 서버가 보내준 방 상태로 화면을 맞춥니다 (입장·재접속 공통)
  const applySnapshot = useCallback((snap) => {
    roomRef.current = snap.roomCode;
    saveRoom(snap.roomCode);
    setRoomCode(snap.roomCode);
    setMyId(snap.userId);
    setIsHost(snap.isHost);
    setUsers(snap.users || []);
    setSettings(snap.settings);
    setHostOnline(true);

    if (snap.phase === "quiz" && snap.currentQuiz) {
      setCurrentQuiz(snap.currentQuiz);
      setMyAnswer(snap.myAnswer ? snap.myAnswer.selectedAnswer : null);
      setResult(null);
      setPage("quiz");
    } else if (snap.phase === "result" && snap.result) {
      setResult(snap.result);
      setPage("result");
    } else if (snap.phase === "final" && snap.ranking) {
      setRanking(snap.ranking);
      setPage("final");
    } else {
      setPage((prev) => (prev === "createQuiz" || prev === "settings" ? prev : "lobby"));
    }
  }, []);

  useEffect(() => {
    const tryRejoin = async () => {
      const saved = getSavedRoom();
      if (!saved?.roomCode) return;

      const res = await request("rejoinRoom", { roomCode: saved.roomCode, clientKey: getClientKey() });
      if (res.success) {
        applySnapshot(res);
      } else if (roomRef.current) {
        resetToHome();
        notify("방이 종료되었거나 다시 들어갈 수 없습니다.", "연결 종료");
      } else {
        saveRoom(null);
      }
    };

    const handlers = {
      connect: () => {
        setConnected(true);
        tryRejoin();
      },
      disconnect: () => setConnected(false),
      updateUsers: setUsers,
      updateSettings: setSettings,
      publicUrl: (url) => setPublicUrl(url || ""),
      hostStatus: ({ connected: online }) => setHostOnline(online),
      showQuiz: (quiz) => {
        setCurrentQuiz(quiz);
        setMyAnswer(null);
        setResult(null);
        setPage("quiz");
      },
      showResult: (data) => {
        setResult(data);
        setPage("result");
      },
      gameEnd: (data) => {
        setRanking(data.ranking || []);
        setPage("final");
      },
      backToLobby: () => {
        setCurrentQuiz(null);
        setResult(null);
        setRanking([]);
        setPage("lobby");
      },
      roomClosed: (data) => {
        resetToHome();
        notify(data?.message || "방이 종료되었습니다.", "방 종료");
      },
    };

    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    if (socket.connected) tryRejoin();

    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
    };
  }, [applySnapshot, resetToHome]);

  // ── 동작 ────────────────────────────────────
  const fail = (res) => {
    if (!res.success) notify(res.message || "요청을 처리하지 못했습니다.", "앗");
    return !res.success;
  };

  const ensureAdmin = async () => {
    const res = await askAdminPin((pin) => request("adminLogin", { pin }));
    if (res?.adminToken) setAdminToken(res.adminToken);
    return Boolean(res);
  };

  const createRoom = async (nickname) => {
    let res = await request("createRoom", { nickname, clientKey: getClientKey() });

    if (!res.success && res.needAdmin) {
      if (!(await ensureAdmin())) return;
      res = await request("createRoom", { nickname, clientKey: getClientKey() });
    }

    if (fail(res)) return;
    applySnapshot(res);
  };

  const joinRoom = async (code, nickname) => {
    const res = await request("joinRoom", { roomCode: code, nickname, clientKey: getClientKey() });
    if (fail(res)) return;
    applySnapshot(res);
  };

  const saveSettings = async (next) => {
    const res = await request("updateRoomSettings", { settings: next });
    if (fail(res)) return false;
    setSettings(res.settings);
    toast("설정을 저장했어요");
    return true;
  };

  const startGame = async () => fail(await request("startGame"));
  const revealAnswer = async () => fail(await request("revealAnswer"));
  const nextQuiz = async () => fail(await request("nextQuiz"));

  const submitAnswer = async (answer) => {
    const res = await request("submitAnswer", { selectedAnswer: answer });
    if (res.success) setMyAnswer(answer);
    else notify(res.message, "제출 실패");
    return res.success;
  };

  const endGameNow = async () => {
    const ok = await confirmDialog("지금까지의 점수로 게임을 끝낼까요?", "게임 종료", "종료", "계속 진행", true);
    if (ok) fail(await request("endGameNow"));
  };

  const goLobbyAfterGame = async () => {
    if (isHost) {
      if (fail(await request("returnToLobby"))) return;
    }
    setCurrentQuiz(null);
    setResult(null);
    setRanking([]);
    setPage("lobby");
  };

  const leaveGame = async () => {
    const message = isHost
      ? "방장이 나가면 방이 종료되고 모든 참가자가 나가게 됩니다."
      : "방에서 나갈까요?";
    if (!(await confirmDialog(message, "나가기", "나가기", "취소", isHost))) return;
    await request("leaveRoom");
    resetToHome();
  };

  // ── 화면 ────────────────────────────────────
  let content = null;

  if (page === "home") {
    content = <Home onCreate={createRoom} onJoin={joinRoom} />;
  } else if (page === "lobby") {
    content = (
      <Lobby
        roomCode={roomCode}
        myId={myId}
        users={users}
        isHost={isHost}
        settings={settings}
        publicUrl={publicUrl}
        onCreateQuiz={() => setPage("createQuiz")}
        onSettings={() => setPage("settings")}
        onStart={startGame}
        onLeave={leaveGame}
      />
    );
  } else if (page === "settings" && settings) {
    content = <GameSettings settings={settings} onSave={saveSettings} onBack={() => setPage("lobby")} />;
  } else if (page === "createQuiz") {
    content = <CreateQuiz onBack={() => setPage("lobby")} />;
  } else if (page === "quiz" && currentQuiz) {
    content = (
      <Quiz
        quiz={currentQuiz}
        users={users}
        isHost={isHost}
        myAnswer={myAnswer}
        onSubmit={submitAnswer}
        onReveal={revealAnswer}
        onEndGame={endGameNow}
      />
    );
  } else if (page === "result" && result) {
    content = <Result result={result} myId={myId} isHost={isHost} onNext={nextQuiz} onEndGame={endGameNow} />;
  } else if (page === "final") {
    content = (
      <Final ranking={ranking} myId={myId} isHost={isHost} onLobby={goLobbyAfterGame} onLeave={leaveGame} />
    );
  }

  return (
    <>
      {!connected && <div className="banner banner-warn">연결이 끊겼어요. 다시 연결하는 중…</div>}
      {connected && !isHost && !hostOnline && page !== "home" && (
        <div className="banner">방장 연결이 잠시 끊겼어요. 그대로 기다려 주세요.</div>
      )}
      {content}
    </>
  );
}

export default App;
