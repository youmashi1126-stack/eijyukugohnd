"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, loadMyNumber } from "@/lib/me";
import { playSfx, speak } from "@/lib/sound";
import { cheerFor, titleFor } from "@/lib/titles";
import type { Mode, Question, ReviewItem } from "@/lib/types";

const LABELS = ["ア", "イ", "ウ"];
const NEXT_DELAY_OK = 700;
const NEXT_DELAY_NG = 1800;

type Result = {
  score: number;
  total: number;
  review: ReviewItem[];
  remaining: number;
  durationSec: number;
  maxCombo: number;
};

export default function TestPage() {
  return (
    <Suspense fallback={<p className="muted center">問題を準備中…🛠️</p>}>
      <TestRunner />
    </Suspense>
  );
}

function TestRunner() {
  const router = useRouter();
  const mode: Mode = useSearchParams().get("mode") === "review" ? "review" : "test";
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null); // 今の問題で選んだ選択肢（答え合わせ表示中）
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const startedAt = useRef(0);
  const picks = useRef<(number | null)[]>([]);
  const maxCombo = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(async (m: Mode, n: number) => {
    if (timer.current) clearTimeout(timer.current);
    setQuestions(null);
    setResult(null);
    setError("");
    try {
      const url = m === "review" ? `/api/test?mode=review&number=${n}` : "/api/test";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      picks.current = new Array(data.questions.length).fill(null);
      maxCombo.current = 0;
      setQuestions(data.questions);
      setIdx(0);
      setPicked(null);
      setCorrectCount(0);
      setCombo(0);
      setElapsed(0);
      startedAt.current = Date.now();
    } catch {
      setError("問題を読み込めませんでした。再読み込みしてください。");
    }
  }, []);

  useEffect(() => {
    const n = loadMyNumber();
    if (n === null) {
      router.replace("/");
      return;
    }
    setMyNumber(n);
    start(mode, n);
  }, [router, start, mode]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // 経過時間
  useEffect(() => {
    if (!questions || result || questions.length === 0) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [questions, result]);

  // 問題が変わったら発音する
  useEffect(() => {
    if (questions && questions[idx] && !result) speak(questions[idx].phrase);
  }, [questions, idx, result]);

  const submit = useCallback(async () => {
    if (!questions || myNumber === null) return;
    const durationSec = Math.floor((Date.now() - startedAt.current) / 1000);
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: myNumber,
          mode,
          durationSec,
          answers: questions.map((q, i) => {
            const p = picks.current[i];
            return { id: q.id, choice: p === null ? null : q.choices[p] };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "採点できませんでした");
        return;
      }
      playSfx("finish");
      setResult({ ...data, durationSec, maxCombo: maxCombo.current });
      window.scrollTo(0, 0);
    } catch {
      setError("通信に失敗しました。もう一度「結果を送信」を押してください。");
    } finally {
      setSubmitting(false);
    }
  }, [questions, myNumber, mode]);

  const next = useCallback(() => {
    if (!questions) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPicked(null);
    if (idx < questions.length - 1) setIdx(idx + 1);
    else submit();
  }, [questions, idx, submit]);

  const choose = useCallback(
    (i: number) => {
      if (!questions || picked !== null) return;
      const q = questions[idx];
      const ok = i === q.answer;
      picks.current[idx] = i;
      setPicked(i);
      if (ok) {
        const c = combo + 1;
        setCombo(c);
        setCorrectCount((n) => n + 1);
        maxCombo.current = Math.max(maxCombo.current, c);
        playSfx(c > 0 && c % 5 === 0 ? "combo" : "correct");
      } else {
        setCombo(0);
        playSfx("wrong");
      }
      timer.current = setTimeout(next, ok ? NEXT_DELAY_OK : NEXT_DELAY_NG);
    },
    [questions, idx, picked, combo, next],
  );

  // キーボード：1/2/3 で回答、Enter/スペースで次へ
  useEffect(() => {
    if (!questions || result) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0 && picked === null) choose(i);
      else if ((e.key === "Enter" || e.key === " ") && picked !== null) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions, result, picked, choose, next]);

  if (result && myNumber !== null) {
    return <ResultView result={result} mode={mode} onRetry={() => start(mode, myNumber)} />;
  }
  if (error && !questions) return <p className="error">{error}</p>;
  if (!questions) return <p className="muted center">問題を準備中…🛠️</p>;

  if (questions.length === 0) {
    return (
      <div className="card empty-state">
        <div className="big">🎉</div>
        <h1>復習する問題はありません！</h1>
        <p className="muted">テストで間違えた問題がここにたまります。正解するとリストから消えるよ。</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/test" className="btn btn-primary btn-large">
            🚀 テストに挑戦
          </Link>
          <Link href="/" className="btn btn-large">
            ホームへ
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const answered = idx + (picked !== null ? 1 : 0);
  const ok = picked !== null && picked === q.answer;

  return (
    <>
      <div className={`card question-card ${picked === null ? "" : ok ? "correct" : "wrong"}`}>
        <div className="test-top">
          <span className={`mode-tag ${mode === "review" ? "review" : ""}`}>{mode === "review" ? "🔁 復習" : "🚀 テスト"}</span>
          <span>
            Q.{idx + 1} / {questions.length}
          </span>
          <span>⏱ {formatDuration(elapsed)}</span>
        </div>
        <div className="progress">
          <div style={{ width: `${(answered / questions.length) * 100}%` }} />
        </div>
        <div className="score-line">
          <span style={{ color: "var(--ok)" }}>⭕ {correctCount}問正解</span>
          {combo >= 2 && (
            <span key={combo} className="combo">
              🔥 {combo} COMBO!
            </span>
          )}
        </div>

        <div className="phrase-wrap">
          <div className="phrase">{q.phrase}</div>
          <button className="speak-btn" onClick={() => speak(q.phrase, true)}>
            🔊 発音を聞く
          </button>
          {picked !== null && <div className={`feedback ${ok ? "ok" : "ng"}`}>{ok ? "◯" : "✕"}</div>}
        </div>

        <div className="choices">
          {q.choices.map((c, i) => {
            let state = "";
            if (picked !== null) {
              if (i === q.answer) state = "is-answer";
              else if (i === picked) state = "is-wrong";
              else state = "dim";
            }
            return (
              <button key={i} className={`choice c${i} ${state}`} disabled={picked !== null} onClick={() => choose(i)}>
                <span className="choice-label">{LABELS[i]}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>

        <div className="test-bottom">
          <button
            className="link-btn"
            onClick={() => {
              if (confirm("途中でやめると結果は記録されません。やめますか？")) router.push("/");
            }}
          >
            やめる
          </button>
          {picked !== null && !submitting && (
            <button className="btn btn-primary" onClick={next}>
              {idx < questions.length - 1 ? "次へ ▶" : "結果を見る 🎉"}
            </button>
          )}
          {submitting && <span className="muted">採点中…</span>}
        </div>
        {error && (
          <div>
            <p className="error">{error}</p>
            <button className="btn btn-primary" onClick={submit}>
              結果を送信
            </button>
          </div>
        )}
      </div>
      <p className="muted center">キーボードなら 1・2・3 で回答、Enter で次へ</p>
    </>
  );
}

const CONFETTI_COLORS = ["#ff5fa2", "#3fb6f2", "#22c58b", "#fbbf24", "#7c3aed", "#f97316"];

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2 + Math.random() * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function ResultView({ result, mode, onRetry }: { result: Result; mode: Mode; onRetry: () => void }) {
  const [shown, setShown] = useState(0);
  const ratio = result.total > 0 ? result.score / result.total : 0;
  const title = titleFor(Math.round(ratio * 100));

  // 点数をカウントアップ表示
  useEffect(() => {
    let n = 0;
    const step = Math.max(1, Math.ceil(result.score / 40));
    const t = setInterval(() => {
      n = Math.min(result.score, n + step);
      setShown(n);
      if (n >= result.score) clearInterval(t);
    }, 25);
    return () => clearInterval(t);
  }, [result.score]);

  return (
    <>
      <div className="card result-hero">
        {ratio >= 0.8 && <Confetti />}
        <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
          {mode === "review" ? "🔁 復習コーナー 結果" : "🚀 テスト結果"}
        </p>
        <div className="score">
          {shown}
          <small> / {result.total}</small>
        </div>
        <div className="result-title" style={{ color: title.color }}>
          {title.icon} {title.name}
        </div>
        <p style={{ fontWeight: 800, margin: "4px 0 10px" }}>{cheerFor(ratio)}</p>
        <div className="result-stats">
          <span>⏱ {formatDuration(result.durationSec)}</span>
          <span>🔥 最大 {result.maxCombo} コンボ</span>
          <span>🔁 復習リスト 残り {result.remaining}問</span>
        </div>
        {mode === "review" && <p className="muted">復習コーナーの結果はランキングには入りません</p>}
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary btn-large" onClick={onRetry}>
            {mode === "review" ? "🔁 もう一度復習" : "🚀 もう一度挑戦"}
          </button>
          {mode === "test" && result.remaining > 0 && (
            <Link href="/test?mode=review" className="btn btn-review btn-large">
              🔁 復習する
            </Link>
          )}
          <Link href="/ranking" className="btn btn-large">
            🏆 ランキング
          </Link>
          <Link href="/" className="btn btn-large">
            🏠 ホーム
          </Link>
        </div>
      </div>

      {result.review.length > 0 && (
        <div className="card">
          <h2>📝 間違えた問題（{result.review.length}問）</h2>
          {result.review.map((r) => (
            <div key={r.id} className="review-item">
              <button className="mini-speak" onClick={() => speak(r.phrase, true)} aria-label="発音を聞く">
                🔊
              </button>
              <div className="body">
                <div className="phrase-small">{r.phrase}</div>
                <div className="wrong">✕ あなたの答え：{r.chosen ?? "（未回答）"}</div>
                <div className="right">◯ 正しい意味：{r.meaning}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
