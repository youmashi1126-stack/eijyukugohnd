// 日本史：送られてきた回答をサーバーで採点し、記録をまとめて保存する
import { getStore, type JhistAnswerStat } from "../store";
import { KEEP_ATTEMPTS, PRACTICE_COUNT } from "./constants";
import { jhistIndex, type JQuestion } from "./data";
import { markOf, toProfile, type JhistProfile } from "./profile";

// 回答：問題ID、選んだ語（時間切れは null）、かかった秒数
export type SubmittedAnswer = { qid: string; chosen: string | null; sec: number };

export function isSubmittedAnswer(v: unknown): v is SubmittedAnswer {
  const a = v as SubmittedAnswer;
  return !!a && typeof a.qid === "string" && (a.chosen === null || typeof a.chosen === "string") && typeof a.sec === "number" && a.sec >= 0;
}

// 4択の採点：選んだ語が正解と同じか
export function isChoiceCorrect(q: JQuestion, chosen: string | null) {
  return chosen !== null && chosen === q.answer;
}

// 間違えて選んだ語が、ほかの用語の正解になっていれば「取り違え」（正解の用語ID・選んだ語）
export function confusionOf(q: JQuestion, chosen: string | null): { term: string; wrong: string } | null {
  if (chosen === null || chosen === q.answer) return null;
  const idx = jhistIndex();
  const other = idx.termByAnswer.get(chosen);
  return other === undefined || other === q.term ? null : { term: idx.terms[q.term].id, wrong: chosen };
}

export type PracticeResult = { score: number; total: number; best: [number, number]; newBest: boolean; mark: string; duplicate: boolean };

// 節別の練習の結果を保存する。出題はそのセクションの問題から（15問、セクションが15問未満なら全問）
export async function recordPractice(number: number, sectionKey: string, attemptId: string, answers: SubmittedAnswer[]): Promise<PracticeResult | { error: string }> {
  const idx = jhistIndex();
  const section = idx.sectionByKey.get(sectionKey);
  if (!section) return { error: "セクションが見つかりません" };
  const inSection = new Set(section.ids);
  const ids = answers.map((a) => a.qid);
  if (answers.length !== Math.min(PRACTICE_COUNT, section.ids.length) || new Set(ids).size !== ids.length || !ids.every((id) => inSection.has(id))) {
    return { error: "解答データが正しくありません" };
  }
  const store = getStore();
  const profile: JhistProfile = toProfile(await store.getJhistProfile(number));
  const score = answers.filter((a) => isChoiceCorrect(idx.byId.get(a.qid)!, a.chosen)).length;
  const total = answers.length;
  const prev = profile.practice[sectionKey];
  if (attemptId && profile.attempts.includes(attemptId)) {
    return { score, total, best: prev ?? [score, total], newBest: false, mark: markOf(prev), duplicate: true };
  }
  const newBest = !prev || score / total > prev[0] / prev[1];
  const best: [number, number] = newBest ? [score, total] : prev;
  const next: JhistProfile = {
    ...profile,
    practice: { ...profile.practice, [sectionKey]: best },
    attempts: attemptId ? [...profile.attempts, attemptId].slice(-KEEP_ATTEMPTS) : profile.attempts,
  };
  const stats: JhistAnswerStat[] = [];
  const confusions: { term: string; wrong: string }[] = [];
  const entries = answers.map((a) => {
    const q = idx.byId.get(a.qid)!;
    const ok = isChoiceCorrect(q, a.chosen);
    stats.push({ qid: q.id, ok, wrong: ok ? undefined : (a.chosen ?? undefined) });
    const c = ok ? null : confusionOf(q, a.chosen);
    if (c) confusions.push(c);
    // [問題ID, 用語ID, 形式, ○×, 秒数, 選んだ語]
    return [q.id, idx.terms[q.term].id, "4", ok ? "o" : "x", Math.round(a.sec * 10) / 10, ok ? "" : (a.chosen ?? "")];
  });
  await store.saveJhist(number, { profile: next, log: { source: "practice", entries }, stats, confusions });
  return { score, total, best, newBest, mark: markOf(best), duplicate: false };
}
