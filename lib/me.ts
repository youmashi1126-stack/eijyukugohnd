// この端末で登録・選択した番号を覚えておき、2回目以降は自動で識別する
const KEY = "eijukugo:number";

export function loadMyNumber(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveMyNumber(n: number) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {}
}

export function clearMyNumber() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDuration(sec: number) {
  return `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, "0")}秒`;
}
