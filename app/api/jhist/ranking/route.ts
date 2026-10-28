import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { eraStats } from "@/lib/jhist/plan";
import { IMPS, settingsOf, testAverage, toProfile } from "@/lib/jhist/profile";
import { getStore } from "@/lib/store";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 日本史のランキング：実力テスト（全範囲）の平均点と、定着語数（段階4以上の用語の数。重要度を問わず数える）
// マイページで日本史を「見せない」にした人は、本人以外には返さない
export async function GET(req: Request) {
  const me = await sessionNumber(req);
  if (me === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const store = getStore();
  const [users, profiles] = await Promise.all([store.getUsers(), store.getJhistProfiles()]);
  const today = jstDate();
  const players = users
    .filter((u) => u.number === me || !u.hidden?.includes("jhist"))
    .map((u) => {
      const p = toProfile(profiles[u.number]);
      const settings = settingsOf(p, today);
      const fixedAll = (p.summary?.fixed ?? []).reduce((a, r) => a + IMPS.reduce((b, _, i) => b + (r[i] ?? 0), 0), 0);
      const eras = eraStats(p.summary, settings.goal);
      return {
        number: u.number,
        nickname: u.nickname,
        count: p.tests.count,
        average: testAverage(p.tests),
        best: p.tests.best,
        lastAt: p.tests.lastAt,
        fixed: fixedAll,
        // 自分の目標の対象用語のうち定着した割合
        targetFixed: eras.reduce((a, e) => a + e.fixed, 0),
        target: eras.reduce((a, e) => a + e.target, 0),
      };
    })
    .sort((a, b) => a.number - b.number);
  return NextResponse.json({ players, me });
}
