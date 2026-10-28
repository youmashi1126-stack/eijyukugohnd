// 日本史一問一答のサーバー用の索引（data/jhist/index.ts を最初に使うときに解析して保持する）
import { JHIST_QUESTIONS, JHIST_SECTIONS, JHIST_TERMS } from "@/data/jhist";

export type Importance = "S" | "A" | "B";
// reading：読み（かな）を問う問題（入力記述でカタカナとひらがなを区別する）
export type JQuestion = { id: string; term: number; era: number; imp: Importance; section: number; answer: string; alts: string[]; reading: boolean };
// questions：その用語の問題（問題ID順）、order：新出で出す順（最初に出てくるセクション → 問題ID の順）
export type JTerm = { id: string; imp: Importance; era: number; questions: string[]; section: number; order: number };
export type JSection = { no: number; key: string; name: string; era: number; ids: string[] };

type Index = {
  questions: JQuestion[];
  byId: Map<string, JQuestion>;
  terms: JTerm[];
  sections: JSection[];
  sectionByKey: Map<string, JSection>;
  // 正解の語 → その語が正解の用語の番号（取り違えの判定に使う）
  termByAnswer: Map<string, number>;
};

let cache: Index | null = null;

export function jhistIndex(): Index {
  if (cache) return cache;
  const questions = JHIST_QUESTIONS.split("\n").map((line) => {
    const [id, term, era, imp, section, answer, alts, reading] = line.split("|");
    return {
      id,
      term: Number(term),
      era: Number(era),
      imp: imp as Importance,
      section: Number(section),
      answer,
      alts: alts ? alts.split("、").map((s) => s.trim()).filter(Boolean) : [],
      reading: reading === "r",
    };
  });
  const terms: JTerm[] = JHIST_TERMS.split("\n").map((line) => {
    const [id, imp, era] = line.split("|");
    return { id, imp: imp as Importance, era: Number(era), questions: [] as string[], section: Infinity, order: 0 };
  });
  for (const q of questions) {
    const t = terms[q.term];
    t.questions.push(q.id);
    t.section = Math.min(t.section, q.section);
  }
  // 新出の順：節の順（いちばん早く出てくるセクション）、同じセクションなら最初の問題ID順
  [...terms]
    .sort((a, b) => a.section - b.section || a.questions[0].localeCompare(b.questions[0]))
    .forEach((t, i) => (t.order = i));
  const sections = JHIST_SECTIONS.split("\n").map((line, i) => {
    const [key, name, era, ids] = line.split("|");
    return { no: i + 1, key, name, era: Number(era), ids: ids.split(",") };
  });
  cache = {
    questions,
    byId: new Map(questions.map((q) => [q.id, q])),
    terms,
    sections,
    sectionByKey: new Map(sections.map((s) => [s.key, s])),
    termByAnswer: new Map(questions.map((q) => [q.answer, q.term])),
  };
  return cache;
}
