'use client'

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
      <Link href="/" className="site-mark">Compact Pickup</Link>
    </header>
  )
}
