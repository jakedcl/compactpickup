'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SiteHeader() {
  const pathname = usePathname()

  if (pathname === '/game') {
    return (
      <header className="site-header is-game">
        <Link href="/" className="btn">Exit</Link>
      </header>
    )
  }

  return (
    <header className="site-header">
      <Link href="/" className="site-mark">
        <Image src="/Pick-up.ico" alt="" width={32} height={32} unoptimized />
        <span>Compact Pickup</span>
      </Link>
      <nav className="site-nav" aria-label="Sections">
        <Link href="/browse" className="btn" aria-current={pathname === '/browse' ? 'page' : undefined}>
          Browse
        </Link>
        <Link href="/timeline" className="btn" aria-current={pathname === '/timeline' ? 'page' : undefined}>
          Timeline
        </Link>
      </nav>
    </header>
  )
}
