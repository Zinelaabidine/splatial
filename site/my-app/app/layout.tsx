import type { Metadata } from "next";
import { Geist, Geist_Mono, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AmplifyProvider from "@/components/layout/AmplifyProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
        className={`${geistSans.variable} ${geistMono.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-hanken)] bg-[#121212] text-[#f1f1f1] antialiased`}
      >
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
