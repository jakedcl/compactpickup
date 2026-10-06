'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Shelf' },
  { href: '/browse', label: 'Browse' },
  { href: '/timeline', label: 'Timeline' },
]

export default function SiteHeader() {
  const pathname = usePathname()

  function openFind() {
    if (pathname === '/browse') {
      document.getElementById('truck-search')?.focus()
      return
    }
    window.dispatchEvent(new Event('cp-open-search'))
  }

  return (
    <header className="site-header">
      <Link href="/" className="site-mark">Compact Pickup</Link>
      <nav className="site-nav" aria-label="Primary">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <button type="button" className="site-find" aria-keyshortcuts="/" onClick={openFind}>
        Find <kbd>/</kbd>
      </button>
    </header>
  )
}
