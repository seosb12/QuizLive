import { useEffect } from "react";
import confetti from "canvas-confetti";

function Final({ ranking, myId, isHost, onLobby, onLeave }) {
  const myIndex = ranking.findIndex((user) => user.id === myId);
  const me = ranking[myIndex];
  const podium = [ranking[1], ranking[0], ranking[2]];

  useEffect(() => {
    if (!isHost && (myIndex < 0 || myIndex > 2)) return undefined;
    const colors = ["#C6FF3D", "#3DD9FF", "#FF4D8D", "#FFB23D"];
    const end = Date.now() + 1200;
    const timer = setInterval(() => {
      if (Date.now() > end) return clearInterval(timer);
      confetti({ particleCount: 30, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 30, angle: 120, spread: 60, origin: { x: 1 }, colors });
      return undefined;
    }, 220);
    return () => clearInterval(timer);
  }, [isHost, myIndex]);

  if (!isHost) {
    return (
      <main className="screen center">
        <section className="panel final-me">
          <p className="eyebrow">최종 결과</p>
          {me ? (
            <>
              <p className="my-rank num">
                {myIndex + 1}
                <small>위</small>
              </p>
              <p className="muted">
                {ranking.length}명 중 · <b className="num">{me.score}</b>점
              </p>
            </>
          ) : (
            <p className="muted">순위 정보가 없어요</p>
          )}

          <ol className="mini-rank">
            {ranking.slice(0, 5).map((user, index) => (
              <li key={user.id} className={user.id === myId ? "me" : ""}>
                <span className="num">{index + 1}</span>
                <span className="name">{user.nickname}</span>
                <span className="num">{user.score}</span>
              </li>
            ))}
          </ol>

          <p className="muted small">진행자가 대기실로 돌아가면 자동으로 이동해요</p>
          <button className="btn btn-ghost" onClick={onLeave}>
            나가기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen host">
      <header className="stage-top">
        <span className="logo-sm">
          SAFETY<span>QUIZ</span>
        </span>
        <span className="eyebrow">최종 순위</span>
      </header>

      <section className="podium">
        {podium.map((user, i) =>
          user ? (
            <div key={user.id} className={`step s${[2, 1, 3][i]}`}>
              <span className="name">{user.nickname}</span>
              <span className="num score">{user.score}</span>
              <div className="block">
                <span className="num">{[2, 1, 3][i]}</span>
              </div>
            </div>
          ) : (
            <div key={i} className="step empty" />
          )
        )}
      </section>

      {ranking.length > 3 && (
        <ol className="rest" start={4}>
          {ranking.slice(3, 15).map((user, index) => (
            <li key={user.id}>
              <span className="num">{index + 4}</span>
              <span className="name">{user.nickname}</span>
              <span className="num">{user.score}</span>
            </li>
          ))}
        </ol>
      )}

      {ranking.length === 0 && <p className="muted center-text">참가자가 없어요</p>}

      <footer className="stage-bottom">
        <span />
        <div className="stage-actions">
          <button className="btn btn-ghost" onClick={onLeave}>
            방 닫기
          </button>
          <button className="btn btn-primary btn-lg" onClick={onLobby}>
            대기실로 돌아가기
          </button>
        </div>
      </footer>
    </main>
  );
}

export default Final;
