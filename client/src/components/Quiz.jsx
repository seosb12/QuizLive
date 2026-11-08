import { useState } from "react";
import { choicesOf, useCountdown } from "../utils/hooks";
import { QuizMedia, QuizMeta, TimerBar, TimerRing } from "./QuizParts";

function HostQuiz({ quiz, users, onReveal, onEndGame }) {
  const remainingMs = useCountdown(quiz.endsAt, quiz.serverNow);
  const players = users.filter((user) => user.role === "player");
  const submitted = players.filter((user) => user.submitted).length;
  const allIn = players.length > 0 && submitted === players.length;
  const timeUp = remainingMs <= 0;
  const choices = choicesOf(quiz);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    await onReveal();
    setBusy(false);
  };

  return (
    <main className="screen host">
      <header className="stage-top">
        <QuizMeta quiz={quiz} />
        <TimerRing remainingMs={remainingMs} totalSec={quiz.timeLimit} />
      </header>

      <section className="stage">
        <h1 className="stage-question">{quiz.question}</h1>
        <QuizMedia url={quiz.mediaUrl} type={quiz.mediaType} />

        {choices.length > 0 && (
          <div className={`stage-choices n${choices.length} t-${quiz.quizType}`}>
            {choices.map((choice) => (
              <div key={choice.number} className={`choice c${choice.number}`}>
                <span className="key">{choice.key}</span>
                {choice.text && <span className="text">{choice.text}</span>}
              </div>
            ))}
          </div>
        )}

        {quiz.quizType === "short" && <p className="stage-hint">참가자가 휴대폰에서 정답을 입력하고 있어요</p>}
      </section>

      <footer className="stage-bottom">
        <div className="submit-meter">
          <span className="num">
            {submitted}
            <small> / {players.length}</small>
          </span>
          <span className="muted">제출</span>
          <div className="meter">
            <div style={{ transform: `scaleX(${players.length ? submitted / players.length : 0})` }} />
          </div>
        </div>
        <div className="stage-actions">
          <button className="btn btn-ghost" onClick={onEndGame}>
            게임 종료
          </button>
          <button
            className={timeUp || allIn ? "btn btn-primary btn-lg attention" : "btn btn-primary btn-lg"}
            onClick={reveal}
            disabled={busy}
          >
            {quiz.quizType === "balance" ? "결과 공개" : "정답 공개"}
          </button>
        </div>
      </footer>
    </main>
  );
}

function PlayerQuiz({ quiz, myAnswer, onSubmit }) {
  const remainingMs = useCountdown(quiz.endsAt, quiz.serverNow);
  const [pending, setPending] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const choices = choicesOf(quiz);
  const submitted = myAnswer !== null && myAnswer !== undefined;
  const timeUp = remainingMs <= 0;
  const locked = submitted || timeUp || pending !== null;

  const send = async (answer) => {
    if (locked) return;
    setPending(answer);
    await onSubmit(answer);
    setPending(null);
  };

  const sendText = (event) => {
    event.preventDefault();
    if (!text.trim()) {
      setError("정답을 입력하세요.");
      return;
    }
    setError("");
    send(text.trim());
  };

  const chosen = submitted ? myAnswer : pending;

  return (
    <main className="screen player">
      <QuizMeta quiz={quiz} />
      <TimerBar remainingMs={remainingMs} totalSec={quiz.timeLimit} />

      <h1 className="question">{quiz.question}</h1>
      <QuizMedia url={quiz.mediaUrl} type={quiz.mediaType} />

      {choices.length > 0 ? (
        <div className={`choices t-${quiz.quizType}`}>
          {choices.map((choice) => {
            const isChosen = chosen !== null && Number(chosen) === choice.number;
            const cls = ["choice", `c${choice.number}`, isChosen && "chosen", locked && !isChosen && "dim"]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={choice.number} className={cls} onClick={() => send(choice.number)} disabled={locked}>
                <span className="key">{choice.key}</span>
                {choice.text && <span className="text">{choice.text}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <form className="short" onSubmit={sendText}>
          <input
            className="input"
            placeholder="정답 입력"
            maxLength={200}
            value={submitted ? String(myAnswer) : text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError("");
            }}
            disabled={locked}
            enterKeyHint="send"
          />
          {error && <p className="form-error">{error}</p>}
          {!submitted && (
            <button className="btn btn-primary btn-lg" type="submit" disabled={locked}>
              제출
            </button>
          )}
        </form>
      )}

      <p className={submitted ? "status done" : timeUp ? "status over" : "status"}>
        {submitted
          ? quiz.quizType === "balance"
            ? "선택 완료! 결과 공개를 기다리는 중"
            : "제출 완료! 정답 공개를 기다리는 중"
          : timeUp
            ? "시간 종료"
            : choices.length > 0
              ? "누르면 바로 제출돼요"
              : `${Math.ceil(remainingMs / 1000)}초 남음`}
      </p>
    </main>
  );
}

function Quiz({ quiz, users, isHost, myAnswer, onSubmit, onReveal, onEndGame }) {
  // key로 문제마다 새로 그려서 이전 문제의 입력값이 남지 않게 합니다
  return isHost ? (
    <HostQuiz key={quiz.id + "-" + quiz.quizNumber} quiz={quiz} users={users} onReveal={onReveal} onEndGame={onEndGame} />
  ) : (
    <PlayerQuiz key={quiz.id + "-" + quiz.quizNumber} quiz={quiz} myAnswer={myAnswer} onSubmit={onSubmit} />
  );
}

export default Quiz;
