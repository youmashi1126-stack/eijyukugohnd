// 日本史：実力テスト・定着率・見込み日（Phase 3 の完了条件）
import { beforeEach, describe, expect, it, vi } from "vitest";

// 保存先はメモリ上の簡単なものに差し替える
const mem: { profile: Record<number, unknown>; terms: Record<number, unknown> } = { profile: {}, terms: {} };
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    getJhistProfile: async (n: number) => mem.profile[n] ?? null,
    getJhistTerms: async (n: number) => mem.terms[n] ?? null,
    saveJhist: async (n: number, s: { profile?: unknown; terms?: unknown }) => {
      if (s.profile !== undefined) mem.profile[n] = JSON.parse(JSON.stringify(s.profile));
      if (s.terms !== undefined) mem.terms[n] = JSON.parse(JSON.stringify(s.terms));
    },
  }),
}));

import { jhistIndex } from "@/lib/jhist/data";
import { eraStats, projectDate, toTermStates, withFixedHistory } from "@/lib/jhist/plan";
import { emptyProfile, toProfile } from "@/lib/jhist/profile";
import { recordTest, startTest } from "@/lib/jhist/record";
import { statusOf } from "@/lib/jhist/status";
import { buildTest, scoreOf, testPool } from "@/lib/jhist/test";

const { terms, byId } = jhistIndex();

describe("実力テスト", () => {
  it("100点満点に換算する（50問なら1問2点、問題が少ない範囲は割合で）", () => {
    expect(scoreOf(37, 50)).toBe(74);
    expect(scoreOf(50, 50)).toBe(100);
    expect(scoreOf(0, 50)).toBe(0);
    expect(scoreOf(20, 23)).toBe(87);
  });
  it("ランダム50問・同じ用語は1問だけ・難易度で重要度を絞る", () => {
    const std = buildTest(null, "std");
    expect(std.length).toBe(50);
    expect(new Set(std.map((id) => byId.get(id)!.term)).size).toBe(50);
    expect(std.every((id) => byId.get(id)!.imp !== "B")).toBe(true);
    const adv = Array.from({ length: 20 }, () => buildTest(null, "adv")).flat();
    expect(adv.some((id) => byId.get(id)!.imp === "B")).toBe(true);
  });
  it("時代を選ぶと、その時代の問題だけ", () => {
    for (let era = 0; era < 12; era++) {
      const ids = buildTest(era, "adv");
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => byId.get(id)!.era === era)).toBe(true);
      expect(ids.length).toBeLessThanOrEqual(Math.min(50, testPool(era, "adv").length));
    }
  });

  beforeEach(() => {
    mem.profile = {};
    mem.terms = {};
  });
  const answerAll = (qids: string[], okCount: number) =>
    qids.map((qid, i) => ({ qid, format: "choice" as const, chosen: i < okCount ? byId.get(qid)!.answer : "ちがう答え", sec: 5 }));

  it("全範囲のテストだけがランキング（平均点）に入る。正解しても段階は上げず、不正解なら下げる", async () => {
    const t1 = await startTest(1, null, "std");
    const r1 = await recordTest(1, t1.id, answerAll(t1.qids, 40));
    expect(r1).toMatchObject({ score: 80, ok: 40, n: 50, ranked: true, average: 80, best: 80 });
    const t2 = await startTest(1, 4, "std");
    const r2 = await recordTest(1, t2.id, answerAll(t2.qids, t2.qids.length));
    expect(r2).toMatchObject({ score: 100, ranked: false });
    const t3 = await startTest(1, null, "adv");
    const r3 = await recordTest(1, t3.id, answerAll(t3.qids, 30));
    expect(r3).toMatchObject({ score: 60, ranked: true, average: 70, best: 80 });
    const p = toProfile(mem.profile[1]);
    expect(p.tests).toMatchObject({ count: 2, total: 140, best: 80 });
    expect(p.testHistory.length).toBe(3);
    // 未学習の用語は、テストで答えても未学習のまま（記録を作らない＝今日の学習の新出に残る）
    expect(toTermStates(mem.terms[1]).size).toBe(0);
  });
  it("学習済みの用語は、テストで正解しても上げず、不正解なら下げる", async () => {
    const t = await startTest(3, null, "std");
    const day = Math.round(Date.parse(`${new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)}T00:00:00Z`) / 86400000);
    const [a, b] = t.qids.map((id) => byId.get(id)!.term);
    mem.terms[3] = { t: { [a]: [5, day + 10, 3, 0, "", ""], [b]: [5, day + 10, 3, 0, "", ""] } };
    const answers = answerAll(t.qids, 50);
    answers[1] = { ...answers[1], chosen: "ちがう答え" };
    await recordTest(3, t.id, answers);
    const states = toTermStates(mem.terms[3]);
    expect(states.get(a)).toMatchObject({ s: 5, due: day + 10, ok: 4 });
    expect(states.get(b)).toMatchObject({ s: 2, due: day + 1, ng: 1 });
    expect(states.size).toBe(2);
  });
  it("始めていないテスト・二重送信・問題のすり替えは記録しない", async () => {
    const t = await startTest(2, null, "std");
    const bad = answerAll(t.qids, 50);
    bad[0] = { ...bad[0], qid: buildTest(null, "std").find((id) => !t.qids.includes(id))! };
    expect(await recordTest(2, t.id, bad)).toHaveProperty("error");
    expect(await recordTest(2, "nope", answerAll(t.qids, 50))).toHaveProperty("error");
    expect(await recordTest(2, t.id, answerAll(t.qids, 50))).toMatchObject({ score: 100 });
    expect(await recordTest(2, t.id, answerAll(t.qids, 50))).toHaveProperty("error");
  });
});

describe("定着率の分母は、目標に応じた対象用語数", () => {
  it("日東駒専・GMARCH は S＋A、早慶上智は S＋A＋B", () => {
    const std = eraStats(null, "std").reduce((a, e) => a + e.target, 0);
    const adv = eraStats(null, "adv").reduce((a, e) => a + e.target, 0);
    expect(std).toBe(terms.filter((t) => t.imp !== "B").length);
    expect(adv).toBe(terms.length);
  });
  it("定着の数も目標の範囲で数える（B の定着は日東駒専・GMARCH では数えない）", () => {
    const fixed = Array.from({ length: 12 }, () => [0, 0, 0]);
    fixed[3] = [5, 7, 11]; // 奈良：S 5・A 7・B 11
    const summary = { fixed, learning: Array.from({ length: 12 }, () => [0, 0, 0]) };
    expect(eraStats(summary, "std")[3].fixed).toBe(12);
    expect(eraStats(summary, "adv")[3].fixed).toBe(23);
    const today = "2026-11-01";
    const p = { ...emptyProfile(), summary, settings: { examDate: "2027-02-10", goal: "std" as const, set: true } };
    const s = statusOf(p, new Map(), today);
    expect(s.target).toBe(terms.filter((t) => t.imp !== "B").length);
    expect(s.fixed).toBe(12);
    const sAdv = statusOf({ ...p, settings: { ...p.settings, goal: "adv" } }, new Map(), today);
    expect(sAdv.target).toBe(terms.length);
    expect(sAdv.fixed).toBe(23);
  });
});

describe("全範囲が定着する見込み日", () => {
  it("直近14日の増え方で見込む", () => {
    // 14日前に100語、今日400語 → 1日あたり約21.4語。残り1,151語なら54日後
    expect(projectDate([["2026-10-18", 100], ["2026-10-25", 250]], 400, 1551, "2026-11-01")).toBe("2026-12-25");
  });
  it("記録が短ければ最初の日から", () => {
    expect(projectDate([["2026-10-29", 0]], 30, 130, "2026-11-01")).toBe("2026-11-11");
  });
  it("見込めないとき（記録がない・増えていない）は null、全部定着していれば今日", () => {
    expect(projectDate([], 10, 100, "2026-11-01")).toBeNull();
    expect(projectDate([["2026-10-25", 50]], 50, 100, "2026-11-01")).toBeNull();
    expect(projectDate([["2026-10-25", 50]], 100, 100, "2026-11-01")).toBe("2026-11-01");
  });
  it("定着語数の記録は1日1つ（同じ日は上書き）", () => {
    let h = withFixedHistory([], "2026-11-01", 3);
    h = withFixedHistory(h, "2026-11-01", 5);
    h = withFixedHistory(h, "2026-11-02", 9);
    expect(h).toEqual([["2026-11-01", 5], ["2026-11-02", 9]]);
  });
});
