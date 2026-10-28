"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { playSfx } from "@/lib/sound";
import { shuffle, useJhistData, type CQuestion, type JData } from "@/lib/jhist/client";
import { CONFUSION_QUESTIONS_PER_TERM } from "@/lib/jhist/constants";
import { useSet } from "../../SetContext";
import { Feedback } from "../parts";
import { PairList } from "../PairList";
import { pairTerms, useConfusions } from "../useConfusions";

const LABELS = ["ア", "イ", "ウ", "エ"];

export default function JhistConfusionsPage() {
  return (
    <Suspense fallback={<p className="muted center">読み込み中…</p>}>
      <Confusions />
    </Suspense>
  );
}

// 2つの用語の問題を交互に出す（多いときは1語3問まで）
function drillOf(data: JData, a: number, b: number) {
  const qa = data.termQuestions[a].slice(0, CONFUSION_QUESTIONS_PER_TERM);
  const qb = data.termQuestions[b].slice(0, CONFUSION_QUESTIONS_PER_TERM);
  const out: CQuestion[] = [];
  for (let i = 0; i < Math.max(qa.length, qb.length); i++) {
    if (qa[i]) out.push(data.byId.get(qa[i])!);
    if (qb[i]) out.push(data.byId.get(qb[i])!);
  }
  return out.map((q) => ({ q, choices: shuffle([q.answer, ...q.wrongs]) }));
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function Confusions() {
  const params = useSearchParams();
  const { ready } = useSet();
  const { data, error } = useJhistData();
  const pairs = useConfusions();
  const term = params.get("term");
  const wrong = params.get("wrong");
  if (error) return <p className="error">問題を読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data || !pairs) return <p className="muted center">読み込み中…</p>;
  const terms = term && wrong ? pairTerms(data, { term, wrong }) : null;
  if (terms) return <Drill key={`${term}|${wrong}`} data={data} a={terms[0]} b={terms[1]} />;

  return (
    <div className="card">
      <Link href="/c/jhist" className="muted">
        ← 日本史のページ
      </Link>
      <h1 style={{ margin: "8px 0" }}>⚠️ 取り違えやすい語</h1>
      <p className="muted" style={{ marginTop: 0 }}>4択で選んだ誤答が、ほかの問題の正解だった組です。押すと、その2語の問題を続けて出します。</p>
      <PairList data={data} pairs={pairs} />
    </div>
  );
}

// 2語の特訓：4択で1問ずつ答え合わせ。最後にまとめて送る（正解しても段階は上げず、不正解なら下げる）
function Drill({ data, a, b }: { data: JData; a: number; b: number }) {
  const [items] = useState(() => drillOf(data, a, b));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ qid: string; format: "choice"; chosen: string; sec: number }[]>([]);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [sent, setSent] = useState<"" | "sending" | "done" | "error">("");

  const send = useCallback(async (list: typeof answers) => {
    setSent("sending");
    try {
      const r = await fetch("/api/jhist/answers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "confusion", attemptId: newId(), answers: list }) });
      if (!r.ok) throw new Error();
      setSent("done");
      playSfx("finish");
    } catch {
      setSent("error");
    }
  }, []);

  useEffect(() => {
    if (idx >= items.length && answers.length === items.length && sent === "") send(answers);
  }, [idx, items.length, answers, sent, send]);

  if (idx >= items.length) {
    const ok = answers.filter((x) => x.chosen === data.byId.get(x.qid)!.answer).length;
    return (
      <div className="card center">
        <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
          ⚠️ {data.terms[a].term} ⇄ {data.terms[b].term}
        </p>
        <div className="jh-result-number">
          {ok}
          <small>/{items.length}</small>
        </div>
        {sent === "error" && <p className="error">記録できませんでした（答え合わせはできています）。</p>}
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/jhist/confusions" className="btn btn-primary btn-large">
            ほかの組へ
          </Link>
          <Link href="/c/jhist" className="btn btn-large">
            日本史のページへ
          </Link>
        </div>
      </div>
    );
  }

  const { q, choices } = items[idx];
  const done = picked !== null;
  return (
    <div className={`card question-card ${!done ? "" : picked === q.answer ? "correct" : "wrong"}`}>
      <div className="test-top">
        <span className="mode-tag review">⚠️ {data.terms[a].term} ⇄ {data.terms[b].term}</span>
        <span>
          {idx + 1} / {items.length}
        </span>
      </div>
      <div className="jh-question">{done ? <span>{q.text.replace("（　　）", `【${q.answer}】`)}</span> : q.text}</div>
      <div className="choices jh-choices">
        {choices.map((c, i) => {
          const state = !done ? "" : c === q.answer ? "is-answer" : c === picked ? "is-wrong" : "dim";
          return (
            <button
              key={c}
              className={`choice c${i % 3} ${state}`}
              disabled={done}
              onClick={() => {
                setPicked(c);
                setAnswers((x) => [...x, { qid: q.id, format: "choice", chosen: c, sec: Math.round((Date.now() - shownAt) / 100) / 10 }]);
                playSfx(c === q.answer ? "correct" : "wrong");
              }}
            >
              <span className="choice-label">{LABELS[i]}</span>
              <span>{c}</span>
            </button>
          );
        })}
      </div>
      {done && <Feedback data={data} q={q} chosen={picked} />}
      <div className="test-bottom">
        <Link href="/jhist/confusions" className="link-btn">
          やめる
        </Link>
        {done && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setIdx(idx + 1);
              setPicked(null);
              setShownAt(Date.now());
            }}
          >
            {idx < items.length - 1 ? "次へ ▶" : "結果を見る 🎉"}
          </button>
        )}
      </div>
    </div>
  );
}
