"use client";

import { useEffect, useState } from "react";
import { GOALS, type ExamLevel, type Goal, type WriteMode } from "@/lib/jhist/profile";
import { useHist } from "@/lib/jhist/context";

// 日本史・世界史の設定：入試日と目標（今日の学習のはじめと、マイページで使う）
export function JhistSettingsForm({
  examDate,
  goal,
  onExamDate,
  onGoal,
}: {
  examDate: string;
  goal: Goal;
  onExamDate: (v: string) => void;
  onGoal: (g: Goal) => void;
}) {
  const h = useHist();
  return (
    <div className="jh-settings">
      <label className="jh-settings-row">
        <span>🗓️ 入試日</span>
        <input type="date" className="input" value={examDate} onChange={(e) => e.target.value && onExamDate(e.target.value)} />
      </label>
      <div className="jh-settings-row" role="radiogroup" aria-label="目標">
        <span>🎯 目標</span>
        <div className="corner-choices">
          {GOALS.map((g) => (
            <label key={g.id} className={`corner-choice ${goal === g.id ? "on" : ""}`}>
              <input type="radio" name={`${h.key}-goal`} checked={goal === g.id} onChange={() => onGoal(g.id)} />
              {g.label}
            </label>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        目標で変わるのは、覚える用語の範囲と、記述の答え方・入試形式の難易度の最初の値だけです（出題形式や段階の進み方は同じです）。入試30日前からは新出をやめて、復習だけになります。
      </p>
    </div>
  );
}

type Saved = { examDate: string; goal: Goal; writeMode: WriteMode; examLevel: ExamLevel };
const WRITE_MODES: { id: WriteMode; label: string }[] = [
  { id: "self", label: "自己採点" },
  { id: "input", label: "入力して採点" },
];
const LEVELS: { id: ExamLevel; label: string }[] = [
  { id: "basic", label: "基本" },
  { id: "adv", label: "発展" },
];

function Choices<T extends string>({ name, label, list, value, onChange }: { name: string; label: string; list: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="jh-settings-row" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <div className="corner-choices">
        {list.map((c) => (
          <label key={c.id} className={`corner-choice ${value === c.id ? "on" : ""}`}>
            <input type="radio" name={name} checked={value === c.id} onChange={() => onChange(c.id)} />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// マイページ：日本史の設定
export function JhistSettingsCard() {
  const h = useHist();
  const [examDate, setExamDate] = useState("");
  const [goal, setGoal] = useState<Goal>("std");
  const [writeMode, setWriteMode] = useState<WriteMode>("self");
  const [examLevel, setExamLevel] = useState<ExamLevel>("basic");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [state, setState] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(h.api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.settings) return;
        const s: Saved = { examDate: d.settings.examDate, goal: d.settings.goal, writeMode: d.settings.writeMode, examLevel: d.settings.examLevel };
        setExamDate(s.examDate);
        setGoal(s.goal);
        setWriteMode(s.writeMode);
        setExamLevel(s.examLevel);
        setSaved(s);
      })
      .catch(() => {});
  }, []);
  if (!saved) return null;
  const now: Saved = { examDate, goal, writeMode, examLevel };
  // 変えた項目だけ送る（記述の答え方・難易度は、変えるまでは目標に合わせたおすすめのまま）
  const changed = (Object.keys(now) as (keyof Saved)[]).filter((k) => now[k] !== saved[k]);
  async function save() {
    setBusy(true);
    setState(null);
    try {
      const r = await fetch(`${h.api}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(changed.map((k) => [k, now[k]]))) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSaved(now);
      setState({ kind: "ok", text: `✓ ${h.label}の設定を保存しました（今日の学習の新出の数は、明日から新しい設定で決まります）` });
    } catch (e) {
      setState({ kind: "error", text: e instanceof Error ? e.message : "保存できませんでした" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <h2>{h.icon} {h.label}の設定</h2>
      <JhistSettingsForm examDate={examDate} goal={goal} onExamDate={setExamDate} onGoal={setGoal} />
      <div className="jh-settings" style={{ marginTop: 10 }}>
        <Choices name={`${h.key}-write`} label="✍️ 記述の答え方" list={WRITE_MODES} value={writeMode} onChange={setWriteMode} />
        <Choices name={`${h.key}-level`} label="🎯 入試形式の難易度" list={LEVELS} value={examLevel} onChange={setExamLevel} />
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          入力して採点：漢字を入力すると自動で採点します（基本は1文字違いを△「誤字の可能性」、発展は×）。難易度は入試形式トレーニングの最初の値です。
        </p>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy || changed.length === 0} onClick={save}>
          保存する
        </button>
      </div>
      {state && <p className={state.kind === "ok" ? "save-ok" : "error"}>{state.text}</p>}
    </div>
  );
}
