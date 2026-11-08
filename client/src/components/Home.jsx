import { useEffect, useRef, useState } from "react";

function Home({ onCreate, onJoin }) {
  const params = new URLSearchParams(window.location.search);
  const codeFromLink = (params.get("code") || "").replace(/\D/g, "").slice(0, 6);

  const [mode, setMode] = useState("join");
  const [code, setCode] = useState(codeFromLink);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nicknameRef = useRef(null);

  useEffect(() => {
    if (codeFromLink) nicknameRef.current?.focus();
  }, [codeFromLink]);

  const submit = async (event) => {
    event.preventDefault();
    const name = nickname.trim();

    if (mode === "join" && code.length !== 6) {
      setError("참여코드 6자리를 입력하세요.");
      return;
    }
    if (!name) {
      setError("닉네임을 입력하세요.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      if (mode === "join") await onJoin(code, name);
      else await onCreate(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen center">
      <form className="panel home" onSubmit={submit} noValidate>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1 className="brand-name">
            SAFETY<span>QUIZ</span>
          </h1>
          <p className="muted">실시간 참여형 퀴즈</p>
        </div>

        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "join"}
            className={mode === "join" ? "on" : ""}
            onClick={() => setMode("join")}
          >
            참가하기
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={mode === "create" ? "on" : ""}
            onClick={() => setMode("create")}
          >
            방 만들기
          </button>
        </div>

        {mode === "join" && (
          <label className="field">
            <span>참여코드</span>
            <input
              className="input input-code"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
        )}

        <label className="field">
          <span>닉네임</span>
          <input
            ref={nicknameRef}
            className="input"
            placeholder={mode === "join" ? "화면에 보일 이름" : "진행자 이름"}
            maxLength={16}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? "연결 중…" : mode === "join" ? "입장하기" : "방 만들기"}
        </button>

        <p className="hint">
          {mode === "join"
            ? "진행자 화면에 보이는 6자리 코드를 입력하세요."
            : "서버 PC가 아니면 런처에 표시된 관리자 PIN이 필요해요."}
        </p>
      </form>
    </main>
  );
}

export default Home;
