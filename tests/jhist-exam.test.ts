// 日本史：入試形式トレーニング（Phase 5 の完了条件）
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JHIST_DATA_URL } from "@/data/jhist/meta";
import { comboPairs, isReadingQuestion, judgeInput, makeCombo, makeMulti, makeThreeTf, normalizeAnswer, oneCharDiff, type SQ } from "@/lib/jhist/exam";

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", JHIST_DATA_URL), "utf8"));
const all: SQ[] = raw.q.map((q: (string | number)[]) => ({ id: q[0], orig: q[1], text: q[2], answer: q[3], wrongs: [q[4], q[5], q[6]], era: q[8], term: q[11] }));
const BLANK = "（　　）";

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("入力記述の採点", () => {
  it("例：「韓鍛冶部」に「韓鍛治部」は1文字違い（基本は△・発展は×、違う文字に印）", () => {
    expect(judgeInput("韓鍛冶部", [], "韓鍛治部", "basic")).toEqual({ mark: "t", typo: 2, normalized: "韓鍛治部" });
    expect(judgeInput("韓鍛冶部", [], "韓鍛治部", "adv")).toMatchObject({ mark: "x", typo: 2 });
  });
  it("例：「墾田永年私財法」に「墾田永年私財法 」は○", () => {
    expect(judgeInput("墾田永年私財法", [], "墾田永年私財法 ", "adv").mark).toBe("o");
  });
  it("全角・半角、前後の空白、「・」「＝」「=」、カタカナとひらがなの違いは無視する", () => {
    expect(judgeInput("GHQ", [], "ＧＨＱ", "adv").mark).toBe("o");
    expect(judgeInput("サン＝フェリペ号事件", [], "サンフェリペ号事件", "adv").mark).toBe("o");
    expect(judgeInput("サン＝フェリペ号事件", [], "サン=フェリペ号事件", "adv").mark).toBe("o");
    expect(judgeInput("日独伊三国同盟", [], "　日独伊三国同盟", "adv").mark).toBe("o");
    expect(judgeInput("ナウマンゾウ", [], "なうまんぞう", "adv").mark).toBe("o");
    expect(judgeInput("ええじゃないか", [], "エエジャナイカ", "adv").mark).toBe("o");
    expect(judgeInput("ア・イ", [], "アイ", "adv").mark).toBe("o");
  });
  it("読みを問う問題では、カタカナとひらがなの違いを無視しない", () => {
    expect(judgeInput("おおきみ", [], "オオキミ", "adv", true).mark).not.toBe("o");
    expect(isReadingQuestion("「大王」の読みを答えよ")).toBe(true);
    expect(isReadingQuestion("本居宣長は、古代の歴史書の中に日本古来の精神を読み取ろうとして")).toBe(false);
  });
  it("漢字の字体の違いは無視しない（別解に載っているものだけ正解）", () => {
    expect(judgeInput("国学", [], "國学", "adv").mark).toBe("x");
    expect(judgeInput("国学", ["國学"], "國学", "adv").mark).toBe("o");
  });
  it("別解とも照らし合わせる", () => {
    expect(judgeInput("大化改新", ["大化の改新"], "大化の改新", "basic").mark).toBe("o");
  });
  it("2文字以上違えば×（基本でも）、空は×", () => {
    expect(judgeInput("墾田永年私財法", [], "墾田永世私材法", "basic")).toMatchObject({ mark: "x", typo: null });
    expect(judgeInput("律令", [], "", "basic").mark).toBe("x");
  });
  it("1文字の抜け・余分も1文字違い", () => {
    expect(oneCharDiff("墾田永年財法", "墾田永年私財法")).toBe(4);
    expect(oneCharDiff("墾田永年私私財法", "墾田永年私財法")).toBe(5);
    expect(oneCharDiff("abc", "abc")).toBeNull();
    expect(normalizeAnswer(" ｱｲ ")).toBe("あい");
  });
});

describe("3文正誤", () => {
  it("同じ時代の3文、同じ用語・同じ元問題IDの文は入れない。正文は0〜3つのどれも出る", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const set = makeThreeTf(all, seeded(seed))!;
      expect(set.length).toBe(3);
      expect(new Set(set.map((s) => s.q.era)).size).toBe(1);
      expect(new Set(set.map((s) => s.q.term)).size).toBe(3);
      expect(new Set(set.map((s) => s.q.orig)).size).toBe(3);
      for (const s of set) expect(s.text).toBe(s.q.text.replace(BLANK, s.wrong ? s.q.wrongs[0] : s.q.answer));
      counts.add(set.filter((s) => !s.wrong).length);
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("複数選択", () => {
  it("基本：同じ時代の5文で、正文は必ずちょうど2つ", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const set = makeMulti(all, "basic", seeded(seed))!;
      expect(set.length).toBe(5);
      expect(new Set(set.map((s) => s.q.era)).size).toBe(1);
      expect(new Set(set.map((s) => s.q.term)).size).toBe(5);
      expect(set.filter((s) => !s.wrong).length).toBe(2);
    }
  });
  it("発展：正文は1〜4つ（どれも出る）", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) counts.add(makeMulti(all, "adv", seeded(seed))!.filter((s) => !s.wrong).length);
    expect([...counts].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("組合せ", () => {
  const pairs = comboPairs(all);
  it("同じ元問題IDで正文が同じ2問の組（78組）をすべて、空欄2つの文にできる", () => {
    expect(pairs.length).toBe(78);
    for (const p of pairs) {
      const [x, y, z] = p.text;
      expect(x + p.a.answer + y + p.b.answer + z).toBe(p.a.text.replace(BLANK, p.a.answer));
      expect(x + BLANK + y + p.b.answer + z).toBe(p.a.text);
      expect(x + p.a.answer + y + BLANK + z).toBe(p.b.text);
    }
  });
  it("「律・令」のように、答えの語が文のほかの所にも出てくる組も正しく作れる", () => {
    const p = pairs.find((x) => x.a.id === "Q0175")!;
    expect(p.text[0]).toBe("律令体制では、今日の刑法にあたるものを");
    expect(p.text[1]).toBe("、行政法・民法にあたるものを");
  });
  it("4択は「正＋正」「正＋誤」「誤＋正」「誤＋誤」で、誤答は各問題の誤答1〜3から", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = pairs[seed % pairs.length];
      const c = makeCombo(p, seeded(seed));
      expect(c.choices.length).toBe(4);
      expect(new Set(c.choices.map((x) => x.join("|"))).size).toBe(4);
      expect(c.choices.filter((x) => x[0] === p.a.answer && x[1] === p.b.answer).length).toBe(1);
      for (const [x, y] of c.choices) {
        expect([p.a.answer, ...p.a.wrongs]).toContain(x);
        expect([p.b.answer, ...p.b.wrongs]).toContain(y);
      }
    }
  });
  it("同じ語を2つの空欄に並べた選択肢を作らない（作れる組では）", () => {
    for (const p of pairs) {
      for (let seed = 1; seed <= 20; seed++) {
        const avoidable = p.a.wrongs.some((wa) => wa !== p.b.answer && p.b.wrongs.some((wb) => wb !== p.a.answer && wb !== wa));
        if (!avoidable) continue;
        for (const [x, y] of makeCombo(p, seeded(seed)).choices) expect(x).not.toBe(y);
      }
    }
  });
});
