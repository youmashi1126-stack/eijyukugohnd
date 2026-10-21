"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, loadMyNumber } from "@/lib/me";
import { playSfx, speak } from "@/lib/sound";
import { cheerFor, titleFor } from "@/lib/titles";
import {
  markFor,
  PASS_SCORE,
  PRACTICE_SEC_PER_QUESTION,
  sectionRange,
  TEST_TIME_LIMIT_SEC,
  type DetailItem,
  type Mode,
  type Question,
} from "@/lib/types";

const LABELS = ["ア", "イ", "ウ"];
const FLASH_MS = 150; // 選んだ選択肢を一瞬光らせてから次へ
const TIMED_OUT = -1; // picked に入れる「時間切れ」の印
const NEXT_DELAY_OK = 700; // 復習コーナーの答え合わせ表示
const NEXT_DELAY_NG = 1800;

type Result = {
  score: number;
  total: number;
  details: DetailItem[];
  remaining: number;
  durationSec: number;
  maxCombo: number;
  timeUp: boolean;
  newBest: boolean;
  best?: number;
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
  const params = useSearchParams();
  const modeParam = params.get("mode");
  const mode: Mode = modeParam === "review" || modeParam === "practice" ? modeParam : "test";
  const section = Number(params.get("section")) || 0;
  // 復習コーナーと練習モードは1問ごとに答え合わせ（練習モードは「次へ」を押すまで確認できる）
  const instant = mode === "review" || mode === "practice";

  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const startedAt = useRef(0);
  const qDeadline = useRef(0);
  const frozenLeft = useRef(0);
  const idxRef = useRef(0);
  const picksRef = useRef<(number | null)[]>([]);
  const locked = useRef(false);
  const submitted = useRef(false);
  const maxCombo = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((i: number) => {
    idxRef.current = i;
    setIdx(i);
    qDeadline.current = Date.now() + PRACTICE_SEC_PER_QUESTION * 1000;
  }, []);

  const start = useCallback(
    async (n: number) => {
      if (timer.current) clearTimeout(timer.current);
      setQuestions(null);
      setResult(null);
      setError("");
      try {
        let url = "/api/test";
        if (mode === "review") url = `/api/test?mode=review&number=${n}`;
        if (mode === "practice") url = `/api/test?mode=practice&section=${section}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        picksRef.current = new Array(data.questions.length).fill(null);
        setPicks([...picksRef.current]);
        maxCombo.current = 0;
        locked.current = false;
        submitted.current = false;
        setQuestions(data.questions);
        setPicked(null);
        setFlash(null);
        setCorrectCount(0);
        setCombo(0);
        startedAt.current = Date.now();
        setNow(Date.now());
        goTo(0);
      } catch {
        setError("問題を読み込めませんでした。再読み込みしてください。");
      }
    },
    [mode, section, goTo],
  );

  useEffect(() => {
    const n = loadMyNumber();
    if (n === null) {
      router.replace("/");
      return;
    }
    setMyNumber(n);
    start(n);
  }, [router, start]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const submit = useCallback(
    async (timeUp = false) => {
      if (!questions || myNumber === null || submitted.current) return;
      submitted.current = true;
      locked.current = true;
      let durationSec = Math.floor((Date.now() - startedAt.current) / 1000);
      if (mode === "test") durationSec = Math.min(durationSec, TEST_TIME_LIMIT_SEC);
      setSubmitting(true);
      setError("");
      try {
        const res = await fetch("/api/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: myNumber,
            mode,
            section: mode === "practice" ? section : undefined,
            durationSec,
            answers: questions.map((q, i) => {
              const p = picksRef.current[i];
              return { id: q.id, choice: p === null ? null : q.choices[p] };
            }),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          submitted.current = false;
          setError(data.error ?? "採点できませんでした");
          return;
        }
        playSfx("finish");
        setResult({ ...data, durationSec, maxCombo: maxCombo.current, timeUp });
        window.scrollTo(0, 0);
      } catch {
        submitted.current = false;
        setError("通信に失敗しました。もう一度「結果を送信」を押してください。");
      } finally {
        setSubmitting(false);
      }
    },
    [questions, myNumber, mode, section],
  );

  // 回答後（または時間切れ後）に次の問題へ
  const afterAnswer = useCallback(() => {
    if (!questions) return;
    const c = idxRef.current;
    if (mode === "test") {
      // 前に戻って答え直した場合も、まだ答えていない最初の問題へ進む
      const next = picksRef.current.findIndex((p) => p === null);
      if (next === -1) submit();
      else goTo(next);
    } else if (c < questions.length - 1) {
      goTo(c + 1);
    } else {
      submit();
    }
  }, [questions, mode, goTo, submit]);

  // 復習コーナー：答え合わせ表示の後に次へ
  const nextReview = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPicked(null);
    locked.current = false;
    afterAnswer();
  }, [afterAnswer]);

  const choose = useCallback(
    (i: number) => {
      if (!questions || locked.current || submitted.current) return;
      const c = idxRef.current;
      const q = questions[c];
      picksRef.current[c] = i;
      setPicks([...picksRef.current]);
      locked.current = true;

      if (!instant) {
        setFlash(i);
        timer.current = setTimeout(() => {
          setFlash(null);
          locked.current = false;
          afterAnswer();
        }, FLASH_MS);
        return;
      }

      const ok = i === q.answer;
      frozenLeft.current = Math.max(0, qDeadline.current - Date.now());
      setPicked(i);
      if (ok) {
        const nextCombo = combo + 1;
        setCombo(nextCombo);
        setCorrectCount((n) => n + 1);
        maxCombo.current = Math.max(maxCombo.current, nextCombo);
        playSfx(nextCombo % 5 === 0 ? "combo" : "correct");
      } else {
        setCombo(0);
        playSfx("wrong");
      }
      if (mode === "review") timer.current = setTimeout(nextReview, ok ? NEXT_DELAY_OK : NEXT_DELAY_NG);
    },
    [questions, instant, mode, combo, afterAnswer, nextReview],
  );

  // タイマー
  useEffect(() => {
    if (!questions || result || questions.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [questions, result]);

  // 制限時間のチェック
  useEffect(() => {
    if (!questions || result || questions.length === 0 || submitted.current) return;
    if (mode === "test" && now >= startedAt.current + TEST_TIME_LIMIT_SEC * 1000) {
      submit(true);
    }
    // 練習モードの時間切れ：未回答のまま正解を表示し、「次へ」を待つ
    if (mode === "practice" && !locked.current && now >= qDeadline.current) {
      locked.current = true;
      frozenLeft.current = 0;
      setPicked(TIMED_OUT);
      setCombo(0);
      playSfx("wrong");
    }
  }, [now, questions, result, mode, submit]);

  // 問題が変わったら発音する
  useEffect(() => {
    if (questions && questions[idx] && !result) speak(questions[idx].phrase);
  }, [questions, idx, result]);

  // キーボード：1/2/3 で回答、← で前へ（テスト）、Enter で次へ（復習）
  useEffect(() => {
    if (!questions || result) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) choose(i);
      else if (e.key === "ArrowLeft" && mode === "test" && idxRef.current > 0 && !locked.current) goTo(idxRef.current - 1);
      else if ((e.key === "Enter" || e.key === " ") && instant && picked !== null) {
        e.preventDefault();
        nextReview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions, result, mode, instant, picked, choose, goTo, nextReview]);

  if (result && myNumber !== null) {
    return <ResultView result={result} mode={mode} section={section} onRetry={() => start(myNumber)} />;
  }
  if (error && !questions) return <p className="error">{error}</p>;
  if (!questions) return <p className="muted center">問題を準備中…🛠️</p>;

  if (questions.length === 0) {
    return (
      <div className="card empty-state">
        <div className="big">🎉</div>
        <h1>復習する問題はありません！</h1>
        <p className="muted">テストや練習で間違えた問題がここにたまります。正解するとリストから消えるよ。</p>
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
  const answeredCount = picks.filter((p) => p !== null).length;
  const doneCount = mode === "practice" ? idx : answeredCount;
  const elapsedMs = Math.max(0, now - startedAt.current);
  const ok = picked !== null && picked === q.answer;

  let timerLabel = `⏱ ${formatDuration(Math.floor(elapsedMs / 1000))}`;
  let timeRatio: number | null = null;
  let hurry = false;
  if (mode === "test") {
    const left = Math.max(0, TEST_TIME_LIMIT_SEC * 1000 - elapsedMs);
    const sec = Math.ceil(left / 1000);
    timerLabel = `⏳ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    timeRatio = left / (TEST_TIME_LIMIT_SEC * 1000);
    hurry = sec <= 30;
  } else if (mode === "practice") {
    // 答え合わせ表示中は回答した時点の残り時間で止める
    const left = picked !== null ? frozenLeft.current : Math.max(0, qDeadline.current - now);
    timerLabel = picked !== null ? "✋ 確認中" : `⏳ ${Math.ceil(left / 1000)}秒`;
    timeRatio = left / (PRACTICE_SEC_PER_QUESTION * 1000);
    hurry = picked === null && left <= 2000;
  }

  const modeLabel = mode === "review" ? "🔁 復習" : mode === "practice" ? `📚 練習 S${section}` : "🚀 テスト";

  return (
    <>
      <div className={`card question-card ${picked === null ? "" : ok ? "correct" : "wrong"}`}>
        <div className="test-top">
          <span className={`mode-tag ${mode}`}>{modeLabel}</span>
          <span>
            Q.{idx + 1} / {questions.length}
          </span>
          <span className={`timer ${hurry ? "hurry" : ""}`}>{timerLabel}</span>
        </div>
        {timeRatio !== null && (
          <div className="time-bar">
            <div className={hurry ? "hurry" : ""} style={{ width: `${timeRatio * 100}%` }} />
          </div>
        )}
        <div className="progress">
          <div style={{ width: `${(doneCount / questions.length) * 100}%` }} />
        </div>
        {instant && (
          <div className="score-line">
            <span style={{ color: "var(--ok)" }}>⭕ {correctCount}問正解</span>
            {combo >= 2 && (
              <span key={combo} className="combo">
                🔥 {combo} COMBO!
              </span>
            )}
          </div>
        )}

        <div className="phrase-wrap">
          <div className="phrase" key={idx}>
            {q.phrase}
          </div>
          <button className="speak-btn" onClick={() => speak(q.phrase, true)}>
            🔊 発音を聞く
          </button>
          {picked !== null && picked !== TIMED_OUT && <div className={`feedback ${ok ? "ok" : "ng"}`}>{ok ? "◯" : "✕"}</div>}
          {picked === TIMED_OUT && <div className="feedback ng timeout">時間切れ</div>}
        </div>

        <div className="choices">
          {q.choices.map((c, i) => {
            let state = "";
            if (instant && picked !== null) {
              if (i === q.answer) state = "is-answer";
              else if (i === picked) state = "is-wrong";
              else state = "dim";
            } else if (flash === i || (flash === null && picks[idx] === i)) {
              state = "chosen";
            }
            return (
              <button
                key={i}
                className={`choice c${i} ${state}`}
                disabled={instant && picked !== null}
                onClick={() => choose(i)}
              >
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
              if (confirm("途中でやめると結果は記録されません。やめますか？")) router.push(mode === "practice" ? "/practice" : "/");
            }}
          >
            やめる
          </button>
          {mode === "test" && idx > 0 && !submitting && (
            <button className="btn" onClick={() => !locked.current && goTo(idx - 1)}>
              ← 前へ
            </button>
          )}
          {instant && picked !== null && !submitting && (
            <button className="btn btn-primary" onClick={nextReview}>
              {idx < questions.length - 1 ? "次へ ▶" : "結果を見る 🎉"}
            </button>
          )}
          {submitting && <span className="muted">採点中…</span>}
        </div>
        {error && (
          <div>
            <p className="error">{error}</p>
            <button className="btn btn-primary" onClick={() => submit()}>
              結果を送信
            </button>
          </div>
        )}
      </div>
      <p className="muted center">
        {mode === "test" && "選ぶとすぐ次の問題へ。答え合わせは最後にまとめて！（1・2・3キーでも回答できます）"}
        {mode === "practice" &&
          `1問${PRACTICE_SEC_PER_QUESTION}秒以内に答えよう！答え合わせを確認したら「次へ」（1・2・3キーで回答、Enterで次へ）`}
        {mode === "review" && "キーボードなら 1・2・3 で回答、Enter で次へ"}
      </p>
    </>
  );
}

const CONFETTI_COLORS = ["#ff5fa2", "#3fb6f2", "#22c58b", "#fbbf24", "#7c3aed", "#f97316"];

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 60 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2 + Math.random() * 2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  );
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

function ResultView({
  result,
  mode,
  section,
  onRetry,
}: {
  result: Result;
  mode: Mode;
  section: number;
  onRetry: () => void;
}) {
  const [shown, setShown] = useState(0);
  const wrongItems = result.details.filter((d) => !d.correct);
  const [filter, setFilter] = useState<"wrong" | "all">(wrongItems.length > 0 ? "wrong" : "all");
  const ratio = result.total > 0 ? result.score / result.total : 0;
  const title = titleFor(Math.round(ratio * 100));
  const mark = mode === "practice" ? markFor(result.score) : "";
  const list = filter === "wrong" ? wrongItems : result.details;

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

  const heading =
    mode === "review"
      ? "🔁 復習コーナー 結果"
      : mode === "practice"
        ? `📚 練習 セクション${section}（No.${sectionRange(section).join("〜")}）`
        : "🚀 テスト結果";

  return (
    <>
      <div className="card result-hero">
        {ratio >= 0.8 && <Confetti />}
        <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
          {heading}
        </p>
        {result.timeUp && <p className="time-up">⏰ タイムアップ！</p>}
        <div className="score">
          {shown}
          <small> / {result.total}</small>
        </div>
        {mode === "practice" ? (
          <div className="result-title">
            {mark === "◎" && <span className="mark perfect">◎ 満点クリア！</span>}
            {mark === "○" && <span className="mark pass">○ クリア！</span>}
            {mark === "" && <span className="mark none">あと{PASS_SCORE - result.score}問でクリア（○）</span>}
            {result.newBest && <span className="badge" style={{ background: "#f97316", marginLeft: 8 }}>🆕 自己ベスト</span>}
          </div>
        ) : (
          <div className="result-title" style={{ color: title.color }}>
            {title.icon} {title.name}
          </div>
        )}
        <p style={{ fontWeight: 800, margin: "4px 0 10px" }}>{cheerFor(ratio)}</p>
        <div className="result-stats">
          <span>⏱ {formatDuration(result.durationSec)}</span>
          {mode === "review" && <span>🔥 最大 {result.maxCombo} コンボ</span>}
          {mode === "practice" && result.best !== undefined && <span>🏅 ベスト {result.best}点</span>}
          <span>🔁 復習リスト 残り {result.remaining}問</span>
        </div>
        {mode === "review" && <p className="muted">復習コーナーの結果はランキングには入りません</p>}
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary btn-large" onClick={onRetry}>
            {mode === "review" ? "🔁 もう一度復習" : "🚀 もう一度挑戦"}
          </button>
          {mode === "practice" && (
            <>
              <Link href={`/practice/${section}`} className="btn btn-large">
                📖 単語一覧
              </Link>
              <Link href="/practice" className="btn btn-large">
                🗺️ セクション一覧
              </Link>
            </>
          )}
          {mode === "test" && result.remaining > 0 && (
            <Link href="/test?mode=review" className="btn btn-review btn-large">
              🔁 復習する
            </Link>
          )}
          {mode !== "practice" && (
            <Link href="/ranking" className="btn btn-large">
              🏆 ランキング
            </Link>
          )}
          <Link href="/" className="btn btn-large">
            🏠 ホーム
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="sort-tabs">
          <button className={filter === "wrong" ? "active" : ""} onClick={() => setFilter("wrong")}>
            ❌ 不正解だけ（{wrongItems.length}）
          </button>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            📋 全問（{result.details.length}）
          </button>
        </div>
        {list.length === 0 && <p className="muted center">全問正解！すばらしい🎉</p>}
        {list.map((r, i) => (
          <div key={r.id} className={`review-item ${r.correct ? "ok" : ""}`}>
            <button className="mini-speak" onClick={() => speak(r.phrase, true)} aria-label="発音を聞く">
              🔊
            </button>
            <div className="body">
              <div className="phrase-small">
                <span className={r.correct ? "res-ok" : "res-ng"}>{r.correct ? "◯" : "✕"}</span>{" "}
                {filter === "all" && <span className="muted">Q{i + 1}　</span>}
                {r.phrase}
              </div>
              {!r.correct && <div className="wrong">あなたの答え：{r.chosen ?? "（未回答・時間切れ）"}</div>}
              <div className="right">正しい意味：{r.meaning}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
