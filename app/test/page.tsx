"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, loadMyNumber } from "@/lib/me";
import type { Question, ReviewItem } from "@/lib/types";

const LABELS = ["ア", "イ", "ウ"];

type Result = { score: number; review: ReviewItem[]; durationSec: number };

export default function TestPage() {
  const router = useRouter();
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  const currentRef = useRef(0);

  const start = useCallback(async () => {
    setQuestions(null);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/test", { cache: "no-store" });
      const data = await res.json();
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(null));
      currentRef.current = 0;
      setCurrent(0);
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
    start();
  }, [router, start]);

  // 経過時間の表示
  useEffect(() => {
    if (!questions || result) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [questions, result]);

  // 素早く連続入力しても同じ問題に二重回答しないよう、現在位置は ref でも持つ
  const goTo = useCallback((i: number) => {
    currentRef.current = i;
    setCurrent(i);
  }, []);

  const choose = useCallback(
    (index: number) => {
      if (!questions) return;
      const c = currentRef.current;
      const choice = questions[c].choices[index];
      setAnswers((prev) => {
        const next = [...prev];
        next[c] = choice;
        return next;
      });
      // 選んだら自動で次の問題へ
      if (c < questions.length - 1) goTo(c + 1);
    },
    [questions, goTo],
  );

  // キーボードの 1/2/3 でも回答できる
  useEffect(() => {
    if (!questions || result) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) choose(i);
      if (e.key === "ArrowLeft") goTo(Math.max(0, currentRef.current - 1));
      if (e.key === "ArrowRight") goTo(Math.min(questions.length - 1, currentRef.current + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions, result, choose, goTo]);

  // テスト中にページを離れようとしたら確認する
  useEffect(() => {
    if (!questions || result) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [questions, result]);

  async function submit() {
    if (!questions || myNumber === null) return;
    const unanswered = answers.filter((a) => a === null).length;
    if (unanswered > 0 && !confirm(`未回答が${unanswered}問あります。採点しますか？`)) return;
    const durationSec = Math.floor((Date.now() - startedAt.current) / 1000);
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: myNumber,
          durationSec,
          answers: questions.map((q, i) => ({ id: q.id, choice: answers[i] })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "採点できませんでした");
        return;
      }
      setResult({ score: data.score, review: data.review, durationSec });
      window.scrollTo(0, 0);
    } catch {
      setError("通信に失敗しました。もう一度「採点する」を押してください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (result && questions) return <ResultView result={result} total={questions.length} onRetry={start} />;
  if (error && !questions) return <p className="error">{error}</p>;
  if (!questions) return <p className="muted">問題を準備中…</p>;

  const q = questions[current];
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <>
      <div className="card">
        <div className="test-top">
          <span>
            No.{current + 1} / {questions.length}
          </span>
          <span>回答済み {answeredCount}問</span>
          <span>⏱ {formatDuration(elapsed)}</span>
        </div>
        <div className="progress">
          <div style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>

        <div className="phrase">{q.phrase}</div>

        <div className="choices">
          {q.choices.map((c, i) => (
            <button key={i} className={`choice ${answers[current] === c ? "chosen" : ""}`} onClick={() => choose(i)}>
              <span className="choice-label">{LABELS[i]}</span>
              <span>{c}</span>
            </button>
          ))}
        </div>

        <div className="test-nav">
          <button className="btn" disabled={current === 0} onClick={() => goTo(current - 1)}>
            ← 前へ
          </button>
          {current < questions.length - 1 ? (
            <button className="btn" onClick={() => goTo(current + 1)}>
              次へ →
            </button>
          ) : (
            <button className="btn btn-primary" disabled={submitting} onClick={submit}>
              {submitting ? "採点中…" : "採点する"}
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted">問題一覧（タップで移動）</span>
          <button className="btn btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? "採点中…" : "採点する"}
          </button>
        </div>
        <div className="palette">
          {questions.map((_, i) => (
            <button
              key={i}
              className={`${answers[i] !== null ? "answered" : ""} ${i === current ? "current" : ""}`}
              onClick={() => goTo(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ResultView({ result, total, onRetry }: { result: Result; total: number; onRetry: () => void }) {
  return (
    <>
      <div className="card" style={{ textAlign: "center" }}>
        <h1>テスト結果</h1>
        <div className="score">
          {result.score}
          <small> / {total}点</small>
        </div>
        <p className="muted">所要時間 {formatDuration(result.durationSec)}</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={onRetry}>
            もう一度テストする
          </button>
          <Link href="/ranking" className="btn">
            ランキングを見る
          </Link>
          <Link href="/" className="btn">
            ホームへ
          </Link>
        </div>
      </div>

      {result.review.length > 0 && (
        <div className="card">
          <h2>間違えた問題（{result.review.length}問）</h2>
          {result.review.map((r) => (
            <div key={r.id} className="review-item">
              <div className="phrase-small">{r.phrase}</div>
              <div className="wrong">✕ あなたの答え：{r.chosen ?? "（未回答）"}</div>
              <div className="right">○ 正しい意味：{r.meaning}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
