// 日本史・世界史：送られてきた回答をサーバーで採点し、記憶の段階・ノルマ・記録をまとめて保存する
import { getStore, type JhistAnswerStat } from "../store";
import { jstDate } from "../types";
import { CONFUSION_QUESTIONS_PER_TERM, EXAM_COUNT, KEEP_ATTEMPTS, MULTI_SIZE, PRACTICE_COUNT, REPORT_MAX, TEST_GRACE_SEC, TEST_HISTORY, TEST_SEC } from "./constants";
import { histIndex, jhistIndex, type Index, type JQuestion } from "./data";
import type { HistKey } from "./subject";
import { dailyFor, eraStats, fromTermStates, summarize, toTermStates, withFixedHistory, type TermStates } from "./plan";
import { judgeInput } from "./exam";
import { markOf, settingsOf, toProfile, type Daily, type ExamLevel, type Goal, type JhistProfile } from "./profile";
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
  input?: string; // 記述を入力して採点するとき、入力した文字列
};

export function isSubmittedAnswer(v: unknown): v is SubmittedAnswer {
  const a = v as SubmittedAnswer;
  if (!a || typeof a.qid !== "string" || typeof a.sec !== "number" || !(a.sec >= 0)) return false;
  const format = a.format ?? "choice";
  if (format === "choice") return a.chosen === null || typeof a.chosen === "string";
  if (format === "tf") return typeof a.shownWrong === "boolean" && typeof a.judged === "boolean";
  if (format === "write") return a.self === "o" || a.self === "t" || a.self === "x" || (typeof a.input === "string" && a.input.length <= 60);
  return false;
}

// 4択の採点：選んだ語が正解と同じか
export function isChoiceCorrect(q: JQuestion, chosen: string | null | undefined) {
  return chosen !== null && chosen !== undefined && chosen === q.answer;
}

// 形式ごとの採点（記述は自己採点のまま）
// 形式ごとの採点。記述は、入力した文字列があればサーバーで採点し直す（基本は1文字違いを△、発展は×）、なければ自己採点のまま
export function gradeAnswer(q: JQuestion, a: SubmittedAnswer, level: ExamLevel = "basic"): Mark {
  const format = a.format ?? "choice";
  if (format === "choice") return isChoiceCorrect(q, a.chosen) ? "o" : "x";
  if (format === "tf") return a.judged === !a.shownWrong ? "o" : "x";
  if (typeof a.input === "string") return judgeInput(q.answer, q.alts, a.input, level, q.reading).mark;
  return a.self ?? "x";
}

// 間違えて選んだ語が、ほかの用語の正解になっていれば「取り違え」（正解の用語ID・選んだ語）
export function confusionOf(q: JQuestion, chosen: string | null | undefined, idx: Index = jhistIndex()): { term: string; wrong: string } | null {
  if (chosen === null || chosen === undefined || chosen === q.answer) return null;
  const other = idx.termByAnswer.get(chosen);
  return other === undefined || other === q.term ? null : { term: idx.terms[q.term].id, wrong: chosen };
}

// 回答をまとめて反映する（記憶の段階・ログ・集計）
function applyAll(idx: Index, states: TermStates, answers: SubmittedAnswer[], today: string, mode: "today" | "intro" | "check", source: string, level: ExamLevel = "basic") {
  const day = dayNumber(today);
  const at = new Date().toISOString();
  const stats: JhistAnswerStat[] = [];
  const confusions: { term: string; wrong: string }[] = [];
  const results: { qid: string; term: number; mark: Mark; hesitant: boolean; before: number; after: number; wasNew: boolean; wasDue: boolean }[] = [];
  const entries = answers.map((a) => {
    const q = idx.byId.get(a.qid)!;
    const format = a.format ?? "choice";
    const mark = gradeAnswer(q, a, level);
    const prev = states.get(q.term);
    const { state } = applyAnswer(prev, { mark, format, sec: a.sec, qid: q.id, at }, day, mode);
    // 練習・実力テストでは、未学習の用語は段階1に上がったとき（練習の正解）だけ記録を作る。
    // それ以外（テストの答え・練習の不正解や迷った正解）で記録を作ると、今日の学習の復習に入って新出から外れてしまう
    if (prev || mode === "today" || state.s > 0) states.set(q.term, state);
    const hesitant = isHesitant(format, mark, a.sec);
    results.push({ qid: q.id, term: q.term, mark, hesitant, before: prev?.s ?? 0, after: state.s, wasNew: !prev, wasDue: !!prev && prev.due <= day });
    stats.push({ qid: q.id, ok: mark === "o", wrong: mark === "o" || format !== "choice" ? undefined : (a.chosen ?? undefined) });
    const c = format === "choice" && mark !== "o" ? confusionOf(q, a.chosen, idx) : null;
    if (c) confusions.push(c);
    // [問題ID, 用語ID, 形式, ○△×, 秒数, 選んだ語・答え]
    const detail =
      format === "choice" ? (mark === "o" ? "" : (a.chosen ?? "")) : format === "tf" ? `${a.shownWrong ? "誤文" : "正文"}→${a.judged ? "正" : "誤"}` : (a.input ?? "");
    return [q.id, idx.terms[q.term].id, format === "choice" ? "4" : format, mark, Math.round(a.sec * 10) / 10, detail];
  });
  return { stats, confusions, results, log: { source, entries } };
}

// 集計と、日ごとの定着語数（目標の対象用語のうち）の記録を、今の状態で作り直す
function summaryFields(idx: Index, profile: JhistProfile, states: TermStates, today: string) {
  const summary = summarize(states, idx.terms, idx.eras.length);
  const fixed = eraStats(summary, settingsOf(profile, today).goal, idx.eras.length, idx.terms).reduce((a, e) => a + e.fixed, 0);
  return { summary, fixedHistory: withFixedHistory(profile.fixedHistory, today, fixed) };
}

export type PracticeResult = { score: number; total: number; best: [number, number]; newBest: boolean; mark: string; duplicate: boolean };

// 節別の練習の結果を保存する。出題はそのセクションの問題から（15問、セクションが15問未満なら全問）
// 練習は新しい用語の「導入」：段階0の用語に正解したら段階1へ（それより上は上げない。不正解なら下げる）
export async function recordPractice(number: number, sectionKey: string, attemptId: string, answers: SubmittedAnswer[], key: HistKey = "jhist"): Promise<PracticeResult | { error: string }> {
  const idx = histIndex(key);
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
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
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
  const applied = applyAll(idx, states, answers, jstDate(), "intro", "practice");
  const next: JhistProfile = {
    ...profile,
    practice: { ...profile.practice, [sectionKey]: best },
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
    ...summaryFields(idx, profile, states, jstDate()),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions }, key);
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
export async function recordToday(number: number, attemptId: string, answers: SubmittedAnswer[], key: HistKey = "jhist"): Promise<TodayResult | { error: string }> {
  const idx = histIndex(key);
  if (!answers.length || answers.length > 40 || !answers.every((a) => idx.byId.has(a.qid))) return { error: "解答データが正しくありません" };
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const profile = toProfile(rawProfile);
  const today = jstDate();
  const states = toTermStates(rawTerms);
  const settings = settingsOf(profile, today);
  const daily: Daily = { ...dailyFor(profile.daily, settings, states, today, idx.terms) };
  if (attemptId && profile.attempts.includes(attemptId)) {
    return { results: [], daily, streak: profile.streak.count, achievedNow: false, duplicate: true };
  }
  const applied = applyAll(idx, states, answers, today, "today", "today", settings.examLevel);
  const { daily: nextDaily, streak, achievedNow } = countDaily(daily, profile.streak, applied.results, today);
  const next: JhistProfile = {
    ...profile,
    daily: nextDaily,
    streak,
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
    ...summaryFields(idx, profile, states, jstDate()),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions }, key);
  return {
    results: applied.results.map(({ qid, mark, hesitant, before, after }) => ({ qid, mark, hesitant, before, after })),
    daily: nextDaily,
    streak: streak.count,
    achievedNow,
    duplicate: false,
  };
}

// 実力テストを始める：問題を選び、出題した問題を覚えておく（送られてきた答えと照らし合わせるため）
export async function startTest(number: number, era: number | null, level: Goal, key: HistKey = "jhist") {
  const idx = histIndex(key);
  const store = getStore();
  const profile = toProfile(await store.getJhistProfile(number, key));
  const qids = buildTest(era, level, Math.random, idx);
  const pendingTest = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, qids, startedAt: new Date().toISOString(), era, level };
  await store.saveJhist(number, { profile: { ...profile, pendingTest } }, key);
  return { id: pendingTest.id, qids, sec: TEST_SEC };
}

export type TestResult = { score: number; ok: number; n: number; correct: Record<string, boolean>; average: number | null; best: number | null; ranked: boolean };

// 実力テストの結果：100点満点に換算。正解しても段階は上げず、不正解なら下げる。ランキング用の集計は全範囲のテストだけ
export async function recordTest(number: number, testId: string, answers: SubmittedAnswer[], key: HistKey = "jhist"): Promise<TestResult | { error: string }> {
  const idx = histIndex(key);
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const profile = toProfile(rawProfile);
  const pending = profile.pendingTest;
  if (!pending || pending.id !== testId) return { error: "このテストはもう記録されたか、始めた記録がありません" };
  const asked = new Set(pending.qids);
  const ids = answers.map((a) => a.qid);
  if (answers.length !== pending.qids.length || new Set(ids).size !== ids.length || !ids.every((id) => asked.has(id)) || answers.some((a) => (a.format ?? "choice") !== "choice")) {
    return { error: "解答データが正しくありません" };
  }
  if (Date.now() - Date.parse(pending.startedAt) > (TEST_SEC + TEST_GRACE_SEC) * 1000) {
    await store.saveJhist(number, { profile: { ...profile, pendingTest: null } }, key);
    return { error: "制限時間を大きく過ぎたため、記録できませんでした" };
  }
  const today = jstDate();
  const states = toTermStates(rawTerms);
  const applied = applyAll(idx, states, answers, today, "check", "test");
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
    ...summaryFields(idx, profile, states, today),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions }, key);
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

// 取り違えやすい語の特訓：2つの用語の問題を続けて出す。実力テストと同じく、正解しても上げず、不正解なら下げる
export async function recordDrill(number: number, attemptId: string, answers: SubmittedAnswer[], key: HistKey = "jhist"): Promise<{ ok: number; n: number } | { error: string }> {
  const idx = histIndex(key);
  const terms = new Set(answers.map((a) => idx.byId.get(a.qid)?.term));
  if (
    !answers.length ||
    terms.has(undefined) ||
    terms.size > 2 ||
    answers.length > 2 * CONFUSION_QUESTIONS_PER_TERM ||
    answers.some((a) => (a.format ?? "choice") !== "choice")
  ) {
    return { error: "解答データが正しくありません" };
  }
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const profile = toProfile(rawProfile);
  if (attemptId && profile.attempts.includes(attemptId)) return { ok: 0, n: 0 };
  const today = jstDate();
  const states = toTermStates(rawTerms);
  const applied = applyAll(idx, states, answers, today, "check", "confusion");
  const next: JhistProfile = {
    ...profile,
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
    ...summaryFields(idx, profile, states, today),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions }, key);
  return { ok: applied.results.filter((r) => r.mark === "o").length, n: answers.length };
}

// 年代チャレンジの結果（記憶の段階には使わない。並べ替えなどは、どの用語を間違えたか決められないため）
export type ChronoAnswer = { kind: "sort" | "nearest" | "after"; ok: boolean; qids: string[] };

export function isChronoAnswer(v: unknown): v is ChronoAnswer {
  const a = v as ChronoAnswer;
  return !!a && ["sort", "nearest", "after"].includes(a.kind) && typeof a.ok === "boolean" && Array.isArray(a.qids) && a.qids.length <= 6 && a.qids.every((q) => typeof q === "string");
}

export async function recordChrono(number: number, attemptId: string, items: ChronoAnswer[], key: HistKey = "jhist") {
  const idx = histIndex(key);
  if (!items.length || items.length > 10 || !items.every((i) => i.qids.every((q) => idx.byId.has(q)))) return { error: "解答データが正しくありません" };
  const store = getStore();
  const profile = toProfile(await store.getJhistProfile(number, key));
  if (attemptId && profile.attempts.includes(attemptId)) return { chrono: profile.chrono };
  const today = jstDate();
  const prev = profile.chrono?.date === today ? profile.chrono : { date: today, done: 0, ok: 0 };
  const chrono = { date: today, done: prev.done + items.length, ok: prev.ok + items.filter((i) => i.ok).length };
  const next: JhistProfile = { ...profile, chrono, attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts };
  // [形式, ○×, 出てきた出来事の出典問題ID]
  await store.saveJhist(number, { profile: next, log: { source: "chrono", entries: items.map((i) => [i.kind, i.ok ? "o" : "x", i.qids.join(",")]) } }, key);
  return { chrono };
}

// 「問題がおかしい」報告（自由記述は任意・100字まで）
export async function reportQuestion(number: number, qid: string, text: string, key: HistKey = "jhist") {
  if (!histIndex(key).byId.has(qid)) return { error: "問題が見つかりません" };
  const clean = [...String(text ?? "").replace(/[\r\n\t]+/g, " ").trim()].slice(0, REPORT_MAX).join("");
  await getStore().addJhistReport(number, qid, clean, key);
  return { ok: true };
}

// 入試形式トレーニング（入力記述・3文正誤・複数選択・組合せ）。ノルマ・連続日数・ランキングには入れない
// 段階への影響は実力テストと同じ（正解しても上げず、不正解なら下げる）。3文正誤・複数選択は1文ずつ、組合せは空欄ごとに送られてくる
export async function recordExam(number: number, attemptId: string, answers: SubmittedAnswer[], key: HistKey = "jhist"): Promise<{ ok: number; n: number } | { error: string }> {
  const idx = histIndex(key);
  if (!answers.length || answers.length > EXAM_COUNT * MULTI_SIZE || !answers.every((a) => idx.byId.has(a.qid))) return { error: "解答データが正しくありません" };
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const profile = toProfile(rawProfile);
  if (attemptId && profile.attempts.includes(attemptId)) return { ok: 0, n: 0 };
  const today = jstDate();
  const states = toTermStates(rawTerms);
  const applied = applyAll(idx, states, answers, today, "check", "exam", settingsOf(profile, today).examLevel);
  const next: JhistProfile = {
    ...profile,
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
    ...summaryFields(idx, profile, states, today),
  };
  await store.saveJhist(number, { profile: next, terms: fromTermStates(states), log: applied.log, stats: applied.stats, confusions: applied.confusions }, key);
  return { ok: applied.results.filter((r) => r.mark === "o").length, n: answers.length };
}
