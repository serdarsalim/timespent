import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goal Tracker App",
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "SLMTRACK",
    "personal goal setting",
    "productivity tracker",
    "personal OKRs",
    "weekly schedule planner",
    "minimalist planning app",
  ],
  authors: [{ name: APP_NAME }],
  category: "productivity",
  openGraph: {
    title: "Goal Tracker App",
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Goal Tracker App",
    description: APP_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
