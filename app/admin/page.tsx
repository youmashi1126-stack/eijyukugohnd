"use client";

import { useEffect, useRef, useState } from "react";

// 管理者ページ：データのバックアップ（ファイルに保存）と読み込み（アップロード）
type Status = { hasPassword: boolean; storage: string; persistent: boolean };

const STORAGE_LABEL: Record<string, string> = {
  d1: "Cloudflare D1",
  redis: "Upstash Redis（Vercel）",
  local: "このパソコンのファイル（開発用）",
};

function fileStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function post(body: object) {
  const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function AdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadStatus() {
    const res = await fetch("/api/admin", { cache: "no-store" });
    setStatus(await res.json());
  }

  useEffect(() => {
    loadStatus().catch(() => setError("状態を読み込めませんでした"));
  }, []);

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await task());
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const setup = () =>
    run(async () => {
      if (password !== password2) throw new Error("確認用のパスワードが一致しません");
      await post({ action: "setup", password });
      await loadStatus();
      return "管理者パスワードを設定しました。忘れないように控えておいてください。";
    });

  const download = () =>
    run(async () => {
      const data = await post({ action: "export", password });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `eijukugo-backup-${fileStamp()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const records = (data.records as { data: object }[]).reduce((s, r) => s + Object.keys(r.data).length, 0);
      return `ダウンロードしました（登録者 ${Object.keys(data.users).length}人・記録 ${records}件）。`;
    });

  const upload = () =>
    run(async () => {
      if (!file) throw new Error("ファイルを選んでください");
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("JSONファイルとして読み込めませんでした");
      }
      const info = data as { exportedAt?: string; users?: object };
      const when = info.exportedAt ? new Date(info.exportedAt).toLocaleString("ja-JP") : "不明";
      if (
        !confirm(
          `「${file.name}」（${when} 時点・登録者 ${Object.keys(info.users ?? {}).length}人）を読み込みます。\n` +
            "ファイルにある番号の記録は、ファイルの内容で上書きされます。よろしいですか？",
        )
      ) {
        return "読み込みをやめました。";
      }
      const res = await post({ action: "import", password, data });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      return `読み込みました（登録者 ${res.users}人・記録 ${res.records}件）。`;
    });

  if (!status) return <p className="muted center">{error || "読み込み中…"}</p>;

  return (
    <>
      <div className="card hero">
        <h1>🛠️ 管理者ページ</h1>
        <p className="muted" style={{ margin: 0 }}>
          全員の記録をファイルに保存（バックアップ）したり、保存したファイルを読み込んだりできます。
        </p>
        <div className="stats" style={{ gridTemplateColumns: "1fr" }}>
          <div className="stat">
            <div className="stat-label">今の保存先</div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              {STORAGE_LABEL[status.storage] ?? status.storage}
              {!status.persistent && "（⚠️ 保存されません）"}
            </div>
          </div>
        </div>
      </div>

      {!status.hasPassword ? (
        <div className="card">
          <h2>🔑 はじめに管理者パスワードを設定</h2>
          <p className="muted">バックアップと読み込みにはパスワードが必要です。8文字以上で設定してください（1回だけ設定できます）。</p>
          <input className="input" type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div style={{ height: 8 }} />
          <input className="input" type="password" placeholder="パスワード（確認）" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          <div className="btn-row">
            <button className="btn btn-primary" disabled={busy || password.length < 8} onClick={setup}>
              設定する
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>🔑 管理者パスワード</h2>
            <input className="input" type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div className="card">
            <h2>⬇️ データをダウンロード</h2>
            <p className="muted">登録者・テスト結果・練習の記録・習熟ポイントを、1つのファイル（JSON）に保存します。</p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy || !password} onClick={download}>
                ダウンロード
              </button>
            </div>
          </div>

          <div className="card">
            <h2>⬆️ データをアップロード（読み込み）</h2>
            <p className="muted">
              ダウンロードしたファイルを読み込みます。ファイルにある番号の記録はファイルの内容で上書きされ、ファイルにない番号の記録はそのまま残ります。
              Vercel 版でダウンロードしたファイルを Cloudflare 版で読み込めば、何度でも同じ状態にそろえられます。
            </p>
            <input ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="btn-row">
              <button className="btn btn-review" disabled={busy || !password || !file} onClick={upload}>
                読み込む
              </button>
            </div>
          </div>
        </>
      )}

      {busy && <p className="muted center">処理中…</p>}
      {message && <p className="center" style={{ fontWeight: 800, color: "var(--ok)" }}>{message}</p>}
      {error && <p className="error center">{error}</p>}
    </>
  );
}
