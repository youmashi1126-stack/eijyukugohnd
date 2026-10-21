import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "朝学習 英熟語テスト",
  description: "ターゲット英熟語1000からランダム100問の3択テスト",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            朝学習 英熟語テスト
          </Link>
          <nav>
            <Link href="/">ホーム</Link>
            <Link href="/ranking">ランキング</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
