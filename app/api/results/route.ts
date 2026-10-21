import { NextResponse } from "next/server";
import { getIdiom, isCorrect, QUESTION_COUNT } from "@/lib/idioms";
import { getStore } from "@/lib/store";
import {
  isValidNumber,
  isValidSection,
  PRACTICE_QUESTION_COUNT,
  REVIEW_COUNT,
  sectionRange,
  type Answer,
  type DetailItem,
  type Mode,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const number = body?.number;
  const mode: Mode = body?.mode === "review" || body?.mode === "practice" ? body.mode : "test";
  const section = body?.section;
  const answers: Answer[] = Array.isArray(body?.answers) ? body.answers : [];
  const durationSec = Number.isFinite(body?.durationSec) ? Math.max(0, Math.round(body.durationSec)) : 0;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.slice(0, 64) : undefined;

  if (!isValidNumber(number)) {
    return NextResponse.json({ error: "番号が正しくありません" }, { status: 400 });
  }
  if (mode === "practice" && !isValidSection(section)) {
    return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
  }
  const store = getStore();
  if (!(await store.hasUser(number))) {
    return NextResponse.json({ error: "未登録の番号です" }, { status: 404 });
  }

  const ids = new Set(answers.map((a) => a?.id));
  let countOk: boolean;
  if (mode === "review") countOk = answers.length >= 1 && answers.length <= REVIEW_COUNT;
  else if (mode === "practice") {
    const [from, to] = sectionRange(section);
    countOk = answers.length === PRACTICE_QUESTION_COUNT && answers.every((a) => a?.id >= from && a?.id <= to);
  } else countOk = answers.length === QUESTION_COUNT;
  const valid =
    countOk &&
    ids.size === answers.length &&
    answers.every((a) => getIdiom(a.id) && (a.choice === null || typeof a.choice === "string"));
  if (!valid) {
    return NextResponse.json({ error: "解答データが正しくありません" }, { status: 400 });
  }

  const details: DetailItem[] = answers.map((a) => {
    const idiom = getIdiom(a.id)!;
    return { id: a.id, phrase: idiom.phrase, chosen: a.choice, meaning: idiom.meaning, correct: isCorrect(a.id, a.choice) };
  });
  const score = details.filter((d) => d.correct).length;

  // 答えて間違えた問題は復習リストへ（時間切れ・未回答は入れない）。
  // 復習コーナーで正解した問題は正解回数を増やし、2回でリストから外す。ランキングに入るのは本番テストのみ
  const { remaining, best, newBest, reviewProgress } = await store.record(number, {
    attemptId,
    wrongAdd: details.filter((d) => !d.correct && d.chosen !== null).map((d) => d.id),
    reviewCorrect: mode === "review" ? details.filter((d) => d.correct).map((d) => d.id) : [],
    result: mode === "test" ? { score, at: new Date().toISOString(), durationSec, attemptId } : undefined,
    practice: mode === "practice" ? { section, score } : undefined,
  });
  return NextResponse.json({ score, total: answers.length, details, remaining, newBest, best, reviewProgress });
}
