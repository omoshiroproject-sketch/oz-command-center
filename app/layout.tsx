import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OZ COMMAND CENTER",
  description:
    "OZとリアルタイムに音声で対話する、プライベート・インテリジェンス・インターフェース。",
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
