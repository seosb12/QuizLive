import { useEffect, useMemo, useState } from "react";

// 서버가 보낸 종료 시각(endsAt)까지 남은 시간을 계산합니다.
// serverNow로 내 기기 시계와 서버 시계의 차이를 보정하므로
// 늦게 들어오거나 인터넷이 느려도 모두 같은 시간을 봅니다.
export function useCountdown(endsAt, serverNow) {
  // eslint-disable-next-line react-hooks/purity
  const offset = useMemo(() => (serverNow ? serverNow - Date.now() : 0), [serverNow]);

  const calc = () => Math.max(0, (endsAt || 0) - (Date.now() + offset));
  const [remainingMs, setRemainingMs] = useState(calc);

  useEffect(() => {
    if (!endsAt) return undefined;
    setRemainingMs(calc());
    const timer = setInterval(() => setRemainingMs(calc()), 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, offset]);

  return remainingMs;
}

export const QUIZ_TYPE_LABEL = {
  multiple: "객관식",
  ox: "OX",
  short: "주관식",
  balance: "밸런스",
};

export function choicesOf(quiz) {
  const type = quiz.quizType || "multiple";

  if (type === "ox") {
    return [
      { number: 1, key: "O", text: "" },
      { number: 2, key: "X", text: "" },
    ];
  }

  if (type === "balance") {
    return [
      { number: 1, key: "A", text: quiz.choice1 },
      { number: 2, key: "B", text: quiz.choice2 },
    ];
  }

  if (type === "short") return [];

  return [1, 2, 3, 4].map((n) => ({ number: n, key: String(n), text: quiz[`choice${n}`] }));
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}
