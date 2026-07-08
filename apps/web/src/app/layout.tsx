import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
