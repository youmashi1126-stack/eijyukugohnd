// 日本史：送られてきた回答をサーバーで採点し、記憶の段階・ノルマ・記録をまとめて保存する
import { getStore, type JhistAnswerStat } from "../store";
import { jstDate } from "../types";
import { KEEP_ATTEMPTS, PRACTICE_COUNT, TEST_GRACE_SEC, TEST_HISTORY, TEST_SEC } from "./constants";
import { jhistIndex, type JQuestion } from "./data";
import { dailyFor, eraStats, fromTermStates, summarize, toTermStates, withFixedHistory, type TermStates } from "./plan";
import { markOf, settingsOf, toProfile, type Daily, type Goal, type JhistProfile } from "./profile";
import { buildTest, scoreOf } from "./test";
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
    // 練習・実力テストでは、未学習の用語は段階1に上がったとき（練習の正解）だけ記録を作る。
    // それ以外（テストの答え・練習の不正解や迷った正解）で記録を作ると、今日の学習の復習に入って新出から外れてしまう
    if (prev || mode === "today" || state.s > 0) states.set(q.term, state);
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

// 集計と、日ごとの定着語数（目標の対象用語のうち）の記録を、今の状態で作り直す
function summaryFields(profile: JhistProfile, states: TermStates, today: string) {
  const summary = summarize(states);
  const fixed = eraStats(summary, settingsOf(profile, today).goal).reduce((a, e) => a + e.fixed, 0);
  return { summary, fixedHistory: withFixedHistory(profile.fixedHistory, today, fixed) };
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
    ...summaryFields(profile, states, jstDate()),
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
    ...summaryFields(profile, states, jstDate()),
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

// 実力テストを始める：問題を選び、出題した問題を覚えておく（送られてきた答えと照らし合わせるため）
export async function startTest(number: number, era: number | null, level: Goal) {
  const store = getStore();
  const profile = toProfile(await store.getJhistProfile(number));
  const qids = buildTest(era, level);
  const pendingTest = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, qids, startedAt: new Date().toISOString(), era, level };
  await store.saveJhist(number, { profile: { ...profile, pendingTest } });
  return { id: pendingTest.id, qids, sec: TEST_SEC };
}

export type TestResult = { score: number; ok: number; n: number; correct: Record<string, boolean>; average: number | null; best: number | null; ranked: boolean };

// 実力テストの結果：100点満点に換算。正解しても段階は上げず、不正解なら下げる。ランキング用の集計は全範囲のテストだけ
export async function recordTest(number: number, testId: string, answers: SubmittedAnswer[]): Promise<TestResult | { error: string }> {
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number), store.getJhistTerms(number)]);
  const profile = toProfile(rawProfile);
  const pending = profile.pendingTest;
  if (!pending || pending.id !== testId) return { error: "このテストはもう記録されたか、始めた記録がありません" };
  const asked = new Set(pending.qids);
  const ids = answers.map((a) => a.qid);
  if (answers.length !== pending.qids.length || new Set(ids).size !== ids.length || !ids.every((id) => asked.has(id)) || answers.some((a) => (a.format ?? "choice") !== "choice")) {
    return { error: "解答データが正しくありません" };
  }
  if (Date.now() - Date.parse(pending.startedAt) > (TEST_SEC + TEST_GRACE_SEC) * 1000) {
    await store.saveJhist(number, { profile: { ...profile, pendingTest: null } });
    return { error: "制限時間を大きく過ぎたため、記録できませんでした" };
  }
  const today = jstDate();
  const states = toTermStates(rawTerms);
  const applied = applyAll(states, answers, today, "check", "test");
  const ok = applied.results.filter((r) => r.mark === "o").length;
  const n = answers.length;
  const score = scoreOf(ok, n);
  const at = new Date().toISOString();
  const ranked = pending.era === null;
  const tests = ranked
    ? { count: profile.tests.count + 1, total: profile.tests.total + score, best: Math.max(profile.tests.best ?? 0, score), lastAt: at }
    : profile.tests;
  const next: JhistProfile = {
    ...profile,
    pendingTest: null,
    tests,
    testHistory: [...profile.testHistory, { at, score, ok, n, era: pending.era, level: pending.level }].slice(-TEST_HISTORY),
    ...summaryFields(profile, states, today),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions });
  return {
    score,
    ok,
    n,
    correct: Object.fromEntries(applied.results.map((r) => [r.qid, r.mark === "o"])),
    average: tests.count ? Math.round((tests.total / tests.count) * 10) / 10 : null,
    best: tests.best,
    ranked,
  };
}
