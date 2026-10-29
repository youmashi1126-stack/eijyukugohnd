// 日本史：練習の ○◎、採点、取り違えの判定、新しいコーナーの表示
import { describe, expect, it } from "vitest";
import { jhistIndex } from "@/lib/jhist/data";
import { markOf, practiceSummary, toProfile } from "@/lib/jhist/profile";
import { confusionOf, isChoiceCorrect } from "@/lib/jhist/record";
import { visibleCorners } from "@/lib/sets";

describe("節別の練習の ○◎", () => {
  it("正答率80％以上で ○、満点で ◎", () => {
    expect(markOf([15, 15])).toBe("◎");
    expect(markOf([12, 15])).toBe("○");
    expect(markOf([11, 15])).toBe("");
    expect(markOf([10, 12])).toBe("○"); // 12問のセクション：10問（83％）で ○
    expect(markOf([9, 12])).toBe("");
    expect(markOf(undefined)).toBe("");
  });
  it("集計", () => {
    const p = toProfile({ practice: { a: [15, 15], b: [12, 15], c: [3, 15] } });
    expect(practiceSummary(p)).toEqual({ cleared: 2, perfect: 1, tried: 3 });
  });
  it("壊れた値は捨てる", () => {
    const p = toProfile({ practice: { a: "x", b: [1, 0] }, attempts: [1, "a"], settings: { examDate: "x", goal: "std" } });
    expect(p.practice).toEqual({});
    expect(p.attempts).toEqual(["a"]);
    expect(p.settings).toBeNull();
  });
});

describe("4択の採点と取り違え", () => {
  const idx = jhistIndex();
  const q = idx.byId.get("Q0001")!; // 正解：更新世
  it("正解だけが ○、時間切れ（null）は ×", () => {
    expect(isChoiceCorrect(q, "更新世")).toBe(true);
    expect(isChoiceCorrect(q, "完新世")).toBe(false);
    expect(isChoiceCorrect(q, null)).toBe(false);
  });
  it("選んだ誤答がほかの用語の正解なら取り違え", () => {
    const other = idx.questions.find((x) => x.answer === "完新世");
    const c = confusionOf(q, "完新世");
    if (other) expect(c).toEqual({ term: idx.terms[q.term].id, wrong: "完新世" });
    else expect(c).toBeNull();
    expect(confusionOf(q, "更新世")).toBeNull();
    expect(confusionOf(q, "どの問題の正解でもない語")).toBeNull();
  });
});

describe("表示するコーナー", () => {
  it("設定を保存していない人は、すべて表示（null）", () => {
    expect(visibleCorners({})).toBeNull();
  });
  it("日本史・世界史を追加する前に保存した人にも、日本史・世界史を表示する", () => {
    expect(visibleCorners({ corners: ["word", "study"] })).toEqual(["word", "jhist", "whist", "study"]);
  });
  it("日本史を追加したあと・世界史を追加する前に保存した人には、世界史だけ新しく表示する", () => {
    const before = ["word", "idiom", "jhs", "jhist", "study", "materials", "pastexams"];
    expect(visibleCorners({ corners: ["word", "study"], cornersKnown: before })).toEqual(["word", "whist", "study"]);
    expect(visibleCorners({ corners: ["jhist"], cornersKnown: before })).toEqual(["jhist", "whist"]);
  });
  it("世界史を追加したあとに保存した人は、選んだとおり", () => {
    const all = ["word", "idiom", "jhs", "jhist", "whist", "study", "materials", "pastexams"];
    expect(visibleCorners({ corners: ["word", "study"], cornersKnown: all })).toEqual(["word", "study"]);
    expect(visibleCorners({ corners: ["whist"], cornersKnown: all })).toEqual(["whist"]);
  });
});

import { lengthHint } from "@/lib/jhist/hint";
describe("記述の字数表示", () => {
  it("すべて漢字なら字数つき", () => expect(lengthHint("墾田永年私財法", [])).toBe("（漢字7字）"));
  it("々も漢字として数える", () => expect(lengthHint("佐々木", [])).toBe("（漢字3字）"));
  it("別解の字数が違えば「漢字」だけ", () => expect(lengthHint("韓鍛冶部", ["韓鍛冶"])).toBe("（漢字）"));
  it("別解も同じ字数の漢字なら字数つき", () => expect(lengthHint("大化改新", ["乙巳の変"].filter(() => false))).toBe("（漢字4字）"));
  it("カタカナ・ひらがなを含む正解には出さない", () => {
    expect(lengthHint("ナウマンゾウ", [])).toBe("");
    expect(lengthHint("加賀の一向一揆", [])).toBe("");
  });
});
