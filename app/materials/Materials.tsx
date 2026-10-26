"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AMOUNT_MAX,
  emptyMaterial,
  MATERIAL_MAX,
  ROUND_MAX,
  STATUSES,
  SUBJECTS,
  summaryOf,
  TITLE_MAX,
  UNITS,
  viewOf,
  type Material,
} from "@/lib/materials";
import { dayLabel } from "@/lib/study";
import { useMe } from "../MeContext";

type SaveState = "saving" | "saved" | "error" | null;
// ＋／－ボタンを続けて押したときは、押し終わってから保存する
const SAVE_DELAY_MS = 700;

const shortDate = (d: string) => dayLabel(d);

// 学習教材のコーナー：学習教材シート（Excel）の1冊1行と同じ項目を、スマホで入力しやすい形で編集する
// 残りの量・ペース・進捗・状態は Excel と同じ計算で自動で出す
export default function Materials() {
  const { me } = useMe();
  const [items, setItems] = useState<Material[] | null>(null);
  const [today, setToday] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Material[]>([]);

  useEffect(() => {
    fetch("/api/materials", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        setItems(d.items);
        latest.current = d.items;
        setToday(d.today);
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  const send = useCallback(async () => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: latest.current }),
        // 画面を離れる直前の保存も最後まで送る
        keepalive: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  // 画面をすぐ更新し、保存はまとめて行う（delay なしはすぐ保存）
  const update = useCallback(
    (next: Material[], delay = 0) => {
      setItems(next);
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (delay) {
        setSaveState("saving");
        timer.current = setTimeout(() => {
          timer.current = null;
          send();
        }, delay);
      } else send();
    },
    [send],
  );

  // 保存待ちのまま画面を離れたときは、その場で保存する
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        send();
      }
    },
    [send],
  );

  if (error) return <p className="error">{error}</p>;
  if (!items || !me) return <p className="muted center">読み込み中…</p>;

  const sum = summaryOf(items, today);
  const setAt = (i: number, m: Material, delay = 0) => update(items.map((x, k) => (k === i ? m : x)), delay);

  return (
    <>
      <div className="card hero materials-hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 10 }}>📒 {me.nickname}の学習教材</h1>
        <p className="muted" style={{ margin: 0 }}>
          今取り組んでいる教材と、入試までに取り組む教材を1冊ずつ登録します。進んだら「現在位置」を、周が変わったら「次の周へ」を押してください。
          残りの量と1週間・1日のペースは自動で出ます（基準日：今日 {today && shortDate(today)}）。
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">取組中</div>
            <div className="stat-value">{sum.doing}冊</div>
          </div>
          <div className="stat">
            <div className="stat-label">これから</div>
            <div className="stat-value">{sum.upcoming}冊</div>
          </div>
          <div className="stat">
            <div className="stat-label">完了</div>
            <div className="stat-value">{sum.done}冊</div>
          </div>
          <div className="stat">
            <div className="stat-label">期限超過</div>
            <div className="stat-value">{sum.overdue}冊</div>
          </div>
        </div>
      </div>

      <div className="materials-head">
        <span className="muted">
          登録した教材 {sum.count}/{MATERIAL_MAX}冊
        </span>
        <span className={`save-state ${saveState ?? ""}`}>
          {saveState === "saving" ? "保存中…" : saveState === "saved" ? "✓ 保存しました" : saveState === "error" ? "⚠️ 保存できませんでした" : ""}
        </span>
      </div>

      {items.length === 0 && editing !== "new" && (
        <div className="card center">
          <p className="muted" style={{ margin: 0 }}>
            まだ教材がありません。「＋ 教材を追加」から登録しよう。
          </p>
        </div>
      )}

      {items.map((m, i) =>
        editing === i ? (
          <MaterialForm
            key={i}
            initial={m}
            onCancel={() => setEditing(null)}
            onSave={(next) => {
              setAt(i, next);
              setEditing(null);
            }}
            onDelete={() => {
              if (!confirm(`「${m.title || "この教材"}」を消します。よろしいですか？`)) return;
              update(items.filter((_, k) => k !== i));
              setEditing(null);
            }}
          />
        ) : (
          <MaterialCard key={i} m={m} today={today} onChange={(next, delay) => setAt(i, next, delay)} onEdit={() => setEditing(i)} />
        ),
      )}

      {editing === "new" ? (
        <MaterialForm
          initial={emptyMaterial()}
          isNew
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            update([...items, next]);
            setEditing(null);
          }}
        />
      ) : (
        items.length < MATERIAL_MAX && (
          <p className="center">
            <button className="btn btn-primary btn-large" onClick={() => setEditing("new")}>
              ＋ 教材を追加
            </button>
          </p>
        )
      )}
    </>
  );
}

function MaterialCard({
  m,
  today,
  onChange,
  onEdit,
}: {
  m: Material;
  today: string;
  onChange: (m: Material, delay?: number) => void;
  onEdit: () => void;
}) {
  const v = viewOf(m, today);
  const unit = m.unit ?? "";
  const canStep = m.pos !== null;
  const step = (d: number) => {
    const pos = Math.max(0, Math.min(m.total ?? AMOUNT_MAX, (m.pos ?? 0) + d));
    onChange({ ...m, pos }, SAVE_DELAY_MS);
  };
  const stateClass = v.state === "完了" ? "done" : v.state === "期限超過" ? "overdue" : v.state === "未入力あり" ? "missing" : "";

  return (
    <div className={`card material-card ${stateClass}`}>
      <div className="material-top">
        {m.subject && <span className="chip subject">{m.subject}</span>}
        <span className="material-title">{m.title || "（書名なし）"}</span>
        <button className="link-btn" onClick={onEdit}>
          ✏️ 編集
        </button>
      </div>

      <div className="chip-row" role="radiogroup" aria-label="区分">
        {STATUSES.map((s) => (
          <button key={s} role="radio" aria-checked={m.status === s} className={`chip-btn ${m.status === s ? "active" : ""}`} onClick={() => onChange({ ...m, status: s })}>
            {s}
          </button>
        ))}
        {v.state && <span className={`state-badge ${stateClass}`}>{v.state}</span>}
      </div>

      <div className="material-progress">
        <div className="mini-bar big">
          <div className={v.state === "完了" ? "done" : ""} style={{ width: `${(v.progress ?? 0) * 100}%` }} />
        </div>
        <span className="material-percent">{v.progress === null ? "-" : `${Math.floor(v.progress * 100)}%`}</span>
      </div>
      <p className="material-where">
        {m.round ?? "-"}周目 ／ 目標 {m.target ?? "-"}周 ・ 全体 {m.total ?? "-"}
        {unit}
      </p>

      <div className="pos-editor">
        <span className="pos-label">現在位置</span>
        <button className="step-btn" disabled={!canStep} onClick={() => step(-10)} aria-label="10減らす">
          −10
        </button>
        <button className="step-btn" disabled={!canStep} onClick={() => step(-1)} aria-label="1減らす">
          −1
        </button>
        <input
          className="input pos-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={m.total ?? AMOUNT_MAX}
          value={m.pos ?? ""}
          aria-label="現在位置"
          onChange={(e) => {
            const n = e.target.value === "" ? null : Math.max(0, Math.min(AMOUNT_MAX, Math.floor(Number(e.target.value))));
            onChange({ ...m, pos: Number.isFinite(n) ? n : null }, SAVE_DELAY_MS);
          }}
        />
        <button className="step-btn" onClick={() => step(1)} aria-label="1増やす">
          +1
        </button>
        <button className="step-btn" onClick={() => step(10)} aria-label="10増やす">
          +10
        </button>
      </div>
      {m.round !== null && (
        <button
          className="btn next-round"
          disabled={m.round >= ROUND_MAX}
          onClick={() => {
            if (confirm(`${m.round! + 1}周目に進みます（現在位置は0からになります）。よろしいですか？`)) onChange({ ...m, round: m.round! + 1, pos: 0 });
          }}
        >
          🔁 次の周へ（{m.round + 1}周目）
        </button>
      )}

      <dl className="material-stats">
        <div>
          <dt>残りの量</dt>
          <dd>{v.remain === null ? "-" : `${v.remain.toLocaleString()} ${unit}`}</dd>
        </div>
        <div>
          <dt>完了期限</dt>
          <dd>
            {m.deadline ? shortDate(m.deadline) : "-"}
            {typeof v.weeks === "number" && <small>（あと{v.weeks}週）</small>}
          </dd>
        </div>
        <div>
          <dt>1週間のペース</dt>
          <dd>{v.perWeek || "-"}</dd>
        </div>
        <div>
          <dt>1日のペース</dt>
          <dd>{v.perDay || "-"}</dd>
        </div>
      </dl>
    </div>
  );
}

function Chips<T extends string>({ label, list, value, onChange }: { label: string; list: readonly T[]; value: string | null; onChange: (v: T | null) => void }) {
  return (
    <div className="form-field">
      <span className="form-label">{label}</span>
      <div className="chip-row" role="radiogroup" aria-label={label}>
        {list.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={value === s} className={`chip-btn ${value === s ? "active" : ""}`} onClick={() => onChange(value === s ? null : s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumField({ label, hint, value, max, onChange }: { label: string; hint: string; value: number | null; max: number; onChange: (v: number | null) => void }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value ?? ""}
        placeholder={hint}
        onChange={(e) => {
          if (e.target.value === "") return onChange(null);
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.max(0, Math.min(max, n)));
        }}
      />
    </label>
  );
}

function MaterialForm({
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Material;
  isNew?: boolean;
  onSave: (m: Material) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [m, setM] = useState<Material>(initial);
  const set = <K extends keyof Material>(k: K, v: Material[K]) => setM((x) => ({ ...x, [k]: v }));

  return (
    <div className="card material-form">
      <h2>{isNew ? "＋ 教材を追加" : "✏️ 教材を編集"}</h2>
      <Chips label="科目" list={SUBJECTS} value={m.subject} onChange={(v) => set("subject", v)} />
      <label className="form-field">
        <span className="form-label">書名</span>
        <input className="input" value={m.title} maxLength={TITLE_MAX} placeholder="表紙の書名（例：システム英単語）" onChange={(e) => set("title", e.target.value)} />
      </label>
      <Chips label="区分" list={STATUSES} value={m.status} onChange={(v) => set("status", v)} />
      <Chips label="単位（進み具合を数える単位）" list={UNITS} value={m.unit} onChange={(v) => set("unit", v)} />
      <div className="form-grid">
        <NumField label="全体の量" hint="例：2000" value={m.total} max={AMOUNT_MAX} onChange={(v) => set("total", v)} />
        <NumField label="今いる周" hint="例：1" value={m.round} max={ROUND_MAX} onChange={(v) => set("round", v)} />
        <NumField label="現在位置" hint="例：800" value={m.pos} max={AMOUNT_MAX} onChange={(v) => set("pos", v)} />
        <NumField label="目標周回" hint="例：3" value={m.target} max={ROUND_MAX} onChange={(v) => set("target", v)} />
      </div>
      <label className="form-field">
        <span className="form-label">完了期限（目標周回を終える日）</span>
        <input className="input" type="date" value={m.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
      </label>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!m.title.trim()} onClick={() => onSave({ ...m, title: m.title.trim() })}>
          {isNew ? "追加する" : "保存する"}
        </button>
        <button className="btn" onClick={onCancel}>
          やめる
        </button>
        {onDelete && (
          <button className="link-btn delete-btn" onClick={onDelete}>
            🗑️ この教材を消す
          </button>
        )}
      </div>
      {!m.title.trim() && <p className="muted" style={{ marginBottom: 0 }}>書名を入れると保存できます。</p>}
    </div>
  );
}
