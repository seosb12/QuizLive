import { useEffect, useState } from "react";
import QRCode from "qrcode";

function JoinQr({ url }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#0E0F1A", light: "#FFFFFF" } })
      .then((data) => alive && setSrc(data))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [url]);

  return src ? <img className="qr" src={src} alt="참가 QR 코드" /> : null;
}

function Lobby({ roomCode, myId, users, isHost, settings, publicUrl, onCreateQuiz, onSettings, onStart, onLeave }) {
  const players = users.filter((user) => user.role === "player");
  const me = users.find((user) => user.id === myId);
  const [starting, setStarting] = useState(false);

  // 방장이 서버 PC(localhost)에서 접속했다면 Cloudflare 주소를, 아니면 지금 주소를 안내
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const baseUrl = publicUrl || (isLocalHost ? "" : window.location.origin);
  const joinUrl = baseUrl ? `${baseUrl}/?code=${roomCode}` : "";

  const start = async () => {
    setStarting(true);
    await onStart();
    setStarting(false);
  };

  if (!isHost) {
    return (
      <main className="screen center">
        <section className="panel waiting">
          <p className="eyebrow">ROOM {roomCode}</p>
          <div className="pulse" aria-hidden="true" />
          <h1 className="title">입장 완료</h1>
          <p className="me-chip">{me?.nickname}</p>
          <p className="muted">진행자가 게임을 시작하면 자동으로 넘어가요.</p>
          <p className="count">
            <b className="num">{players.length}</b>명 참가 중
          </p>
          <button className="btn btn-ghost" onClick={onLeave}>
            나가기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen host">
      <header className="host-bar">
        <span className="logo-sm">
          SAFETY<span>QUIZ</span>
        </span>
        <div className="host-bar-actions">
          <button className="btn btn-ghost btn-sm" onClick={onSettings}>
            게임 설정
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCreateQuiz}>
            문제 관리
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onLeave}>
            방 닫기
          </button>
        </div>
      </header>

      <section className="lobby-grid">
        <div className="join-card">
          <p className="eyebrow">참여코드</p>
          <p className="room-code num">{roomCode}</p>

          {joinUrl ? (
            <>
              <JoinQr url={joinUrl} />
              <p className="join-url">{baseUrl.replace(/^https?:\/\//, "")}</p>
            </>
          ) : (
            <p className="muted small">
              런처에서 서버를 시작하면 참가용 QR 코드가 여기에 표시돼요.
            </p>
          )}
        </div>

        <div className="players-card">
          <div className="players-head">
            <h2>참가자</h2>
            <span className="num big-count">
              {players.length}
              <small>/{settings?.maxPlayers ?? "-"}</small>
            </span>
          </div>

          {players.length === 0 ? (
            <div className="empty">
              <div className="pulse" aria-hidden="true" />
              <p>참가자를 기다리는 중</p>
            </div>
          ) : (
            <ul className="chips">
              {players.map((user) => (
                <li key={user.id} className={user.connected === false ? "chip off" : "chip"}>
                  {user.nickname}
                </li>
              ))}
            </ul>
          )}

          {settings && (
            <dl className="summary">
              <div>
                <dt>제한시간</dt>
                <dd className="num">{settings.questionTime}s</dd>
              </div>
              <div>
                <dt>문제 수</dt>
                <dd>{settings.questionLimit > 0 ? `${settings.questionLimit}개` : "전체"}</dd>
              </div>
              <div>
                <dt>순서</dt>
                <dd>{settings.randomQuestionOrder ? "랜덤" : "저장순"}</dd>
              </div>
              <div>
                <dt>속도 보너스</dt>
                <dd>{settings.speedBonusEnabled ? `+${settings.speedBonusMax}` : "끔"}</dd>
              </div>
            </dl>
          )}

          <button className="btn btn-primary btn-xl" onClick={start} disabled={starting}>
            {starting ? "시작하는 중…" : "게임 시작"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default Lobby;
