'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SanityImage from '@/components/SanityImage'
import VhsBoot from '@/components/VhsBoot'
import type { ShelfManufacturer } from '@/components/TapeShelf'
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
  manufacturers: ShelfManufacturer[]
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
  const logos = manufacturers.filter((manufacturer) => manufacturer.logo?.asset?._ref && manufacturer.slug?.current)

  return (
    <main className="screen">
      {boot === 'play' && <VhsBoot onDone={finishBoot} />}
      <div className={boot === 'unknown' ? 'home-hold' : 'home-live'} inert={boot !== 'menu'}>
        {brandStatus === 'error' ? (
          <div className="home-logos-fallback">
            <p>Could not load the brands.</p>
            <button type="button" className="btn" onClick={retry}>Retry</button>
          </div>
        ) : brandStatus === 'loading' ? (
          <p className="home-logos-fallback">Loading brands</p>
        ) : logos.length > 0 ? (
          <div className="home-logos">
            {logos.map((manufacturer) => (
              <Link
                key={manufacturer._id}
                href={`/${manufacturer.slug.current}`}
                className="vhs-logo-container hover:scale-110 transition-transform"
              >
                <SanityImage
                  image={manufacturer.logo!}
                  alt={manufacturer.name}
                  sizes="80px"
                  width={120}
                  height={60}
                  eager
                  className="vhs-logo"
                />
              </Link>
            ))}
          </div>
        ) : null}
        <div className="wrap home-intro">
          <p className="lede">Compact and mid-size pickups.</p>
        </div>
        <form className="home-find" action="/browse" method="get">
          <label htmlFor="home-q">What truck are you looking at?</label>
          <div className="home-find-row">
            <input id="home-q" name="q" placeholder="Hilux, 22R, N10" autoComplete="off" enterKeyHint="search" />
            <button type="submit" className="btn">Search</button>
          </div>
        </form>
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
    </main>
  )
}
