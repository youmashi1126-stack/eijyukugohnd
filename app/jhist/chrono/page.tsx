"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { playSfx } from "@/lib/sound";
import { useJhistData } from "@/lib/jhist/client";
import { afterAnswers, eventsOf, makeChronoSet, sortCorrect, type ChronoEvent, type ChronoQuestion, type Level } from "@/lib/jhist/chrono";
import { CHRONO_COUNT, CHRONO_NEAREST_GAP } from "@/lib/jhist/constants";
import { useSet } from "../../SetContext";

const LABELS = ["ア", "イ", "ウ", "エ", "オ"];
const LEVELS: { id: Level; label: string; sub: string }[] = [
  { id: "basic", label: "基本", sub: "並べ替え3項目・前後は4つから1つ" },
  { id: "adv", label: "発展", sub: "並べ替え4〜5項目・前後は5つからすべて" },
];

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const yearText = (y: number) => (y < 0 ? `紀元前${-y}年` : `${y}年`);

// 日本史の年代チャレンジ：並べ替え・最も近い年・前後の判定を混ぜて5問（年代整序のデータだけで作る）
export default function JhistChronoPage() {
  const { ready } = useSet();
  const { data, error: dataError } = useJhistData();
  const [level, setLevel] = useState<Level | null>(null);
  const [era, setEra] = useState<number | null>(null);
  const [set, setSet] = useState<ChronoQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [today, setToday] = useState<{ done: number; ok: number } | null>(null);
  const [error, setError] = useState("");

  // 難易度の初期値：目標が早慶上智なら発展、それ以外は基本
  useEffect(() => {
    fetch("/api/jhist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setLevel((l) => l ?? (d?.settings?.goal === "adv" ? "adv" : "basic"));
        if (d?.chrono) setToday(d.chrono);
      })
      .catch(() => setLevel((l) => l ?? "basic"));
  }, []);

  const events: ChronoEvent[] = useMemo(() => (data ? data.chrono.map((c) => ({ year: c.year, event: c.event, era: c.era, qid: c.qid })) : []), [data]);

  if (dataError) return <p className="error">問題を読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data || !level) return <p className="muted center">読み込み中…</p>;

  function start() {
    setSet(makeChronoSet(events, era, level!));
    setIdx(0);
    setResults([]);
    setChecked(null);
    setError("");
  }

  async function finish(all: boolean[]) {
    try {
      const r = await fetch("/api/jhist/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "chrono", attemptId: newId(), items: set!.map((q, i) => ({ kind: q.kind, ok: all[i], qids: eventsOf(q).map((e) => e.qid) })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setToday(d.chrono);
      playSfx("finish");
    } catch {
      setError("結果を記録できませんでした（答え合わせはできています）。");
    }
  }

  function answer(ok: boolean) {
    setChecked(ok);
    playSfx(ok ? "correct" : "wrong");
  }

  function next() {
    const all = [...results, checked!];
    setResults(all);
    setChecked(null);
    if (idx < set!.length - 1) setIdx(idx + 1);
    else {
      setIdx(set!.length);
      finish(all);
    }
  }

  // はじめる前：範囲と難易度
  if (!set) {
    return (
      <div className="card">
        <Link href="/c/jhist" className="muted">
          ← 日本史のページ
        </Link>
        <h1 style={{ margin: "8px 0" }}>⏳ 年代チャレンジ</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          並べ替え・最も近い年の出来事・前後の判定を混ぜて{CHRONO_COUNT}問。年号を手がかりに、時代の流れで整理しよう。
          {today && ` 今日は ${today.done}問（正解 ${today.ok}）`}
        </p>
        <div className="jh-settings">
          <div className="jh-settings-row">
            <span>🕰️ 範囲</span>
            <select className="input" style={{ maxWidth: 260 }} value={era ?? "all"} onChange={(e) => setEra(e.target.value === "all" ? null : Number(e.target.value))}>
              <option value="all">全範囲</option>
              {data.eras.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
              その時代だけで問題が作れないときは、隣の時代まで広げます
            </span>
          </div>
          <div className="jh-settings-row" role="radiogroup" aria-label="難易度">
            <span>🎯 難易度</span>
            <div className="corner-choices">
              {LEVELS.map((l) => (
                <label key={l.id} className={`corner-choice ${level === l.id ? "on" : ""}`}>
                  <input type="radio" name="chrono-level" checked={level === l.id} onChange={() => setLevel(l.id)} />
                  {l.label}（{l.sub}）
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary btn-large" onClick={start}>
            ▶ {CHRONO_COUNT}問に挑戦
          </button>
        </div>
      </div>
    );
  }

  // 結果
  if (idx >= set.length) {
    const ok = results.filter(Boolean).length;
    return (
      <div className="card center">
        <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
          ⏳ 年代チャレンジ（{level === "basic" ? "基本" : "発展"}）
        </p>
        <div className="jh-result-number">
          {ok}
          <small>/{set.length}</small>
        </div>
        {today && <p className="muted">今日は {today.done}問・正解 {today.ok}問</p>}
        {error && <p className="error">{error}</p>}
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary btn-large" onClick={start}>
            🔁 もう5問
          </button>
          <Link href="/c/jhist" className="btn btn-large">
            日本史のページへ
          </Link>
        </div>
      </div>
    );
  }

  const q = set[idx];
  return (
    <div className={`card question-card ${checked === null ? "" : checked ? "correct" : "wrong"}`}>
      <div className="test-top">
        <span className="mode-tag">⏳ 年代 {q.kind === "sort" ? "並べ替え" : q.kind === "nearest" ? "最も近い年" : "前後の判定"}</span>
        <span>
          {idx + 1} / {set.length}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {level === "basic" ? "基本" : "発展"}
        </span>
      </div>
      <div className="progress">
        <div style={{ width: `${((idx + (checked === null ? 0 : 1)) / set.length) * 100}%` }} />
      </div>
      {q.kind === "sort" && <SortStep key={idx} q={q} checked={checked} onCheck={answer} />}
      {q.kind === "nearest" && <NearestStep key={idx} q={q} level={level} checked={checked} onCheck={answer} />}
      {q.kind === "after" && <AfterStep key={idx} q={q} checked={checked} onCheck={answer} />}
      {checked !== null && (
        <>
          <p className={`jh-verdict ${checked ? "o" : "x"}`}>{checked ? "◯ 正解" : "✕ 不正解"}</p>
          <div className="jh-feedback">
            <span className="jh-feedback-label">古い順</span>
            <ol className="jh-chrono-answer">
              {[...eventsOf(q)]
                .sort((a, b) => a.year - b.year)
                .map((e) => (
                  <li key={e.qid + e.year}>
                    <b>{yearText(e.year)}</b> {e.event}
                  </li>
                ))}
            </ol>
          </div>
        </>
      )}
      <div className="test-bottom">
        <Link href="/c/jhist" className="link-btn">
          やめる
        </Link>
        {checked !== null && (
          <button className="btn btn-primary" onClick={next}>
            {idx < set.length - 1 ? "次へ ▶" : "結果を見る 🎉"}
          </button>
        )}
      </div>
    </div>
  );
}

// 並べ替え：古い順にタップ（もう一度押すと外す）
function SortStep({ q, checked, onCheck }: { q: Extract<ChronoQuestion, { kind: "sort" }>; checked: boolean | null; onCheck: (ok: boolean) => void }) {
  const [order, setOrder] = useState<ChronoEvent[]>([]);
  const done = checked !== null;
  const toggle = (e: ChronoEvent) => !done && setOrder((o) => (o.includes(e) ? o.filter((x) => x !== e) : [...o, e]));
  return (
    <>
      <p className="jh-chrono-ask">次の出来事を、古い順に押して並べよう</p>
      <div className="jh-chrono-items">
        {q.items.map((e) => {
          const n = order.indexOf(e);
          return (
            <button key={e.qid + e.year} className={`jh-chrono-item ${n >= 0 ? "on" : ""}`} onClick={() => toggle(e)} disabled={done}>
              <span className="jh-chrono-no">{n >= 0 ? n + 1 : ""}</span>
              {e.event}
              {done && <small className="jh-chrono-year">{yearText(e.year)}</small>}
            </button>
          );
        })}
      </div>
      {!done && (
        <div className="btn-row">
          <button className="btn btn-primary" disabled={order.length !== q.items.length} onClick={() => onCheck(sortCorrect(q.items, order))}>
            答え合わせ
          </button>
          {order.length > 0 && (
            <button className="btn" onClick={() => setOrder([])}>
              やり直す
            </button>
          )}
        </div>
      )}
    </>
  );
}

// 最も近い年の出来事（基準の出来事だけ西暦を示し、選択肢の西暦は伏せる）
function NearestStep({ q, level, checked, onCheck }: { q: Extract<ChronoQuestion, { kind: "nearest" }>; level: Level; checked: boolean | null; onCheck: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<ChronoEvent | null>(null);
  const done = checked !== null;
  return (
    <>
      <p className="jh-chrono-ask">
        「{q.base.event}」（{yearText(q.base.year)}）に<b>最も近い年</b>に起きた出来事はどれ？
      </p>
      <div className="choices jh-choices">
        {q.choices.map((e, i) => {
          const state = !done ? "" : e === q.answer ? "is-answer" : e === picked ? "is-wrong" : "dim";
          return (
            <button
              key={e.qid + e.year}
              className={`choice c${i % 3} ${state}`}
              disabled={done}
              onClick={() => {
                setPicked(e);
                onCheck(e === q.answer);
              }}
            >
              <span className="choice-label">{LABELS[i]}</span>
              <span>
                {e.event}
                {done && <small className="jh-chrono-year">{yearText(e.year)}</small>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11, margin: "6px 0 0" }}>
        ほかの選択肢は、正解より{CHRONO_NEAREST_GAP[level]}年以上離れています
      </p>
    </>
  );
}

// 前後の判定：基本は1つ選ぶ、発展は当てはまるものをすべて選ぶ
function AfterStep({ q, checked, onCheck }: { q: Extract<ChronoQuestion, { kind: "after" }>; checked: boolean | null; onCheck: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<ChronoEvent[]>([]);
  const done = checked !== null;
  const right = afterAnswers(q);
  const word = q.dir === "after" ? "後" : "前";
  const judge = (sel: ChronoEvent[]) => onCheck(sel.length === right.length && sel.every((e) => right.includes(e)));
  return (
    <>
      <p className="jh-chrono-ask">
        「{q.base.event}」（{yearText(q.base.year)}）より<b>{word}</b>に起きた出来事を{q.multi ? <b>すべて</b> : "1つ"}選ぼう
      </p>
      <div className="choices jh-choices">
        {q.choices.map((e, i) => {
          const on = picked.includes(e);
          const state = !done ? (on ? "chosen" : "") : right.includes(e) ? "is-answer" : on ? "is-wrong" : "dim";
          return (
            <button
              key={e.qid + e.year}
              className={`choice c${i % 3} ${state}`}
              disabled={done}
              onClick={() => {
                if (!q.multi) {
                  setPicked([e]);
                  judge([e]);
                } else setPicked((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]));
              }}
            >
              <span className="choice-label">{q.multi ? (on ? "☑" : "☐") : LABELS[i]}</span>
              <span>
                {e.event}
                {done && <small className="jh-chrono-year">{yearText(e.year)}</small>}
              </span>
            </button>
          );
        })}
      </div>
      {q.multi && !done && (
        <div className="btn-row">
          <button className="btn btn-primary" disabled={!picked.length} onClick={() => judge(picked)}>
            答え合わせ
          </button>
        </div>
      )}
    </>
  );
}
