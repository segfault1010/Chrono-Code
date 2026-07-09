import type { Metadata } from "next";
import "./globals.css";

import { Navbar } from "../components/layout/Navbar";
import { BackgroundPattern } from "../components/layout/BackgroundPattern";

export const metadata: Metadata = {
  title: "Chronocode — Git History Intelligence",
  description:
    "Turn raw git history into the explanation a senior teammate would give you. AI-powered commit explanations grounded in actual diffs.",
  openGraph: {
    title: "Chronocode — Git History Intelligence",
    description:
      "Turn raw git history into the explanation a senior teammate would give you.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BackgroundPattern />
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <Navbar />
          <div style={{ flex: 1 }}>{children}</div>
        </div>
      </body>
    </html>
  );
}
