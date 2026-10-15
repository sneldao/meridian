import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian — agents that fly ahead of you",
  description:
    "A crew of long-running agents resets your body clock before you land.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#07090f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Script id="sw-register" strategy="afterInteractive">
          {"if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}"}
        </Script>
      </body>
    </html>
  );
}
