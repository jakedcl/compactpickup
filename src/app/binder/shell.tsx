import type { ReactNode } from 'react'
import { BinderClock } from '@/app/binder/binder-clock'
import './binder.css'

export function BinderShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="binder-bar">
        <p>
          <span aria-hidden="true">▶</span> Play <span>SP</span>
        </p>
        <p>
          Binder <BinderClock />
        </p>
      </header>
      <main id="content" className="screen">
        <div className={wide ? 'wrap binder-wide' : 'wrap narrow'}>{children}</div>
      </main>
    </>
  )
}
