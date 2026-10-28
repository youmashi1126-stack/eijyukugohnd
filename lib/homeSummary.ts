// 各コーナーの進捗の概要を作る（サーバーで使う）。ホーム・友達のページ（/api/home）と、管理者ページの各アカウントの状況で共通
import type { HomeSummary } from "./home";
import { isUsed, summaryOf, viewOf, type Material } from "./materials";
import { viewSubject, viewTotal, type Exam } from "./pastExams";
import { getPlayers } from "./players";
import { SET_IDS, SETS, type Corner, type SetId } from "./sets";
import { getStore } from "./store";
import { JHIST_SECTION_COUNT } from "@/data/jhist/meta";
import { practiceSummary as jhistPractice, toProfile } from "./jhist/profile";
import { addDays, goalFor, metaOf, studiedDays, toStudyLog, weekStart, weekTotal, type StudyLog } from "./study";
import { jstDate, practiceSummary, type Player, type User } from "./types";

export type HomeData = {
  today: string;
  players: Record<SetId, Player[]>;
  // 学習時間：全員分のときは今週と先週の分だけ（記録全体は重いので読まない）
  study: Record<number, StudyLog>;
  studyLast: Record<number, string | null>; // 最後に学習時間を記録した日
  materials: Record<number, Material[]>;
  pastExams: Record<number, Exam[]>;
  jhist: Record<number, unknown>; // 日本史の記録のまとめ（jhist_profile）
};

// 概要に使う記録をまとめて読む。only を渡すと、学習時間・教材・過去問はその人の分だけ読む
export async function loadHomeData(only?: number): Promise<HomeData> {
  const store = getStore();
  const today = jstDate();
  const week = weekStart(today);
  const [players, { logs: study, last: studyLast }, materials, pastExams] = await Promise.all([
    Promise.all(SET_IDS.map(async (set) => [set, await getPlayers(set)] as const)).then((e) => Object.fromEntries(e) as Record<SetId, Player[]>),
    only === undefined
      ? store.getStudyWeeks([week, addDays(week, -7)])
      : store.getStudyOf(only).then((l) => ({ logs: { [only]: l }, last: { [only]: metaOf(l).last } })),
    only === undefined ? store.getMaterials() : store.getMaterialsOf(only).then((m) => ({ [only]: m })),
    only === undefined ? store.getPastExams() : store.getPastExamsOf(only).then((p) => ({ [only]: p })),
  ]);
  const jhist = only === undefined ? await store.getJhistProfiles() : { [only]: await store.getJhistProfile(only) };
  return { today, players, study, studyLast, materials, pastExams, jhist };
}

// showAll：見せない設定のコーナーも含める（本人・管理者）
export function buildSummary(user: User, data: HomeData, { isMe, showAll }: { isMe: boolean; showAll: boolean }): HomeSummary {
  const { today } = data;
  const number = user.number;
  const hiddenSet = new Set<Corner>((user.hidden ?? []) as Corner[]);
  const shows = (c: Corner) => showAll || !hiddenSet.has(c);
  const summary: HomeSummary = {
    number,
    nickname: user.nickname,
    isMe,
    today,
    hidden: [...hiddenSet],
    sets: {},
    study: null,
    materials: null,
    pastexams: null,
    jhist: null,
  };

  for (const set of SET_IDS.filter(shows)) {
    const p = data.players[set].find((x) => x.number === number);
    if (!p) continue;
    summary.sets[set] = {
      count: p.count,
      average: p.average,
      best: p.best,
      mastered: p.mastered,
      total: SETS[set].total,
      review: p.reviewCount,
      cleared: practiceSummary(p.practice).cleared,
      sections: SETS[set].sections,
      lastAt: p.lastAt,
    };
  }

  const log = toStudyLog(data.study[number]);
  if (shows("study")) {
    const week = weekStart(today);
    summary.study = {
      week,
      weekTotal: weekTotal(log, week),
      goal: goalFor(log, week),
      today: log.days[today]?.minutes ?? 0,
      days: studiedDays(log, week),
      quant: log.notes[week]?.quant ?? "",
      todayGoal: log.days[today]?.goal ?? null,
      todayPlan: log.days[today]?.plan ?? [],
    };
  }

  if (shows("materials")) {
    const list = (data.materials[number] ?? []).filter(isUsed);
    const items = list.map((m) => {
      const v = viewOf(m, today);
      return { subject: m.subject, title: m.title, status: m.status, progress: v.progress, state: v.state };
    });
    const withProgress = items.filter((x) => x.progress !== null);
    summary.materials = {
      ...summaryOf(list, today),
      progress: withProgress.length ? withProgress.reduce((a, x) => a + x.progress!, 0) / withProgress.length : null,
      items,
    };
  }

  if (shows("pastexams")) {
    let solved = 0;
    let remain = 0;
    const exams = (data.pastExams[number] ?? []).map((e) => ({
      univ: e.univ,
      date: e.date,
      total: viewTotal(e).average,
      subjects: e.subjects.map((s) => {
        const v = viewSubject(s, today);
        solved += v.done ?? 0;
        remain += v.remain;
        return { name: s.name, done: v.done ?? 0, planned: v.planned, average: v.average };
      }),
    }));
    summary.pastexams = { univs: exams.length, solved, remain, exams };
  }

  if (shows("jhist")) {
    summary.jhist = { sections: JHIST_SECTION_COUNT, ...jhistPractice(toProfile(data.jhist[number])) };
  }

  // 最後に記録した日（テストを受けた日・学習時間を記録した日のうち新しいもの。日本時間の日付）
  const dates = [
    ...SET_IDS.map((set) => data.players[set].find((x) => x.number === number)?.lastAt).filter((v): v is string => !!v).map((v) => jstDate(v)),
    ...(data.studyLast[number] ? [data.studyLast[number]!] : []),
  ].sort();
  summary.lastActive = dates.length ? dates[dates.length - 1] : null;
  return summary;
}
