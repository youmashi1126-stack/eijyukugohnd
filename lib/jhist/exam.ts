// 日本史：入試形式トレーニング（入力記述の採点・3文正誤・複数選択・組合せ）。データの文と誤答だけを組み合わせて作る
import { MULTI_BASIC_CORRECT, MULTI_SIZE, THREE_TF_SIZE } from "./constants";

export type Level = "basic" | "adv";

// ---------- 入力記述の採点 ----------

// 読み（かな）を問う問題か：その問題ではカタカナとひらがなの違いを無視しない
export function isReadingQuestion(text: string) {
  return /読み(方)?を(答え|記せ|書け)|何と読|読みがな|ふりがな/.test(text);
}

// 比べる前にそろえる：前後の空白、全角と半角、「・」「＝」「=」の有無、カタカナとひらがなの違い（読みを問う問題を除く）は無視する
// 漢字の字体の違い（旧字体など）はそろえない（別解に載っているものだけを正解にする）
export function normalizeAnswer(s: string, keepKana = false) {
  let t = s.normalize("NFKC").trim().replace(/[\s・･=＝]/g, "");
  if (!keepKana) t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return t;
}

// 1文字だけ違うか（1文字の入れ替え・抜け・余分）。違う文字の位置（入力の側）を返す。違いが0や2文字以上なら null
export function oneCharDiff(input: string, target: string): number | null {
  const a = [...input];
  const b = [...target];
  if (Math.abs(a.length - b.length) > 1) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (i === a.length) return null; // 同じ
    return a.slice(i + 1).join("") === b.slice(i + 1).join("") ? i : null;
  }
  // 1文字多い・少ない
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (long.slice(i + 1).join("") !== short.slice(i).join("")) return null;
  return Math.min(i, a.length - 1);
}

export type InputJudge = { mark: "o" | "t" | "x"; typo: number | null; normalized: string };

// 入力記述の採点：正解または別解と一致で ○。1文字だけ違えば、基本は △・発展は ×（どちらも「誤字の可能性」として違う文字に印）
export function judgeInput(answer: string, alts: string[], input: string, level: Level, reading = false): InputJudge {
  const norm = normalizeAnswer(input, reading);
  const targets = [answer, ...alts].map((t) => normalizeAnswer(t, reading));
  if (norm && targets.includes(norm)) return { mark: "o", typo: null, normalized: norm };
  for (const t of targets) {
    const pos = norm ? oneCharDiff(norm, t) : null;
    if (pos !== null) return { mark: level === "basic" ? "t" : "x", typo: pos, normalized: norm };
  }
  return { mark: "x", typo: null, normalized: norm };
}

// ---------- 文を組み合わせる問題 ----------

// 問題の最小限の形（画面用データの問題）
export type SQ = { id: string; orig: string; text: string; answer: string; wrongs: string[]; era: number; term: number };
const BLANK = "（　　）";
type Rand = () => number;

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 正誤判定に使う文：正文（空欄に正解）か誤文（空欄に誤答1）
export type Sentence = { q: SQ; wrong: boolean; text: string };
export function sentenceOf(q: SQ, wrong: boolean): Sentence {
  return { q, wrong, text: q.text.replace(BLANK, wrong ? q.wrongs[0] : q.answer) };
}

// 同じ時代の問題から、用語も元問題IDも重ならないように n 問選ぶ（作れる時代をランダムに選ぶ）
export function pickSameEra(pool: SQ[], n: number, rand: Rand): SQ[] | null {
  const eras = shuffle([...new Set(pool.map((q) => q.era))], rand);
  for (const era of eras) {
    const out: SQ[] = [];
    const terms = new Set<number>();
    const origs = new Set<string>();
    for (const q of shuffle(pool.filter((x) => x.era === era), rand)) {
      if (terms.has(q.term) || origs.has(q.orig)) continue;
      terms.add(q.term);
      origs.add(q.orig);
      out.push(q);
      if (out.length === n) return out;
    }
  }
  return null;
}

// 3文正誤：①②③ のそれぞれに正／誤。正文の数は0〜3のどれも出る
export function makeThreeTf(pool: SQ[], rand: Rand): Sentence[] | null {
  const qs = pickSameEra(pool, THREE_TF_SIZE, rand);
  if (!qs) return null;
  const correct = Math.floor(rand() * (THREE_TF_SIZE + 1));
  return shuffle(
    qs.map((q, i) => sentenceOf(q, i >= correct)),
    rand,
  );
}

// 複数選択：同じ時代の5文。基本は正文がちょうど2つ、発展は1〜4つ
export function makeMulti(pool: SQ[], level: Level, rand: Rand): Sentence[] | null {
  const qs = pickSameEra(pool, MULTI_SIZE, rand);
  if (!qs) return null;
  const correct = level === "basic" ? MULTI_BASIC_CORRECT : 1 + Math.floor(rand() * (MULTI_SIZE - 1));
  return shuffle(
    qs.map((q, i) => sentenceOf(q, i >= correct)),
    rand,
  );
}

// ---------- 組合せ（1つの文に空欄が2つあった問題） ----------

// 同じ元問題IDで、空欄に正解を入れた文が同じになる2問（＝もとは1つの文の2つの空欄）
export type ComboPair = { a: SQ; b: SQ; text: [string, string, string] };

// 2つの文の空欄の位置から、空欄が2つの文を作る：[空欄1の前, 空欄1と2の間, 空欄2のあと]（a が前の空欄）
function twoBlanks(x: SQ, y: SQ): ComboPair | null {
  const full = x.text.replace(BLANK, x.answer);
  if (full !== y.text.replace(BLANK, y.answer)) return null;
  const px = x.text.indexOf(BLANK);
  const py = y.text.indexOf(BLANK);
  const [a, b, pa, pb] = px < py ? [x, y, px, py] : [y, x, py, px];
  // 空欄より前は文全体と同じなので、空欄の位置はそのまま文全体の中での位置になる
  const startB = pb;
  const endA = pa + a.answer.length;
  if (startB < endA) return null; // 空欄が重なる
  return { a, b, text: [full.slice(0, pa), full.slice(endA, startB), full.slice(startB + b.answer.length)] };
}

export function comboPairs(questions: SQ[]): ComboPair[] {
  const groups = new Map<string, SQ[]>();
  for (const q of questions) {
    const k = `${q.orig}|${q.text.replace(BLANK, q.answer)}`;
    groups.set(k, [...(groups.get(k) ?? []), q]);
  }
  return [...groups.values()].filter((g) => g.length === 2).map(([x, y]) => twoBlanks(x, y)).filter((p): p is ComboPair => !!p);
}

// 4択：「正解＋正解」「正解＋誤答」「誤答＋正解」「誤答＋誤答」（誤答はそれぞれの問題の誤答1〜3から）
// 誤答は、もう一方の空欄の正解と同じ語・2つの空欄で同じ語にならないものを選ぶ（「長崎・長崎」のような組を作らない）
export function makeCombo(pair: ComboPair, rand: Rand): { choices: [string, string][]; answer: [string, string] } {
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  const prefer = (list: string[], avoid: string[]) => {
    const ok = list.filter((w) => !avoid.includes(w));
    return pick(ok.length ? ok : list);
  };
  const wa = prefer(pair.a.wrongs, [pair.b.answer]);
  const wb = prefer(pair.b.wrongs, [pair.a.answer, wa]);
  const answer: [string, string] = [pair.a.answer, pair.b.answer];
  return { answer, choices: shuffle([answer, [pair.a.answer, wb], [wa, pair.b.answer], [wa, wb]] as [string, string][], rand) };
}
