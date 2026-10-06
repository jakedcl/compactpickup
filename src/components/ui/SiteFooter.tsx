'use client'

import { usePathname } from 'next/navigation'

export default function SiteFooter() {
  const pathname = usePathname()
  if (pathname === '/game') return null

  return (
    <footer className="site-footer">
      <span>Field guide</span>
      <a href="https://jakedcl.com/compactpickup" target="_blank" rel="noopener noreferrer">
        jakedcl.com/compactpickup
      </a>
    </footer>
  )
}
