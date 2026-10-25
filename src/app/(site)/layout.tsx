import SiteSearch from "@/components/SiteSearch";
import SiteFooter from "@/components/ui/SiteFooter";
import SiteHeader from "@/components/ui/SiteHeader";
import "@/components/home-game.css";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <SiteHeader />
      <div id="content">{children}</div>
      <SiteFooter />
      <SiteSearch />
    </>
  );
}
