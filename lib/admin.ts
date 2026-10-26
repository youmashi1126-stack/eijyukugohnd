import { KINDS, type Dump } from "./store";
import { SET_IDS } from "./sets";

// 管理者パスワードは PBKDF2-SHA256 のハッシュで保存し、元のパスワードは残さない
// 保存形式：「v2:回数:ソルト:ハッシュ」。以前の形式「ソルト:ハッシュ」は10万回で計算していた
// Cloudflare の無料プランは1回の処理で使える CPU 時間が10ミリ秒までなので、10万回（約15〜20ミリ秒）では
// パスワードを確かめるたびに止められてしまう。いまは約1ミリ秒で終わる回数にしている
const ITERATIONS = 5_000;
const LEGACY_ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, saltHex: string, iterations: number) {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(bits);
}

export async function hashPassword(password: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return `v2:${ITERATIONS}:${salt}:${await derive(password, salt, ITERATIONS)}`;
}

// ok：パスワードが正しいか。upgrade：以前の形式で保存されていたので、今の形式で保存し直すとよい
export async function verifyPassword(password: unknown, stored: string | null): Promise<{ ok: boolean; upgrade: boolean }> {
  if (typeof password !== "string" || !stored) return { ok: false, upgrade: false };
  const parts = stored.split(":");
  if (parts[0] === "v2" && parts.length === 4) {
    return { ok: (await derive(password, parts[2], Number(parts[1]))) === parts[3], upgrade: false };
  }
  const [salt, hash] = parts;
  const ok = (await derive(password, salt, LEGACY_ITERATIONS)) === hash;
  return { ok, upgrade: ok };
}

// 読み込むファイルが、このアプリのバックアップとして正しい形かを確かめる
export function isDump(v: unknown): v is Dump {
  const d = v as Dump;
  return (
    !!d &&
    d.app === "eijukugo" &&
    d.version === 1 &&
    typeof d.users === "object" &&
    Array.isArray(d.records) &&
    d.records.every(
      (r) =>
        (SET_IDS as string[]).includes(r?.set) &&
        (KINDS as readonly string[]).includes(r?.kind) &&
        !!r.data &&
        typeof r.data === "object" &&
        Object.keys(r.data).every((n) => /^\d+$/.test(n)),
    ) &&
    Object.keys(d.users).every((n) => /^\d+$/.test(n)) &&
    (d.study === undefined || (!!d.study && typeof d.study === "object" && Object.keys(d.study).every((n) => /^\d+$/.test(n)))) &&
    (d.materials === undefined ||
      (!!d.materials && typeof d.materials === "object" && Object.keys(d.materials).every((n) => /^\d+$/.test(n)))) &&
    (d.pastExams === undefined ||
      (!!d.pastExams && typeof d.pastExams === "object" && Object.keys(d.pastExams).every((n) => /^\d+$/.test(n))))
  );
}

// パスワード違いのときは少し待たせて、総当たりで試されにくくする
export function slowDown() {
  return new Promise((r) => setTimeout(r, 1000));
}
