import type { Metadata } from "next";
import "./globals.css";

import { Navbar } from "../components/layout/Navbar";
import { BackgroundPattern } from "../components/layout/BackgroundPattern";

export const metadata: Metadata = {
  title: "Chronocode — Git History Intelligence",
  description: "Turn raw git history into clear, AI-generated explanations. Understand any codebase instantly.",
  openGraph: {
    title: "Chronocode — Git History Intelligence",
    description: "Turn raw git history into clear, AI-generated explanations. Paste a GitHub URL to reconstruct context instantly.",
    type: "website",
    locale: "en_US",
    siteName: "Chronocode",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chronocode — Git History Intelligence",
    description: "Turn raw git history into clear, AI-generated explanations.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <BackgroundPattern />
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <Navbar />
          <div style={{ flex: 1 }}>{children}</div>
        </div>
      </body>
    </html>
  );
}
