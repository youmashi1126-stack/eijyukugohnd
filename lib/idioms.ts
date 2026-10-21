import raw from "@/data/idioms.json";
import type { Question } from "./types";

export type Idiom = { id: number; phrase: string; meaning: string };

export const idioms = raw as Idiom[];
const byId = new Map(idioms.map((i) => [i.id, i]));

export const QUESTION_COUNT = 100;
export const REVIEW_MAX = 50;

export function getIdiom(id: number): Idiom | undefined {
  return byId.get(id);
}

// 「①～ ②～」形式の意味を語義ごとに分ける（朝学習のテストと同じく選択肢には1つの語義だけを出す）
export function senses(meaning: string): string[] {
  const parts = meaning
    .split(/[①②③④⑤⑥⑦⑧⑨⑩]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [meaning.trim()];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 1000問（復習なら間違えた問題）からランダムに選び、正解1つ＋他の熟語の意味2つの3択を作る
export function generateTest(fromIds?: number[]): Question[] {
  const pool = fromIds ? fromIds.map((id) => byId.get(id)).filter((i): i is Idiom => !!i) : idioms;
  const chosen = shuffle(pool).slice(0, fromIds ? REVIEW_MAX : QUESTION_COUNT);
  return chosen.map((idiom) => {
    const own = senses(idiom.meaning);
    const correct = pick(own);
    const distractors: string[] = [];
    while (distractors.length < 2) {
      const other = pick(idioms);
      if (other.id === idiom.id) continue;
      const s = pick(senses(other.meaning));
      if (own.includes(s) || distractors.includes(s)) continue;
      distractors.push(s);
    }
    const choices = shuffle([correct, ...distractors]);
    return { id: idiom.id, phrase: idiom.phrase, choices, answer: choices.indexOf(correct) };
  });
}

// 選んだ語義がその熟語の語義のどれかに一致すれば正解（誤答の選択肢は正解の語義と重ならないよう作っている）
export function isCorrect(id: number, choice: string | null): boolean {
  const idiom = byId.get(id);
  if (!idiom || choice === null) return false;
  return senses(idiom.meaning).includes(choice);
}
