// 日本史：年代チャレンジの問題を作る（年代整序のデータだけを組み合わせる。新しい文や語は作らない）
// どの問題も、同じ西暦の項目を1問に入れない
import { CHRONO_AFTER_ADV, CHRONO_AFTER_BASIC, CHRONO_COUNT, CHRONO_NEAREST_GAP, CHRONO_SORT_ADV, CHRONO_SORT_BASIC } from "./constants";

export type ChronoEvent = { year: number; event: string; era: number; qid: string };
export type Level = "basic" | "adv";

// sort：古い順に並べる／nearest：基準の出来事に最も近い年の出来事（4択）
// after：基準より後（または前）に起きた出来事を選ぶ（基本は1つ、発展はすべて）
export type ChronoQuestion =
  | { kind: "sort"; items: ChronoEvent[] }
  | { kind: "nearest"; base: ChronoEvent; choices: ChronoEvent[]; answer: ChronoEvent }
  | { kind: "after"; base: ChronoEvent; dir: "after" | "before"; choices: ChronoEvent[]; multi: boolean };

type Rand = () => number;

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 西暦が重ならないように選ぶ（used：すでに使った西暦）
function pickDistinct(pool: ChronoEvent[], n: number, rand: Rand, used = new Set<number>()): ChronoEvent[] | null {
  const out: ChronoEvent[] = [];
  const years = new Set(used);
  for (const e of shuffle(pool, rand)) {
    if (years.has(e.year)) continue;
    years.add(e.year);
    out.push(e);
    if (out.length === n) return out;
  }
  return null;
}

// 範囲：時代を選んだときはその時代、作れなければ隣の時代まで広げる（null は全範囲）
export function poolFor(all: ChronoEvent[], era: number | null, widen = 0): ChronoEvent[] {
  if (era === null) return all;
  return all.filter((e) => Math.abs(e.era - era) <= widen);
}

export function makeSort(pool: ChronoEvent[], level: Level, rand: Rand): ChronoQuestion | null {
  const n = level === "basic" ? CHRONO_SORT_BASIC : CHRONO_SORT_ADV[Math.floor(rand() * CHRONO_SORT_ADV.length)];
  const items = pickDistinct(pool, n, rand);
  return items ? { kind: "sort", items } : null;
}

// 最も近い年：正解は基準に近い出来事（近い5つの中から）、誤答は「正解との差＋差の年数」以上離れた出来事
export function makeNearest(pool: ChronoEvent[], level: Level, rand: Rand): ChronoQuestion | null {
  const gap = CHRONO_NEAREST_GAP[level];
  for (const base of shuffle(pool, rand).slice(0, 30)) {
    const others = pool.filter((e) => e.year !== base.year);
    const byDistance = [...new Map(others.sort((a, b) => Math.abs(a.year - base.year) - Math.abs(b.year - base.year)).map((e) => [e.year, e])).values()];
    for (const answer of shuffle(byDistance.slice(0, 5), rand)) {
      const d = Math.abs(answer.year - base.year);
      const far = others.filter((e) => Math.abs(e.year - base.year) >= d + gap);
      const wrongs = pickDistinct(far, 3, rand, new Set([base.year, answer.year]));
      if (wrongs) return { kind: "nearest", base, answer, choices: shuffle([answer, ...wrongs], rand) };
    }
  }
  return null;
}

// 前後の判定：基本は4つの中で基準より後（前）がちょうど1つ、発展は5つの中で1〜4つ
export function makeAfter(pool: ChronoEvent[], level: Level, rand: Rand): ChronoQuestion | null {
  const multi = level === "adv";
  const size = multi ? CHRONO_AFTER_ADV : CHRONO_AFTER_BASIC;
  for (const base of shuffle(pool, rand).slice(0, 30)) {
    const dir: "after" | "before" = rand() < 0.5 ? "after" : "before";
    const yes = pool.filter((e) => (dir === "after" ? e.year > base.year : e.year < base.year));
    const no = pool.filter((e) => (dir === "after" ? e.year < base.year : e.year > base.year));
    const nYes = multi ? 1 + Math.floor(rand() * (size - 1)) : 1;
    const a = pickDistinct(yes, nYes, rand, new Set([base.year]));
    if (!a) continue;
    const b = pickDistinct(no, size - nYes, rand, new Set([base.year, ...a.map((e) => e.year)]));
    if (!b) continue;
    return { kind: "after", base, dir, multi, choices: shuffle([...a, ...b], rand) };
  }
  return null;
}

// 1問作る。選んだ時代で作れなければ、隣の時代まで少しずつ広げる
export function makeChrono(all: ChronoEvent[], kind: ChronoQuestion["kind"], era: number | null, level: Level, rand: Rand = Math.random): ChronoQuestion {
  const make = kind === "sort" ? makeSort : kind === "nearest" ? makeNearest : makeAfter;
  for (let widen = 0; widen <= 11; widen++) {
    const q = make(poolFor(all, era, widen), level, rand);
    if (q) return q;
    if (era === null) break;
  }
  throw new Error("年代チャレンジの問題を作れませんでした");
}

// 毎日5問：3つの形式を必ず1つずつ入れ、残りはランダム
export function makeChronoSet(all: ChronoEvent[], era: number | null, level: Level, rand: Rand = Math.random): ChronoQuestion[] {
  const kinds: ChronoQuestion["kind"][] = ["sort", "nearest", "after"];
  while (kinds.length < CHRONO_COUNT) kinds.push(kinds[Math.floor(rand() * 3)]);
  return shuffle(kinds, rand).map((k) => makeChrono(all, k, era, level, rand));
}

// 採点
export function sortCorrect(items: ChronoEvent[], order: ChronoEvent[]) {
  const right = [...items].sort((a, b) => a.year - b.year);
  return order.length === right.length && order.every((e, i) => e === right[i]);
}

export function afterAnswers(q: Extract<ChronoQuestion, { kind: "after" }>) {
  return q.choices.filter((e) => (q.dir === "after" ? e.year > q.base.year : e.year < q.base.year));
}

// 問題に出てくる項目（答え合わせで西暦をすべて見せる・重複の確認）
export function eventsOf(q: ChronoQuestion): ChronoEvent[] {
  return q.kind === "sort" ? q.items : [q.base, ...q.choices];
}
