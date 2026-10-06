'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LogoReel, { type ReelBrand } from '@/components/LogoReel'
import SanityImage from '@/components/SanityImage'
import VhsBoot from '@/components/VhsBoot'
import type { GameStill } from '@/lib/gameDeck'
import { hasSeenBoot, markBootSeen, prefersReducedMotion } from '@/lib/vhsSession'
import '@/components/home-game.css'
import '@/components/vhs-hero.css'

export default function HomeScreen({
  manufacturers,
  makerStatus,
  preview,
  stillStatus,
  onRetry,
}: {
  manufacturers: ReelBrand[]
  makerStatus: 'ready' | 'error'
  preview: GameStill | null
  stillStatus: 'ready' | 'error'
  onRetry: () => Promise<void>
}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [boot, setBoot] = useState<'unknown' | 'play' | 'menu'>('unknown')

  const retry = useCallback(() => {
    setRetrying(true)
    void onRetry()
      .then(() => router.refresh())
      .catch(() => setRetrying(false))
  }, [onRetry, router])

  useEffect(() => {
    setRetrying(false)
  }, [manufacturers, makerStatus, preview, stillStatus])

  useEffect(() => {
    if (prefersReducedMotion() || hasSeenBoot()) {
      markBootSeen()
      setBoot('menu')
    } else {
      setBoot('play')
    }
  }, [])

  const finishBoot = useCallback((viaKeyboard: boolean) => {
    markBootSeen()
    setBoot('menu')
    if (!viaKeyboard) return
    window.setTimeout(() => {
      document.getElementById('name-that-truck')?.focus({ focusVisible: true } as FocusOptions)
    }, 0)
  }, [])

  const brandStatus = retrying ? 'loading' : makerStatus
  const photoStatus = retrying ? 'loading' : stillStatus

  return (
    <main className="screen">
      {boot === 'play' && <VhsBoot onDone={finishBoot} />}
      <div className={boot === 'unknown' ? 'home-hold' : 'home-live'} inert={boot !== 'menu'}>
        <div className="wrap home-intro">
          <p className="kicker">U.S. truck market</p>
          <p className="lede">Compact and mid-size pickups.</p>
        </div>
        <div className="home-grid">
          <LogoReel brands={manufacturers} status={brandStatus} onRetry={retry} />
          <section className="home-play" aria-labelledby="name-that-truck-title">
            <p className="kicker" id="name-that-truck-title">Name that truck</p>
            <div className="home-still">
              {photoStatus === 'ready' && preview?.asset?._ref ? (
                <SanityImage
                  image={preview}
                  alt=""
                  sizes="(max-width: 800px) 100vw, 520px"
                  fill
                  cropRatio={0.625}
                  eager
                  className="sanity-cover"
                />
              ) : (
                <p className="still-empty">
                  {photoStatus === 'error' ? 'Signal lost' : photoStatus === 'ready' ? 'No still for this round.' : 'Loading a still'}
                </p>
              )}
            </div>
            {photoStatus === 'error' ? (
              <button type="button" className="btn" onClick={retry}>Retry</button>
            ) : (
              <Link id="name-that-truck" href="/game" className="btn btn-accent home-play-btn">
                Name that truck
              </Link>
            )}
          </section>
        </div>
        <form className="home-find" action="/browse" method="get">
          <label htmlFor="home-q">What truck are you looking at?</label>
          <div className="home-find-row">
            <input id="home-q" name="q" placeholder="Hilux, 22R, N10" autoComplete="off" enterKeyHint="search" />
            <button type="submit" className="btn">Search</button>
          </div>
        </form>
        <div className="home-routes">
          <Link href="/browse" className="btn">Browse</Link>
          <Link href="/timeline" className="btn">Timeline</Link>
        </div>
      </div>
    </main>
  )
}
