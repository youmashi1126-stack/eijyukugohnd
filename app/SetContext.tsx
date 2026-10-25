"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { parseSet, SET_IDS, SETS, type SetId } from "@/lib/sets";

// コーナーの切り替え：英単語モード / 英熟語モード / 中学英語モード / 学習時間。端末に記憶し、<html data-set> でテーマカラーを切り替える
// set は英単語・英熟語・中学英語のどれか（学習時間のコーナーにいる間も、最後に選んだものを覚えておく）
const KEY = "eijukugo:set";
const CORNER_KEY = "eijukugo:corner";

export type Corner = SetId | "study";

type Ctx = { set: SetId; corner: Corner; ready: boolean; changeSet: (s: SetId) => void; openStudy: () => void };
const SetContext = createContext<Ctx>({ set: "idiom", corner: "idiom", ready: false, changeSet: () => {}, openStudy: () => {} });

export function SetProvider({ children }: { children: React.ReactNode }) {
  const [set, setSet] = useState<SetId>("idiom");
  const [corner, setCorner] = useState<Corner>("idiom");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: SetId = "idiom";
    let study = false;
    try {
      saved = parseSet(localStorage.getItem(KEY));
      study = localStorage.getItem(CORNER_KEY) === "study";
    } catch {}
    setSet(saved);
    setCorner(study ? "study" : saved);
    document.documentElement.dataset.set = study ? "study" : saved;
    setReady(true);
  }, []);

  const changeSet = useCallback((s: SetId) => {
    setSet(s);
    setCorner(s);
    document.documentElement.dataset.set = s;
    try {
      localStorage.setItem(KEY, s);
      localStorage.removeItem(CORNER_KEY);
    } catch {}
  }, []);

  const openStudy = useCallback(() => {
    setCorner("study");
    document.documentElement.dataset.set = "study";
    try {
      localStorage.setItem(CORNER_KEY, "study");
    } catch {}
  }, []);

  return <SetContext.Provider value={{ set, corner, ready, changeSet, openStudy }}>{children}</SetContext.Provider>;
}

export function useSet() {
  return useContext(SetContext);
}

// 画面の描画前にテーマを当てる（読み込み時に色がちらつかないように）
export const setThemeScript = `try{document.documentElement.dataset.set=localStorage.getItem("${CORNER_KEY}")==="study"?"study":["word","jhs"].indexOf(localStorage.getItem("${KEY}"))>=0?localStorage.getItem("${KEY}"):"idiom"}catch(e){}`;

const STUDY = { icon: "⏱️", label: "学習時間" };

// ヘッダーに今のコーナーを表示（押すとホームでコーナーを切り替えられる）
export function SetBadge() {
  const { set, corner, ready } = useSet();
  if (!ready) return null;
  return (
    <Link href="/" className="set-badge" title="ホームでコーナーを切り替え">
      {corner === "study" ? `${STUDY.icon} ${STUDY.label}` : `${SETS[set].icon} ${SETS[set].label}モード`}
    </Link>
  );
}

// ヘッダーのメニュー。練習・復習は英単語・英熟語・中学英語のコーナーだけ
export function SiteNav() {
  const { corner } = useSet();
  return (
    <nav className="site-nav">
      <Link href="/">🏠 ホーム</Link>
      {corner !== "study" && (
        <>
          <Link href="/practice">📚 練習</Link>
          <Link href="/test?mode=review">🔁 復習</Link>
        </>
      )}
      <Link href="/ranking">🏆 ランキング</Link>
    </nav>
  );
}

// ホーム上部のコーナー切り替え
export function SetSwitch() {
  const { corner, changeSet, openStudy } = useSet();
  return (
    <div className="set-switch four" role="tablist" aria-label="コーナー切り替え">
      {SET_IDS.map((s) => (
        <button key={s} role="tab" aria-selected={corner === s} className={`set-tab ${s} ${corner === s ? "active" : ""}`} onClick={() => changeSet(s)}>
          <span className="set-tab-icon">{SETS[s].icon}</span>
          <span>
            <b>{SETS[s].label}</b>
            <small>全{SETS[s].total.toLocaleString()}問</small>
          </span>
        </button>
      ))}
      <button
        role="tab"
        aria-selected={corner === "study"}
        className={`set-tab study ${corner === "study" ? "active" : ""}`}
        onClick={openStudy}
      >
        <span className="set-tab-icon">{STUDY.icon}</span>
        <span>
          <b>{STUDY.label}</b>
          <small>記録・目標</small>
        </span>
      </button>
    </div>
  );
}
