import HistLayout from "../jhist/HistLayout";

// 世界史のページ（/whist/…）。画面は日本史と同じもの（app/jhist）を使い、科目だけを世界史にする
export default function WhistLayout({ children }: { children: React.ReactNode }) {
  return <HistLayout subject="whist">{children}</HistLayout>;
}
