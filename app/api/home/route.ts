import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import type { HomeSummary } from "@/lib/home";
import { isUsed, summaryOf, viewOf } from "@/lib/materials";
import { viewSubject, viewTotal } from "@/lib/pastExams";
import { getPlayers } from "@/lib/players";
import { SET_IDS, SETS, type Corner } from "@/lib/sets";
import { getStore } from "@/lib/store";
import { goalFor, studiedDays, toStudyLog, weekStart, weekTotal } from "@/lib/study";
import { jstDate, practiceSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

// 1人分の各コーナーの進捗の概要。?number= がなければ自分。ほかの人の分は、その人が「見せない」にしたコーナーを返さない
export async function GET(req: Request) {
  const me = await sessionNumber(req);
  if (me === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const param = new URL(req.url).searchParams.get("number");
  const number = param === null ? me : Number(param);
  const store = getStore();
  const user = Number.isInteger(number) ? await store.getUser(number) : null;
  if (!user) return NextResponse.json({ error: "その番号の人はまだ登録していません" }, { status: 404 });

  const isMe = number === me;
  const hiddenSet = new Set<Corner>((user.hidden ?? []) as Corner[]);
  const shows = (c: Corner) => isMe || !hiddenSet.has(c);
  const today = jstDate();

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
  };

  await Promise.all(
    SET_IDS.filter(shows).map(async (set) => {
      const p = (await getPlayers(set)).find((x) => x.number === number);
      if (!p) return;
      summary.sets[set] = {
        count: p.count,
        average: p.average,
        best: p.best,
        mastered: p.mastered,
        total: SETS[set].total,
        review: p.reviewCount,
        cleared: practiceSummary(p.practice).cleared,
        sections: SETS[set].sections,
      };
    }),
  );

  if (shows("study")) {
    const log = toStudyLog((await store.getStudy())[number]);
    const week = weekStart(today);
    summary.study = {
      week,
      weekTotal: weekTotal(log, week),
      goal: goalFor(log, week),
      today: log.days[today]?.minutes ?? 0,
      days: studiedDays(log, week),
      quant: log.notes[week]?.quant ?? "",
    };
  }

  if (shows("materials")) {
    const list = (await store.getMaterialsOf(number)).filter(isUsed);
    const sum = summaryOf(list, today);
    const items = list.map((m) => {
      const v = viewOf(m, today);
      return { subject: m.subject, title: m.title, status: m.status, progress: v.progress, state: v.state };
    });
    const withProgress = items.filter((x) => x.progress !== null);
    summary.materials = {
      ...sum,
      progress: withProgress.length ? withProgress.reduce((a, x) => a + x.progress!, 0) / withProgress.length : null,
      items,
    };
  }

  if (shows("pastexams")) {
    const exams = await store.getPastExamsOf(number);
    let solved = 0;
    let remain = 0;
    summary.pastexams = {
      univs: exams.length,
      solved: 0,
      remain: 0,
      exams: exams.map((e) => ({
        univ: e.univ,
        date: e.date,
        total: viewTotal(e).average,
        subjects: e.subjects.map((s) => {
          const v = viewSubject(s, today);
          solved += v.done ?? 0;
          remain += v.remain;
          return { name: s.name, done: v.done ?? 0, planned: v.planned, average: v.average };
        }),
      })),
    };
    summary.pastexams.solved = solved;
    summary.pastexams.remain = remain;
  }

  return NextResponse.json(summary);
}
