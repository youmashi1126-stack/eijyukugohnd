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

// サーバーがエラーのページ（JSON 以外）を返したときも、原因の手がかりになる番号を出す
function serverError(status: number) {
  return status === 503
    ? "サーバーの処理が上限を超えて止まりました（503）。少し待ってからもう一度お試しください。"
    : `サーバーでエラーが起きました（${status}）。少し待ってからもう一度お試しください。`;
}

async function post(body: object) {
  const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? serverError(res.status));
  if (!data) throw new Error(serverError(res.status));
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
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.hasPassword !== "boolean") throw new Error(data?.error ?? serverError(res.status));
    setError("");
    setStatus(data);
  }

  useEffect(() => {
    loadStatus().catch((e) => setError(`管理者ページの状態を読み込めませんでした。${e instanceof Error ? e.message : ""}`));
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
      document.body.appendChild(a);
      a.click();
      a.remove();
      // すぐに消すとファイル名が付かないことがあるので、ダウンロードが始まってから消す
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      const records = (data.records as { data: object }[]).reduce((s, r) => s + Object.keys(r.data).length, 0);
      return `ダウンロードしました（登録者 ${Object.keys(data.users).length}人・記録 ${records}件）。`;
    });

  // 学習教材の進捗：登録している全員分を、学習教材シートと同じ形の Excel に書き出す
  const downloadMaterials = () =>
    run(async () => {
      const data = await post({ action: "materials", password });
      const res = await fetch("/templates/materials-template.xlsx");
      if (!res.ok) throw new Error("Excel のひな形を読み込めませんでした");
      const { buildMaterialsWorkbook } = await import("@/lib/materialsXlsx");
      // 登録している人と、教材が入っている人（取り込んだがまだ登録していない人を含む）のシートを番号順に作る
      const numbers = new Set<number>([...(data.users as { number: number }[]).map((u) => u.number), ...Object.keys(data.materials).map(Number)]);
      const sheets = [...numbers].sort((a, b) => a - b).map((n) => ({ number: n, items: data.materials[n] ?? [] }));
      const blob = await buildMaterialsWorkbook(await res.arrayBuffer(), sheets);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `eijukugo-materials-${fileStamp()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // すぐに消すとファイル名が付かないことがあるので、ダウンロードが始まってから消す
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      const books = sheets.reduce((s, x) => s + x.items.filter((m: { title: string }) => m.title).length, 0);
      return `ダウンロードしました（${sheets.length}人分のシート・教材 ${books}冊）。`;
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

  if (!status) {
    if (!error) return <p className="muted center">読み込み中…</p>;
    return (
      <div className="card center">
        <p className="error">{error}</p>
        <button
          className="btn"
          onClick={() => loadStatus().catch((e) => setError(`管理者ページの状態を読み込めませんでした。${e instanceof Error ? e.message : ""}`))}
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

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
            <p className="muted">登録者・テスト結果・練習の記録・習熟ポイント・学習時間・学習教材を、1つのファイル（JSON）に保存します。</p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy || !password} onClick={download}>
                ダウンロード
              </button>
            </div>
          </div>

          <div className="card">
            <h2>📒 学習教材の進捗をダウンロード（Excel）</h2>
            <p className="muted">
              登録している人と教材が入っている人の学習教材を、学習教材シートと同じ見た目の Excel ファイルに書き出します。1人1シート（シート名は番号）で、
              残りの量・ペース・進捗・状態は Excel を開いたときに計算されます。
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy || !password} onClick={downloadMaterials}>
                Excel でダウンロード
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
