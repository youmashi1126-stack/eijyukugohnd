import { NextResponse } from "next/server";
import { getIdiom, isCorrect, QUESTION_COUNT } from "@/lib/idioms";
import { getStore } from "@/lib/store";
import { isValidNumber, type Answer, type ReviewItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const number = body?.number;
  const answers: Answer[] = Array.isArray(body?.answers) ? body.answers : [];
  const durationSec = Number.isFinite(body?.durationSec) ? Math.max(0, Math.round(body.durationSec)) : 0;

  if (!isValidNumber(number)) {
    return NextResponse.json({ error: "番号が正しくありません" }, { status: 400 });
  }
  const store = getStore();
  const users = await store.getUsers();
  if (!users.some((u) => u.number === number)) {
    return NextResponse.json({ error: "未登録の番号です" }, { status: 404 });
  }

  const ids = new Set(answers.map((a) => a?.id));
  const valid =
    answers.length === QUESTION_COUNT &&
    ids.size === QUESTION_COUNT &&
    answers.every((a) => getIdiom(a.id) && (a.choice === null || typeof a.choice === "string"));
  if (!valid) {
    return NextResponse.json({ error: "解答データが正しくありません" }, { status: 400 });
  }

  const review: ReviewItem[] = [];
  let score = 0;
  for (const a of answers) {
    if (isCorrect(a.id, a.choice)) {
      score++;
    } else {
      const idiom = getIdiom(a.id)!;
      review.push({ id: a.id, phrase: idiom.phrase, chosen: a.choice, meaning: idiom.meaning });
    }
  }

  await store.addResult(number, { score, at: new Date().toISOString(), durationSec });
  return NextResponse.json({ score, review });
}
