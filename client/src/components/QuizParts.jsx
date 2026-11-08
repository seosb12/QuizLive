import { memo } from "react";
import { mediaSrc } from "../socket";
import { QUIZ_TYPE_LABEL, pad2 } from "../utils/hooks";

// 컴포넌트 밖에 두고 memo로 감싸서 타이머가 바뀌어도 다시 만들어지지 않게 합니다.
// (v2에서는 1초마다 다시 만들어져 동영상이 처음부터 재생되는 문제가 있었음)
export const QuizMedia = memo(function QuizMedia({ url, type }) {
  if (!url) return null;

  return (
    <div className="media">
      {type === "video" ? (
        <video src={mediaSrc(url)} controls playsInline preload="metadata" />
      ) : (
        <img src={mediaSrc(url)} alt="문제 자료" />
      )}
    </div>
  );
});

export function QuizMeta({ quiz }) {
  return (
    <div className="quiz-meta">
      <span className="num">
        Q {pad2(quiz.quizNumber)}
        <small> / {pad2(quiz.totalQuiz)}</small>
      </span>
      <span className="tags">
        <span className="tag">{QUIZ_TYPE_LABEL[quiz.quizType] || "객관식"}</span>
        {quiz.category && <span className="tag tag-accent">{quiz.category}</span>}
      </span>
    </div>
  );
}

export function TimerBar({ remainingMs, totalSec }) {
  const ratio = totalSec > 0 ? Math.min(1, remainingMs / (totalSec * 1000)) : 0;
  const urgent = remainingMs <= 5000;

  return (
    <div className={urgent ? "timerbar urgent" : "timerbar"}>
      <div style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

export function TimerRing({ remainingMs, totalSec, size = 132 }) {
  const ratio = totalSec > 0 ? Math.min(1, remainingMs / (totalSec * 1000)) : 0;
  const r = 44;
  const c = 2 * Math.PI * r;
  const urgent = remainingMs <= 5000;

  return (
    <div className={urgent ? "ring urgent" : "ring"} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ring-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <span className="num">{Math.ceil(remainingMs / 1000)}</span>
    </div>
  );
}
