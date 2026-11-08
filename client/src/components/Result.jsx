import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { choicesOf, useCountdown } from "../utils/hooks";
import { QuizMedia, QuizMeta } from "./QuizParts";

function formatAnswer(result, answer) {
  if (answer === null || answer === undefined || answer === "") return "미제출";
  if (result.quizType === "short") return String(answer);
  if (result.quizType === "ox") return Number(answer) === 1 ? "O" : "X";
  if (result.quizType === "balance") return Number(answer) === 1 ? `A · ${result.choice1}` : `B · ${result.choice2}`;
  return `${answer}번 · ${result[`choice${answer}`] ?? ""}`;
}

function AutoNext({ result }) {
  const remainingMs = useCountdown(result.autoNextAt, result.serverNow);
  if (!result.autoNextAt) return null;
  return <span className="muted">{Math.ceil(remainingMs / 1000)}초 후 자동으로 넘어가요</span>;
}

function HostResult({ result, onNext, onEndGame }) {
  const [busy, setBusy] = useState(false);
  const choices = choicesOf(result);
  const isBalance = result.quizType === "balance";
  const total = choices.reduce((sum, c) => sum + (result.answerStats?.[c.number] || 0), 0);
  const correctCount = result.users.filter((u) => u.isCorrect).length;
  const top = result.ranking.slice(0, 5);
  const earned = Object.fromEntries(result.users.map((u) => [u.id, u.earnedScore - u.penaltyScore]));

  const next = async () => {
    setBusy(true);
    await onNext();
    setBusy(false);
  };

  return (
    <main className="screen host">
      <header className="stage-top">
        <QuizMeta quiz={result} />
        {!isBalance && (
          <span className="pill-stat">
            정답자 <b className="num">{correctCount}</b>
            <small className="num"> / {result.users.length}</small>
          </span>
        )}
      </header>

      <section className="result-grid">
        <div className="result-main">
          <h1 className="stage-question sm">{result.question}</h1>
          <QuizMedia url={result.mediaUrl} type={result.mediaType} />

          {result.quizType === "short" ? (
            <div className="answer-reveal">
              <span className="eyebrow">정답</span>
              <strong>{result.shortAnswer}</strong>
            </div>
          ) : (
            <div className="bars">
              {choices.map((choice) => {
                const count = result.answerStats?.[choice.number] || 0;
                const pct = total ? Math.round((count / total) * 100) : 0;
                const correct = !isBalance && choice.number === Number(result.correctAnswer);
                return (
                  <div key={choice.number} className={`bar c${choice.number} ${correct ? "correct" : ""} ${!isBalance && !correct ? "wrong" : ""}`}>
                    <span className="key">{choice.key}</span>
                    <span className="text">{choice.text || (choice.key === "O" ? "그렇다" : "아니다")}</span>
                    <span className="track">
                      <span style={{ transform: `scaleX(${pct / 100})` }} />
                    </span>
                    <span className="num val">
                      {count}
                      <small>명 · {pct}%</small>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="leader">
          <h2>순위</h2>
          {top.length === 0 && <p className="muted">참가자가 없어요</p>}
          <ol>
            {top.map((user, index) => (
              <li key={user.id}>
                <span className="num rank">{index + 1}</span>
                <span className="name">{user.nickname}</span>
                {!isBalance && earned[user.id] !== 0 && (
                  <span className={earned[user.id] > 0 ? "num delta up" : "num delta down"}>
                    {earned[user.id] > 0 ? "+" : ""}
                    {earned[user.id]}
                  </span>
                )}
                <span className="num score">{user.score}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <footer className="stage-bottom">
        <AutoNext result={result} />
        <div className="stage-actions">
          {!result.isLastQuiz && (
            <button className="btn btn-ghost" onClick={onEndGame}>
              게임 종료
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={next} disabled={busy}>
            {result.isLastQuiz ? "최종 순위 보기" : "다음 문제"}
          </button>
        </div>
      </footer>
    </main>
  );
}

function PlayerResult({ result, myId }) {
  const me = result.users.find((user) => user.id === myId);
  const isBalance = result.quizType === "balance";
  const answered = me && me.selectedAnswer !== null && me.selectedAnswer !== undefined;

  let verdict = "missed";
  if (isBalance) verdict = answered ? "picked" : "missed";
  else if (me?.isCorrect) verdict = "correct";
  else if (answered) verdict = "wrong";

  useEffect(() => {
    if (verdict !== "correct") return undefined;
    const colors = ["#C6FF3D", "#3DD9FF", "#FF4D8D", "#FFB23D"];
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.65 }, colors });
    const timer = setTimeout(() => confetti({ particleCount: 90, spread: 140, origin: { y: 0.7 }, colors }), 350);
    return () => clearTimeout(timer);
  }, [verdict]);

  const correctText =
    result.quizType === "short"
      ? result.shortAnswer
      : isBalance
        ? null
        : formatAnswer(result, result.correctAnswer);

  const headline = {
    correct: "정답!",
    wrong: "아쉬워요",
    missed: "시간 초과",
    picked: "선택 완료",
  }[verdict];

  return (
    <main className={`screen player verdict-screen v-${verdict}`}>
      <QuizMeta quiz={result} />

      <section className="verdict">
        <div className="verdict-icon" aria-hidden="true" />
        <h1>{headline}</h1>
        {answered && <p className="mine">내 답 · {formatAnswer(result, me.selectedAnswer)}</p>}
      </section>

      {correctText && (
        <div className="answer-reveal">
          <span className="eyebrow">정답</span>
          <strong>{correctText}</strong>
        </div>
      )}

      {isBalance && (
        <div className="bars compact">
          {choicesOf(result).map((choice) => {
            const total = (result.answerStats?.[1] || 0) + (result.answerStats?.[2] || 0);
            const count = result.answerStats?.[choice.number] || 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={choice.number} className={`bar c${choice.number}`}>
                <span className="key">{choice.key}</span>
                <span className="text">{choice.text}</span>
                <span className="track">
                  <span style={{ transform: `scaleX(${pct / 100})` }} />
                </span>
                <span className="num val">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="status">
        {result.autoNext ? "곧 다음 문제로 넘어가요" : "진행자가 다음 문제로 넘어가길 기다리는 중"}
      </p>
    </main>
  );
}

function Result({ result, myId, isHost, onNext, onEndGame }) {
  return isHost ? (
    <HostResult result={result} onNext={onNext} onEndGame={onEndGame} />
  ) : (
    <PlayerResult key={result.quizNumber} result={result} myId={myId} />
  );
}

export default Result;
