import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import AmplifyProvider from "@/components/AmplifyProvider"; // Import the provider

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});



export const metadata: Metadata = {
  title: "Create Next App",
  description: "Next.js Frontend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
<html lang="en">
      <body className={inter.className}>
        <AmplifyProvider>
          {children}
        </AmplifyProvider>
      </body>
    </html>
  );
}
