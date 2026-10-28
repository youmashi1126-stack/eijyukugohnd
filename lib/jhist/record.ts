// 日本史：送られてきた回答をサーバーで採点し、記憶の段階・ノルマ・記録をまとめて保存する
import { getStore, type JhistAnswerStat } from "../store";
import { jstDate } from "../types";
import { KEEP_ATTEMPTS, PRACTICE_COUNT } from "./constants";
import { jhistIndex, type JQuestion } from "./data";
import { dailyFor, fromTermStates, summarize, toTermStates, type TermStates } from "./plan";
import { markOf, settingsOf, toProfile, type Daily, type JhistProfile } from "./profile";
import { applyAnswer, dateOf, dayNumber, isHesitant, type Format, type Mark } from "./srs";

// 回答：問題ID、かかった秒数と、形式ごとの答え
// choice（4択）：chosen＝選んだ語（時間切れは null）
// tf（正誤）：shownWrong＝見せた文が誤文か、judged＝「正しい」と答えたか
// write（記述）：self＝自己採点（o 書けた／t あやふや／x 書けなかった）
export type SubmittedAnswer = {
  qid: string;
  sec: number;
  format?: Format;
  chosen?: string | null;
  shownWrong?: boolean;
  judged?: boolean;
  self?: Mark;
};

export function isSubmittedAnswer(v: unknown): v is SubmittedAnswer {
  const a = v as SubmittedAnswer;
  if (!a || typeof a.qid !== "string" || typeof a.sec !== "number" || !(a.sec >= 0)) return false;
  const format = a.format ?? "choice";
  if (format === "choice") return a.chosen === null || typeof a.chosen === "string";
  if (format === "tf") return typeof a.shownWrong === "boolean" && typeof a.judged === "boolean";
  if (format === "write") return a.self === "o" || a.self === "t" || a.self === "x";
  return false;
}

// 4択の採点：選んだ語が正解と同じか
export function isChoiceCorrect(q: JQuestion, chosen: string | null | undefined) {
  return chosen !== null && chosen !== undefined && chosen === q.answer;
}

// 形式ごとの採点（記述は自己採点のまま）
export function gradeAnswer(q: JQuestion, a: SubmittedAnswer): Mark {
  const format = a.format ?? "choice";
  if (format === "choice") return isChoiceCorrect(q, a.chosen) ? "o" : "x";
  if (format === "tf") return a.judged === !a.shownWrong ? "o" : "x";
  return a.self ?? "x";
}

// 間違えて選んだ語が、ほかの用語の正解になっていれば「取り違え」（正解の用語ID・選んだ語）
export function confusionOf(q: JQuestion, chosen: string | null | undefined): { term: string; wrong: string } | null {
  if (chosen === null || chosen === undefined || chosen === q.answer) return null;
  const idx = jhistIndex();
  const other = idx.termByAnswer.get(chosen);
  return other === undefined || other === q.term ? null : { term: idx.terms[q.term].id, wrong: chosen };
}

// 回答をまとめて反映する（記憶の段階・ログ・集計）
function applyAll(states: TermStates, answers: SubmittedAnswer[], today: string, mode: "today" | "intro" | "check", source: string) {
  const idx = jhistIndex();
  const day = dayNumber(today);
  const at = new Date().toISOString();
  const stats: JhistAnswerStat[] = [];
  const confusions: { term: string; wrong: string }[] = [];
  const results: { qid: string; term: number; mark: Mark; hesitant: boolean; before: number; after: number; wasNew: boolean; wasDue: boolean }[] = [];
  const entries = answers.map((a) => {
    const q = idx.byId.get(a.qid)!;
    const format = a.format ?? "choice";
    const mark = gradeAnswer(q, a);
    const prev = states.get(q.term);
    const { state } = applyAnswer(prev, { mark, format, sec: a.sec, qid: q.id, at }, day, mode);
    states.set(q.term, state);
    const hesitant = isHesitant(format, mark, a.sec);
    results.push({ qid: q.id, term: q.term, mark, hesitant, before: prev?.s ?? 0, after: state.s, wasNew: !prev, wasDue: !!prev && prev.due <= day });
    stats.push({ qid: q.id, ok: mark === "o", wrong: mark === "o" || format !== "choice" ? undefined : (a.chosen ?? undefined) });
    const c = format === "choice" && mark !== "o" ? confusionOf(q, a.chosen) : null;
    if (c) confusions.push(c);
    // [問題ID, 用語ID, 形式, ○△×, 秒数, 選んだ語・答え]
    const detail = format === "choice" ? (mark === "o" ? "" : (a.chosen ?? "")) : format === "tf" ? `${a.shownWrong ? "誤文" : "正文"}→${a.judged ? "正" : "誤"}` : "";
    return [q.id, idx.terms[q.term].id, format === "choice" ? "4" : format, mark, Math.round(a.sec * 10) / 10, detail];
  });
  return { stats, confusions, results, log: { source, entries } };
}

export type PracticeResult = { score: number; total: number; best: [number, number]; newBest: boolean; mark: string; duplicate: boolean };

// 節別の練習の結果を保存する。出題はそのセクションの問題から（15問、セクションが15問未満なら全問）
// 練習は新しい用語の「導入」：段階0の用語に正解したら段階1へ（それより上は上げない。不正解なら下げる）
export async function recordPractice(number: number, sectionKey: string, attemptId: string, answers: SubmittedAnswer[]): Promise<PracticeResult | { error: string }> {
  const idx = jhistIndex();
  const section = idx.sectionByKey.get(sectionKey);
  if (!section) return { error: "セクションが見つかりません" };
  const inSection = new Set(section.ids);
  const ids = answers.map((a) => a.qid);
  if (
    answers.length !== Math.min(PRACTICE_COUNT, section.ids.length) ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => inSection.has(id)) ||
    answers.some((a) => (a.format ?? "choice") !== "choice")
  ) {
    return { error: "解答データが正しくありません" };
  }
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number), store.getJhistTerms(number)]);
  const profile: JhistProfile = toProfile(rawProfile);
  const score = answers.filter((a) => isChoiceCorrect(idx.byId.get(a.qid)!, a.chosen)).length;
  const total = answers.length;
  const prev = profile.practice[sectionKey];
  if (attemptId && profile.attempts.includes(attemptId)) {
    return { score, total, best: prev ?? [score, total], newBest: false, mark: markOf(prev), duplicate: true };
  }
  const newBest = !prev || score / total > prev[0] / prev[1];
  const best: [number, number] = newBest ? [score, total] : prev;
  const states = toTermStates(rawTerms);
  const applied = applyAll(states, answers, jstDate(), "intro", "practice");
  const next: JhistProfile = {
    ...profile,
    practice: { ...profile.practice, [sectionKey]: best },
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
    summary: summarize(states),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions });
  return { score, total, best, newBest, mark: markOf(best), duplicate: false };
}

// ノルマの数え方：その日に初めて答えた用語のうち、未学習だったものは新出、次の出題日が来ていたものは復習
// （同じ日の2回目以降は数えない）。新出・復習の両方が目標に届いた最初の回答で、連続日数を1つ進める
export function countDaily(
  daily: Daily,
  streak: JhistProfile["streak"],
  results: { term: number; wasNew: boolean; wasDue: boolean }[],
  today: string,
): { daily: Daily; streak: JhistProfile["streak"]; achievedNow: boolean } {
  const next = { ...daily };
  const seen = new Set(next.terms);
  for (const r of results) {
    if (seen.has(r.term)) continue;
    seen.add(r.term);
    if (r.wasNew) next.newDone++;
    else if (r.wasDue) next.reviewDone++;
  }
  next.terms = [...seen];
  if (next.achieved || next.newDone < next.newTarget || next.reviewDone < next.reviewTarget) return { daily: next, streak, achievedNow: false };
  next.achieved = true;
  const yesterday = dateOf(dayNumber(today) - 1);
  const count = streak.last === yesterday ? streak.count + 1 : streak.last === today ? streak.count : 1;
  return { daily: next, streak: { count, last: today }, achievedNow: true };
}

export type TodayResult = {
  results: { qid: string; mark: Mark; hesitant: boolean; before: number; after: number }[];
  daily: Daily;
  streak: number;
  achievedNow: boolean;
  duplicate: boolean;
};

// 今日の学習の回答（数問ずつまとめて送られてくる）。ノルマの数え方：その日に初めて答えた用語のうち、
// 未学習だったものは新出、次の出題日が来ていたものは復習として数える（同じ日の2回目以降は数えない）
export async function recordToday(number: number, attemptId: string, answers: SubmittedAnswer[]): Promise<TodayResult | { error: string }> {
  const idx = jhistIndex();
  if (!answers.length || answers.length > 40 || !answers.every((a) => idx.byId.has(a.qid))) return { error: "解答データが正しくありません" };
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number), store.getJhistTerms(number)]);
  const profile = toProfile(rawProfile);
  const today = jstDate();
  const states = toTermStates(rawTerms);
  const settings = settingsOf(profile, today);
  const daily: Daily = { ...dailyFor(profile.daily, settings, states, today) };
  if (attemptId && profile.attempts.includes(attemptId)) {
    return { results: [], daily, streak: profile.streak.count, achievedNow: false, duplicate: true };
  }
  const applied = applyAll(states, answers, today, "today", "today");
  const { daily: nextDaily, streak, achievedNow } = countDaily(daily, profile.streak, applied.results, today);
  const next: JhistProfile = {
    ...profile,
    daily: nextDaily,
    streak,
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
    summary: summarize(states),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions });
  return {
    results: applied.results.map(({ qid, mark, hesitant, before, after }) => ({ qid, mark, hesitant, before, after })),
    daily: nextDaily,
    streak: streak.count,
    achievedNow,
    duplicate: false,
  };
}
