'use client'

import { BinderClock } from '@/app/binder/binder-clock'
import './binder.css'

export default function BinderError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
        <div className="wrap narrow">
          <p className="kicker">Binder</p>
          <h1>Photo library</h1>
          <p>The page did not finish loading.</p>
          <button type="button" className="btn" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </main>
    </>
  )
}
