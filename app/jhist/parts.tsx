"use client";
// 日本史の画面で共通の部品：空欄に語を入れた文、取り違え注意、正誤の比べ表示、「問題がおかしい」報告
import { useState } from "react";
import { BLANK, type CQuestion, type JData } from "@/lib/jhist/client";
import { REPORT_MAX } from "@/lib/jhist/constants";
import { useHist } from "@/lib/jhist/context";

// 「問題がおかしい」ボタン：押すと理由（任意・100字まで）を書いて送れる
export function ReportButton({ qid }: { qid: string }) {
  const h = useHist();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"" | "sending" | "sent" | "error">("");
  if (state === "sent") return <p className="jh-report-done muted">✓ 報告しました。ありがとう！</p>;
  if (!open) {
    return (
      <button className="link-btn jh-report-btn" onClick={() => setOpen(true)}>
        ⚑ 問題がおかしい
      </button>
    );
  }
  async function send() {
    setState("sending");
    try {
      const r = await fetch(`${h.api}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qid, text }) });
      if (!r.ok) throw new Error();
      setState("sent");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="jh-report">
      <textarea
        className="input"
        rows={2}
        maxLength={REPORT_MAX}
        placeholder="どこがおかしいか（書かなくても送れます）"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[\r\n]/g, " "))}
      />
      <div className="jh-report-actions">
        <span className="muted">
          {[...text].length}/{REPORT_MAX}
        </span>
        <button className="btn" onClick={() => setOpen(false)}>
          やめる
        </button>
        <button className="btn btn-primary" disabled={state === "sending"} onClick={send}>
          報告する
        </button>
      </div>
      {state === "error" && <p className="error">送れませんでした。もう一度お試しください。</p>}
    </div>
  );
}

// 空欄に語を入れた文。入れた語は強調する
export function Filled({ q, word, className }: { q: CQuestion; word: string; className?: string }) {
  const [before, after] = q.text.split(BLANK);
  return (
    <span className={className}>
      {before}
      <b className="jh-fill">{word}</b>
      {after}
    </span>
  );
}

// 間違えて選んだ語が、ほかの用語の問題の正解になっているなら、その問題（取り違え注意）
export function confusedWith(data: JData, q: CQuestion, chosen: string | null) {
  if (!chosen || chosen === q.answer) return null;
  return data.questions.find((x) => x.answer === chosen && x.term !== q.term) ?? null;
}

// 答えたあとに見せるもの：正文・別解（いつも）、取り違え注意（4択で別の問題の正解を選んだとき）
// showWrong：正誤判定で間違えたときは、正文と誤文を並べて、入れ替わっている語を強調する
export function Feedback({ data, q, chosen, showWrong }: { data: JData; q: CQuestion; chosen?: string | null; showWrong?: boolean }) {
  return (
    <>
      <FeedbackBody data={data} q={q} chosen={chosen} showWrong={showWrong} />
      <ReportButton key={q.id} qid={q.id} />
    </>
  );
}

function FeedbackBody({ data, q, chosen, showWrong }: { data: JData; q: CQuestion; chosen?: string | null; showWrong?: boolean }) {
  const confused = chosen !== undefined ? confusedWith(data, q, chosen ?? null) : null;
  return (
    <div className="jh-feedback">
      <div>
        <span className="jh-feedback-label">正文</span>
        <Filled q={q} word={q.answer} />
      </div>
      {showWrong && (
        <div>
          <span className="jh-feedback-label wrong">誤文</span>
          <Filled q={q} word={q.wrongs[0]} className="jh-wrong-text" />
          <div className="muted jh-diff-note">
            「{q.wrongs[0]}」ではなく「{q.answer}」が正しい
          </div>
        </div>
      )}
      {q.alts.length > 0 && (
        <div>
          <span className="jh-feedback-label">別解</span>
          {q.alts.join("、")}
        </div>
      )}
      {confused && (
        <div className="jh-confused">
          <span className="jh-feedback-label">⚠️ 取り違え注意</span>「{chosen}」はこちらの答えです：
          <Filled q={confused} word={confused.answer} />
        </div>
      )}
    </div>
  );
}
