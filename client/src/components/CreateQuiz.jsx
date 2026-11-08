import { useEffect, useMemo, useState } from "react";
import socket, { API_BASE, getAdminToken, mediaSrc, request } from "../socket";
import { confirmDialog, notify, toast } from "../utils/dialog";
import { QUIZ_TYPE_LABEL } from "../utils/hooks";

const EMPTY = {
  id: null,
  quizType: "multiple",
  category: "",
  question: "",
  mediaUrl: "",
  mediaType: "",
  timeLimit: 0,
  choice1: "",
  choice2: "",
  choice3: "",
  choice4: "",
  correctAnswer: 1,
  shortAnswer: "",
};

const TYPES = ["multiple", "ox", "short", "balance"];

function answerSummary(quiz) {
  if (quiz.quizType === "short") return quiz.shortAnswer.split(/[|\n]/).join(" / ");
  if (quiz.quizType === "ox") return Number(quiz.correctAnswer) === 1 ? "O" : "X";
  if (quiz.quizType === "balance") return `A ${quiz.choice1} · B ${quiz.choice2}`;
  return `${quiz.correctAnswer}번 · ${quiz[`choice${quiz.correctAnswer}`] ?? ""}`;
}

function CreateQuiz({ onBack }) {
  const [quizzes, setQuizzes] = useState([]);
  const [usedIds, setUsedIds] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    request("getQuizzes").then((res) => {
      if (res.success) {
        setQuizzes(res.quizzes);
        setUsedIds(res.usedQuizIds || []);
      } else {
        notify(res.message, "문제를 불러오지 못했어요");
      }
    });

    const onQuizzes = (list) => setQuizzes(list);
    const onUsage = (list) => setUsedIds(list || []);
    socket.on("updateQuizzes", onQuizzes);
    socket.on("updateQuizUsage", onUsage);
    return () => {
      socket.off("updateQuizzes", onQuizzes);
      socket.off("updateQuizUsage", onUsage);
    };
  }, []);

  const set = (key) => (e) => {
    const value = e && e.target ? e.target.value : e;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError("");
  };

  const categories = useMemo(
    () => [...new Set(quizzes.map((q) => q.category).filter(Boolean))],
    [quizzes]
  );

  const usedSet = useMemo(() => new Set(usedIds.map(String)), [usedIds]);

  const visible = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    return quizzes.filter((quiz) => {
      const used = usedSet.has(String(quiz.id));
      if (filter === "used" && !used) return false;
      if (filter === "unused" && used) return false;
      if (!word) return true;
      return [quiz.category, quiz.question, quiz.choice1, quiz.choice2, quiz.choice3, quiz.choice4, quiz.shortAnswer, QUIZ_TYPE_LABEL[quiz.quizType]]
        .join(" ")
        .toLowerCase()
        .includes(word);
    });
  }, [quizzes, usedSet, filter, keyword]);

  const usedCount = quizzes.filter((q) => usedSet.has(String(q.id))).length;

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      notify("100MB 이하 파일만 올릴 수 있어요.", "파일이 너무 커요");
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setUploading(true);

    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body,
        headers: token ? { "x-admin-token": token } : {},
      });
      const data = await res.json().catch(() => ({ success: false, message: "서버 응답을 읽지 못했어요." }));
      if (!data.success) {
        notify(data.message || "업로드에 실패했어요.", "업로드 실패");
        return;
      }
      setForm((prev) => ({ ...prev, mediaUrl: data.mediaUrl, mediaType: data.mediaType }));
    } catch {
      notify("업로드 중 연결이 끊겼어요.", "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    if (!form.question.trim()) return "문제를 입력하세요.";
    if (form.quizType === "multiple" && [1, 2, 3, 4].some((n) => !String(form[`choice${n}`]).trim())) {
      return "보기 4개를 모두 입력하세요.";
    }
    if (form.quizType === "balance" && (!form.choice1.trim() || !form.choice2.trim())) {
      return "선택지 A와 B를 모두 입력하세요.";
    }
    if (form.quizType === "short" && !form.shortAnswer.trim()) return "정답을 입력하세요.";
    const t = Number(form.timeLimit) || 0;
    if (t !== 0 && (t < 5 || t > 300)) return "문제별 제한시간은 5~300초 (0이면 기본값)";
    return "";
  };

  const save = async () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    setSaving(true);
    const payload = { ...form, timeLimit: Number(form.timeLimit) || 0 };
    const res = await request(form.id ? "updateQuiz" : "addQuiz", { quiz: payload });
    setSaving(false);

    if (!res.success) {
      setError(res.message);
      return;
    }

    setQuizzes(res.quizzes);
    toast(form.id ? "문제를 수정했어요" : "문제를 저장했어요");
    setForm((prev) => ({ ...EMPTY, quizType: prev.quizType, category: prev.category }));
  };

  const load = (quiz, asCopy = false) => {
    setForm({
      ...EMPTY,
      ...quiz,
      id: asCopy ? null : quiz.id,
      timeLimit: Number(quiz.timeLimit) || 0,
      correctAnswer: Number(quiz.correctAnswer) || 1,
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (quiz) => {
    if (!(await confirmDialog(`"${quiz.question.slice(0, 40)}" 문제를 삭제할까요?`, "문제 삭제", "삭제", "취소", true))) return;
    const res = await request("deleteQuiz", { quizId: quiz.id });
    if (!res.success) return notify(res.message, "삭제 실패");
    setQuizzes(res.quizzes);
    if (form.id === quiz.id) setForm(EMPTY);
    return undefined;
  };

  const removeAll = async () => {
    if (quizzes.length === 0) return;
    if (!(await confirmDialog(`문제 ${quizzes.length}개가 모두 삭제돼요. 되돌릴 수 없어요.`, "전체 삭제", "전부 삭제", "취소", true))) return;
    const res = await request("deleteAllQuizzes");
    if (!res.success) return notify(res.message, "삭제 실패");
    setQuizzes(res.quizzes);
    setForm(EMPTY);
    return undefined;
  };

  const resetUsage = async () => {
    if (!(await confirmDialog("출제됨 기록을 모두 지울까요?", "출제 기록 초기화"))) return;
    const res = await request("resetUsedQuizHistory");
    if (!res.success) return notify(res.message, "초기화 실패");
    setUsedIds([]);
    return undefined;
  };

  const t = form.quizType;

  return (
    <main className="screen admin">
      <header className="admin-head">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← 대기실
        </button>
        <h1>문제 관리</h1>
        <span className="muted num">{quizzes.length}개</span>
      </header>

      <div className="editor-grid">
        <section className="editor">
          <div className="editor-title">
            <h2>{form.id ? "문제 수정" : "새 문제"}</h2>
            {form.id && (
              <button className="btn btn-ghost btn-sm" onClick={() => setForm(EMPTY)}>
                수정 취소
              </button>
            )}
          </div>

          <div className="segmented">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={t === type ? "on" : ""}
                onClick={() => setForm((prev) => ({ ...prev, quizType: type, correctAnswer: 1 }))}
              >
                {QUIZ_TYPE_LABEL[type]}
              </button>
            ))}
          </div>

          <div className="two">
            <label className="field">
              <span>분류</span>
              <input className="input" list="category-list" placeholder="예: 응급처치" maxLength={40} value={form.category} onChange={set("category")} />
              <datalist id="category-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>제한시간 (초)</span>
              <input className="input" type="number" min={0} max={300} placeholder="0 = 기본값" value={form.timeLimit} onChange={set("timeLimit")} />
            </label>
          </div>

          <label className="field">
            <span>문제</span>
            <textarea className="input" rows={3} maxLength={1000} placeholder="문제를 입력하세요" value={form.question} onChange={set("question")} />
          </label>

          <div className="field">
            <span>사진 / 동영상</span>
            {form.mediaUrl ? (
              <div className="media-edit">
                {form.mediaType === "video" ? <video src={mediaSrc(form.mediaUrl)} controls /> : <img src={mediaSrc(form.mediaUrl)} alt="" />}
                <button className="btn btn-ghost btn-sm" onClick={() => setForm((prev) => ({ ...prev, mediaUrl: "", mediaType: "" }))}>
                  제거
                </button>
              </div>
            ) : (
              <label className="dropzone">
                <input type="file" accept="image/*,video/*" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
                {uploading ? "올리는 중…" : "파일 선택 (100MB 이하)"}
              </label>
            )}
          </div>

          {t === "multiple" && (
            <div className="field">
              <span>보기 · 정답을 눌러 표시</span>
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className={`choice-edit c${n} ${Number(form.correctAnswer) === n ? "is-answer" : ""}`}>
                  <button type="button" className="key" onClick={() => set("correctAnswer")(n)} aria-label={`${n}번을 정답으로`}>
                    {Number(form.correctAnswer) === n ? "✓" : n}
                  </button>
                  <input className="input" maxLength={200} placeholder={`보기 ${n}`} value={form[`choice${n}`]} onChange={set(`choice${n}`)} />
                </div>
              ))}
            </div>
          )}

          {t === "ox" && (
            <div className="field">
              <span>정답</span>
              <div className="ox-pick">
                {[
                  [1, "O"],
                  [2, "X"],
                ].map(([n, label]) => (
                  <button key={n} type="button" className={`choice c${n} ${Number(form.correctAnswer) === n ? "chosen" : "dim"}`} onClick={() => set("correctAnswer")(n)}>
                    <span className="key">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {t === "balance" && (
            <div className="field">
              <span>선택지 (정답 없음 · 점수 없음)</span>
              {[1, 2].map((n) => (
                <div key={n} className={`choice-edit c${n}`}>
                  <span className="key">{n === 1 ? "A" : "B"}</span>
                  <input className="input" maxLength={200} placeholder={`선택지 ${n === 1 ? "A" : "B"}`} value={form[`choice${n}`]} onChange={set(`choice${n}`)} />
                </div>
              ))}
            </div>
          )}

          {t === "short" && (
            <label className="field">
              <span>정답</span>
              <input className="input" maxLength={500} placeholder="예: 회복자세 | 회복 자세" value={form.shortAnswer} onChange={set("shortAnswer")} />
              <small className="muted">
                인정할 답이 여러 개면 | 로 구분하세요. 띄어쓰기·문장부호·대소문자는 무시하고 채점해요. 짧은 단어형 정답을 추천해요.
              </small>
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="btn btn-primary btn-lg" onClick={save} disabled={saving || uploading}>
            {saving ? "저장 중…" : form.id ? "수정 저장" : "문제 저장"}
          </button>
        </section>

        <section className="library">
          <div className="library-tools">
            <input className="input" placeholder="검색" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <div className="segmented small">
              {[
                ["all", `전체 ${quizzes.length}`],
                ["unused", `미출제 ${quizzes.length - usedCount}`],
                ["used", `출제됨 ${usedCount}`],
              ].map(([key, label]) => (
                <button key={key} type="button" className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 && <p className="muted empty-list">{quizzes.length === 0 ? "아직 문제가 없어요. 왼쪽에서 첫 문제를 만들어 보세요." : "조건에 맞는 문제가 없어요."}</p>}

          <ul className="quiz-list">
            {visible.map((quiz) => (
              <li key={quiz.id} className={form.id === quiz.id ? "editing" : ""}>
                <div className="tags">
                  <span className="tag">{QUIZ_TYPE_LABEL[quiz.quizType] || "객관식"}</span>
                  {quiz.category && <span className="tag tag-accent">{quiz.category}</span>}
                  {Number(quiz.timeLimit) > 0 && <span className="tag num">{quiz.timeLimit}s</span>}
                  {quiz.mediaUrl && <span className="tag">{quiz.mediaType === "video" ? "영상" : "사진"}</span>}
                  {usedSet.has(String(quiz.id)) && <span className="tag tag-dim">출제됨</span>}
                </div>
                <p className="q">{quiz.question}</p>
                <p className="a">{answerSummary(quiz)}</p>
                <div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => load(quiz)}>
                    수정
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => load(quiz, true)}>
                    복사
                  </button>
                  <button className="btn btn-ghost btn-sm danger-text" onClick={() => remove(quiz)}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="library-foot">
            <button className="btn btn-ghost btn-sm" onClick={resetUsage}>
              출제 기록 초기화
            </button>
            <button className="btn btn-ghost btn-sm danger-text" onClick={removeAll}>
              전체 삭제
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default CreateQuiz;
