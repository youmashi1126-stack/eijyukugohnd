import { ACCOUNT_HASHES } from "./accounts";

// 個人用URL（/u/<合言葉>）で開くと、合言葉をこの Cookie に保存する。API は毎回 Cookie の合言葉から番号を確かめる
export const SESSION_COOKIE = "eij_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 400;

const byHash = new Map(Object.entries(ACCOUNT_HASHES).map(([n, h]) => [h, Number(n)]));

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 合言葉に対応する番号（正しくなければ null）
export async function numberForToken(token: string | null | undefined): Promise<number | null> {
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return byHash.get(await sha256(token)) ?? null;
}

// リクエストの Cookie から、ログインしている番号を取り出す
export async function sessionNumber(req: Request): Promise<number | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return numberForToken(m ? decodeURIComponent(m[1]) : null);
}
