// 学習時間の記録（クライアントでも使う定義）。日付は日本時間の YYYY-MM-DD、1週間は月曜〜日曜
export type Mood = "good" | "normal" | "bad";

export const MOODS: { id: Mood; icon: string; label: string }[] = [
  { id: "good", icon: "😊", label: "うまくいった" },
  { id: "normal", icon: "😐", label: "普通" },
  { id: "bad", icon: "😣", label: "うまくいかなかった" },
];

export type StudyDay = { minutes: number; mood: Mood | null };

// その週の定量ゴール（数で測れる目標）と定性ゴール（取り組み方などの目標）。どちらも30字まで
// quantEval / qualEval：週の終わり（日曜日）からつけられる振り返り（◎〇△×）
export type Eval = "◎" | "〇" | "△" | "×";
export const EVALS: Eval[] = ["◎", "〇", "△", "×"];
export type WeekNote = { quant: string; qual: string; quantEval: Eval | null; qualEval: Eval | null };

export function isEval(v: unknown): v is Eval {
  return typeof v === "string" && (EVALS as string[]).includes(v);
}

// その週の振り返り（◎〇△×）をつけられるか：週の最後の日（日曜日）になったら
export function canEvaluate(week: string, today: string) {
  return today >= addDays(week, 6);
}

function hasNote(n: WeekNote) {
  return !!(n.quant || n.qual || n.quantEval || n.qualEval);
}
export const NOTE_MAX = 30;

// days：日付 → その日の記録、goals：週の始まり（月曜）の日付 → 目標（分）、notes：週の始まり → 定量・定性ゴール
export type StudyLog = { days: Record<string, StudyDay>; goals: Record<string, number>; notes: Record<string, WeekNote> };

// 1日に入力できる上限と、1週間の目標の上限（分）
export const MAX_DAY_MINUTES = 16 * 60;
export const MAX_WEEK_GOAL = 7 * MAX_DAY_MINUTES;

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

export function emptyLog(): StudyLog {
  return { days: {}, goals: {}, notes: {} };
}

// 文字数（絵文字なども1文字と数える）
export function charCount(s: string) {
  return [...s].length;
}

// 1行・30字までに整える
export function cleanNote(v: unknown): string {
  return [...String(v ?? "").replace(/[\r\n\t]+/g, " ").trim()].slice(0, NOTE_MAX).join("");
}

export function isMood(v: unknown): v is Mood {
  return v === "good" || v === "normal" || v === "bad";
}

export function isDateString(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// 日付の計算は時差の影響を受けないよう UTC の 0 時として扱う
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// その日を含む週の月曜日
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=日曜
  return addDays(date, -((day + 6) % 7));
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekTotal(log: StudyLog, start: string): number {
  return weekDates(start).reduce((s, d) => s + (log.days[d]?.minutes ?? 0), 0);
}

// 記録した日数（0分の日は数えない）
export function studiedDays(log: StudyLog, start: string): number {
  return weekDates(start).filter((d) => (log.days[d]?.minutes ?? 0) > 0).length;
}

// その週の目標。設定していない週は、それより前で最後に設定した目標を引き継ぐ
export function goalFor(log: StudyLog, start: string): number | null {
  if (log.goals[start] !== undefined) return log.goals[start];
  const earlier = Object.keys(log.goals)
    .filter((w) => w < start)
    .sort();
  return earlier.length ? log.goals[earlier[earlier.length - 1]] : null;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// 「10/20(月)」の形
export function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const w = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
  return `${m}/${d}(${w})`;
}

export function weekLabel(start: string): string {
  return `${dayLabel(start)}〜${dayLabel(addDays(start, 6))}`;
}

// 保存されている値を正しい形にそろえる（壊れた値は捨てる）
export function toStudyLog(v: unknown): StudyLog {
  const log = emptyLog();
  if (!v || typeof v !== "object") return log;
  const o = v as Partial<StudyLog>;
  for (const [date, day] of Object.entries(o.days ?? {})) {
    if (!isDateString(date) || !day || typeof day !== "object") continue;
    const minutes = Number((day as StudyDay).minutes);
    if (!Number.isFinite(minutes)) continue;
    log.days[date] = { minutes: clamp(minutes, MAX_DAY_MINUTES), mood: isMood((day as StudyDay).mood) ? (day as StudyDay).mood : null };
  }
  for (const [week, goal] of Object.entries(o.goals ?? {})) {
    const g = Number(goal);
    if (isDateString(week) && Number.isFinite(g)) log.goals[week] = clamp(g, MAX_WEEK_GOAL);
  }
  for (const [week, note] of Object.entries(o.notes ?? {})) {
    if (!isDateString(week) || !note || typeof note !== "object") continue;
    const o = note as WeekNote;
    const n: WeekNote = {
      quant: cleanNote(o.quant),
      qual: cleanNote(o.qual),
      quantEval: isEval(o.quantEval) ? o.quantEval : null,
      qualEval: isEval(o.qualEval) ? o.qualEval : null,
    };
    if (hasNote(n)) log.notes[week] = n;
  }
  return log;
}

function clamp(n: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(n)));
}

// 1回の保存内容：その日の記録（minutes / mood は送った項目だけ変える）、週の目標時間、または週の定量・定性ゴール
export type StudyPatch =
  | { type: "day"; date: string; minutes?: number; mood?: Mood | null }
  | { type: "goal"; week: string; minutes: number | null }
  | { type: "notes"; week: string; quant: string; qual: string }
  | { type: "eval"; week: string; target: "quant" | "qual"; value: Eval | null };

export function applyStudyPatch(log: StudyLog, patch: StudyPatch): StudyLog {
  const next: StudyLog = { days: { ...log.days }, goals: { ...log.goals }, notes: { ...log.notes } };
  if (patch.type === "day") {
    const prev = next.days[patch.date] ?? { minutes: 0, mood: null };
    const day: StudyDay = {
      minutes: patch.minutes === undefined ? prev.minutes : clamp(patch.minutes, MAX_DAY_MINUTES),
      mood: patch.mood === undefined ? prev.mood : patch.mood,
    };
    if (day.minutes === 0 && day.mood === null) delete next.days[patch.date];
    else next.days[patch.date] = day;
  } else if (patch.type === "notes" || patch.type === "eval") {
    // ゴールの文を書き直しても振り返りは残し、振り返りをつけても文は変えない
    const prev = next.notes[patch.week] ?? { quant: "", qual: "", quantEval: null, qualEval: null };
    const note: WeekNote =
      patch.type === "notes"
        ? { ...prev, quant: cleanNote(patch.quant), qual: cleanNote(patch.qual) }
        : { ...prev, [patch.target === "quant" ? "quantEval" : "qualEval"]: patch.value };
    if (hasNote(note)) next.notes[patch.week] = note;
    else delete next.notes[patch.week];
  } else if (patch.minutes === null) {
    delete next.goals[patch.week];
  } else {
    next.goals[patch.week] = clamp(patch.minutes, MAX_WEEK_GOAL);
  }
  return next;
}

// 同じ値なら同順位にした順位の配列（rows は並べ替え済み）
export function rankBy<T>(rows: T[], value: (r: T) => number): number[] {
  const ranks: number[] = [];
  rows.forEach((r, i) => ranks.push(i > 0 && value(rows[i - 1]) === value(r) ? ranks[i - 1] : i + 1));
  return ranks;
}

// ---------- 週ごとに分けた保存（サーバーで使う） ----------
// 全員分の記録を毎回読むと、記録が増えるほど処理が重くなる（無料プランの CPU 時間を超える）。
// そこで、1人分の記録（StudyLog）とは別に「週ごとの記録」と「目標・最後に記録した日」を保存し、
// ランキング・みんなの目標・管理者の一覧では必要な週の分だけを読む

// 1週間分：その週の日ごとの記録と、その週のゴール
export type StudyWeekRow = { days: Record<string, StudyDay>; note?: WeekNote };
// 1人分の目標（週 → 分。引き継ぎの計算に前の週の目標も使う）と、最後に学習時間を記録した日
export type StudyMeta = { goals: Record<string, number>; last: string | null };

export function weekRowOf(log: StudyLog, week: string): StudyWeekRow | null {
  const days: Record<string, StudyDay> = {};
  for (const d of weekDates(week)) if (log.days[d]) days[d] = log.days[d];
  const note = log.notes[week];
  if (!Object.keys(days).length && !note) return null;
  return note ? { days, note } : { days };
}

// 記録かゴールがある週（月曜日の日付）
export function weeksOf(log: StudyLog): string[] {
  return [...new Set([...Object.keys(log.days).map(weekStart), ...Object.keys(log.notes)])].sort();
}

export function metaOf(log: StudyLog): StudyMeta {
  const studied = Object.keys(log.days).filter((d) => log.days[d].minutes > 0);
  return { goals: log.goals, last: studied.length ? studied.sort()[studied.length - 1] : null };
}

// 目標と、読んだ週の分だけを持つ記録（その週の合計・目標・ゴールの計算は全体の記録と同じ結果になる）
export function partialLog(meta: StudyMeta | undefined, rows: Record<string, StudyWeekRow>): StudyLog {
  const log: StudyLog = { days: {}, goals: { ...(meta?.goals ?? {}) }, notes: {} };
  for (const [week, r] of Object.entries(rows)) {
    Object.assign(log.days, r.days);
    if (r.note) log.notes[week] = r.note;
  }
  return log;
}

// 全体の記録から、指定した週の分だけを持つ記録を作る（Redis・ローカルの保存先で使う）
export function sliceLog(log: StudyLog, weeks: string[]): StudyLog {
  const rows: Record<string, StudyWeekRow> = {};
  for (const w of weeks) {
    const r = weekRowOf(log, w);
    if (r) rows[w] = r;
  }
  return partialLog(metaOf(log), rows);
}
