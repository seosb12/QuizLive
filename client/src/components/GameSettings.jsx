import { useState } from "react";
import { confirmDialog } from "../utils/dialog";

const DEFAULT_SETTINGS = {
  questionTime: 20,
  maxPlayers: 30,
  allowLateJoin: true,
  allowDuplicateNicknames: true,
  autoNext: false,
  autoNextDelay: 5,
  baseScore: 100,
  speedBonusEnabled: false,
  speedBonusMax: 50,
  noSubmitPenaltyEnabled: false,
  noSubmitPenalty: 20,
  randomQuestionOrder: false,
  questionLimit: 0,
  excludeUsedQuestions: false,
  resetUsedQuestionsOnLobby: false,
};

const RULES = {
  questionTime: [5, 300, "제한시간은 5~300초"],
  maxPlayers: [1, 1000, "최대 인원은 1~1000명"],
  autoNextDelay: [1, 60, "자동 넘김 대기는 1~60초"],
  baseScore: [1, 10000, "기본 점수는 1~10000점"],
  speedBonusMax: [0, 10000, "속도 보너스는 0~10000점"],
  noSubmitPenalty: [0, 10000, "미제출 감점은 0~10000점"],
  questionLimit: [0, 300, "출제 문제 수는 0~300개"],
};

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="row toggle-row">
      <span>
        <b>{label}</b>
        {help && <small>{help}</small>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function NumberRow({ label, help, unit, value, onChange, disabled, error }) {
  return (
    <label className={disabled ? "row disabled" : "row"}>
      <span>
        <b>{label}</b>
        {help && <small>{help}</small>}
        {error && <small className="form-error">{error}</small>}
      </span>
      <span className="num-input">
        <input
          type="number"
          inputMode="numeric"
          className="input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function GameSettings({ settings, onSave, onBack }) {
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validate = () => {
    const next = {};
    Object.entries(RULES).forEach(([key, [min, max, message]]) => {
      const value = Number(form[key]);
      if (form[key] === "" || !Number.isFinite(value) || value < min || value > max) next[key] = message;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = { ...form };
    Object.keys(RULES).forEach((key) => {
      payload[key] = Number(form[key]);
    });
    const ok = await onSave(payload);
    setSaving(false);
    if (ok) onBack();
  };

  const reset = async () => {
    if (await confirmDialog("기본값으로 되돌릴까요? 저장을 눌러야 적용돼요.", "설정 초기화")) {
      setForm({ ...DEFAULT_SETTINGS });
      setErrors({});
    }
  };

  return (
    <main className="screen admin">
      <header className="admin-head">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← 대기실
        </button>
        <h1>게임 설정</h1>
        <span />
      </header>

      <div className="settings">
        <section className="group">
          <h2>진행</h2>
          <NumberRow label="기본 제한시간" help="문제별 시간이 없을 때 적용" unit="초" value={form.questionTime} onChange={set("questionTime")} error={errors.questionTime} />
          <Toggle label="자동으로 다음 문제" help="정답 공개 후 자동 진행" checked={form.autoNext} onChange={set("autoNext")} />
          <NumberRow label="자동 넘김 대기" unit="초" value={form.autoNextDelay} onChange={set("autoNextDelay")} disabled={!form.autoNext} error={errors.autoNextDelay} />
        </section>

        <section className="group">
          <h2>점수</h2>
          <NumberRow label="정답 점수" unit="점" value={form.baseScore} onChange={set("baseScore")} error={errors.baseScore} />
          <Toggle label="빠른 정답 보너스" help="빨리 맞힐수록 추가 점수" checked={form.speedBonusEnabled} onChange={set("speedBonusEnabled")} />
          <NumberRow label="최대 보너스" unit="점" value={form.speedBonusMax} onChange={set("speedBonusMax")} disabled={!form.speedBonusEnabled} error={errors.speedBonusMax} />
          <Toggle label="미제출 감점" help="밸런스게임에는 적용 안 됨" checked={form.noSubmitPenaltyEnabled} onChange={set("noSubmitPenaltyEnabled")} />
          <NumberRow label="감점" unit="점" value={form.noSubmitPenalty} onChange={set("noSubmitPenalty")} disabled={!form.noSubmitPenaltyEnabled} error={errors.noSubmitPenalty} />
        </section>

        <section className="group">
          <h2>출제</h2>
          <Toggle label="문제 순서 섞기" checked={form.randomQuestionOrder} onChange={set("randomQuestionOrder")} />
          <NumberRow label="출제 문제 수" help="0이면 전체" unit="개" value={form.questionLimit} onChange={set("questionLimit")} error={errors.questionLimit} />
          <Toggle label="이미 낸 문제 제외" checked={form.excludeUsedQuestions} onChange={set("excludeUsedQuestions")} />
          <Toggle label="대기실로 돌아가면 출제 기록 초기화" checked={form.resetUsedQuestionsOnLobby} onChange={set("resetUsedQuestionsOnLobby")} />
        </section>

        <section className="group">
          <h2>입장</h2>
          <NumberRow label="최대 참가자" unit="명" value={form.maxPlayers} onChange={set("maxPlayers")} error={errors.maxPlayers} />
          <Toggle label="게임 중 입장 허용" checked={form.allowLateJoin} onChange={set("allowLateJoin")} />
          <Toggle label="같은 닉네임 허용" checked={form.allowDuplicateNicknames} onChange={set("allowDuplicateNicknames")} />
        </section>
      </div>

      <footer className="admin-foot">
        <button className="btn btn-ghost" onClick={reset}>
          기본값으로
        </button>
        <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </footer>
    </main>
  );
}

export default GameSettings;
