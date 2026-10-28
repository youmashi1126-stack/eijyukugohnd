// 日本史：今日の学習の組み立て（新出数・重要度の解放・ノルマ・出題順）。サーバーで使う
import { FIXED_HISTORY_DAYS, FIXED_STAGE, NEW_PER_DAY_MAX, NEW_PER_DAY_MIN, PACE_DAYS, REVIEW_ONLY_DAYS, UNLOCK_RATE, UNLOCK_STAGE } from "./constants";
import { jhistIndex, type JTerm } from "./data";
import { GOALS, IMPS, type Daily, type Goal, type Imp, type JhistSettings, type JhistSummary } from "./profile";
import { dateOf, dayNumber, formatOf, type Format, type TermState } from "./srs";

// 用語の番号 → 状態（記録のない用語は未学習＝段階0）
export type TermStates = Map<number, TermState>;

// jhist_terms に保存する形：{ t: { 用語の番号: [段階, 次の出題日, 正解回数, 不正解回数, 直近の問題ID, 最後に答えた日時] } }
export function toTermStates(v: unknown): TermStates {
  const out: TermStates = new Map();
  const t = (v && typeof v === "object" ? (v as { t?: unknown }).t : null) ?? {};
  for (const [k, a] of Object.entries(t as Record<string, unknown>)) {
    if (!Array.isArray(a) || a.length < 6) continue;
    const [s, due, ok, ng, q, at] = a;
    if (!Number.isInteger(s) || s < 0 || s > 6 || !Number.isInteger(due)) continue;
    out.set(Number(k), { s, due, ok: Number(ok) || 0, ng: Number(ng) || 0, q: String(q ?? ""), at: String(at ?? "") });
  }
  return out;
}

export function fromTermStates(states: TermStates) {
  return { t: Object.fromEntries([...states].map(([k, st]) => [k, [st.s, st.due, st.ok, st.ng, st.q, st.at]])) };
}

export function targetImps(goal: Goal): Imp[] {
  return GOALS.find((g) => g.id === goal)!.imps;
}

const stageOf = (states: TermStates, i: number) => states.get(i)?.s ?? 0;

// 今日の新出数：未学習の対象用語数 ÷ 入試日の30日前までの残り日数（切り上げ）。10〜40語（未学習が少なければその数）。入試30日前からは0
export function newPerDay(unlearned: number, today: string, examDate: string) {
  const days = dayNumber(examDate) - REVIEW_ONLY_DAYS - dayNumber(today);
  if (days <= 0 || unlearned <= 0) return 0;
  return Math.min(unlearned, Math.max(NEW_PER_DAY_MIN, Math.min(NEW_PER_DAY_MAX, Math.ceil(unlearned / days))));
}

// 新出に出す重要度：S から。S の段階2以上が80％を超えたら A、A も超えたら B（目標が早慶上智のとき）
export function unlockedImps(goal: Goal, states: TermStates, terms: JTerm[] = jhistIndex().terms): Imp[] {
  const rate = (imp: Imp) => {
    const list = terms.map((t, i) => [t, i] as const).filter(([t]) => t.imp === imp);
    return list.length ? list.filter(([, i]) => stageOf(states, i) >= UNLOCK_STAGE).length / list.length : 1;
  };
  const out: Imp[] = ["S"];
  if (rate("S") > UNLOCK_RATE) {
    out.push("A");
    if (goal === "adv" && rate("A") > UNLOCK_RATE) out.push("B");
  }
  return out;
}

// 対象用語のうち未学習（段階0）の数
export function unlearnedCount(goal: Goal, states: TermStates, terms: JTerm[] = jhistIndex().terms) {
  const imps = targetImps(goal);
  return terms.filter((t, i) => imps.includes(t.imp) && stageOf(states, i) === 0).length;
}

// 復習が必要な用語（記録があり、次の出題日が来たもの）
export function dueTerms(states: TermStates, today: number) {
  return [...states].filter(([, st]) => st.due <= today).map(([i]) => i);
}

// その日のノルマ。日が変わったら作り直す（その日の最初に決めた数のまま、1日を通して使う）
export function dailyFor(prev: Daily | null, settings: JhistSettings, states: TermStates, today: string): Daily {
  if (prev && prev.date === today) return prev;
  return {
    date: today,
    newTarget: newPerDay(unlearnedCount(settings.goal, states), today, settings.examDate),
    reviewTarget: dueTerms(states, dayNumber(today)).length,
    newDone: 0,
    reviewDone: 0,
    terms: [],
    achieved: false,
  };
}

export function remainingOf(d: Daily) {
  return Math.max(0, d.newTarget - d.newDone) + Math.max(0, d.reviewTarget - d.reviewDone);
}

// 同じ用語に問題が複数あれば、前回と違う問題文を出す（問題ID順に回す）
export function nextQuestion(term: JTerm, last: string | undefined) {
  const i = last ? term.questions.indexOf(last) : -1;
  return term.questions[(i + 1) % term.questions.length];
}

export type QueueItem = { qid: string; term: number; stage: number; format: Format; isNew: boolean };

function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 1セッション分の出題：復習（期限切れの日数が多い順に選び、時代をまたいでシャッフル）を先に、新出（節の順）をあとに
// exclude：このセッションですでに出した用語
export function buildQueue(
  states: TermStates,
  daily: Daily,
  settings: JhistSettings,
  today: string,
  size: number,
  exclude: Set<number> = new Set(),
  rand = Math.random,
): QueueItem[] {
  const { terms } = jhistIndex();
  const day = dayNumber(today);
  const reviews = dueTerms(states, day)
    .filter((i) => !exclude.has(i))
    .sort((a, b) => states.get(a)!.due - states.get(b)!.due || terms[a].order - terms[b].order)
    .slice(0, size);
  const items: QueueItem[] = shuffle(reviews, rand).map((i) => {
    const st = states.get(i)!;
    return { qid: nextQuestion(terms[i], st.q), term: i, stage: st.s, format: formatOf(st.s), isNew: false };
  });
  const room = Math.min(size - items.length, Math.max(0, daily.newTarget - daily.newDone));
  if (room > 0) {
    const imps = unlockedImps(settings.goal, states).filter((imp) => targetImps(settings.goal).includes(imp));
    const fresh = terms
      .map((t, i) => [t, i] as const)
      .filter(([t, i]) => !states.has(i) && !exclude.has(i) && imps.includes(t.imp))
      .sort(([a], [b]) => a.order - b.order)
      .slice(0, room);
    for (const [t, i] of fresh) items.push({ qid: t.questions[0], term: i, stage: 0, format: "choice", isNew: true });
  }
  return items;
}

// 集計：時代 × 重要度（S・A・B）ごとの、定着（段階4以上）と学習中（段階1〜3）の用語数
export function summarize(states: TermStates, terms: JTerm[] = jhistIndex().terms, eras = 12): JhistSummary {
  const fixed = Array.from({ length: eras }, () => [0, 0, 0]);
  const learning = Array.from({ length: eras }, () => [0, 0, 0]);
  for (const [i, st] of states) {
    const t = terms[i];
    if (!t) continue;
    const imp = IMPS.indexOf(t.imp);
    if (st.s >= FIXED_STAGE) fixed[t.era][imp]++;
    else if (st.s >= 1) learning[t.era][imp]++;
  }
  return { fixed, learning };
}

// 時代ごとの、目標の対象用語数と定着した数
export function eraStats(summary: JhistSummary | null, goal: Goal, eras = 12, terms: JTerm[] = jhistIndex().terms) {
  const imps = targetImps(goal);
  return Array.from({ length: eras }, (_, e) => ({
    target: terms.filter((t) => t.era === e && imps.includes(t.imp)).length,
    fixed: imps.reduce((a, imp) => a + (summary?.fixed[e]?.[IMPS.indexOf(imp)] ?? 0), 0),
    learning: imps.reduce((a, imp) => a + (summary?.learning[e]?.[IMPS.indexOf(imp)] ?? 0), 0),
  }));
}

// このペースで全範囲（目標の対象用語）が定着する見込み日。直近14日（記録が短ければ最初の日から）の定着語数の増え方で見込む
// 見込めないとき（記録が1日分しかない・増えていない）は null
export function projectDate(history: [string, number][], fixedNow: number, target: number, today: string, paceDays = PACE_DAYS): string | null {
  if (target <= 0) return null;
  if (fixedNow >= target) return today;
  const day = dayNumber(today);
  const past = history.filter(([d]) => dayNumber(d) < day);
  if (!past.length) return null;
  const ref = [...past].reverse().find(([d]) => dayNumber(d) <= day - paceDays) ?? past[0];
  const days = day - dayNumber(ref[0]);
  const pace = (fixedNow - ref[1]) / days;
  if (!(pace > 0)) return null;
  return dateOf(day + Math.ceil((target - fixedNow) / pace));
}

// 日ごとの定着語数の記録を、今日の分で更新する
export function withFixedHistory(history: [string, number][], today: string, fixed: number): [string, number][] {
  const rest = history.filter(([d]) => d !== today);
  return [...rest, [today, fixed] as [string, number]].slice(-FIXED_HISTORY_DAYS);
}
