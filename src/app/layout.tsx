import type { Metadata, Viewport } from "next";
import Script from "next/script";
/* Dawn Ember type system (design.md): self-hosted variable faces, no runtime
   network requests. Display = Fraunces (the crew's voice), body = Inter,
   readouts = JetBrains Mono (every number is a measurement). */
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian — arrive better adjusted",
  description:
    "A daily plan for sleep, light and caffeine, timed to your trip — so jet lag costs you less of it.",
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
          {"try{var k='meridian:theme',t=localStorage.getItem(k)||'auto',p=localStorage.getItem(k+':paint'),dark;if(t==='light')dark=false;else if(t==='dark')dark=true;else if(p!==null)dark=p==='night';else dark=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)||new Date().getHours()>=21||new Date().getHours()<6;document.documentElement.dataset.theme=dark?'night':''}catch(e){}"}
        </Script>
        <Script id="sw-register" strategy="afterInteractive">
          {"if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}"}
        </Script>
      </body>
    </html>
  );
}
