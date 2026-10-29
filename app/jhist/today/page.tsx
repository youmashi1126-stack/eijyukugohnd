"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "@/lib/sound";
import { BLANK, shuffle, useJhistData, type CQuestion, type JData } from "@/lib/jhist/client";
import { HESITATE_SEC, REQUEUE_AFTER, REQUEUE_MAX_STAGE, WRONG_TO } from "@/lib/jhist/constants";
import { lengthHint } from "@/lib/jhist/hint";
import { type Daily, type Goal, type ResolvedSettings } from "@/lib/jhist/profile";
import { formatOf, type Format, type Mark } from "@/lib/jhist/srs";
import { useSet } from "../../SetContext";
import { InputAnswer } from "../InputAnswer";
import { Feedback } from "../parts";
import { JhistSettingsForm } from "../SettingsForm";
import { useHist } from "@/lib/jhist/context";

const LABELS = ["ア", "イ", "ウ", "エ"];
// 何問ごとにまとめて送るか
const SEND_EVERY = 5;
const FORMAT_LABEL: Record<Format, string> = { choice: "4択", tf: "正誤", write: "記述" };

type QueueItem = { qid: string; term: number; stage: number; format: Format; isNew: boolean };
type Status = {
  today: string;
  settings: ResolvedSettings;
  daily: Daily;
  remaining: number;
  streak: number;
  more: boolean;
  items?: QueueItem[];
};
// 出題中の1問：4択なら選択肢、正誤なら見せる文が誤文か
type Step = QueueItem & { choices: string[]; shownWrong: boolean; again: boolean };
type Sent = { qid: string; sec: number; format: Format; chosen?: string | null; shownWrong?: boolean; judged?: boolean; self?: Mark; input?: string };

function makeStep(data: JData, item: QueueItem, again = false): Step {
  const q = data.byId.get(item.qid)!;
  return { ...item, again, choices: shuffle([q.answer, ...q.wrongs]), shownWrong: Math.random() < 0.5 };
}

// 不正解で出し直すときは、前回と違う問題文にする（同じ用語の問題が1つなら同じ文）
function otherQuestion(data: JData, term: number, last: string) {
  const list = data.termQuestions[term];
  return list[(list.indexOf(last) + 1) % list.length];
}

function newAttemptId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function JhistTodayPage() {
  const h = useHist();
  const { ready } = useSet();
  const { data, error: dataError } = useJhistData();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<{ mark: Mark }[]>([]);
  const [phase, setPhase] = useState<"answer" | "reveal" | "feedback">("answer");
  const [last, setLast] = useState<{ mark: Mark; hesitant: boolean; chosen?: string | null; judged?: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const pending = useRef<Sent[]>([]);
  const shownAt = useRef(0);
  const sessionTerms = useRef<Set<number>>(new Set());

  // 次のセッションの問題とノルマを読む
  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`${h.api}/today`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStatus(d);
      return d as Status;
    } catch {
      setError("データを読み込めませんでした。再読み込みしてください。");
      return null;
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // たまった回答を送る（失敗したら次の送信でまとめて送り直す）
  const flush = useCallback(async () => {
    if (!pending.current.length) return true;
    const batch = pending.current;
    pending.current = [];
    setSending(true);
    try {
      const r = await fetch(`${h.api}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "today", attemptId: newAttemptId(), answers: batch }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStatus((s) => (s ? { ...s, daily: d.daily, streak: d.streak, remaining: Math.max(0, d.daily.newTarget - d.daily.newDone) + Math.max(0, d.daily.reviewTarget - d.daily.reviewDone) } : s));
      if (d.achievedNow) playSfx("finish");
      return true;
    } catch {
      pending.current = [...batch, ...pending.current];
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  // 画面を離れるとき（ほかのページへ移る・アプリを閉じる）も、たまった回答を送る
  const sendNow = useCallback(() => {
    if (!pending.current.length) return;
    const body = JSON.stringify({ source: "today", attemptId: newAttemptId(), answers: pending.current });
    pending.current = [];
    if (!navigator.sendBeacon?.(`${h.api}/answers`, new Blob([body], { type: "application/json" }))) {
      fetch(`${h.api}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && sendNow();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      sendNow();
    };
  }, [sendNow]);

  const startSession = useCallback(
    (s: Status) => {
      if (!data || !s.items?.length) return;
      sessionTerms.current = new Set(s.items.map((i) => i.term));
      setSteps(s.items.map((i) => makeStep(data, i)));
      setIdx(0);
      setDone([]);
      setPhase("answer");
      setLast(null);
      shownAt.current = Date.now();
    },
    [data],
  );

  // 答えを記録する。不正解（段階3まで）は、同じセッションの7問後に違う問題文で出し直す
  const record = useCallback(
    (sent: Omit<Sent, "sec" | "qid" | "format">, mark: Mark) => {
      if (!steps || !data) return;
      const step = steps[idx];
      const sec = (Date.now() - shownAt.current) / 1000;
      pending.current.push({ qid: step.qid, sec: Math.round(sec * 10) / 10, format: step.format, ...sent });
      const hesitant = step.format !== "write" && mark === "o" && sec >= HESITATE_SEC;
      setLast({ mark, hesitant, chosen: sent.chosen, judged: sent.judged });
      setDone((d) => [...d, { mark }]);
      setPhase("feedback");
      if (mark === "x" && step.stage <= REQUEUE_MAX_STAGE) {
        const stage = WRONG_TO[step.stage];
        const again = makeStep(data, { ...step, qid: otherQuestion(data, step.term, step.qid), stage, format: formatOf(stage), isNew: false }, true);
        setSteps((list) => {
          const next = [...list!];
          next.splice(Math.min(next.length, idx + 1 + REQUEUE_AFTER), 0, again);
          return next;
        });
      }
      playSfx(mark === "o" ? "correct" : "wrong");
      if (pending.current.length >= SEND_EVERY) flush();
    },
    [steps, idx, data, flush],
  );

  const next = useCallback(async () => {
    if (!steps) return;
    if (idx < steps.length - 1) {
      setIdx(idx + 1);
      setPhase("answer");
      setLast(null);
      shownAt.current = Date.now();
      return;
    }
    // セッションの終わり：送ってからノルマを読み直す
    await flush();
    const s = await load();
    if (s) setStatus(s);
    setSteps([]);
  }, [steps, idx, flush, load]);

  if (dataError) return <p className="error">問題を読み込めませんでした。再読み込みしてください。</p>;
  if (error) return <p className="error">{error}</p>;
  if (!ready || !data || !status) return <p className="muted center">読み込み中…</p>;

  if (!status.settings.set) return <Setup status={status} onSaved={() => load()} />;

  const quota = <Quota status={status} />;

  // セッションの前・あと
  if (!steps || steps.length === 0 || idx >= steps.length) {
    const finished = steps !== null;
    const ok = done.filter((d) => d.mark === "o").length;
    return (
      <>
        {quota}
        <div className="card center">
          {finished && done.length > 0 && (
            <>
              <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
                この回の結果
              </p>
              <div className="jh-result-number">
                {ok}
                <small>/{done.length}</small>
              </div>
            </>
          )}
          {status.items?.length ? (
            <>
              <p>
                {status.remaining > 0
                  ? `今日のノルマはあと ${status.remaining}問。`
                  : "🎉 今日のノルマは達成！ 期限の来た復習が残っています。"}
                次は{status.items.length}問です。
              </p>
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button className="btn btn-primary btn-large" onClick={() => startSession(status)}>
                  {finished ? "▶ 続ける" : "▶ 今日の学習をはじめる"}
                </button>
                {finished && (
                  <Link href={h.corner} className="btn btn-large">
                    今日は終わり
                  </Link>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 18, fontWeight: 800 }}>🎉 今日の分はすべて終わりました！</p>
              <p className="muted">また明日。節別の練習で新しい範囲を先に学ぶこともできます。</p>
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <Link href={h.corner} className="btn btn-primary btn-large">
                  {h.label}のページへ
                </Link>
                <Link href={`${h.base}/practice`} className="btn btn-large">
                  📚 節別の練習
                </Link>
              </div>
            </>
          )}
          {sending && <p className="muted">送信中…</p>}
        </div>
      </>
    );
  }

  const step = steps[idx];
  const q = data.byId.get(step.qid)!;
  const answered = phase === "feedback";

  return (
    <>
      {quota}
      <div className={`card question-card ${!answered ? "" : last?.mark === "o" ? "correct" : last?.mark === "t" ? "" : "wrong"}`}>
        <div className="test-top">
          <span className={`mode-tag ${step.isNew ? "practice" : "review"}`}>
            {step.again ? "🔁 もう一度" : step.isNew ? "🆕 新出" : `🔁 復習・段階${step.stage}`}・{FORMAT_LABEL[step.format]}
          </span>
          <span>
            {idx + 1} / {steps.length}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {h.eraShort[q.era]}
          </span>
        </div>
        <div className="progress">
          <div style={{ width: `${((idx + (answered ? 1 : 0)) / steps.length) * 100}%` }} />
        </div>

        {step.format === "choice" && <ChoiceStep step={step} q={q} phase={phase} chosen={last?.chosen} onPick={(c) => record({ chosen: c }, c === q.answer ? "o" : "x")} />}
        {step.format === "tf" && <TfStep step={step} q={q} phase={phase} judged={last?.judged} onJudge={(j) => record({ shownWrong: step.shownWrong, judged: j }, j === !step.shownWrong ? "o" : "x")} />}
        {step.format === "write" &&
          (status.settings.writeMode === "input" ? (
            <InputAnswer key={idx} q={q} level={status.settings.examLevel} onJudged={(input, j) => record({ input }, j.mark)} />
          ) : (
            <WriteStep q={q} phase={phase} onReveal={() => setPhase("reveal")} onSelf={(m) => record({ self: m }, m)} />
          ))}

        {answered && last && (
          <>
            <p className={`jh-verdict ${last.mark}`}>
              {last.mark === "o" ? (last.hesitant ? "◯ 正解（迷った正解：段階はそのまま、明日もう一度）" : "◯ 正解") : last.mark === "t" ? (step.format === "write" && status.settings.writeMode === "input" ? "△ 1文字違い・誤字の可能性（明日もう一度）" : "△ あやふや（明日もう一度）") : "✕ 不正解"}
              {last.mark === "x" && step.stage <= REQUEUE_MAX_STAGE && <span className="muted">・このあともう一度出ます</span>}
            </p>
            <Feedback data={data} q={q} chosen={step.format === "choice" ? (last.chosen ?? null) : undefined} showWrong={step.format === "tf" && last.mark === "x"} />
          </>
        )}

        <div className="test-bottom">
          <Link href={h.corner} className="link-btn" onClick={sendNow}>
            今日は終わり
          </Link>
          {answered && (
            <button className="btn btn-primary" onClick={next} disabled={sending && idx >= steps.length - 1}>
              {idx < steps.length - 1 ? "次へ ▶" : "この回の結果 ▶"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// 今日のノルマ（いつでも見えるように上に出す）
function Quota({ status }: { status: Status }) {
  const d = status.daily;
  return (
    <div className="card jh-quota">
      <div className="jh-quota-main">
        <span>
          📅 今日のノルマ {status.remaining > 0 ? <b>残り {status.remaining}問</b> : <b>達成 🎉</b>}
        </span>
        <span>🔥 連続 {status.streak}日</span>
      </div>
      <div className="jh-quota-sub muted">
        新出 {Math.min(d.newDone, d.newTarget)}/{d.newTarget}・復習 {Math.min(d.reviewDone, d.reviewTarget)}/{d.reviewTarget}
      </div>
      <div className="mini-bar">
        <div
          className={status.remaining === 0 ? "done" : ""}
          style={{ width: `${d.newTarget + d.reviewTarget ? ((Math.min(d.newDone, d.newTarget) + Math.min(d.reviewDone, d.reviewTarget)) / (d.newTarget + d.reviewTarget)) * 100 : 100}%` }}
        />
      </div>
    </div>
  );
}

// 問題文（空欄つき）。答えたあとは空欄に正解を入れる
function Question({ q, filled, hint }: { q: CQuestion; filled: boolean; hint?: string }) {
  const [before, after] = q.text.split(BLANK);
  return (
    <div className="jh-question">
      {before}
      <span className="jh-blank">{filled ? <b className="jh-fill">{q.answer}</b> : "（　　）"}</span>
      {hint && !filled && <span className="jh-hint">{hint}</span>}
      {after}
    </div>
  );
}

function ChoiceStep({ step, q, phase, chosen, onPick }: { step: Step; q: CQuestion; phase: string; chosen?: string | null; onPick: (c: string) => void }) {
  const answered = phase === "feedback";
  return (
    <>
      <Question q={q} filled={answered} />
      <div className="choices jh-choices">
        {step.choices.map((c, i) => {
          const state = !answered ? "" : c === q.answer ? "is-answer" : c === chosen ? "is-wrong" : "dim";
          return (
            <button key={c} className={`choice c${i % 3} ${state}`} disabled={answered} onClick={() => onPick(c)}>
              <span className="choice-label">{LABELS[i]}</span>
              <span>{c}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// 正誤判定：正文か誤文（空欄に誤答1を入れた文）のどちらかを見せて、正しいか誤りかを答える
function TfStep({ step, q, phase, judged, onJudge }: { step: Step; q: CQuestion; phase: string; judged?: boolean; onJudge: (j: boolean) => void }) {
  const answered = phase === "feedback";
  const word = step.shownWrong ? q.wrongs[0] : q.answer;
  const [before, after] = q.text.split(BLANK);
  return (
    <>
      <p className="muted jh-tf-ask">次の文は正しい？ 誤り？</p>
      <div className="jh-question jh-tf-text">
        {before}
        <b className={answered ? (step.shownWrong ? "jh-wrong-word" : "jh-fill") : ""}>{word}</b>
        {after}
      </div>
      <div className="jh-tf-buttons">
        {[true, false].map((j) => (
          <button
            key={String(j)}
            className={`btn btn-large ${answered ? (j === !step.shownWrong ? "is-answer" : judged === j ? "is-wrong" : "dim") : ""}`}
            disabled={answered}
            onClick={() => onJudge(j)}
          >
            {j ? "⭕ 正しい" : "❌ 誤り"}
          </button>
        ))}
      </div>
    </>
  );
}

// 記述（自己採点）：答えを思い浮かべてから「答えを見る」→ ○書けた／△あやふや／×書けなかった
function WriteStep({ q, phase, onReveal, onSelf }: { q: CQuestion; phase: string; onReveal: () => void; onSelf: (m: Mark) => void }) {
  const shown = phase !== "answer";
  return (
    <>
      <p className="muted jh-tf-ask">空欄に入る語を、紙に書くか頭の中で書いてから答えを見よう</p>
      <Question q={q} filled={shown} hint={lengthHint(q.answer, q.alts)} />
      {!shown && (
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary btn-large" onClick={onReveal}>
            👀 答えを見る
          </button>
        </div>
      )}
      {phase === "reveal" && (
        <>
          <p className="center" style={{ margin: "6px 0" }}>
            正解：<b className="jh-fill">{q.answer}</b>
            {q.alts.length > 0 && <span className="muted">（別解：{q.alts.join("、")}）</span>}
          </p>
          <div className="jh-self">
            <button className="btn btn-large jh-self-o" onClick={() => onSelf("o")}>
              ○ 書けた
            </button>
            <button className="btn btn-large jh-self-t" onClick={() => onSelf("t")}>
              △ あやふや
            </button>
            <button className="btn btn-large jh-self-x" onClick={() => onSelf("x")}>
              × 書けなかった
            </button>
          </div>
        </>
      )}
    </>
  );
}

// 初回だけ：入試日と目標を選ぶ（マイページでいつでも変えられる）
function Setup({ status, onSaved }: { status: Status; onSaved: () => void }) {
  const h = useHist();
  const [examDate, setExamDate] = useState(status.settings.examDate);
  const [goal, setGoal] = useState<Goal>(status.settings.goal);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${h.api}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examDate, goal }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>📅 今日の学習の準備</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        入試日と目標から、毎日の新出の数を決めます。あとからマイページで変えられます。
      </p>
      <JhistSettingsForm examDate={examDate} goal={goal} onExamDate={setExamDate} onGoal={setGoal} />
      <div className="btn-row">
        <button className="btn btn-primary btn-large" disabled={busy} onClick={save}>
          この設定ではじめる
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
