"use client";

import Link from "next/link";
import { useState } from "react";
import { CORNERS, SETS, type Corner } from "@/lib/sets";
import { NICKNAME_MAX } from "@/lib/types";
import { toMe, useMe } from "../MeContext";
import { JhistSettingsCard } from "../jhist/SettingsForm";
import { HistProvider } from "@/lib/jhist/context";
import { HIST_KEYS } from "@/lib/jhist/subject";

const CORNER_LABEL: Record<Corner, string> = {
  word: `${SETS.word.icon} ${SETS.word.label}`,
  idiom: `${SETS.idiom.icon} ${SETS.idiom.label}`,
  jhs: `${SETS.jhs.icon} ${SETS.jhs.label}`,
  study: "⏱️ 学習時間",
  materials: "📒 学習教材",
  pastexams: "📝 過去問",
  jhist: "📕 日本史",
  whist: "🌍 世界史",
};

type SaveState = { kind: "ok" | "error"; text: string } | null;

async function save(body: object) {
  const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "保存できませんでした");
  return toMe(data);
}

// マイページ：ニックネームの変更と、ホーム・ランキングに表示するコーナーの選択
export default function MyPage() {
  const { me, setMe } = useMe();
  const [nickname, setNickname] = useState(me?.nickname ?? "");
  const [corners, setCorners] = useState<Corner[]>(me?.corners ?? CORNERS);
  const [nameState, setNameState] = useState<SaveState>(null);
  const [cornerState, setCornerState] = useState<SaveState>(null);
  const [hidden, setHidden] = useState<Corner[]>(me?.hidden ?? []);
  const [hiddenState, setHiddenState] = useState<SaveState>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function run(task: () => Promise<void>, set: (s: SaveState) => void, ok: string) {
    setBusy(true);
    set(null);
    try {
      await task();
      set({ kind: "ok", text: ok });
    } catch (e) {
      set({ kind: "error", text: e instanceof Error ? e.message : "保存できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  const saveName = () => run(async () => setMe(await save({ nickname })), setNameState, "✓ ニックネームを変更しました");
  const saveCorners = () => run(async () => setMe(await save({ corners })), setCornerState, "✓ 表示するコーナーを保存しました");
  const toggle = (c: Corner) => setCorners((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : CORNERS.filter((x) => cs.includes(x) || x === c)));
  const cornersChanged = corners.join() !== me.corners.join();
  const saveHidden = () => run(async () => setMe(await save({ hidden })), setHiddenState, "✓ みんなに見せないものを保存しました");
  const toggleHidden = (c: Corner) => setHidden((hs) => (hs.includes(c) ? hs.filter((x) => x !== c) : CORNERS.filter((x) => hs.includes(x) || x === c)));
  const hiddenChanged = hidden.join() !== me.hidden.join();

  return (
    <>
      <div className="card hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 10 }}>👤 {me.nickname}のマイページ</h1>
        <p className="muted" style={{ margin: 0 }}>
          ニックネームと、表示するコーナーを変えられます。個人用のURLは自分だけのものなので、ほかの人に教えないでください。
        </p>
      </div>

      <div className="card">
        <h2>✏️ ニックネーム</h2>
        <input
          className="input"
          value={nickname}
          maxLength={NICKNAME_MAX}
          onChange={(e) => setNickname(e.target.value)}
          aria-label="ニックネーム"
        />
        <p className="muted" style={{ margin: "6px 0 0" }}>
          {NICKNAME_MAX}文字まで。ランキングに表示されます。
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || !nickname.trim() || nickname.trim() === me.nickname} onClick={saveName}>
            変更する
          </button>
        </div>
        {nameState && <p className={nameState.kind === "ok" ? "save-ok" : "error"}>{nameState.text}</p>}
      </div>

      <div className="card">
        <h2>🧩 表示するコーナー</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          ホームとランキングの切り替えに出すコーナーを選びます（1つ以上）。記録は消えません。
        </p>
        <div className="corner-choices">
          {CORNERS.map((c) => (
            <label key={c} className={`corner-choice ${corners.includes(c) ? "on" : ""}`}>
              <input type="checkbox" checked={corners.includes(c)} onChange={() => toggle(c)} />
              {CORNER_LABEL[c]}
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || corners.length === 0 || !cornersChanged} onClick={saveCorners}>
            保存する
          </button>
        </div>
        {corners.length === 0 && <p className="error">1つ以上選んでください</p>}
        {cornerState && <p className={cornerState.kind === "ok" ? "save-ok" : "error"}>{cornerState.text}</p>}
      </div>

      <div className="card">
        <h2>🙈 みんなに見せないもの</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          チェックしたものは、みんなの学習（友達のページ）に出なくなります。英単語・英熟語・中学英語はランキングに、学習時間はランキングとみんなの目標にも出なくなります。自分のホームには出ます。
        </p>
        <div className="corner-choices">
          {CORNERS.map((c) => (
            <label key={c} className={`corner-choice ${hidden.includes(c) ? "on" : ""}`}>
              <input type="checkbox" checked={hidden.includes(c)} onChange={() => toggleHidden(c)} />
              {CORNER_LABEL[c]}
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || !hiddenChanged} onClick={saveHidden}>
            保存する
          </button>
          <Link className="btn" href={`/friends/${me.number}`}>
            ほかの人からの見え方
          </Link>
        </div>
        {hiddenState && <p className={hiddenState.kind === "ok" ? "save-ok" : "error"}>{hiddenState.text}</p>}
      </div>

      {HIST_KEYS.filter((key) => me.corners.includes(key)).map((key) => (
        <HistProvider key={key} subject={key}>
          <JhistSettingsCard />
        </HistProvider>
      ))}
    </>
  );
}
