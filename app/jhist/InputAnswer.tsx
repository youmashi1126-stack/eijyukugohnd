"use client";

import { useState } from "react";
import { BLANK, type CQuestion } from "@/lib/jhist/client";
import { isReadingQuestion, judgeInput, type InputJudge, type Level } from "@/lib/jhist/exam";
import { lengthHint } from "@/lib/jhist/hint";

// 記述を入力して採点：空欄に入る語を入力 → 正解・別解と照らし合わせる。1文字だけ違えば「誤字の可能性」として、違う文字に印をつける
export function InputAnswer({ q, level, onJudged }: { q: CQuestion; level: Level; onJudged: (input: string, judge: InputJudge) => void }) {
  const [input, setInput] = useState("");
  const [judge, setJudge] = useState<InputJudge | null>(null);
  const [before, after] = q.text.split(BLANK);
  const hint = lengthHint(q.answer, q.alts);
  function submit() {
    if (judge || !input.trim()) return;
    const j = judgeInput(q.answer, q.alts, input, level, isReadingQuestion(q.text));
    setJudge(j);
    onJudged(input, j);
  }
  return (
    <>
      <div className="jh-question">
        {before}
        <span className="jh-blank">{judge ? <b className="jh-fill">{q.answer}</b> : "（　　）"}</span>
        {hint && !judge && <span className="jh-hint">{hint}</span>}
        {after}
      </div>
      <div className="jh-input-row">
        <input
          className="input jh-input"
          value={input}
          maxLength={40}
          placeholder="空欄に入る語を入力"
          disabled={!!judge}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          autoFocus
          aria-label="答えを入力"
        />
        {!judge && (
          <button className="btn btn-primary" disabled={!input.trim()} onClick={submit}>
            採点
          </button>
        )}
      </div>
      {judge && (
        <p className="jh-typed">
          あなたの答え：
          <span className="jh-typed-text">
            {[...judge.normalized].map((c, i) => (
              <span key={i} className={i === judge.typo ? "jh-typo" : ""}>
                {c}
              </span>
            ))}
          </span>
          {judge.typo !== null && <span className="jh-typo-note">⚠️ 誤字の可能性（印の文字）</span>}
        </p>
      )}
    </>
  );
}
