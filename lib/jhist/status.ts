// 日本史：自分の状況（コーナーのページ・今日の学習の画面で使う）
import { jhistIndex } from "./data";
import { buildQueue, dailyFor, eraStats, projectDate, remainingOf, targetImps, type TermStates } from "./plan";
import { currentStreak, IMPS, settingsOf, testAverage, type JhistProfile } from "./profile";
import { dayNumber } from "./srs";

export function statusOf(profile: JhistProfile, states: TermStates, today: string) {
  const settings = settingsOf(profile, today);
  const daily = dailyFor(profile.daily, settings, states, today);
  const imps = targetImps(settings.goal);
  const terms = jhistIndex().terms;
  const target = terms.filter((t) => imps.includes(t.imp)).length;
  // 定着（段階4以上）・学習中（段階1〜3）の数は、目標の対象用語だけで数える
  const sum = profile.summary;
  const count = (rows: number[][] | undefined) => (rows ?? []).reduce((a, r) => a + imps.reduce((b, imp) => b + (r[IMPS.indexOf(imp)] ?? 0), 0), 0);
  // 今日もう出せる問題があるか（ノルマを終えても、期限の来た復習があれば続けられる）
  const more = buildQueue(states, daily, settings, today, 1).length > 0;
  const fixed = count(sum?.fixed);
  return {
    eras: eraStats(sum, settings.goal),
    examDays: dayNumber(settings.examDate) - dayNumber(today),
    projected: projectDate(profile.fixedHistory, fixed, target, today),
    tests: { ...profile.tests, average: testAverage(profile.tests) },
    testHistory: profile.testHistory.slice(-10),
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
