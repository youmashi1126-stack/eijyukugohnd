// 日本史：年代チャレンジの記録・取り違えの特訓・「問題がおかしい」報告（Phase 4）
import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = {
  profile: {} as Record<number, unknown>,
  terms: {} as Record<number, unknown>,
  logs: [] as { number: number; source: string; entries: unknown[] }[],
  reports: [] as { number: number; qid: string; text: string }[],
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
    addJhistReport: async (number: number, qid: string, text: string) => {
      mem.reports.push({ number, qid, text });
    },
  }),
}));

import { jhistIndex } from "@/lib/jhist/data";
import { toTermStates } from "@/lib/jhist/plan";
import { toProfile } from "@/lib/jhist/profile";
import { recordChrono, recordDrill, reportQuestion } from "@/lib/jhist/record";

const { terms, byId } = jhistIndex();

beforeEach(() => {
  mem.profile = {};
  mem.terms = {};
  mem.logs = [];
  mem.reports = [];
});

describe("「問題がおかしい」報告", () => {
  it("問題ID・生徒番号・自由記述を保存する（100字まで・改行は空白に）", async () => {
    expect(await reportQuestion(301, "Q0001", "選択肢が\n2つ正しい")).toEqual({ ok: true });
    expect(await reportQuestion(301, "Q0002", "あ".repeat(150))).toEqual({ ok: true });
    expect(await reportQuestion(301, "Q0003", "")).toEqual({ ok: true });
    expect(mem.reports).toEqual([
      { number: 301, qid: "Q0001", text: "選択肢が 2つ正しい" },
      { number: 301, qid: "Q0002", text: "あ".repeat(100) },
      { number: 301, qid: "Q0003", text: "" },
    ]);
  });
  it("ない問題IDは保存しない", async () => {
    expect(await reportQuestion(301, "Q9999", "x")).toHaveProperty("error");
    expect(mem.reports.length).toBe(0);
  });
});

describe("年代チャレンジの記録", () => {
  it("今日解いた数と正解数を数え、ログに残す（段階には使わない）", async () => {
    const r = await recordChrono(301, "a1", [
      { kind: "sort", ok: true, qids: ["Q0125", "Q2132", "Q0001"] },
      { kind: "nearest", ok: false, qids: ["Q0125", "Q2132"] },
    ]);
    expect(r).toMatchObject({ chrono: { done: 2, ok: 1 } });
    await recordChrono(301, "a2", [{ kind: "after", ok: true, qids: ["Q0125"] }]);
    await recordChrono(301, "a2", [{ kind: "after", ok: true, qids: ["Q0125"] }]); // 二重送信
    expect(toProfile(mem.profile[301]).chrono).toMatchObject({ done: 3, ok: 2 });
    expect(mem.logs.map((l) => l.source)).toEqual(["chrono", "chrono"]);
    expect(mem.terms[301]).toBeUndefined();
  });
});

describe("取り違えやすい語の特訓", () => {
  const twoTerms = terms.map((t, i) => [t, i] as const).filter(([t]) => t.questions.length >= 2);
  it("2つの用語の問題だけを受け付け、正解しても上げず、不正解なら下げる", async () => {
    const [ta, a] = twoTerms[0];
    const [tb, b] = twoTerms[1];
    mem.terms[302] = { t: { [a]: [5, 99999, 1, 0, "", ""], [b]: [3, 99999, 1, 0, "", ""] } };
    const answers = [
      { qid: ta.questions[0], format: "choice" as const, chosen: byId.get(ta.questions[0])!.answer, sec: 3 },
      { qid: tb.questions[0], format: "choice" as const, chosen: "ちがう", sec: 3 },
    ];
    expect(await recordDrill(302, "d1", answers)).toEqual({ ok: 1, n: 2 });
    const st = toTermStates(mem.terms[302]);
    expect(st.get(a)?.s).toBe(5);
    expect(st.get(b)?.s).toBe(1);
    expect(mem.logs.at(-1)?.source).toBe("confusion");
  });
  it("3つ以上の用語・多すぎる問題は受け付けない", async () => {
    const three = twoTerms.slice(0, 3).map(([t]) => ({ qid: t.questions[0], format: "choice" as const, chosen: null, sec: 1 }));
    expect(await recordDrill(302, "d2", three)).toHaveProperty("error");
    const [t] = twoTerms[0];
    const many = Array.from({ length: 7 }, () => ({ qid: t.questions[0], format: "choice" as const, chosen: null, sec: 1 }));
    expect(await recordDrill(302, "d3", many)).toHaveProperty("error");
  });
});
