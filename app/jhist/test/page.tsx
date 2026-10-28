"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sound";
import { BLANK, shuffle, useJhistData, type CQuestion } from "@/lib/jhist/client";
import { TEST_COUNT, TEST_SEC } from "@/lib/jhist/constants";
import type { Goal } from "@/lib/jhist/profile";
import { useSet } from "../../SetContext";
import { Filled } from "../parts";

const LABELS = ["ア", "イ", "ウ", "エ"];
const FLASH_MS = 150;
const LEVELS: { id: Goal; label: string }[] = [
  { id: "std", label: "日東駒専・GMARCH（重要度 S＋A）" },
  { id: "adv", label: "早慶上智（重要度 S＋A＋B）" },
];

type Item = { q: CQuestion; choices: string[] };
type Result = { score: number; ok: number; n: number; correct: Record<string, boolean>; average: number | null; best: number | null; ranked: boolean };

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 日本史の実力テスト：ランダム50問・4択・制限時間12分30秒。選ぶとすぐ次へ、答え合わせは最後に
export default function JhistTestPage() {
  const { ready } = useSet();
  const { data, error: dataError } = useJhistData();
  const [era, setEra] = useState<number | null>(null);
  const [level, setLevel] = useState<Goal>("std");
  const [test, setTest] = useState<{ id: string; items: Item[]; startedAt: number } | null>(null);
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const picksRef = useRef<(string | null)[]>([]);
  const submitted = useRef(false);
  const shownAt = useRef(0);
  const secs = useRef<number[]>([]);

  const start = useCallback(async () => {
    if (!data) return;
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/jhist/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ era, level }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const items = (d.qids as string[]).map((id) => {
        const q = data.byId.get(id)!;
        return { q, choices: shuffle([q.answer, ...q.wrongs]) };
      });
      picksRef.current = new Array(items.length).fill(null);
      secs.current = new Array(items.length).fill(0);
      setPicks([...picksRef.current]);
      submitted.current = false;
      setIdx(0);
      setTest({ id: d.id, items, startedAt: Date.now() });
      shownAt.current = Date.now();
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "テストを始められませんでした");
    }
  }, [data, era, level]);

  const submit = useCallback(async () => {
    if (!test || submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setError("");
    const answers = test.items.map((it, i) => ({ qid: it.q.id, format: "choice", chosen: picksRef.current[i], sec: Math.round(secs.current[i] * 10) / 10 }));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch("/api/jhist/answers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "test", testId: test.id, attemptId: newId(), answers }) });
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "結果を送信できませんでした");
          setSubmitting(false);
          return;
        }
        setResult(d);
        setSubmitting(false);
        playSfx("finish");
        return;
      } catch {
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
    }
    submitted.current = false;
    setSubmitting(false);
    setError("結果を送信できませんでした。通信を確認して、もう一度送信してください。");
  }, [test]);

  // 全体の制限時間。時間切れになったら、答えていない問題はそのままで送る
  useEffect(() => {
    if (!test || result) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - test.startedAt >= TEST_SEC * 1000) submit();
    }, 250);
    return () => clearInterval(t);
  }, [test, result, submit]);

  const choose = (c: string) => {
    if (!test || flash !== null || submitted.current) return;
    picksRef.current[idx] = c;
    secs.current[idx] += (Date.now() - shownAt.current) / 1000;
    setPicks([...picksRef.current]);
    setFlash(c);
    setTimeout(() => {
      setFlash(null);
      if (idx < test.items.length - 1) {
        setIdx(idx + 1);
        shownAt.current = Date.now();
      } else if (picksRef.current.every((p) => p !== null)) {
        submit();
      }
    }, FLASH_MS);
  };

  if (dataError) return <p className="error">問題を読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data) return <p className="muted center">読み込み中…</p>;

  // テストの前：範囲と難易度を選ぶ
  if (!test) {
    return (
      <div className="card">
        <Link href="/c/jhist" className="muted">
          ← 日本史のページ
        </Link>
        <h1 style={{ margin: "8px 0" }}>🚀 日本史 実力テスト</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          ランダム{TEST_COUNT}問・4択・制限時間{Math.floor(TEST_SEC / 60)}分{TEST_SEC % 60}秒。100点満点で採点します。ランキング（平均点）には全範囲のテストだけが入ります。
        </p>
        <div className="jh-settings">
          <div className="jh-settings-row">
            <span>🕰️ 範囲</span>
            <select className="input" style={{ maxWidth: 260 }} value={era ?? "all"} onChange={(e) => setEra(e.target.value === "all" ? null : Number(e.target.value))}>
              <option value="all">全範囲（ランキングに入る）</option>
              {data.eras.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="jh-settings-row" role="radiogroup" aria-label="難易度">
            <span>🎯 難易度</span>
            <div className="corner-choices">
              {LEVELS.map((l) => (
                <label key={l.id} className={`corner-choice ${level === l.id ? "on" : ""}`}>
                  <input type="radio" name="jhist-level" checked={level === l.id} onChange={() => setLevel(l.id)} />
                  {l.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>正解しても記憶の段階は上がりません。間違えた用語は、今日の学習でもう一度復習します。</p>
        <div className="btn-row">
          <button className="btn btn-primary btn-large" onClick={start}>
            ▶ スタート
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (result) {
    const wrong = test.items.filter((it) => !result.correct[it.q.id]);
    return (
      <>
        <div className="card center">
          <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
            🚀 実力テスト（{era === null ? "全範囲" : data.eras[era]}・{level === "std" ? "S＋A" : "S＋A＋B"}）
          </p>
          <div className="jh-result-number">
            {result.score}
            <small>点</small>
          </div>
          <p className="muted">
            {result.ok}/{result.n}問正解
            {result.ranked ? `・平均 ${result.average ?? "-"}点・最高 ${result.best ?? "-"}点` : "（時代を選んだテストはランキングに入りません）"}
          </p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary btn-large" onClick={() => setTest(null)}>
              🔁 もう一度
            </button>
            <Link href="/c/jhist" className="btn btn-large">
              日本史のページへ
            </Link>
          </div>
        </div>
        {wrong.length > 0 && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>✕ 間違えた問題（{wrong.length}問）</h2>
            {wrong.map((it) => {
              const i = test.items.indexOf(it);
              return (
                <div key={it.q.id} className="jh-review">
                  <Filled q={it.q} word={it.q.answer} />
                  <div className="muted jh-review-sub">
                    {picks[i] ? `あなたの答え：${picks[i]}` : "未回答"}
                    {it.q.alts.length > 0 && `・別解：${it.q.alts.join("、")}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  const item = test.items[idx];
  const left = Math.max(0, TEST_SEC - (now - test.startedAt) / 1000);
  const [before, after] = item.q.text.split(BLANK);
  const answeredCount = picks.filter((p) => p !== null).length;
  return (
    <>
      <div className="card question-card">
        <div className="test-top">
          <span className="mode-tag">🚀 実力テスト</span>
          <span>
            Q.{idx + 1} / {test.items.length}
          </span>
          <span className={`timer ${left <= 60 ? "hurry" : ""}`}>
            ⏳ {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, "0")}
          </span>
        </div>
        <div className="time-bar">
          <div className={left <= 60 ? "hurry" : ""} style={{ width: `${(left / TEST_SEC) * 100}%` }} />
        </div>
        <div className="progress">
          <div style={{ width: `${(answeredCount / test.items.length) * 100}%` }} />
        </div>
        <div className="jh-question">
          {before}
          <span className="jh-blank">（　　）</span>
          {after}
        </div>
        <div className="choices jh-choices">
          {item.choices.map((c, i) => (
            <button key={c} className={`choice c${i % 3} ${flash === c || (flash === null && picks[idx] === c) ? "chosen" : ""}`} onClick={() => choose(c)} disabled={submitting}>
              <span className="choice-label">{LABELS[i]}</span>
              <span>{c}</span>
            </button>
          ))}
        </div>
        <div className="test-bottom">
          <button className="link-btn" onClick={() => confirm("途中でやめると結果は記録されません。やめますか？") && setTest(null)}>
            やめる
          </button>
          {idx > 0 && !submitting && (
            <button className="btn" onClick={() => setIdx(idx - 1)}>
              ← 前へ
            </button>
          )}
          {idx < test.items.length - 1 && picks[idx] !== null && !submitting && (
            <button className="btn" onClick={() => setIdx(idx + 1)}>
              次へ →
            </button>
          )}
          {(answeredCount === test.items.length || idx === test.items.length - 1) && !submitting && !result && (
            <button className="btn btn-primary" onClick={() => (answeredCount < test.items.length ? confirm(`まだ答えていない問題が${test.items.length - answeredCount}問あります。採点しますか？`) && submit() : submit())}>
              採点する
            </button>
          )}
          {submitting && <span className="muted">採点中…</span>}
        </div>
        {error && (
          <div>
            <p className="error">{error}</p>
            {!submitted.current && (
              <button className="btn btn-primary" onClick={submit}>
                結果を送信
              </button>
            )}
          </div>
        )}
      </div>
      <p className="muted center">選ぶとすぐ次の問題へ。答え合わせは最後にまとめて！（「前へ」で戻って選び直せます）</p>
    </>
  );
}
