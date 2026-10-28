// 日本史：入試形式トレーニングの記録・入力して採点・目標ごとの初期値（Phase 5 の完了条件）
import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = {
  profile: {} as Record<number, unknown>,
  terms: {} as Record<number, unknown>,
  logs: [] as { number: number; source: string; entries: unknown[] }[],
};
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    getJhistProfile: async (n: number) => mem.profile[n] ?? null,
    getJhistTerms: async (n: number) => mem.terms[n] ?? null,
    saveJhist: async (n: number, s: { profile?: unknown; terms?: unknown; log?: { source: string; entries: unknown[] } }) => {
      if (s.profile !== undefined) mem.profile[n] = JSON.parse(JSON.stringify(s.profile));
      if (s.terms !== undefined) mem.terms[n] = JSON.parse(JSON.stringify(s.terms));
      if (s.log) mem.logs.push({ number: n, ...s.log });
    },
  }),
}));

import { jhistIndex } from "@/lib/jhist/data";
import { buildQueue, dailyFor, toTermStates, type TermStates } from "@/lib/jhist/plan";
import { dayNumber } from "@/lib/jhist/srs";
import { settingsOf, toProfile, type JhistSettings } from "@/lib/jhist/profile";
import { gradeAnswer, recordExam, recordToday } from "@/lib/jhist/record";
import { statusOf } from "@/lib/jhist/status";
import { jstDate } from "@/lib/types";

const { terms, byId } = jhistIndex();
// 3文字以上で、読みを答える問題でない問題（1文字違いを作る）
const plain = [...byId.values()].find((q) => !q.reading && q.answer.length >= 3 && !q.alts.length)!;
const typo = plain.answer.slice(0, 1) + (plain.answer[1] === "X" ? "Y" : "X") + plain.answer.slice(2);

beforeEach(() => {
  mem.profile = {};
  mem.terms = {};
  mem.logs = [];
});

describe("入力して採点（サーバー側でも採点し直す）", () => {
  it("一致は○、1文字違いは基本で△・発展で×、ほかは×", () => {
    expect(gradeAnswer(plain, { qid: plain.id, sec: 1, format: "write", input: ` ${plain.answer} ` }, "basic")).toBe("o");
    expect(gradeAnswer(plain, { qid: plain.id, sec: 1, format: "write", input: typo }, "basic")).toBe("t");
    expect(gradeAnswer(plain, { qid: plain.id, sec: 1, format: "write", input: typo }, "adv")).toBe("x");
    expect(gradeAnswer(plain, { qid: plain.id, sec: 1, format: "write", input: "ちがう答え" }, "basic")).toBe("x");
  });
  it("自己採点（input なし）はこれまでどおり", () => {
    expect(gradeAnswer(plain, { qid: plain.id, sec: 1, format: "write", self: "t" })).toBe("t");
  });
});

describe("目標ごとの初期値", () => {
  const today = "2026-11-01";
  it("日東駒専・GMARCH は自己採点・基本、早慶上智は入力して採点・発展", () => {
    const std = settingsOf(toProfile({ settings: { examDate: "2027-02-10", goal: "std", set: true } }), today);
    expect([std.writeMode, std.examLevel]).toEqual(["self", "basic"]);
    const adv = settingsOf(toProfile({ settings: { examDate: "2027-02-10", goal: "adv", set: true } }), today);
    expect([adv.writeMode, adv.examLevel]).toEqual(["input", "adv"]);
  });
  it("選び直した値は目標より優先", () => {
    const s = settingsOf(toProfile({ settings: { examDate: "2027-02-10", goal: "adv", set: true, writeMode: "self", examLevel: "basic" } }), today);
    expect([s.writeMode, s.examLevel]).toEqual(["self", "basic"]);
  });
});

describe("std の生徒の今日の学習は Phase 4 と同じ", () => {
  const today = "2026-11-01";
  const day = dayNumber(today);
  const states: TermStates = new Map(Array.from({ length: 40 }, (_, i) => [i * 7, { s: (i % 6) + 1, due: day - (i % 5), ok: 3, ng: 1, q: "", at: "" }]));
  const phase4: JhistSettings = { examDate: "2027-02-10", goal: "std", set: true };
  const phase5 = settingsOf(toProfile({ settings: phase4 }), today);
  it("ノルマ・出題・定着率が変わらない", () => {
    const d4 = dailyFor(null, phase4, states, today);
    const d5 = dailyFor(null, phase5, states, today);
    expect(d5).toEqual(d4);
    const fixedRand = () => 0.42;
    expect(buildQueue(states, d5, phase5, today, 20, new Set(), fixedRand)).toEqual(buildQueue(states, d4, phase4, today, 20, new Set(), fixedRand));
    const s4 = statusOf(toProfile({ settings: phase4 }), states, today);
    const s5 = statusOf(toProfile({ settings: { ...phase4, writeMode: "self", examLevel: "basic" } }), states, today);
    expect({ ...s5, settings: null }).toEqual({ ...s4, settings: null });
  });
});

describe("入試形式トレーニングの記録", () => {
  it("正解しても上げず、誤判定した文の用語だけ下げる。ノルマ・連続日数には入らない", async () => {
    const [a, b, c] = [terms[10], terms[20], terms[30]];
    const ia = 10, ib = 20, ic = 30;
    const daily = { date: jstDate(), newTarget: 5, reviewTarget: 5, newDone: 1, reviewDone: 2, terms: [99], achieved: false };
    mem.profile[401] = { settings: { examDate: "2027-02-10", goal: "std", set: true }, daily, streak: { count: 4, last: "2000-01-01" } };
    mem.terms[401] = { t: { [ia]: [5, 99999, 1, 0, "", ""], [ib]: [3, 99999, 1, 0, "", ""] } };
    // 3文正誤：①正文を正と判断（正解）②誤文を正と判断（誤判定）③未学習の用語の正文を正と判断（正解）
    const answers = [
      { qid: a.questions[0], sec: 4, format: "tf" as const, shownWrong: false, judged: true },
      { qid: b.questions[0], sec: 4, format: "tf" as const, shownWrong: true, judged: true },
      { qid: c.questions[0], sec: 4, format: "tf" as const, shownWrong: false, judged: true },
    ];
    expect(await recordExam(401, "e1", answers)).toEqual({ ok: 2, n: 3 });
    const st = toTermStates(mem.terms[401]);
    expect(st.get(ia)?.s).toBe(5);
    expect(st.get(ib)?.s).toBe(1);
    expect(st.has(ic)).toBe(false);
    const p = toProfile(mem.profile[401]);
    expect(p.daily).toEqual(daily);
    expect(p.streak).toEqual({ count: 4, last: "2000-01-01" });
    expect(mem.logs.at(-1)?.source).toBe("exam");
    // 同じ回をもう一度送っても二重に記録しない
    expect(await recordExam(401, "e1", answers)).toEqual({ ok: 0, n: 0 });
  });
  it("入力記述は目標の難易度で採点する（std は1文字違いを△）", async () => {
    const t = plain.term;
    mem.profile[402] = { settings: { examDate: "2027-02-10", goal: "std", set: true } };
    mem.terms[402] = { t: { [t]: [3, 99999, 1, 0, "", ""] } };
    await recordExam(402, "e2", [{ qid: plain.id, sec: 5, format: "write", input: typo }]);
    expect(toTermStates(mem.terms[402]).get(t)?.s).toBe(3);
    mem.profile[403] = { settings: { examDate: "2027-02-10", goal: "adv", set: true } };
    mem.terms[403] = { t: { [t]: [3, 99999, 1, 0, "", ""] } };
    await recordExam(403, "e3", [{ qid: plain.id, sec: 5, format: "write", input: typo }]);
    expect(toTermStates(mem.terms[403]).get(t)?.s).toBe(1);
  });
  it("多すぎる回答・知らない問題は受け付けない", async () => {
    expect(await recordExam(404, "e4", [{ qid: "Q9999", sec: 1, format: "tf", shownWrong: false, judged: true }])).toHaveProperty("error");
    const many = Array.from({ length: 51 }, () => ({ qid: plain.id, sec: 1, format: "tf" as const, shownWrong: false, judged: true }));
    expect(await recordExam(404, "e5", many)).toHaveProperty("error");
  });
});

describe("今日の学習で入力して採点", () => {
  it("段階3の用語を入力で正解すると上がり、ノルマにも数える", async () => {
    const t = plain.term;
    mem.profile[405] = { settings: { examDate: "2027-02-10", goal: "std", set: true, writeMode: "input" } };
    mem.terms[405] = { t: { [t]: [3, dayNumber(jstDate()), 1, 0, "", ""] } };
    const r = await recordToday(405, "t1", [{ qid: plain.id, sec: 5, format: "write", input: plain.answer }]);
    expect("results" in r && r.results[0].mark).toBe("o");
    expect(toTermStates(mem.terms[405]).get(t)?.s).toBe(4);
  });
});
