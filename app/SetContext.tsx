"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { parseSet, SET_IDS, SETS, type Corner, type SetId } from "@/lib/sets";
import { useMe } from "./MeContext";

// コーナーの切り替え：英単語モード / 英熟語モード / 中学英語モード / 学習時間。端末に記憶し、<html data-set> でテーマカラーを切り替える
// set は英単語・英熟語・中学英語のどれか（学習時間のコーナーにいる間も、最後に選んだものを覚えておく）
const KEY = "eijukugo:set";
const CORNER_KEY = "eijukugo:corner";

export type { Corner };

// visible：マイページで選んだ、表示するコーナー（ホームとランキングの切り替えに出す）
type Ctx = { set: SetId; corner: Corner; visible: Corner[]; ready: boolean; changeSet: (s: SetId) => void; openStudy: () => void };
const SetContext = createContext<Ctx>({
  set: "idiom",
  corner: "idiom",
  visible: [],
  ready: false,
  changeSet: () => {},
  openStudy: () => {},
});

export function SetProvider({ children }: { children: React.ReactNode }) {
  const { me, status } = useMe();
  const [set, setSet] = useState<SetId>("idiom");
  const [corner, setCorner] = useState<Corner>("idiom");
  const [loaded, setLoaded] = useState(false);
  const visible = me?.corners ?? [];

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
    setLoaded(true);
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

  // 今のコーナーをマイページで非表示にしたときは、表示するコーナーの最初のものに切り替える
  const hidden = loaded && visible.length > 0 && !visible.includes(corner);
  useEffect(() => {
    if (!hidden) return;
    const first = visible[0];
    if (first === "study") openStudy();
    else changeSet(first);
  }, [hidden, visible, changeSet, openStudy]);

  // 個人用URLでログインしていて、表示するコーナーがそろってから画面を出す
  const ready = loaded && status === "ok" && !hidden;
  return <SetContext.Provider value={{ set, corner, visible, ready, changeSet, openStudy }}>{children}</SetContext.Provider>;
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
  const { corner, ready } = useSet();
  if (!ready) return null;
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
      <Link href="/mypage">👤 マイページ</Link>
    </nav>
  );
}

// ホーム上部のコーナー切り替え（マイページで選んだコーナーだけ。1つだけなら出さない）
export function SetSwitch() {
  const { corner, visible, changeSet, openStudy } = useSet();
  if (visible.length <= 1) return null;
  return (
    <div className="set-switch multi" role="tablist" aria-label="コーナー切り替え" style={{ gridTemplateColumns: `repeat(${visible.length}, 1fr)` }}>
      {SET_IDS.filter((s) => visible.includes(s)).map((s) => (
        <button key={s} role="tab" aria-selected={corner === s} className={`set-tab ${s} ${corner === s ? "active" : ""}`} onClick={() => changeSet(s)}>
          <span className="set-tab-icon">{SETS[s].icon}</span>
          <span>
            <b>{SETS[s].label}</b>
            <small>全{SETS[s].total.toLocaleString()}問</small>
          </span>
        </button>
      ))}
      {visible.includes("study") && (
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
      )}
    </div>
  );
}
