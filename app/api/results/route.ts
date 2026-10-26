import { NextResponse } from "next/server";
import { dataset, QUESTION_COUNT, sectionItems } from "@/lib/datasets";
import { parseSet } from "@/lib/sets";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";
import {
  isValidSection,
  PRACTICE_QUESTION_COUNT,
  REVIEW_COUNT,
  type Answer,
  type DetailItem,
  type Mode,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const set = parseSet(body?.set);
  // 記録するのはログインしている本人の番号だけ（送られてきた番号は使わない）
  const number = await sessionNumber(req);
  const mode: Mode = body?.mode === "review" || body?.mode === "practice" ? body.mode : "test";
  const section = body?.section;
  const answers: Answer[] = Array.isArray(body?.answers)
    ? body.answers.map((a: { id: unknown; choice: unknown }) => ({ id: String(a?.id), choice: a?.choice }))
    : [];
  const durationSec = Number.isFinite(body?.durationSec) ? Math.max(0, Math.round(body.durationSec)) : 0;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.slice(0, 64) : undefined;
  const ds = dataset(set);

  if (number === null) {
    return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  }
  if (mode === "practice" && !isValidSection(section, set)) {
    return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
  }
  const store = getStore();
  if (!(await store.hasUser(number))) {
    return NextResponse.json({ error: "未登録の番号です" }, { status: 404 });
  }

  const ids = new Set(answers.map((a) => a.id));
  let countOk: boolean;
  if (mode === "review") countOk = answers.length >= 1 && answers.length <= REVIEW_COUNT;
  else if (mode === "practice") {
    const inSection = new Set(sectionItems(set, section).map((i) => i.id));
    countOk = answers.length === PRACTICE_QUESTION_COUNT && answers.every((a) => inSection.has(a.id));
  } else countOk = answers.length === QUESTION_COUNT;
  const valid =
    countOk &&
    ids.size === answers.length &&
    answers.every((a) => ds.get(a.id) && (a.choice === null || typeof a.choice === "string"));
  if (!valid) {
    return NextResponse.json({ error: "解答データが正しくありません" }, { status: 400 });
  }

  const details: DetailItem[] = answers.map((a) => {
    const item = ds.get(a.id)!;
    return { id: a.id, phrase: item.phrase, chosen: a.choice, meaning: item.meaning, correct: ds.isCorrect(a.id, a.choice) };
  });
  const score = details.filter((d) => d.correct).length;

  // 習熟ポイントの反映。正解で加算、不正解で0に戻して要復習。
  // 練習の時間切れは不正解として扱い、本番テストで時間内に出題されなかった問題（未回答）は対象外
  const outcomes = details
    .filter((d) => mode !== "test" || d.chosen !== null)
    .map((d) => ({ id: d.id, correct: d.correct }));
  const { remaining, mastered, best, newBest, progress } = await store.record(number, set, {
    attemptId,
    source: mode,
    outcomes,
    // ランキングに入るのは本番テストのみ
    result: mode === "test" ? { score, at: new Date().toISOString(), durationSec, attemptId } : undefined,
    practice: mode === "practice" ? { section, score } : undefined,
  });
  return NextResponse.json({ score, total: answers.length, details, remaining, mastered, newBest, best, progress });
}
