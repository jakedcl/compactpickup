'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NameThatTruck from '@/components/NameThatTruck'
import type { GameStill } from '@/lib/gameDeck'
import '@/components/home-game.css'

export default function GameScreen({
  stills,
  status,
  onRetry,
}: {
  stills: GameStill[]
  status: 'ready' | 'error'
  onRetry: () => Promise<void>
}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  const retry = useCallback(() => {
    setRetrying(true)
    void onRetry()
      .then(() => router.refresh())
      .catch(() => setRetrying(false))
  }, [onRetry, router])

  useEffect(() => {
    setRetrying(false)
  }, [stills, status])

  if (retrying) {
    return (
      <main className="game-page">
        <p className="state">Loading the round...</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="game-page">
        <p className="state" role="alert">Signal lost. Could not load the stills.</p>
        <div className="quiz-actions">
          <button type="button" className="btn btn-accent" onClick={retry}>Try again</button>
          <Link href="/" className="btn">Exit</Link>
        </div>
      </main>
    )
  }

  return (
    <main>
      <NameThatTruck stills={stills} />
    </main>
  )
}
