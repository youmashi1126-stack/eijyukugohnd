// 世界史：データの条件と、日本史と同じ仕組みが世界史のデータ・保存先で動くこと
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 保存先は、科目ごとに分けて覚えるメモリ上のものに差し替える
const mem: Record<string, { profile: Record<number, unknown>; terms: Record<number, unknown>; logs: { source: string }[] }> = {};
const box = (subject = "jhist") => (mem[subject] ??= { profile: {}, terms: {}, logs: [] });
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    getJhistProfile: async (n: number, subject?: string) => box(subject).profile[n] ?? null,
    getJhistTerms: async (n: number, subject?: string) => box(subject).terms[n] ?? null,
    saveJhist: async (n: number, s: { profile?: unknown; terms?: unknown; log?: { source: string } }, subject?: string) => {
      const b = box(subject);
      if (s.profile !== undefined) b.profile[n] = JSON.parse(JSON.stringify(s.profile));
      if (s.terms !== undefined) b.terms[n] = JSON.parse(JSON.stringify(s.terms));
      if (s.log) b.logs.push(s.log);
    },
  }),
}));

import { WHIST_DATA_URL, WHIST_ERAS, WHIST_QUESTION_COUNT, WHIST_SECTION_COUNT, WHIST_TERM_COUNT } from "@/data/whist/meta";
import { eventsOf, makeChronoSet, type ChronoEvent, type Level } from "@/lib/jhist/chrono";
import { histIndex, jhistIndex } from "@/lib/jhist/data";
import { comboPairs, makeMulti, makeThreeTf, type SQ } from "@/lib/jhist/exam";
import { buildQueue, dailyFor, hasMore, toTermStates, type TermStates } from "@/lib/jhist/plan";
import { toProfile } from "@/lib/jhist/profile";
import { recordPractice, recordToday, startTest } from "@/lib/jhist/record";
import { statusOf } from "@/lib/jhist/status";
import { yearLabel } from "@/lib/jhist/subject";
import { buildTest } from "@/lib/jhist/test";

const BLANK = "（　　）";
type Raw = {
  eras: string[];
  sections: { key: string; ids: string[]; era: number }[];
  terms: [string, string, string][];
  q: [string, string, string, string, string, string, string, string, number, string, number, number, number, string][];
  chrono: [number, string, string, number, string, string][];
};
const raw: Raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", WHIST_DATA_URL), "utf8"));
const ix = histIndex("whist");

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

describe("世界史の問題データ", () => {
  it("6,051問・4,048語・9つの章（時代）をすべて読み込める", () => {
    expect(raw.q.length).toBe(6051);
    expect(WHIST_QUESTION_COUNT).toBe(6051);
    expect(raw.terms.length).toBe(4048);
    expect(WHIST_TERM_COUNT).toBe(4048);
    expect(new Set(raw.q.map((q) => q[0])).size).toBe(6051);
    expect(WHIST_ERAS.length).toBe(9);
    expect(raw.eras).toEqual(WHIST_ERAS);
  });

  it("全問で空欄がちょうど1つ・選択肢4つが重複しない・用語は正解と同じ語", () => {
    expect(raw.q.filter((q) => q[2].split(BLANK).length !== 2).map((q) => q[0])).toEqual([]);
    expect(raw.q.filter((q) => new Set([q[3], q[4], q[5], q[6]]).size !== 4 || [q[3], q[4], q[5], q[6]].some((c) => !c)).map((q) => q[0])).toEqual([]);
    expect(raw.q.filter((q) => raw.terms[q[11]][1] !== q[3]).map((q) => q[0])).toEqual([]);
  });

  it("別解が誤答と同じ問題がない（4択で正解が2つにならない）", () => {
    const bad = raw.q.filter((q) => q[7].split("、").some((a) => a.trim() && [q[4], q[5], q[6]].includes(a.trim())));
    expect(bad.map((q) => q[0])).toEqual([]);
  });

  it(`${WHIST_SECTION_COUNT}セクションすべてが10〜30問で、全問がちょうど1つのセクションに入る`, () => {
    expect(raw.sections.length).toBe(WHIST_SECTION_COUNT);
    for (const s of raw.sections) {
      expect(s.ids.length).toBeGreaterThanOrEqual(10);
      expect(s.ids.length).toBeLessThanOrEqual(30);
    }
    const all = raw.sections.flatMap((s) => s.ids);
    expect(all.length).toBe(6051);
    expect(new Set(all).size).toBe(6051);
  });

  it("年代整序は84件。紀元前（負の数）は「紀元前〇年」と表示する", () => {
    expect(raw.chrono.length).toBe(84);
    expect(raw.chrono.find((c) => c[1] === "バビロン捕囚")?.[0]).toBe(-586);
    expect(yearLabel(-586)).toBe("紀元前586年");
    expect(yearLabel(1789)).toBe("1789年");
  });

  it("サーバー用の索引が画面用のデータと一致し、日本史の索引とは別", () => {
    expect(ix.key).toBe("whist");
    expect(ix.questions.length).toBe(6051);
    expect(ix.terms.length).toBe(4048);
    expect(ix.eras.length).toBe(9);
    for (const q of raw.q) {
      const s = ix.byId.get(q[0])!;
      expect(s.answer).toBe(q[3]);
      expect(s.term).toBe(q[11]);
      expect(s.section).toBe(q[12]);
    }
    expect(jhistIndex().questions.length).toBe(3139);
    expect(histIndex("jhist")).toBe(jhistIndex());
  });
});

describe("世界史でも日本史と同じ仕組みが動く", () => {
  const today = "2026-11-01";
  const settings = { examDate: "2027-02-10", goal: "std" as const, set: true };

  it("今日のノルマと新出は世界史の用語から（重要度 S から、節の順）", () => {
    const daily = dailyFor(null, settings, new Map(), today, ix.terms);
    expect(daily.newTarget).toBeGreaterThanOrEqual(10);
    const q = buildQueue(new Map(), daily, settings, today, 20, new Set(), seeded(1), ix.terms);
    expect(q.length).toBe(20);
    expect(q.every((x) => x.isNew && ix.terms[x.term].imp === "S" && ix.byId.has(x.qid))).toBe(true);
  });

  it("状況の時代別は9つ、対象用語数は目標（S＋A）の世界史の用語数", () => {
    const st = statusOf(toProfile({ settings }), new Map(), today, ix);
    expect(st.eras.length).toBe(9);
    expect(st.target).toBe(ix.terms.filter((t) => t.imp !== "B").length);
  });

  it("実力テストは世界史の問題から50問（同じ用語は1問）", () => {
    const ids = buildTest(null, "adv", seeded(3), ix);
    expect(ids.length).toBe(50);
    expect(ids.every((id) => ix.byId.has(id))).toBe(true);
    expect(new Set(ids.map((id) => ix.byId.get(id)!.term)).size).toBe(50);
  });

  it("記録は世界史の保存先に入り、日本史の記録には触れない", async () => {
    const qid = ix.terms[0].questions[0];
    const r = await recordToday(301, "w1", [{ qid, sec: 3, format: "choice", chosen: ix.byId.get(qid)!.answer }], "whist");
    expect("results" in r && r.results[0].mark).toBe("o");
    expect(toTermStates(box("whist").terms[301]).get(0)?.s).toBe(1);
    expect(box("jhist").terms[301]).toBeUndefined();
    expect(box("whist").logs.at(-1)?.source).toBe("today");
    // 日本史の問題IDを世界史として送っても、世界史の問題として扱う（同じ ID でも別の問題）
    const t = await startTest(301, null, "std", "whist");
    expect(t.qids.every((id) => ix.byId.has(id))).toBe(true);
    expect(toProfile(box("whist").profile[301]).pendingTest?.qids).toEqual(t.qids);
    expect(box("jhist").profile[301]).toBeUndefined();
  });

  it("節別の練習は世界史のセクションの key で記録する", async () => {
    const sec = ix.sections[0];
    const answers = sec.ids.slice(0, 15).map((id) => ({ qid: id, sec: 3, format: "choice" as const, chosen: ix.byId.get(id)!.answer }));
    const r = await recordPractice(302, sec.key, "p1", answers, "whist");
    expect(r).toMatchObject({ score: answers.length, total: answers.length });
    expect(toProfile(box("whist").profile[302]).practice[sec.key]).toEqual([answers.length, answers.length]);
  });
});

describe("速くした計算が、前と同じ答えを返す", () => {
  it("「今日まだ出せる問題があるか」は、出題を1問組み立てた結果と同じ（日本史・世界史 × いろいろな状態）", () => {
    for (const key of ["jhist", "whist"] as const) {
      const x = histIndex(key);
      for (let seed = 1; seed <= 60; seed++) {
        const rand = seeded(seed);
        const today = "2026-11-01";
        const day = 20758;
        const states: TermStates = new Map();
        const n = Math.floor(rand() * x.terms.length);
        for (let i = 0; i < n; i++) if (rand() < 0.9) states.set(i, { s: Math.floor(rand() * 7), due: day + Math.floor(rand() * 10) - (seed % 3 === 0 ? -1 : 3), ok: 1, ng: 0, q: "", at: "" });
        const settings = { examDate: seed % 4 === 0 ? "2026-11-20" : "2027-02-10", goal: (seed % 2 ? "std" : "adv") as "std" | "adv", set: true };
        const d0 = dailyFor(null, settings, states, today, x.terms);
        const daily = seed % 5 === 0 ? { ...d0, newDone: d0.newTarget } : d0;
        expect(hasMore(states, daily, settings, today, x.terms)).toBe(buildQueue(states, daily, settings, today, 1, new Set(), Math.random, x.terms).length > 0);
      }
    }
  });
});

describe("世界史の年代チャレンジ・入試形式トレーニング", () => {
  const events: ChronoEvent[] = raw.chrono.map(([year, event, , era, , qid]) => ({ year, event, era, qid }));
  const levels: Level[] = ["basic", "adv"];
  it("年代チャレンジ：全範囲・9つの章 × 基本・発展で5問作れ、1問の中に同じ西暦がない", () => {
    for (const era of [null, ...WHIST_ERAS.map((_, i) => i)])
      for (const level of levels)
        for (let seed = 1; seed <= 20; seed++) {
          const set = makeChronoSet(events, era, level, seeded(seed * 31 + (era ?? 99)));
          expect(set.length).toBe(5);
          for (const q of set) {
            const years = eventsOf(q).map((e) => e.year);
            expect(new Set(years).size).toBe(years.length);
          }
        }
  });

  it("入試形式：3文正誤・複数選択（基本は正文2つ）・組合せが世界史のデータで作れる", () => {
    const all: SQ[] = raw.q.map((q) => ({ id: q[0], orig: q[1], text: q[2], answer: q[3], wrongs: [q[4], q[5], q[6]], era: q[8], term: q[11] }));
    const counts = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const t = makeThreeTf(all, seeded(seed))!;
      counts.add(t.filter((s) => !s.wrong).length);
      const m = makeMulti(all, "basic", seeded(seed))!;
      expect(m.filter((s) => !s.wrong).length).toBe(2);
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3]);
    const pairs = comboPairs(all);
    expect(pairs.length).toBeGreaterThan(100);
    for (const p of pairs) expect(p.text[0] + p.a.answer + p.text[1] + p.b.answer + p.text[2]).toBe(p.a.text.replace(BLANK, p.a.answer));
  });
});
