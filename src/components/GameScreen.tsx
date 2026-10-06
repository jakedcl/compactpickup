'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import NameThatTruck from '@/components/NameThatTruck'
import { client, allTruckImagesQuery } from '@/lib/sanity'
import { buildDeck, type GameStill } from '@/lib/gameDeck'
import '@/components/home-game.css'

export default function GameScreen() {
  const [stills, setStills] = useState<GameStill[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    client
      .fetch(allTruckImagesQuery)
      .then((data: Array<{ images?: GameStill[] }>) => {
        setStills(buildDeck(data))
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (status === 'loading') {
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
          <button type="button" className="btn btn-accent" onClick={load}>Try again</button>
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
