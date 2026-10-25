// 学習時間の記録（クライアントでも使う定義）。日付は日本時間の YYYY-MM-DD、1週間は月曜〜日曜
export type Mood = "good" | "normal" | "bad";

export const MOODS: { id: Mood; icon: string; label: string }[] = [
  { id: "good", icon: "😊", label: "うまくいった" },
  { id: "normal", icon: "😐", label: "普通" },
  { id: "bad", icon: "😣", label: "うまくいかなかった" },
];

export type StudyDay = { minutes: number; mood: Mood | null };

// days：日付 → その日の記録、goals：週の始まり（月曜）の日付 → 目標（分）
export type StudyLog = { days: Record<string, StudyDay>; goals: Record<string, number> };

// 1日に入力できる上限と、1週間の目標の上限（分）
export const MAX_DAY_MINUTES = 16 * 60;
export const MAX_WEEK_GOAL = 7 * MAX_DAY_MINUTES;

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

export function emptyLog(): StudyLog {
  return { days: {}, goals: {} };
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
  return log;
}

function clamp(n: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(n)));
}

// 1回の保存内容：その日の記録（minutes / mood は送った項目だけ変える）または週の目標
export type StudyPatch =
  | { type: "day"; date: string; minutes?: number; mood?: Mood | null }
  | { type: "goal"; week: string; minutes: number | null };

export function applyStudyPatch(log: StudyLog, patch: StudyPatch): StudyLog {
  const next: StudyLog = { days: { ...log.days }, goals: { ...log.goals } };
  if (patch.type === "day") {
    const prev = next.days[patch.date] ?? { minutes: 0, mood: null };
    const day: StudyDay = {
      minutes: patch.minutes === undefined ? prev.minutes : clamp(patch.minutes, MAX_DAY_MINUTES),
      mood: patch.mood === undefined ? prev.mood : patch.mood,
    };
    if (day.minutes === 0 && day.mood === null) delete next.days[patch.date];
    else next.days[patch.date] = day;
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
