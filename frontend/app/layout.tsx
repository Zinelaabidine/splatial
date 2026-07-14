import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AmplifyProvider from "@/components/layout/AmplifyProvider";

// Geist Sans was previously loaded here but never consumed: --font-sans resolves
// to Tailwind's default stack and the body uses --font-hanken as its primary
// family. Dropping it removes one WOFF2 download from the critical path.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Splatworks",
  description: "Gaussian splatting platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistMono.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-hanken)] bg-[var(--nord-bg)] text-[var(--nord-ink)] antialiased`}
      >
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
