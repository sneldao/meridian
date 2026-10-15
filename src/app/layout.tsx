import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian — agents that fly ahead of you",
  description:
    "A crew of long-running agents resets your body clock before you land.",
  manifest: "/manifest.webmanifest",
  themeColor: "#b8e356",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
