"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { EXTRA, EXTRA_CORNERS, isExtraCorner, parseSet, SET_IDS, SETS, type Corner, type ExtraCorner, type SetId } from "@/lib/sets";
import { useMe } from "./MeContext";

// コーナーの切り替え：英単語モード / 英熟語モード / 中学英語モード / 学習時間 / 学習教材。端末に記憶し、<html data-set> でテーマカラーを切り替える
// set は英単語・英熟語・中学英語のどれか（学習時間・学習教材のコーナーにいる間も、最後に選んだものを覚えておく）
const KEY = "eijukugo:set";
const CORNER_KEY = "eijukugo:corner";

export type { Corner };

// visible：マイページで選んだ、表示するコーナー（ホームとランキングの切り替えに出す）
type Ctx = {
  set: SetId;
  corner: Corner;
  visible: Corner[];
  ready: boolean;
  changeSet: (s: SetId) => void;
  openCorner: (c: ExtraCorner) => void;
  openStudy: () => void;
};
const SetContext = createContext<Ctx>({
  set: "idiom",
  corner: "idiom",
  visible: [],
  ready: false,
  changeSet: () => {},
  openCorner: () => {},
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
    let extra: ExtraCorner | null = null;
    try {
      saved = parseSet(localStorage.getItem(KEY));
      const c = localStorage.getItem(CORNER_KEY);
      if (isExtraCorner(c)) extra = c;
    } catch {}
    setSet(saved);
    setCorner(extra ?? saved);
    document.documentElement.dataset.set = extra ?? saved;
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

  const openCorner = useCallback((c: ExtraCorner) => {
    setCorner(c);
    document.documentElement.dataset.set = c;
    try {
      localStorage.setItem(CORNER_KEY, c);
    } catch {}
  }, []);
  const openStudy = useCallback(() => openCorner("study"), [openCorner]);

  // 今のコーナーをマイページで非表示にしたときは、表示するコーナーの最初のものに切り替える
  const hidden = loaded && visible.length > 0 && !visible.includes(corner);
  useEffect(() => {
    if (!hidden) return;
    const first = visible[0];
    if (isExtraCorner(first)) openCorner(first);
    else changeSet(first);
  }, [hidden, visible, changeSet, openCorner]);

  // 個人用URLでログインしていて、表示するコーナーがそろってから画面を出す
  const ready = loaded && status === "ok" && !hidden;
  return (
    <SetContext.Provider value={{ set, corner, visible, ready, changeSet, openCorner, openStudy }}>{children}</SetContext.Provider>
  );
}

export function useSet() {
  return useContext(SetContext);
}

// 画面の描画前にテーマを当てる（読み込み時に色がちらつかないように）
export const setThemeScript = `try{var c=localStorage.getItem("${CORNER_KEY}"),s=localStorage.getItem("${KEY}");document.documentElement.dataset.set=${JSON.stringify(EXTRA_CORNERS)}.indexOf(c)>=0?c:["word","jhs"].indexOf(s)>=0?s:"idiom"}catch(e){}`;

// ヘッダーに今のコーナーを表示（押すとホームでコーナーを切り替えられる）
export function SetBadge() {
  const { set, corner, ready } = useSet();
  if (!ready) return null;
  return (
    <Link href={`/c/${corner}`} className="set-badge" title="このコーナーのページへ">
      {isExtraCorner(corner) ? `${EXTRA[corner].icon} ${EXTRA[corner].label}` : `${SETS[set].icon} ${SETS[set].label}モード`}
    </Link>
  );
}

// ヘッダーのメニュー。練習・復習は、英単語・英熟語・中学英語のコーナーのページ・練習・テストを開いているときだけ
export function SiteNav() {
  const { corner, ready } = useSet();
  const pathname = usePathname();
  if (!ready) return null;
  const inSet = !isExtraCorner(corner) && (pathname.startsWith("/c/") || pathname.startsWith("/practice") || pathname.startsWith("/test"));
  return (
    <nav className="site-nav">
      <Link href="/">🏠 ホーム</Link>
      {inSet && (
        <>
          <Link href="/practice">📚 練習</Link>
          <Link href="/test?mode=review">🔁 復習</Link>
        </>
      )}
      {corner === "jhist" && (pathname.startsWith("/c/jhist") || pathname.startsWith("/jhist")) && <Link href="/jhist/practice">📚 節別の練習</Link>}
      <Link href="/ranking">🏆 ランキング</Link>
      <Link href="/friends">👥 みんな</Link>
      <Link href="/mypage">👤 マイページ</Link>
    </nav>
  );
}

// コーナーのページ上部の切り替え（マイページで選んだコーナーだけ。1つだけなら出さない）。押すとそのコーナーのページへ
export function SetSwitch() {
  const { corner, visible } = useSet();
  const router = useRouter();
  const go = (c: Corner) => router.push(`/c/${c}`);
  if (visible.length <= 1) return null;
  return (
    <div className={`set-switch multi ${visible.length > 4 ? "many" : ""}`} role="tablist" aria-label="コーナー切り替え" style={{ "--cols": visible.length } as React.CSSProperties}>
      {SET_IDS.filter((s) => visible.includes(s)).map((s) => (
        <button key={s} role="tab" aria-selected={corner === s} className={`set-tab ${s} ${corner === s ? "active" : ""}`} onClick={() => go(s)}>
          <span className="set-tab-icon">{SETS[s].icon}</span>
          <span>
            <b>{SETS[s].label}</b>
            <small>全{SETS[s].total.toLocaleString()}問</small>
          </span>
        </button>
      ))}
      {EXTRA_CORNERS.filter((c) => visible.includes(c)).map((c) => (
        <button key={c} role="tab" aria-selected={corner === c} className={`set-tab ${c} ${corner === c ? "active" : ""}`} onClick={() => go(c)}>
          <span className="set-tab-icon">{EXTRA[c].icon}</span>
          <span>
            <b>{EXTRA[c].label}</b>
            <small>{EXTRA[c].sub}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
