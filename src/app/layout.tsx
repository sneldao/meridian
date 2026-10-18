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
  themeColor: "#D96B43",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <Script id="theme-init" strategy="beforeInteractive">
          {"try{var t=localStorage.getItem('meridian:theme')||'auto';var dark=t==='dark'||(t==='auto'&&((window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)||new Date().getHours()>=21||new Date().getHours()<6));document.documentElement.dataset.theme=dark?'night':''}catch(e){}"}
        </Script>
        <Script id="sw-register" strategy="afterInteractive">
          {"if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}"}
        </Script>
      </body>
    </html>
  );
}
