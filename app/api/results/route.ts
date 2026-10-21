import { NextResponse } from "next/server";
import { getIdiom, isCorrect, QUESTION_COUNT, REVIEW_MAX } from "@/lib/idioms";
import { getStore } from "@/lib/store";
import {
  isValidNumber,
  isValidSection,
  sectionRange,
  SECTION_SIZE,
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

  if (!isValidNumber(number)) {
    return NextResponse.json({ error: "番号が正しくありません" }, { status: 400 });
  }
  if (mode === "practice" && !isValidSection(section)) {
    return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
  }
  const store = getStore();
  const users = await store.getUsers();
  if (!users.some((u) => u.number === number)) {
    return NextResponse.json({ error: "未登録の番号です" }, { status: 404 });
  }

  const ids = new Set(answers.map((a) => a?.id));
  let countOk: boolean;
  if (mode === "review") countOk = answers.length >= 1 && answers.length <= REVIEW_MAX;
  else if (mode === "practice") {
    const [from, to] = sectionRange(section);
    countOk = answers.length === SECTION_SIZE && answers.every((a) => a?.id >= from && a?.id <= to);
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

  // 間違えた問題は復習リストへ、正解した問題はリストから外す
  await store.updateWrong(
    number,
    details.filter((d) => !d.correct).map((d) => d.id),
    details.filter((d) => d.correct).map((d) => d.id),
  );

  let newBest = false;
  if (mode === "test") {
    // ランキングに入るのは本番テストのみ
    await store.addResult(number, { score, at: new Date().toISOString(), durationSec });
  } else if (mode === "practice") {
    newBest = await store.setPracticeBest(number, section, score);
  }
  const best = mode === "practice" ? (await store.getPractice([number]))[number][section] : undefined;
  const remaining = (await store.getWrong(number)).length;
  return NextResponse.json({ score, total: answers.length, details, remaining, newBest, best });
}
