// ログインしている本人の番号（MeProvider が /api/me で確かめて入れる）。ランキングで「あなた」を示すのに使う
let current: number | null = null;

export function loadMyNumber(): number | null {
  return current;
}

export function setMyNumber(n: number | null) {
  current = n;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDuration(sec: number) {
  return `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, "0")}秒`;
}
