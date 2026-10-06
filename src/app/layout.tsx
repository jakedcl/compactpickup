import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteSearch from "@/components/SiteSearch";
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
  title: "Compact Pickup",
  description: "Your guide to compact and mid-size pickup trucks",
  icons: {
    icon: '/Pick-up.ico',
    shortcut: '/Pick-up.ico',
    apple: '/Pick-up.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <SiteSearch />
        <footer className="text-center py-4 text-gray-500 text-sm">
          <a 
            href="https://jakedcl.com/compactpickup" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-gray-700 transition-colors"
          >
            jakedcl.com/compactpickup
          </a>
        </footer>
      </body>
    </html>
  );
}
