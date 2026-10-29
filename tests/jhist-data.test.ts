// 日本史：変換したデータが条件を満たしているか（Phase 1 の完了条件）
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JHIST_DATA_URL, JHIST_QUESTION_COUNT, JHIST_SECTION_COUNT, JHIST_TERM_COUNT } from "@/data/jhist/meta";
import { jhistIndex } from "@/lib/jhist/data";

const BLANK = "（　　）";
type Raw = {
  eras: string[];
  sections: { key: string; ids: string[]; era: number }[];
  terms: [string, string, string][];
  q: [string, string, string, string, string, string, string, string, number, string, number, number, number, string][];
  chrono: [number, string, string, number, string, string][];
};
const raw: Raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", JHIST_DATA_URL), "utf8"));

describe("日本史の問題データ（画面用）", () => {
  it("3,139問・2,281語をすべて読み込める", () => {
    expect(raw.q.length).toBe(3139);
    expect(JHIST_QUESTION_COUNT).toBe(3139);
    expect(raw.terms.length).toBe(2281);
    expect(JHIST_TERM_COUNT).toBe(2281);
    expect(new Set(raw.q.map((q) => q[0])).size).toBe(3139);
  });

  it("全問で空欄がちょうど1つ", () => {
    const bad = raw.q.filter((q) => q[2].split(BLANK).length !== 2).map((q) => q[0]);
    expect(bad).toEqual([]);
  });

  it("全問で選択肢（正解＋誤答1〜3）が4つあり、重複も空もない", () => {
    const bad = raw.q.filter((q) => {
      const choices = [q[3], q[4], q[5], q[6]];
      return choices.some((c) => !c) || new Set(choices).size !== 4;
    });
    expect(bad.map((q) => q[0])).toEqual([]);
  });

  it("問題の用語は、その問題の正解と同じ語", () => {
    const bad = raw.q.filter((q) => raw.terms[q[11]][1] !== q[3]);
    expect(bad.map((q) => q[0])).toEqual([]);
  });

  it("年代整序の西暦が時代の範囲に収まっている（加賀の一向一揆は1488年）", () => {
    const kaga = raw.chrono.find((c) => c[1] === "加賀の一向一揆");
    expect(kaga?.[0]).toBe(1488);
    expect(raw.chrono.length).toBe(304);
  });
});

describe("節別の練習のセクション", () => {
  it(`${JHIST_SECTION_COUNT}セクションすべてが10〜30問で、全問がちょうど1つのセクションに入る`, () => {
    expect(raw.sections.length).toBe(JHIST_SECTION_COUNT);
    for (const s of raw.sections) {
      expect(s.ids.length).toBeGreaterThanOrEqual(10);
      expect(s.ids.length).toBeLessThanOrEqual(30);
    }
    const all = raw.sections.flatMap((s) => s.ids);
    expect(all.length).toBe(3139);
    expect(new Set(all).size).toBe(3139);
    expect(new Set(raw.sections.map((s) => s.key)).size).toBe(raw.sections.length);
  });
});

describe("サーバー用の索引", () => {
  const idx = jhistIndex();
  it("画面用のデータと、問題・正解・用語・セクションが一致する", () => {
    expect(idx.questions.length).toBe(3139);
    expect(idx.terms.length).toBe(2281);
    expect(idx.sections.length).toBe(JHIST_SECTION_COUNT);
    for (const q of raw.q) {
      const s = idx.byId.get(q[0])!;
      expect(s.answer).toBe(q[3]);
      expect(s.term).toBe(q[11]);
      expect(s.section).toBe(q[12]);
      expect(s.alts.join("、")).toBe(q[7].split("、").map((x) => x.trim()).filter(Boolean).join("、"));
    }
    for (const t of idx.terms) expect(t.questions.length).toBeGreaterThan(0);
  });
});
