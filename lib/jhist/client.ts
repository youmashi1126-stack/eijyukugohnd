"use client";
// 日本史一問一答の画面用データ（public/jhist/data-*.json）。一度読んだら、ページを移っても使い回す
import { useEffect, useState } from "react";
import { JHIST_DATA_URL } from "@/data/jhist/meta";

export const BLANK = "（　　）";

export type CQuestion = {
  id: string;
  orig: string; // 元問題ID
  text: string; // 問題文（空欄「（　　）」を1つ含む）
  answer: string;
  wrongs: [string, string, string]; // 誤答1〜3
  alts: string[]; // 別解
  era: number;
  imp: "S" | "A" | "B";
  type: string; // 用語タイプ
  term: number; // 用語の番号
  section: number; // セクションの番号（0から）
  reading: string;
};
export type CSection = { no: number; key: string; name: string; chapter: number; era: number; nodes: number[]; ids: string[] };
export type CChrono = { year: number; event: string; type: string; era: number; imp: string; qid: string };
export type JData = {
  eras: string[];
  sections: CSection[];
  terms: { id: string; term: string; imp: string }[];
  questions: CQuestion[];
  byId: Map<string, CQuestion>;
  // 用語の番号 → その用語の問題ID（問題ID順）
  termQuestions: string[][];
  chrono: CChrono[];
};

type Raw = {
  eras: string[];
  types: string[];
  sections: CSection[];
  terms: [string, string, string][];
  q: [string, string, string, string, string, string, string, string, number, "S" | "A" | "B", number, number, number, string][];
  chrono: [number, string, string, number, string, string][];
};

function build(raw: Raw): JData {
  const questions = raw.q.map(([id, orig, text, answer, w1, w2, w3, alts, era, imp, type, term, section, reading]) => ({
    id,
    orig,
    text,
    answer,
    wrongs: [w1, w2, w3] as [string, string, string],
    alts: alts ? alts.split("、").map((s) => s.trim()).filter(Boolean) : [],
    era,
    imp,
    type: raw.types[type],
    term,
    section,
    reading,
  }));
  const termQuestions: string[][] = raw.terms.map(() => []);
  for (const q of questions) termQuestions[q.term].push(q.id);
  return {
    termQuestions,
    eras: raw.eras,
    sections: raw.sections,
    terms: raw.terms.map(([id, term, imp]) => ({ id, term, imp })),
    questions,
    byId: new Map(questions.map((q) => [q.id, q])),
    chrono: raw.chrono.map(([year, event, type, era, imp, qid]) => ({ year, event, type, era, imp, qid })),
  };
}

let loaded: JData | null = null;
let loading: Promise<JData> | null = null;

export function loadJhistData(): Promise<JData> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= fetch(JHIST_DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error("load failed");
      return r.json();
    })
    .then((raw: Raw) => (loaded = build(raw)))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function useJhistData(): { data: JData | null; error: boolean } {
  const [data, setData] = useState<JData | null>(loaded);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (data) return;
    let alive = true;
    loadJhistData()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [data]);
  return { data, error };
}

// 空欄に語を入れた文（正文・誤文）
export function fill(q: CQuestion, word: string) {
  return q.text.replace(BLANK, word);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
