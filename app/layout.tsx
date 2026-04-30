import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SyllogosHub — Διαχείριση Συλλόγου",
  description:
    "Ειδικό ERP για Ελληνικούς Πολιτιστικούς Συλλόγους: μέλη, συνδρομές, εκδηλώσεις και πλάνο τραπεζιών.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SyllogosHub",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#800000",
  width: "device-width",
  initialScale: 1,
  // ΣΚΟΠΙΜΑ ΔΕΝ έχει userScalable: false ή maximumScale — διατηρούμε
  // accessibility (pinch-to-zoom must work).
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="el"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
