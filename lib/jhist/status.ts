// 日本史・世界史：自分の状況（コーナーのページ・今日の学習の画面で使う）
import { jhistIndex, type Index } from "./data";
import { dailyFor, hasMore, eraStats, projectDate, remainingOf, targetImps, type TermStates } from "./plan";
import { currentStreak, IMPS, settingsOf, testAverage, type JhistProfile } from "./profile";
import { dayNumber } from "./srs";

export function statusOf(profile: JhistProfile, states: TermStates, today: string, ix: Index = jhistIndex()) {
  const settings = settingsOf(profile, today);
  const terms = ix.terms;
  const daily = dailyFor(profile.daily, settings, states, today, terms);
  const imps = targetImps(settings.goal);
  const target = terms.filter((t) => imps.includes(t.imp)).length;
  // 定着（段階4以上）・学習中（段階1〜3）の数は、目標の対象用語だけで数える
  const sum = profile.summary;
  const count = (rows: number[][] | undefined) => (rows ?? []).reduce((a, r) => a + imps.reduce((b, imp) => b + (r[IMPS.indexOf(imp)] ?? 0), 0), 0);
  // 今日もう出せる問題があるか（ノルマを終えても、期限の来た復習があれば続けられる）
  const more = hasMore(states, daily, settings, today, terms);
  const fixed = count(sum?.fixed);
  return {
    eras: eraStats(sum, settings.goal, ix.eras.length, terms),
    examDays: dayNumber(settings.examDate) - dayNumber(today),
    projected: projectDate(profile.fixedHistory, fixed, target, today),
    tests: { ...profile.tests, average: testAverage(profile.tests) },
    testHistory: profile.testHistory.slice(-10),
    // 年代チャレンジ：今日解いた数
    chrono: profile.chrono?.date === today ? { done: profile.chrono.done, ok: profile.chrono.ok } : { done: 0, ok: 0 },
    settings,
    daily,
    remaining: remainingOf(daily),
    streak: currentStreak(profile, today),
    target,
    fixed,
    learning: count(sum?.learning),
    more,
  };
}
