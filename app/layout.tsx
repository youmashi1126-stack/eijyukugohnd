import type { Metadata, Viewport } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import Link from "next/link";
import SoundControls from "./SoundControls";
import "./globals.css";

const rounded = M_PLUS_Rounded_1c({ weight: ["400", "700", "800"], subsets: ["latin"], preload: false, display: "swap" });

export const metadata: Metadata = {
  title: "英熟語チャレンジ｜朝学習",
  description: "ターゲット英熟語1000からランダム100問の3択テスト",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7c3aed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={rounded.className}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-icon">⚡</span>英熟語チャレンジ
          </Link>
          <nav className="site-nav">
            <Link href="/">🏠 ホーム</Link>
            <Link href="/practice">📚 練習</Link>
            <Link href="/test?mode=review">🔁 復習</Link>
            <Link href="/ranking">🏆 ランキング</Link>
          </nav>
          <SoundControls />
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
