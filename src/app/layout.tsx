import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const jbm = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbm",
});

export const metadata: Metadata = {
  title: "VOLBREAK α — ETHUSDT 2H Adaptive Volatility Breakout",
  description:
    "Paper-trading terminal running the v3.3c Adaptive Volatility Breakout engine on live Binance ETHUSDT 2-hour data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${grotesk.variable} ${jbm.variable} antialiased terminal-bg`}
      >
        {children}
      </body>
    </html>
  );
}
