import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { rootOpenGraph, rootTwitter } from "@/lib/metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://compactpickup.com'),
  title: { default: 'Compact Pickup', template: '%s' },
  description: "A field guide to compact and mid-size pickup trucks",
  openGraph: rootOpenGraph,
  twitter: rootTwitter,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
