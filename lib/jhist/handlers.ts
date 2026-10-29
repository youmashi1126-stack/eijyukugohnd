// 日本史・世界史の API の中身（app/api/jhist/〜 と app/api/whist/〜 の route.ts から、科目を付けて呼ぶ）
import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { isDateString } from "@/lib/study";
import { jstDate } from "@/lib/types";
import { CONFUSION_TOP, SESSION_SIZE } from "./constants";
import { histIndex } from "./data";
import { buildQueue, dailyFor, eraStats, toTermStates } from "./plan";
import { IMPS, settingsOf, testAverage, toProfile } from "./profile";
import { isChronoAnswer, isSubmittedAnswer, recordChrono, recordDrill, recordExam, recordPractice, recordTest, recordToday, reportQuestion, startTest } from "./record";
import { statusOf } from "./status";
import type { HistKey } from "./subject";

const NO_SESSION = { error: "個人用のURLから開き直してください" };
const NO_USER = { error: "まだニックネームが登録されていません" };

// 自分の状況（節別の練習の最高点、設定、今日のノルマ、連続日数、定着の数）
export async function statusGET(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const profile = toProfile(rawProfile);
  return NextResponse.json({ practice: profile.practice, today: jstDate(), ...statusOf(profile, toTermStates(rawTerms), jstDate(), histIndex(key)) });
}

// 回答の送信。source：practice（節別の練習）／today（今日の学習。数問ずつまとめて送る）／test（実力テスト）
// confusion（取り違えやすい語の特訓）／chrono（年代チャレンジ。items で送る）／exam（入試形式トレーニング）
// 採点はサーバーでやり直し、記録するのはログインしている本人の番号だけ
export async function answersPOST(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  if (!(await getStore().hasUser(number))) return NextResponse.json(NO_USER, { status: 400 });
  const body = await req.json().catch(() => null);
  if (body?.source === "chrono") {
    const items = Array.isArray(body.items) && body.items.every(isChronoAnswer) ? body.items : null;
    if (!items) return NextResponse.json({ error: "解答データが正しくありません" }, { status: 400 });
    const result = await recordChrono(number, typeof body.attemptId === "string" ? body.attemptId.slice(0, 64) : "", items, key);
    return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
  }
  const answers = Array.isArray(body?.answers) && body.answers.every(isSubmittedAnswer) ? body.answers : null;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.slice(0, 64) : "";
  if (!answers) return NextResponse.json({ error: "解答データが正しくありません" }, { status: 400 });
  const result =
    body.source === "practice" && typeof body.section === "string"
      ? await recordPractice(number, body.section, attemptId, answers, key)
      : body.source === "test" && typeof body.testId === "string"
        ? await recordTest(number, body.testId, answers, key)
        : body.source === "exam"
          ? await recordExam(number, attemptId, answers, key)
          : body.source === "confusion"
            ? await recordDrill(number, attemptId, answers, key)
            : body.source === "today"
              ? await recordToday(number, attemptId, answers, key)
              : { error: "不明な操作です" };
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}

// 自分が取り違えた組（正解の用語ID・選んだ誤答）の上位10組（回数の多い順）
export async function confusionsGET(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  const list = await getStore().getJhistConfusions(number, key);
  return NextResponse.json({ pairs: [...list].sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, CONFUSION_TOP) });
}

// 入試形式トレーニング用：学習済み（段階1以上）の用語の番号と、設定（難易度・記述の採点方法）
export async function learnedGET(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const learned = [...toTermStates(rawTerms)].filter(([, st]) => st.s >= 1).map(([i]) => i);
  return NextResponse.json({ learned, settings: settingsOf(toProfile(rawProfile), jstDate()) });
}

// ランキング：実力テスト（全範囲）の平均点と、定着語数（段階4以上の用語の数。重要度を問わず数える）
// マイページでそのコーナーを「見せない」にした人は、本人以外には返さない
export async function rankingGET(req: Request, key: HistKey) {
  const me = await sessionNumber(req);
  if (me === null) return NextResponse.json(NO_SESSION, { status: 401 });
  const store = getStore();
  const ix = histIndex(key);
  const [users, profiles] = await Promise.all([store.getUsers(), store.getJhistProfiles(key)]);
  const today = jstDate();
  const players = users
    .filter((u) => u.number === me || !u.hidden?.includes(key))
    .map((u) => {
      const p = toProfile(profiles[u.number]);
      const settings = settingsOf(p, today);
      const fixedAll = (p.summary?.fixed ?? []).reduce((a, r) => a + IMPS.reduce((b, _, i) => b + (r[i] ?? 0), 0), 0);
      const eras = eraStats(p.summary, settings.goal, ix.eras.length, ix.terms);
      return {
        number: u.number,
        nickname: u.nickname,
        count: p.tests.count,
        average: testAverage(p.tests),
        best: p.tests.best,
        lastAt: p.tests.lastAt,
        fixed: fixedAll,
        // 自分の目標の対象用語のうち定着した割合
        targetFixed: eras.reduce((a, e) => a + e.fixed, 0),
        target: eras.reduce((a, e) => a + e.target, 0),
      };
    })
    .sort((a, b) => a.number - b.number);
  return NextResponse.json({ players, me });
}

// 「問題がおかしい」報告：問題ID・生徒番号・自由記述（任意・100字まで）・日時を保存する
export async function reportPOST(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  if (!(await getStore().hasUser(number))) return NextResponse.json(NO_USER, { status: 400 });
  const body = await req.json().catch(() => null);
  if (typeof body?.qid !== "string") return NextResponse.json({ error: "問題が見つかりません" }, { status: 400 });
  const result = await reportQuestion(number, body.qid, typeof body.text === "string" ? body.text : "", key);
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}

// 設定（入試日と目標）。目標で変わるのは、対象用語と、記述の採点方法・入試形式トレーニングの難易度の初期値だけ
// その日のノルマは、次の日から新しい設定で決まる
export async function settingsPOST(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  const store = getStore();
  if (!(await store.hasUser(number))) return NextResponse.json(NO_USER, { status: 400 });
  const body = await req.json().catch(() => null);
  const today = jstDate();
  const profile = toProfile(await store.getJhistProfile(number, key));
  const cur = settingsOf(profile, today);
  // 送られてきた項目だけを変える（入試形式トレーニングの難易度だけ、なども変えられる）
  const examDate = body?.examDate ?? cur.examDate;
  const goal = body?.goal ?? cur.goal;
  if (!isDateString(examDate) || (body?.examDate !== undefined && examDate <= today)) {
    return NextResponse.json({ error: "入試日は明日以降の日付にしてください" }, { status: 400 });
  }
  if (goal !== "std" && goal !== "adv") return NextResponse.json({ error: "目標を選んでください" }, { status: 400 });
  if (body?.writeMode !== undefined && body.writeMode !== "self" && body.writeMode !== "input") return NextResponse.json({ error: "記述の採点方法を選んでください" }, { status: 400 });
  if (body?.examLevel !== undefined && body.examLevel !== "basic" && body.examLevel !== "adv") return NextResponse.json({ error: "難易度を選んでください" }, { status: 400 });
  const prev = profile.settings;
  const settings = {
    examDate: examDate as string,
    goal: goal as "std" | "adv",
    // 入試日・目標を送ったときだけ「設定した」にする（難易度だけを変えたときは初回の設定画面を残す）
    set: body?.examDate !== undefined || body?.goal !== undefined ? true : (prev?.set ?? false),
    ...((body?.writeMode ?? prev?.writeMode) ? { writeMode: body?.writeMode ?? prev?.writeMode } : {}),
    ...((body?.examLevel ?? prev?.examLevel) ? { examLevel: body?.examLevel ?? prev?.examLevel } : {}),
  };
  // 今日のノルマをまだ始めていなければ、新しい設定で決め直す
  const daily = profile.daily && profile.daily.date === today && profile.daily.terms.length === 0 ? null : profile.daily;
  await store.saveJhist(number, { profile: { ...profile, settings, daily } }, key);
  return NextResponse.json({ settings: settingsOf({ ...profile, settings }, today) });
}

// 実力テストを始める：era（時代の番号。全範囲は null）、level（std：日東駒専・GMARCH／adv：早慶上智）
export async function testPOST(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  if (!(await getStore().hasUser(number))) return NextResponse.json(NO_USER, { status: 400 });
  const body = await req.json().catch(() => null);
  const era = body?.era === null || body?.era === undefined ? null : Number(body.era);
  if (era !== null && !(Number.isInteger(era) && era >= 0 && era < histIndex(key).eras.length)) {
    return NextResponse.json({ error: "時代の選び方が正しくありません" }, { status: 400 });
  }
  const level = body?.level === "adv" ? "adv" : "std";
  return NextResponse.json(await startTest(number, era, level, key));
}

// 今日の学習：次のセッションの問題（約20問）と、今日のノルマ。exclude はこのセッションですでに出した用語の番号
// 日が変わって最初に開いたときに、その日のノルマを決めて保存する
export async function todayGET(req: Request, key: HistKey) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(NO_SESSION, { status: 401 });
  const store = getStore();
  const ix = histIndex(key);
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number, key), store.getJhistTerms(number, key)]);
  const profile = toProfile(rawProfile);
  const states = toTermStates(rawTerms);
  const today = jstDate();
  const settings = settingsOf(profile, today);
  const daily = dailyFor(profile.daily, settings, states, today, ix.terms);
  if (daily !== profile.daily && (await store.hasUser(number))) await store.saveJhist(number, { profile: { ...profile, daily } }, key);
  const exclude = new Set(
    (new URL(req.url).searchParams.get("exclude") ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number),
  );
  const items = buildQueue(states, daily, settings, today, SESSION_SIZE, exclude, Math.random, ix.terms);
  return NextResponse.json({ items, today, ...statusOf({ ...profile, daily }, states, today, ix) });
}
