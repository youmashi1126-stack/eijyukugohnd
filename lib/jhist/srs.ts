// 日本史：記憶定着の段階の遷移（日本史専用。英単語の習熟ポイントとは別の仕組み）
import {
  FIXED_STAGE,
  HESITATE_SEC,
  INTERVAL_DAYS,
  MAX_STAGE,
  REQUEUE_MAX_STAGE,
  RETRY_DAYS,
  WRONG_TO,
} from "./constants";

// 生徒×用語の状態：段階、次の出題日（日の番号）、正解回数、不正解回数、直近に出した問題ID、最後に答えた日時
export type TermState = { s: number; due: number; ok: number; ng: number; q: string; at: string };

export type Format = "choice" | "tf" | "write";
// ○＝正解、△＝記述のあやふや、×＝不正解
export type Mark = "o" | "t" | "x";

// 段階ごとの出題形式
export function formatOf(stage: number): Format {
  return stage <= 1 ? "choice" : stage === 2 ? "tf" : "write";
}

export function isFixed(stage: number) {
  return stage >= FIXED_STAGE;
}

// 日本時間の日付（YYYY-MM-DD）と日の番号
export function dayNumber(date: string) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);
}
export function dateOf(day: number) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

// 4択・正誤で時間のかかった正解（当て推量で段階が進まないように）
export function isHesitant(format: Format, mark: Mark, sec: number) {
  return format !== "write" && mark === "o" && sec >= HESITATE_SEC;
}

export type Transition = { state: TermState; requeue: boolean };

// 今日の学習での1回の回答を反映する
// mode：today（今日の学習。上の表のとおり）／intro（節別の練習：段階0の用語だけ1へ。上の段階は上げない）／check（実力テストなど：上げない）
// 不正解はどの mode でも表のとおり下げる
export function applyAnswer(
  prev: TermState | undefined,
  answer: { mark: Mark; format: Format; sec: number; qid: string; at: string },
  today: number,
  mode: "today" | "intro" | "check" = "today",
): Transition {
  const st: TermState = prev ? { ...prev } : { s: 0, due: today, ok: 0, ng: 0, q: "", at: "" };
  const s = st.s;
  st.q = answer.qid;
  st.at = answer.at;
  if (answer.mark === "x") {
    st.ng++;
    st.s = WRONG_TO[s];
    // 段階3までは同じ日（同じセッション内で再出題）、それより上は翌日に
    st.due = s <= REQUEUE_MAX_STAGE ? today : today + RETRY_DAYS;
    return { state: st, requeue: mode === "today" && s <= REQUEUE_MAX_STAGE };
  }
  if (answer.mark === "o") st.ok++;
  const hesitant = isHesitant(answer.format, answer.mark, answer.sec);
  if (answer.mark === "t" || hesitant) {
    // △・迷った正解：段階は据え置き、次の出題を1日後に
    if (mode === "today" || (mode === "intro" && s === 0)) st.due = today + RETRY_DAYS;
    return { state: st, requeue: false };
  }
  if (mode === "check") return { state: st, requeue: false };
  if (mode === "intro") {
    if (s === 0) {
      st.s = 1;
      st.due = today + INTERVAL_DAYS[0];
    }
    return { state: st, requeue: false };
  }
  st.s = Math.min(MAX_STAGE, s + 1);
  st.due = today + INTERVAL_DAYS[s];
  return { state: st, requeue: false };
}
