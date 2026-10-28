// 日本史：記憶定着の仕組み（Phase 2 の完了条件）
import { describe, expect, it } from "vitest";
import { INTERVAL_DAYS } from "@/lib/jhist/constants";
import { jhistIndex } from "@/lib/jhist/data";
import { buildQueue, dailyFor, newPerDay, nextQuestion, unlockedImps, unlearnedCount, type TermStates } from "@/lib/jhist/plan";
import { defaultExamDate, type Daily, type JhistSettings } from "@/lib/jhist/profile";
import { countDaily } from "@/lib/jhist/record";
import { applyAnswer, dateOf, dayNumber, formatOf, type Format, type Mark, type TermState } from "@/lib/jhist/srs";

const T = 1000; // 今日の日の番号
const st = (s: number): TermState => ({ s, due: T, ok: 0, ng: 0, q: "", at: "" });
const answer = (mark: Mark, format: Format, sec = 3) => ({ mark, format, sec, qid: "Q0001", at: "x" });

describe("段階の遷移表（すべてのマス）", () => {
  // [段階, 形式, 正解後の段階, 次の出題までの日数, 不正解後の段階, 不正解のとき同じセッションで再出題]
  const table: [number, Format, number, number, number, boolean][] = [
    [0, "choice", 1, 0, 0, true],
    [1, "choice", 2, 1, 0, true],
    [2, "tf", 3, 3, 1, true],
    [3, "write", 4, 7, 1, true],
    [4, "write", 5, 14, 2, false],
    [5, "write", 6, 30, 2, false],
    [6, "write", 6, 60, 3, false],
  ];
  for (const [s, format, up, days, down, requeue] of table) {
    it(`段階${s}（${format}）：正解→${up}（${days}日後）、不正解→${down}`, () => {
      expect(formatOf(s)).toBe(format);
      const ok = applyAnswer(st(s), answer("o", format), T);
      expect(ok.state.s).toBe(up);
      expect(ok.state.due).toBe(T + days);
      expect(ok.state.ok).toBe(1);
      expect(ok.requeue).toBe(false);
      const ng = applyAnswer(st(s), answer("x", format), T);
      expect(ng.state.s).toBe(down);
      expect(ng.state.ng).toBe(1);
      expect(ng.requeue).toBe(requeue);
      // 同じセッションで出し直す段階（3まで）は今日、それより上は翌日に
      expect(ng.state.due).toBe(requeue ? T : T + 1);
    });
  }
  it("間隔の定数が仕様どおり（当日・1・3・7・14・30・60日）", () => {
    expect(INTERVAL_DAYS).toEqual([0, 1, 3, 7, 14, 30, 60]);
  });
  it("段階0（未学習）の不正解は段階0のまま、同じセッションで出し直す", () => {
    const r = applyAnswer(undefined, answer("x", "choice"), T);
    expect(r.state.s).toBe(0);
    expect(r.requeue).toBe(true);
  });
  it("迷った正解（4択・正誤で15秒以上）：段階は上げず、次の出題だけ1日後", () => {
    for (const [s, f] of [[0, "choice"], [1, "choice"], [2, "tf"]] as [number, Format][]) {
      const r = applyAnswer(st(s), answer("o", f, 15), T);
      expect(r.state.s).toBe(s);
      expect(r.state.due).toBe(T + 1);
      const fast = applyAnswer(st(s), answer("o", f, 14.9), T);
      expect(fast.state.s).toBe(s + 1);
    }
    // 記述は時間がかかっても迷った正解にしない
    expect(applyAnswer(st(3), answer("o", "write", 60), T).state.s).toBe(4);
  });
  it("記述の△あやふや：段階は据え置き、次の出題を1日後に", () => {
    for (const s of [3, 4, 5, 6]) {
      const r = applyAnswer(st(s), answer("t", "write"), T);
      expect(r.state.s).toBe(s);
      expect(r.state.due).toBe(T + 1);
      expect(r.requeue).toBe(false);
    }
  });
  it("節別の練習：段階0の正解だけ1へ。上の段階は上げず、不正解なら下げる", () => {
    expect(applyAnswer(undefined, answer("o", "choice"), T, "intro").state.s).toBe(1);
    expect(applyAnswer(st(3), answer("o", "choice"), T, "intro").state.s).toBe(3);
    expect(applyAnswer(st(3), answer("o", "choice"), T, "intro").state.due).toBe(T);
    expect(applyAnswer(st(5), answer("x", "choice"), T, "intro").state.s).toBe(2);
  });
  it("実力テストなど：正解しても上げず、不正解なら下げる", () => {
    expect(applyAnswer(st(2), answer("o", "choice"), T, "check").state.s).toBe(2);
    expect(applyAnswer(st(6), answer("x", "choice"), T, "check").state.s).toBe(3);
  });
});

describe("今日の新出数", () => {
  const today = "2026-01-01";
  const exam = (daysLeft: number) => dateOf(dayNumber(today) + daysLeft + 30);
  it("未学習1,000語・残り50日なら20語", () => expect(newPerDay(1000, today, exam(50))).toBe(20));
  it("切り上げ", () => expect(newPerDay(1001, today, exam(50))).toBe(21));
  it("下限10語・上限40語", () => {
    expect(newPerDay(100, today, exam(50))).toBe(10);
    expect(newPerDay(5000, today, exam(50))).toBe(40);
  });
  it("未学習が10語未満ならその数、0語なら0", () => {
    expect(newPerDay(3, today, exam(50))).toBe(3);
    expect(newPerDay(0, today, exam(50))).toBe(0);
  });
  it("入試30日前からは0（復習だけ）", () => {
    expect(newPerDay(1000, today, exam(0))).toBe(0);
    expect(newPerDay(1000, today, exam(-5))).toBe(0);
    expect(newPerDay(1000, today, exam(1))).toBe(40);
  });
  it("入試日の初期値は次の2月10日", () => {
    expect(defaultExamDate("2026-10-28")).toBe("2027-02-10");
    expect(defaultExamDate("2027-01-05")).toBe("2027-02-10");
    expect(defaultExamDate("2027-02-11")).toBe("2028-02-10");
  });
});

describe("重要度の解放", () => {
  const { terms } = jhistIndex();
  const ofImp = (imp: string) => terms.map((t, i) => [t, i] as const).filter(([t]) => t.imp === imp).map(([, i]) => i);
  const withStage = (ids: number[], rate: number, s = 2): TermStates => new Map(ids.slice(0, Math.floor(ids.length * rate)).map((i) => [i, st(s)]));
  it("最初は S だけ", () => expect(unlockedImps("adv", new Map())).toEqual(["S"]));
  it("S の段階2以上が80％以下なら A は出ない、80％を超えたら A", () => {
    const s = ofImp("S");
    const just80 = new Map(s.slice(0, Math.floor(s.length * 0.8)).map((i) => [i, st(2)]));
    expect(unlockedImps("std", just80)).toEqual(["S"]);
    expect(unlockedImps("std", withStage(s, 0.81))).toEqual(["S", "A"]);
    expect(unlockedImps("std", withStage(s, 0.81, 1))).toEqual(["S"]); // 段階1では数えない
  });
  it("B は目標が早慶上智で、A も80％を超えたときだけ", () => {
    const both = new Map([...withStage(ofImp("S"), 0.9), ...withStage(ofImp("A"), 0.9)]);
    expect(unlockedImps("std", both)).toEqual(["S", "A"]);
    expect(unlockedImps("adv", both)).toEqual(["S", "A", "B"]);
  });
  it("未学習の数は目標の対象用語だけで数える", () => {
    expect(unlearnedCount("std", new Map())).toBe(terms.filter((t) => t.imp !== "B").length);
    expect(unlearnedCount("adv", new Map())).toBe(terms.length);
  });
});

describe("出題の組み立て", () => {
  const { terms } = jhistIndex();
  const settings: JhistSettings = { examDate: "2027-02-10", goal: "std", set: true };
  it("復習（期限切れの多い順に選ぶ）を先に、新出を節の順にあとに", () => {
    const today = "2026-11-01";
    const day = dayNumber(today);
    const states: TermStates = new Map([
      [100, { ...st(2), due: day - 5 }],
      [200, { ...st(3), due: day - 1 }],
      [300, { ...st(4), due: day + 3 }], // まだ期限が来ていない
    ]);
    const daily = dailyFor(null, settings, states, today);
    const q = buildQueue(states, daily, settings, today, 20);
    expect(q.slice(0, 2).map((x) => x.term).sort()).toEqual([100, 200]);
    expect(q.find((x) => x.term === 300)).toBeUndefined();
    expect(q[0].isNew || q[1].isNew).toBe(false);
    const fresh = q.filter((x) => x.isNew);
    expect(fresh.length).toBe(18);
    expect(fresh.every((x) => terms[x.term].imp === "S")).toBe(true);
    const orders = fresh.map((x) => terms[x.term].order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    // 形式は段階に合わせる
    expect(q.find((x) => x.term === 100)!.format).toBe("tf");
    expect(q.find((x) => x.term === 200)!.format).toBe("write");
  });
  it("期限切れが多いものを優先して選ぶ（数が多いとき）", () => {
    const today = "2026-11-01";
    const day = dayNumber(today);
    const states: TermStates = new Map(Array.from({ length: 30 }, (_, i) => [i, { ...st(2), due: day - i }]));
    const daily = dailyFor(null, settings, states, today);
    const q = buildQueue(states, daily, settings, today, 20);
    expect(q.map((x) => x.term).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 10));
  });
  it("同じ用語に問題が複数あれば、前回と違う問題文を出す", () => {
    const t = terms.find((x) => x.questions.length >= 2)!;
    expect(nextQuestion(t, t.questions[0])).toBe(t.questions[1]);
    expect(nextQuestion(t, t.questions.at(-1))).toBe(t.questions[0]);
    const one = terms.find((x) => x.questions.length === 1)!;
    expect(nextQuestion(one, one.questions[0])).toBe(one.questions[0]);
  });
});

describe("ノルマと連続日数", () => {
  const daily: Daily = { date: "2026-11-02", newTarget: 2, reviewTarget: 1, newDone: 0, reviewDone: 0, terms: [], achieved: false };
  it("その日初めて答えた用語だけを、新出・復習として数える", () => {
    const r = countDaily(daily, { count: 3, last: "2026-11-01" }, [
      { term: 1, wasNew: true, wasDue: false },
      { term: 1, wasNew: false, wasDue: true }, // 同じ日の2回目
      { term: 2, wasNew: false, wasDue: true },
      { term: 3, wasNew: false, wasDue: false }, // 期限前（数えない）
    ], "2026-11-02");
    expect(r.daily.newDone).toBe(1);
    expect(r.daily.reviewDone).toBe(1);
    expect(r.achievedNow).toBe(false);
    const r2 = countDaily(r.daily, { count: 3, last: "2026-11-01" }, [{ term: 4, wasNew: true, wasDue: false }], "2026-11-02");
    expect(r2.achievedNow).toBe(true);
    expect(r2.streak).toEqual({ count: 4, last: "2026-11-02" });
  });
  it("前の日に達成していなければ1から", () => {
    const r = countDaily({ ...daily, newTarget: 0, reviewTarget: 0 }, { count: 9, last: "2026-10-30" }, [{ term: 5, wasNew: false, wasDue: false }], "2026-11-02");
    expect(r.streak).toEqual({ count: 1, last: "2026-11-02" });
  });
});

describe("日付を進めるシミュレーション", () => {
  it("毎日ノルマをこなすと、1つの用語が間隔どおり（当日・1・3・7・14・30・60日）に再出題される", () => {
    const settings: JhistSettings = { examDate: "2028-02-10", goal: "std", set: true };
    const start = dayNumber("2026-11-01");
    const states: TermStates = new Map();
    let daily: Daily | null = null;
    let streak = { count: 0, last: "" };
    const seen: Record<number, number[]> = {};
    for (let d = 0; d <= 130; d++) {
      const today = dateOf(start + d);
      daily = dailyFor(daily, settings, states, today);
      // その日の問題がなくなるまで、セッションを続けて全部正解する（4択・正誤は3秒で答える）
      for (let session = 0; session < 50; session++) {
        const queue = buildQueue(states, daily, settings, today, 20);
        if (!queue.length) break;
        const results = queue.map((item) => {
          const prev = states.get(item.term);
          const { state } = applyAnswer(prev, { mark: "o", format: item.format, sec: 3, qid: item.qid, at: today }, start + d);
          states.set(item.term, state);
          (seen[item.term] ??= []).push(d);
          return { term: item.term, wasNew: !prev, wasDue: !!prev && prev.due <= start + d };
        });
        const c = countDaily(daily, streak, results, today);
        daily = c.daily;
        streak = c.streak;
      }
    }
    // 1日目に出た最初の用語：0日目に新出→当日中に段階1→翌日→3日後→7日後→14日後→30日後→60日後
    const first = Object.entries(seen).find(([, days]) => days[0] === 0)!;
    expect(first[1]).toEqual([0, 0, 1, 4, 11, 25, 55, 115]);
    // ノルマを毎日達成しているので、連続日数は日数と同じ
    expect(streak.count).toBe(131);
  });
});
