import idiomRaw from "@/data/idioms.json";
import { WORDS_1 } from "@/data/words1";
import { WORDS_2 } from "@/data/words2";
import { WORDS_3 } from "@/data/words3";
import { JHS } from "@/data/jhs";
import { getExample } from "./examples";
import { SETS, type SetId } from "./sets";
import { SECTION_SIZE, type Question } from "./types";

// 出題データ（英熟語・英単語）を同じ形で扱う
export type Item = { id: string; phrase: string; meaning: string };

type Dataset = {
  items: Item[];
  get(id: string): Item | undefined;
  makeQuestion(item: Item): Question;
  isCorrect(id: string, choice: string | null): boolean;
  example(id: string): [string, string] | undefined;
};

export const QUESTION_COUNT = 100;

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

// ---------- 英熟語：正解1つ＋他の熟語の意味2つで3択を作る ----------

// 「①～ ②～」形式の意味を語義ごとに分ける（朝学習のテストと同じく選択肢には1つの語義だけを出す）
function senses(meaning: string): string[] {
  const parts = meaning
    .split(/[①②③④⑤⑥⑦⑧⑨⑩]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [meaning.trim()];
}

function idiomDataset(): Dataset {
  const items: Item[] = (idiomRaw as { id: number; phrase: string; meaning: string }[]).map((i) => ({
    id: String(i.id),
    phrase: i.phrase,
    meaning: i.meaning,
  }));
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    items,
    get: (id) => byId.get(id),
    makeQuestion(item) {
      const own = senses(item.meaning);
      const correct = pick(own);
      const distractors: string[] = [];
      while (distractors.length < 2) {
        const other = pick(items);
        if (other.id === item.id) continue;
        const s = pick(senses(other.meaning));
        if (own.includes(s) || distractors.includes(s)) continue;
        distractors.push(s);
      }
      const choices = shuffle([correct, ...distractors]);
      return { id: item.id, phrase: item.phrase, choices, answer: choices.indexOf(correct) };
    },
    // 選んだ語義がその熟語の語義のどれかに一致すれば正解（誤答の選択肢は正解の語義と重ならないよう作っている）
    isCorrect(id, choice) {
      const item = byId.get(id);
      return !!item && choice !== null && senses(item.meaning).includes(choice);
    },
    example: (id) => getExample(Number(id)),
  };
}

// ---------- 英単語・中学英語：データにある3択をそのまま使う（並び順だけ毎回シャッフル） ----------

function choiceDataset(parts: string[]): Dataset {
  const rows = parts
    .join("\n")
    .trim()
    .split("\n")
    .map((line) => {
      const [id, word, c1, c2, c3, ans] = line.split("|");
      const choices = [c1, c2, c3];
      return { id, word, choices, correct: choices[Number(ans) - 1] };
    });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: Item[] = rows.map((r) => ({ id: r.id, phrase: r.word, meaning: r.correct }));
  const itemById = new Map(items.map((i) => [i.id, i]));
  return {
    items,
    get: (id) => itemById.get(id),
    makeQuestion(item) {
      const row = byId.get(item.id)!;
      const choices = shuffle(row.choices);
      return { id: item.id, phrase: item.phrase, choices, answer: choices.indexOf(row.correct) };
    },
    isCorrect(id, choice) {
      return choice !== null && byId.get(id)?.correct === choice;
    },
    example: () => undefined,
  };
}

const cache: Partial<Record<SetId, Dataset>> = {};

export function dataset(set: SetId): Dataset {
  return (cache[set] ??=
    set === "word" ? choiceDataset([WORDS_1, WORDS_2, WORDS_3]) : set === "jhs" ? choiceDataset([JHS]) : idiomDataset());
}

// 練習モードのセクション（データの並び順に50問ずつ。最後のセクションは残りすべて）
export function sectionItems(set: SetId, section: number): Item[] {
  const end = section === SETS[set].sections ? undefined : section * SECTION_SIZE;
  return dataset(set).items.slice((section - 1) * SECTION_SIZE, end);
}

// 全問（復習・練習なら指定した問題）からランダムに limit 問を選んで3択問題にする
export function generateTest(set: SetId, fromIds?: string[], limit = QUESTION_COUNT): Question[] {
  const ds = dataset(set);
  const pool = fromIds ? fromIds.map((id) => ds.get(id)).filter((i): i is Item => !!i) : ds.items;
  return shuffle(pool)
    .slice(0, limit)
    .map((item) => ds.makeQuestion(item));
}
