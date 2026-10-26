"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyExam,
  emptySubject,
  EXAM_MAX,
  newestYear,
  percent,
  SCORE_MAX,
  SUBJECT_MAX,
  SUBJECT_NAME_MAX,
  UNIV_MAX,
  viewSubject,
  viewTotal,
  YEAR_MAX,
  type Exam,
  type ExamSubject,
} from "@/lib/pastExams";
import { dayLabel } from "@/lib/study";
import { useMe } from "../MeContext";

type SaveState = "saving" | "saved" | "error" | null;
// 得点を続けて入力したときは、打ち終わってから保存する
const SAVE_DELAY_MS = 700;
// 年度を選び直すときの一覧：最新の年度から30年分
const YEAR_CHOICES = 30;

const signed = (v: number | null) => (v === null ? "-" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);

// 過去問のコーナー：過去問演習シート（Excel）の大学の枠と同じ項目を、スマホで入力しやすい形で編集する
// 年度と得点は科目ごとに最初は5年度分、自分で最大20件まで追加・削除できる
export default function PastExams() {
  const { me } = useMe();
  const [items, setItems] = useState<Exam[] | null>(null);
  const [today, setToday] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Exam[]>([]);

  useEffect(() => {
    fetch("/api/pastexams", { cache: "no-store" })
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
      const res = await fetch("/api/pastexams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: latest.current }),
        keepalive: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  const update = useCallback(
    (next: Exam[], delay = 0) => {
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

  const views = items.flatMap((e) => e.subjects.map((s) => viewSubject(s, today)));
  const solved = views.reduce((n, v) => n + (v.done ?? 0), 0);
  const remain = views.reduce((n, v) => n + v.remain, 0);
  const overdue = views.filter((v) => v.perWeek === "期限超過").length;
  const setAt = (i: number, e: Exam, delay = 0) => update(items.map((x, k) => (k === i ? e : x)), delay);

  return (
    <>
      <div className="card hero pastexams-hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 10 }}>📝 {me.nickname}の過去問演習</h1>
        <p className="muted" style={{ margin: 0 }}>
          大学・学部ごとに科目を登録し、解いた年度の得点を入れます。年度は最初に5年度分あり、科目ごとに20件まで追加・削除できます。
          得点率・目標との差・1週間に必要な年数は自動で出ます（基準日：今日 {today && dayLabel(today)}）。
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">大学</div>
            <div className="stat-value">{items.length}校</div>
          </div>
          <div className="stat">
            <div className="stat-label">解いた年数</div>
            <div className="stat-value">{solved}</div>
          </div>
          <div className="stat">
            <div className="stat-label">残り</div>
            <div className="stat-value">{remain}</div>
          </div>
          <div className="stat">
            <div className="stat-label">期限超過の科目</div>
            <div className="stat-value">{overdue}</div>
          </div>
        </div>
      </div>

      <div className="materials-head">
        <span className="muted">
          登録した大学 {items.length}/{EXAM_MAX}校
        </span>
        <span className={`save-state ${saveState ?? ""}`}>
          {saveState === "saving" ? "保存中…" : saveState === "saved" ? "✓ 保存しました" : saveState === "error" ? "⚠️ 保存できませんでした" : ""}
        </span>
      </div>

      {items.length === 0 && editing !== "new" && (
        <div className="card center">
          <p className="muted" style={{ margin: 0 }}>
            まだ大学がありません。「＋ 大学を追加」から登録しよう。
          </p>
        </div>
      )}

      {items.map((e, i) =>
        editing === i ? (
          <ExamForm
            key={i}
            initial={e}
            today={today}
            onCancel={() => setEditing(null)}
            onSave={(next) => {
              setAt(i, next);
              setEditing(null);
            }}
            onDelete={() => {
              if (!confirm(`「${e.univ || "この大学"}」と、その得点の記録を消します。よろしいですか？`)) return;
              update(items.filter((_, k) => k !== i));
              setEditing(null);
            }}
          />
        ) : (
          <ExamCard key={i} exam={e} today={today} onChange={(next, delay) => setAt(i, next, delay)} onEdit={() => setEditing(i)} />
        ),
      )}

      {editing === "new" ? (
        <ExamForm
          initial={emptyExam(today)}
          today={today}
          isNew
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            update([...items, next]);
            setEditing(null);
          }}
        />
      ) : (
        items.length < EXAM_MAX && (
          <p className="center">
            <button className="btn btn-primary btn-large" onClick={() => setEditing("new")}>
              ＋ 大学を追加
            </button>
          </p>
        )
      )}
    </>
  );
}

function ExamCard({ exam, today, onChange, onEdit }: { exam: Exam; today: string; onChange: (e: Exam, delay?: number) => void; onEdit: () => void }) {
  const total = viewTotal(exam);
  const setSubject = (k: number, s: ExamSubject, delay = 0) =>
    onChange({ ...exam, subjects: exam.subjects.map((x, j) => (j === k ? s : x)) }, delay);

  return (
    <div className="card exam-card">
      <div className="material-top">
        <span className="material-title">{exam.univ || "（大学名なし）"}</span>
        <button className="link-btn" onClick={onEdit}>
          ✏️ 編集
        </button>
      </div>
      <p className="material-where">
        試験日 {exam.date ? dayLabel(exam.date) : "-"} ・ 合計 {total.full ?? "-"}点 ・ 合計の目標 {exam.totalTarget === null ? "-" : `${exam.totalTarget}%`}
      </p>
      {total.rates.size > 0 && (
        <dl className="material-stats exam-total">
          <div>
            <dt>合計の最新の得点率</dt>
            <dd>{percent(total.latest)}</dd>
          </div>
          <div>
            <dt>合計の平均（目標との差）</dt>
            <dd>
              {percent(total.average)} <small>（{signed(total.diff)}）</small>
            </dd>
          </div>
        </dl>
      )}

      {exam.subjects.length === 0 && <p className="muted">科目がありません。「✏️ 編集」から追加してください。</p>}
      {exam.subjects.map((s, k) => (
        <SubjectBlock key={k} subject={s} today={today} onChange={(next, delay) => setSubject(k, next, delay)} />
      ))}
    </div>
  );
}

function SubjectBlock({
  subject: s,
  today,
  onChange,
}: {
  subject: ExamSubject;
  today: string;
  onChange: (s: ExamSubject, delay?: number) => void;
}) {
  const v = viewSubject(s, today);
  const top = newestYear(today);
  const used = new Set(s.years.map((y) => y.year));
  const setYear = (j: number, patch: Partial<{ year: number; score: number | null }>, delay = 0) => {
    const years = s.years.map((y, k) => (k === j ? { ...y, ...patch } : y));
    onChange({ ...s, years: patch.year === undefined ? years : [...years].sort((a, b) => b.year - a.year) }, delay);
  };
  const addYear = () => {
    // いちばん古い年度の1つ前（年度がなければ最新の年度）
    let year = s.years.length ? Math.min(...s.years.map((y) => y.year)) - 1 : top;
    while (used.has(year)) year--;
    onChange({ ...s, years: [...s.years, { year, score: null }].sort((a, b) => b.year - a.year) });
  };
  const removeYear = (j: number) => {
    const y = s.years[j];
    if (y.score !== null && !confirm(`${y.year}年度の得点（${y.score}点）を消します。よろしいですか？`)) return;
    onChange({ ...s, years: s.years.filter((_, k) => k !== j) });
  };

  return (
    <div className="subject-block">
      <div className="subject-head">
        <span className="chip subject">{s.name || "（科目名なし）"}</span>
        <span className="muted subject-meta">
          満点 {s.full ?? "-"} ・ 目標 {s.target === null ? "-" : `${s.target}%`} ・ 期限 {s.deadline ? dayLabel(s.deadline) : "-"}
        </span>
      </div>
      <dl className="subject-stats">
        <div>
          <dt>済／予定</dt>
          <dd>
            {v.done ?? 0}/{v.planned}
          </dd>
        </div>
        <div>
          <dt>最新</dt>
          <dd>{percent(v.latest)}</dd>
        </div>
        <div>
          <dt>平均（差）</dt>
          <dd>
            {percent(v.average)}
            <small>{v.diff !== null && `（${signed(v.diff)}）`}</small>
          </dd>
        </div>
        <div>
          <dt>1週間に必要</dt>
          <dd className={v.perWeek === "期限超過" ? "overdue-text" : ""}>{typeof v.perWeek === "number" ? `${v.perWeek}年分` : (v.perWeek ?? "-")}</dd>
        </div>
      </dl>

      <div className="year-list">
        {s.years.map((y, j) => {
          const rate = y.score !== null && s.full ? y.score / s.full : null;
          const good = rate !== null && s.target !== null && rate >= s.target / 100;
          return (
            <div key={y.year} className="year-row">
              <select
                className="year-select"
                aria-label="年度"
                value={y.year}
                onChange={(e) => setYear(j, { year: Number(e.target.value) })}
              >
                {Array.from({ length: YEAR_CHOICES }, (_, k) => top - k)
                  .filter((yr) => yr === y.year || !used.has(yr))
                  .map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}年度
                    </option>
                  ))}
              </select>
              <input
                className="input score-input"
                type="number"
                inputMode="numeric"
                min={0}
                max={SCORE_MAX}
                placeholder="得点"
                aria-label={`${y.year}年度の得点`}
                value={y.score ?? ""}
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Math.floor(Number(e.target.value));
                  setYear(j, { score: n === null || !Number.isFinite(n) ? null : Math.max(0, Math.min(SCORE_MAX, n)) }, SAVE_DELAY_MS);
                }}
              />
              <span className="muted score-full">/{s.full ?? "-"}</span>
              <span className={`rate-badge ${rate === null ? "" : s.target === null ? "plain" : good ? "good" : "under"}`}>
                {rate === null ? "" : percent(rate)}
              </span>
              <button className="year-remove" aria-label={`${y.year}年度を消す`} onClick={() => removeYear(j)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      {s.years.length < YEAR_MAX ? (
        <button className="btn add-year" onClick={addYear}>
          ＋ 年度を追加（{s.years.length}/{YEAR_MAX}）
        </button>
      ) : (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
          年度は{YEAR_MAX}件までです。
        </p>
      )}
    </div>
  );
}

function NumberInput({ label, value, max, onChange, hint }: { label: string; value: number | null; max: number; onChange: (v: number | null) => void; hint?: string }) {
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

function ExamForm({
  initial,
  today,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Exam;
  today: string;
  isNew?: boolean;
  onSave: (e: Exam) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [e, setE] = useState<Exam>(initial);
  const setSubject = (k: number, patch: Partial<ExamSubject>) =>
    setE((x) => ({ ...x, subjects: x.subjects.map((s, j) => (j === k ? { ...s, ...patch } : s)) }));
  const removeSubject = (k: number) => {
    const s = e.subjects[k];
    if (s.years.some((y) => y.score !== null) && !confirm(`「${s.name || "この科目"}」と、その得点の記録を消します。よろしいですか？`)) return;
    setE((x) => ({ ...x, subjects: x.subjects.filter((_, j) => j !== k) }));
  };

  return (
    <div className="card material-form">
      <h2>{isNew ? "＋ 大学を追加" : "✏️ 大学・科目を編集"}</h2>
      <label className="form-field">
        <span className="form-label">大学・学部・学科</span>
        <input className="input" value={e.univ} maxLength={UNIV_MAX} placeholder="例：○○大学 法学部 法律学科" onChange={(ev) => setE({ ...e, univ: ev.target.value })} />
      </label>
      <div className="form-grid">
        <label className="form-field">
          <span className="form-label">試験日</span>
          <input className="input" type="date" value={e.date ?? ""} onChange={(ev) => setE({ ...e, date: ev.target.value || null })} />
        </label>
        <NumberInput label="合計の目標（%）" hint="例：70" value={e.totalTarget} max={100} onChange={(v) => setE({ ...e, totalTarget: v })} />
      </div>

      {e.subjects.map((s, k) => (
        <div key={k} className="subject-form">
          <div className="subject-form-head">
            <b>科目 {k + 1}</b>
            <button className="link-btn delete-btn" onClick={() => removeSubject(k)}>
              この科目を消す
            </button>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">科目</span>
              <input className="input" value={s.name} maxLength={SUBJECT_NAME_MAX} placeholder="例：英語" onChange={(ev) => setSubject(k, { name: ev.target.value })} />
            </label>
            <NumberInput label="満点" hint="例：150" value={s.full} max={SCORE_MAX} onChange={(v) => setSubject(k, { full: v === 0 ? null : v })} />
            <NumberInput label="目標得点率（%）" hint="例：75" value={s.target} max={100} onChange={(v) => setSubject(k, { target: v })} />
            <label className="form-field">
              <span className="form-label">完了期限</span>
              <input className="input" type="date" value={s.deadline ?? ""} onChange={(ev) => setSubject(k, { deadline: ev.target.value || null })} />
            </label>
          </div>
        </div>
      ))}
      {e.subjects.length < SUBJECT_MAX ? (
        <button className="btn" onClick={() => setE({ ...e, subjects: [...e.subjects, emptySubject(today)] })}>
          ＋ 科目を追加（{e.subjects.length}/{SUBJECT_MAX}）
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          1つの大学に科目は{SUBJECT_MAX}つまでです。5科目以上ある場合は、同じ大学名に「（続き）」を付けてもう1校分として登録してください。
        </p>
      )}

      <div className="btn-row">
        <button className="btn btn-primary" disabled={!e.univ.trim()} onClick={() => onSave({ ...e, univ: e.univ.trim(), subjects: e.subjects.map((s) => ({ ...s, name: s.name.trim() })) })}>
          {isNew ? "追加する" : "保存する"}
        </button>
        <button className="btn" onClick={onCancel}>
          やめる
        </button>
        {onDelete && (
          <button className="link-btn delete-btn" onClick={onDelete}>
            🗑️ この大学を消す
          </button>
        )}
      </div>
      {!e.univ.trim() && <p className="muted" style={{ marginBottom: 0 }}>大学名を入れると保存できます。</p>}
    </div>
  );
}
