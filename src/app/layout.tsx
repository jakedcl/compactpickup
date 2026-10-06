import type { Metadata, Viewport } from "next";
import SiteSearch from "@/components/SiteSearch";
import SiteFooter from "@/components/ui/SiteFooter";
import SiteHeader from "@/components/ui/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compact Pickup",
  description: "A field guide to compact and mid-size pickup trucks",
  icons: {
    icon: '/Pick-up.ico',
    shortcut: '/Pick-up.ico',
    apple: '/Pick-up.ico',
  },
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
      <body>
        <a className="skip" href="#content">Skip to content</a>
        <SiteHeader />
        <div id="content">{children}</div>
        <SiteFooter />
        <SiteSearch />
      </body>
    </html>
  );
}
