"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sound";
import { BLANK, shuffle, useJhistData, type CQuestion } from "@/lib/jhist/client";
import { PRACTICE_COUNT, PRACTICE_SEC } from "@/lib/jhist/constants";
import { useSet } from "../../SetContext";
import { Feedback, Filled } from "../parts";
import { useHist } from "@/lib/jhist/context";

const LABELS = ["ア", "イ", "ウ", "エ"];
const TIMED_OUT = -1;
const SUBMIT_RETRIES = 3;

type Item = { q: CQuestion; choices: string[] };
type Answer = { qid: string; chosen: string | null; sec: number };
type Result = { score: number; total: number; best: [number, number]; newBest: boolean; mark: string };

export default function JhistQuizPage() {
  return (
    <Suspense fallback={<p className="muted center">問題を準備中…🛠️</p>}>
      <Runner />
    </Suspense>
  );
}

// 4択：正解と誤答1〜3を並べ替える（誤答はデータのものだけを使う）
function makeItem(q: CQuestion): Item {
  return { q, choices: shuffle([q.answer, ...q.wrongs]) };
}

function Runner() {
  const h = useHist();
  const params = useSearchParams();
  const router = useRouter();
  const sectionKey = params.get("section") ?? "";
  const { ready } = useSet();
  const { data, error: dataError } = useJhistData();
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [combo, setCombo] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const answers = useRef<Answer[]>([]);
  const shownAt = useRef(0);
  const attemptId = useRef("");

  const section = data?.sections.find((s) => s.key === sectionKey) ?? null;

  const start = useCallback(() => {
    if (!data || !section) return;
    const pool = shuffle(section.ids).slice(0, Math.min(PRACTICE_COUNT, section.ids.length));
    setItems(pool.map((id) => makeItem(data.byId.get(id)!)));
    answers.current = [];
    attemptId.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    setIdx(0);
    setPicked(null);
    setCorrect(0);
    setCombo(0);
    setResult(null);
    setError("");
    shownAt.current = Date.now();
    setNow(Date.now());
  }, [data, section]);

  useEffect(() => {
    if (ready && data && section && !items) start();
  }, [ready, data, section, items, start]);

  const choose = useCallback(
    (i: number) => {
      if (!items || picked !== null) return;
      const item = items[idx];
      const chosen = i === TIMED_OUT ? null : item.choices[i];
      const ok = chosen === item.q.answer;
      answers.current.push({ qid: item.q.id, chosen, sec: Math.min(PRACTICE_SEC, (Date.now() - shownAt.current) / 1000) });
      setPicked(i);
      if (ok) {
        setCorrect((c) => c + 1);
        setCombo(combo + 1);
        playSfx((combo + 1) % 5 === 0 ? "combo" : "correct");
      } else {
        setCombo(0);
        playSfx("wrong");
      }
    },
    [items, idx, picked, combo],
  );

  // 1問ごとの制限時間
  useEffect(() => {
    if (!items || picked !== null || result) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - shownAt.current >= PRACTICE_SEC * 1000) choose(TIMED_OUT);
    }, 100);
    return () => clearInterval(t);
  }, [items, picked, result, choose]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError("");
    for (let i = 0; i < SUBMIT_RETRIES; i++) {
      try {
        const res = await fetch(`${h.api}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "practice", section: sectionKey, attemptId: attemptId.current, answers: answers.current }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setResult(d);
        setSubmitting(false);
        playSfx("finish");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    setSubmitting(false);
    setError("結果を送信できませんでした。通信を確認して、もう一度送信してください。");
  }, [sectionKey]);

  const next = useCallback(() => {
    if (!items || picked === null) return;
    if (idx < items.length - 1) {
      setIdx(idx + 1);
      setPicked(null);
      shownAt.current = Date.now();
      setNow(Date.now());
    } else {
      submit();
    }
  }, [items, idx, picked, submit]);

  // キーボード：1〜4で回答、Enterで次へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result || submitting) return;
      if (picked === null && ["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      else if (picked !== null && e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, result, submitting, choose, next]);

  if (dataError) return <p className="error">問題を読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data) return <p className="muted center">問題を準備中…🛠️</p>;
  if (!section) {
    return (
      <p className="muted center">
        セクションが見つかりません。<Link href={`${h.base}/practice`}>セクション一覧へ</Link>
      </p>
    );
  }
  if (!items) return <p className="muted center">問題を準備中…🛠️</p>;

  if (result) {
    const wrongs = items.filter((it, i) => answers.current[i]?.chosen !== it.q.answer);
    return (
      <>
        <div className="card center">
          <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
            📚 {section.no}. {section.name}
          </p>
          <div className="jh-result-number">
            {result.score}
            <small>/{result.total}</small>
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, margin: "4px 0" }}>
            {result.mark === "◎" ? "◎ 満点！" : result.mark === "○" ? "○ クリア！" : "もう一息！"}
            {result.newBest && <span className="badge" style={{ marginLeft: 8 }}>自己ベスト更新</span>}
          </p>
          <p className="muted">
            自己ベスト {result.best[0]}/{result.best[1]}
          </p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary btn-large" onClick={start}>
              🔁 もう一度
            </button>
            <Link href={`${h.base}/practice/${encodeURIComponent(section.key)}`} className="btn btn-large">
              📖 一覧を見る
            </Link>
          </div>
        </div>
        {wrongs.length > 0 && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>✕ 間違えた問題（{wrongs.length}問）</h2>
            {wrongs.map((it) => {
              const a = answers.current.find((x) => x.qid === it.q.id);
              return (
                <div key={it.q.id} className="jh-review">
                  <Filled q={it.q} word={it.q.answer} />
                  <div className="muted jh-review-sub">
                    {a?.chosen ? `あなたの答え：${a.chosen}` : "時間切れ"}
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

  const item = items[idx];
  const chosen = picked === null || picked === TIMED_OUT ? null : item.choices[picked];
  const ok = picked !== null && chosen === item.q.answer;
  const left = Math.max(0, PRACTICE_SEC - (now - shownAt.current) / 1000);
  const [before, after] = item.q.text.split(BLANK);

  return (
    <>
      <div className={`card question-card ${picked === null ? "" : ok ? "correct" : "wrong"}`}>
        <div className="test-top">
          <span className="mode-tag practice">📚 {section.no}. {section.name}</span>
          <span>
            Q.{idx + 1} / {items.length}
          </span>
          <span className={`timer ${left <= 5 ? "hurry" : ""}`}>{picked === null ? `${Math.ceil(left)}秒` : ""}</span>
        </div>
        <div className="time-bar">
          <div className={left <= 5 ? "hurry" : ""} style={{ width: `${picked === null ? (left / PRACTICE_SEC) * 100 : 0}%` }} />
        </div>
        <div className="progress">
          <div style={{ width: `${((idx + (picked === null ? 0 : 1)) / items.length) * 100}%` }} />
        </div>
        <div className="score-line">
          <span style={{ color: "var(--ok)" }}>⭕ {correct}問正解</span>
          {combo >= 2 && (
            <span key={combo} className="combo">
              🔥 {combo} COMBO!
            </span>
          )}
        </div>

        <div className="jh-question" key={idx}>
          {before}
          <span className="jh-blank">{picked === null ? "（　　）" : <b className="jh-fill">{item.q.answer}</b>}</span>
          {after}
          {picked !== null && picked !== TIMED_OUT && <div className={`feedback ${ok ? "ok" : "ng"}`}>{ok ? "◯" : "✕"}</div>}
          {picked === TIMED_OUT && <div className="feedback ng timeout">時間切れ</div>}
        </div>

        <div className="choices jh-choices">
          {item.choices.map((c, i) => {
            const state = picked === null ? "" : c === item.q.answer ? "is-answer" : i === picked ? "is-wrong" : "dim";
            return (
              <button key={c} className={`choice c${i % 3} ${state}`} disabled={picked !== null} onClick={() => choose(i)}>
                <span className="choice-label">{LABELS[i]}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>

        {picked !== null && <Feedback data={data} q={item.q} chosen={chosen} />}

        <div className="test-bottom">
          <button
            className="link-btn"
            onClick={() => {
              if (confirm("途中でやめると結果は記録されません。やめますか？")) router.push(`${h.base}/practice/${encodeURIComponent(section.key)}`);
            }}
          >
            やめる
          </button>
          {picked !== null && !submitting && !error && (
            <button className="btn btn-primary" onClick={next}>
              {idx < items.length - 1 ? "次へ ▶" : "結果を見る 🎉"}
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
      <p className="muted center">1問{PRACTICE_SEC}秒以内に答えよう！答え合わせを確認したら「次へ」（1〜4キーで回答、Enterで次へ）</p>
    </>
  );
}
