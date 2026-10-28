// 日本史：年代チャレンジ（Phase 4・5 の完了条件：西暦の重複がない、最も近い年の正解が一意）
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JHIST_DATA_URL } from "@/data/jhist/meta";
import { afterAnswers, eventsOf, makeChrono, makeChronoSet, sortCorrect, type ChronoEvent, type Level } from "@/lib/jhist/chrono";
import { CHRONO_NEAREST_GAP } from "@/lib/jhist/constants";

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", JHIST_DATA_URL), "utf8"));
const all: ChronoEvent[] = raw.chrono.map(([year, event, , era, , qid]: [number, string, string, number, string, string]) => ({ year, event, era, qid }));

// 決まった乱数（何度でも同じ結果になる）
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const ranges: (number | null)[] = [null, ...Array.from({ length: 12 }, (_, i) => i)];
const levels: Level[] = ["basic", "adv"];

describe("年代チャレンジ", () => {
  it("どのセットにも、1問の中に同じ西暦の項目がない（全範囲・12の時代 × 基本・発展 × 50回）", () => {
    for (const era of ranges)
      for (const level of levels)
        for (let seed = 1; seed <= 50; seed++) {
          const set = makeChronoSet(all, era, level, seeded(seed * 97 + (era ?? 99)));
          expect(set.length).toBe(5);
          expect(new Set(set.map((q) => q.kind)).size).toBe(3); // 3つの形式が必ず入る
          for (const q of set) {
            const years = eventsOf(q).map((e) => e.year);
            expect(new Set(years).size).toBe(years.length);
          }
        }
  });

  it("並べ替え：基本は3項目、発展は4〜5項目。古い順に並べたものだけが正解", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = makeChrono(all, "sort", null, "basic", seeded(seed));
      const a = makeChrono(all, "sort", null, "adv", seeded(seed));
      if (b.kind !== "sort" || a.kind !== "sort") throw new Error();
      expect(b.items.length).toBe(3);
      expect([4, 5]).toContain(a.items.length);
      const right = [...a.items].sort((x, y) => x.year - y.year);
      expect(sortCorrect(a.items, right)).toBe(true);
      expect(sortCorrect(a.items, [...right].reverse())).toBe(false);
    }
  });

  it("最も近い年：正解が一意に決まる（誤答との差が、正解との差より基本20年・発展5年以上大きい）", () => {
    for (const era of ranges)
      for (const level of levels)
        for (let seed = 1; seed <= 30; seed++) {
          const q = makeChrono(all, "nearest", era, level, seeded(seed * 31 + (era ?? 50)));
          if (q.kind !== "nearest") throw new Error();
          expect(q.choices.length).toBe(4);
          expect(q.choices).toContain(q.answer);
          const d = Math.abs(q.answer.year - q.base.year);
          for (const c of q.choices) if (c !== q.answer) expect(Math.abs(c.year - q.base.year) - d).toBeGreaterThanOrEqual(CHRONO_NEAREST_GAP[level]);
        }
  });

  it("前後の判定：基本は4つの中でちょうど1つ、発展は5つの中で1〜4つ", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const b = makeChrono(all, "after", null, "basic", seeded(seed));
      const a = makeChrono(all, "after", null, "adv", seeded(seed + 1000));
      if (b.kind !== "after" || a.kind !== "after") throw new Error();
      expect(b.choices.length).toBe(4);
      expect(afterAnswers(b).length).toBe(1);
      expect(a.choices.length).toBe(5);
      expect(afterAnswers(a).length).toBeGreaterThanOrEqual(1);
      expect(afterAnswers(a).length).toBeLessThanOrEqual(4);
    }
  });

  it("選んだ時代で作れないとき（原始・古墳には年代のデータがない）は、隣の時代まで広げる", () => {
    expect(all.filter((e) => e.era === 0).length).toBe(0);
    const q = makeChrono(all, "sort", 0, "basic", seeded(3));
    if (q.kind !== "sort") throw new Error();
    expect(q.items.every((e) => e.era <= 3)).toBe(true);
    // 年代のデータがある時代は、その時代の中だけで作る
    const nara = makeChrono(all, "sort", 3, "basic", seeded(5));
    if (nara.kind !== "sort") throw new Error();
    expect(nara.items.every((e) => e.era === 3)).toBe(true);
  });
});
