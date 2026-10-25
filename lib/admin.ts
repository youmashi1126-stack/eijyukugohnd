import { KINDS, type Dump } from "./store";
import { SET_IDS } from "./sets";

// 管理者パスワードは「ソルト:ハッシュ」（PBKDF2-SHA256）で保存し、元のパスワードは残さない
const ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, saltHex: string) {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

export async function hashPassword(password: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return `${salt}:${await derive(password, salt)}`;
}

export async function verifyPassword(password: unknown, stored: string | null) {
  if (typeof password !== "string" || !stored) return false;
  const [salt, hash] = stored.split(":");
  return (await derive(password, salt)) === hash;
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
    (d.study === undefined || (!!d.study && typeof d.study === "object" && Object.keys(d.study).every((n) => /^\d+$/.test(n))))
  );
}

// パスワード違いのときは少し待たせて、総当たりで試されにくくする
export function slowDown() {
  return new Promise((r) => setTimeout(r, 1000));
}
