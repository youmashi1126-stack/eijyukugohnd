import type { Metadata, Viewport } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import Link from "next/link";
import { AccountGate, MeProvider } from "./MeContext";
import { SetBadge, SetProvider, setThemeScript, SiteNav } from "./SetContext";
import SoundControls from "./SoundControls";
import "./globals.css";

const rounded = M_PLUS_Rounded_1c({ weight: ["400", "700", "800"], subsets: ["latin"], preload: false, display: "swap" });

export const metadata: Metadata = {
  title: "英単語・英熟語チャレンジ｜朝学習",
  description: "システム英単語2032問・ターゲット英熟語1000問・中学英語1357問の3択テスト",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7c3aed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={rounded.className} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setThemeScript }} />
      </head>
      <body>
        <MeProvider>
          <SetProvider>
            <header className="site-header">
              <Link href="/" className="brand">
                <span className="brand-icon">⚡</span>英語チャレンジ
              </Link>
              <SetBadge />
              <SiteNav />
              <SoundControls />
            </header>
            <main className="container">
              <AccountGate>{children}</AccountGate>
            </main>
          </SetProvider>
        </MeProvider>
      </body>
    </html>
  );
}
