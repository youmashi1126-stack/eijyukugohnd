"use client";

import { useEffect, useState } from "react";
import { GOALS, type Goal } from "@/lib/jhist/profile";

// 日本史の設定：入試日と目標（今日の学習のはじめと、マイページで使う）
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
              <input type="radio" name="jhist-goal" checked={goal === g.id} onChange={() => onGoal(g.id)} />
              {g.label}
            </label>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        目標で変わるのは、覚える用語の範囲だけです（出題形式や段階の進み方は同じです）。入試30日前からは新出をやめて、復習だけになります。
      </p>
    </div>
  );
}

// マイページ：日本史の設定
export function JhistSettingsCard() {
  const [examDate, setExamDate] = useState("");
  const [goal, setGoal] = useState<Goal>("std");
  const [saved, setSaved] = useState<{ examDate: string; goal: Goal } | null>(null);
  const [state, setState] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/jhist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.settings) return;
        setExamDate(d.settings.examDate);
        setGoal(d.settings.goal);
        setSaved({ examDate: d.settings.examDate, goal: d.settings.goal });
      })
      .catch(() => {});
  }, []);
  if (!saved) return null;
  async function save() {
    setBusy(true);
    setState(null);
    try {
      const r = await fetch("/api/jhist/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examDate, goal }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSaved({ examDate, goal });
      setState({ kind: "ok", text: "✓ 日本史の設定を保存しました（今日の学習の新出の数は、明日から新しい設定で決まります）" });
    } catch (e) {
      setState({ kind: "error", text: e instanceof Error ? e.message : "保存できませんでした" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <h2>📕 日本史の設定</h2>
      <JhistSettingsForm examDate={examDate} goal={goal} onExamDate={setExamDate} onGoal={setGoal} />
      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy || (examDate === saved.examDate && goal === saved.goal)} onClick={save}>
          保存する
        </button>
      </div>
      {state && <p className={state.kind === "ok" ? "save-ok" : "error"}>{state.text}</p>}
    </div>
  );
}
