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

const SLIDE_MS = 6500

function TruckSlideshow({
  stills,
  status,
  index,
  onPause,
  onRetry,
}: {
  stills: GameStill[]
  status: 'loading' | 'ready' | 'error'
  index: number
  onPause: (paused: boolean) => void
  onRetry: () => void
}) {
  const slides = stills.filter((still) => still.asset?._ref && still.manufacturerSlug && still.truckSlug)
  const slide = slides[index % Math.max(slides.length, 1)]

  return (
    <section
      className="home-reel"
      aria-roledescription="carousel"
      aria-label="Trucks"
      onMouseEnter={() => onPause(true)}
      onMouseLeave={() => onPause(false)}
      onFocus={() => onPause(true)}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        onPause(false)
      }}
    >
      {status === 'error' ? (
        <>
          <p>Signal lost. Could not load the trucks.</p>
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </>
      ) : status === 'loading' ? (
        <p>Loading trucks</p>
      ) : slide?.asset?._ref && slide.manufacturerSlug && slide.truckSlug ? (
        <Link href={`/${slide.manufacturerSlug}/${slide.truckSlug}`} className="home-slide">
          <span className="home-still">
            <SanityImage
              image={slide}
              alt=""
              sizes="(max-width: 800px) 100vw, 720px"
              fill
              cropRatio={0.625}
              eager
              className="sanity-cover"
            />
          </span>
          <span className="home-slide-copy">
            {slide.manufacturerName ? <span className="home-slide-make">{slide.manufacturerName}</span> : null}
            <span className="home-slide-name">{slide.truckTitle}</span>
            {slide.yearRange?.trim() ? <span className="home-slide-years">{slide.yearRange.trim()}</span> : null}
          </span>
        </Link>
      ) : (
        <p>No truck photos yet.</p>
      )}
      {status === 'ready' && slides.length > 0 ? (
        <Link id="make-it-a-game" href="/game" className="btn btn-accent home-play-btn">
          Make it a game
        </Link>
      ) : null}
    </section>
  )
}

export default function HomeScreen({
  manufacturers,
  makerStatus,
  stills,
  stillStatus,
  onRetry,
}: {
  manufacturers: ShelfManufacturer[]
  makerStatus: 'ready' | 'error'
  stills: GameStill[]
  stillStatus: 'ready' | 'error'
  onRetry: () => Promise<void>
}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [boot, setBoot] = useState<'unknown' | 'play' | 'menu'>('unknown')
  const [slideIndex, setSlideIndex] = useState(0)
  const [slidePaused, setSlidePaused] = useState(false)
  const slides = stills.filter((still) => still.asset?._ref && still.manufacturerSlug && still.truckSlug)

  const retry = useCallback(() => {
    setRetrying(true)
    void onRetry()
      .then(() => router.refresh())
      .catch(() => setRetrying(false))
  }, [onRetry, router])

  useEffect(() => {
    setRetrying(false)
    setSlideIndex(0)
  }, [manufacturers, makerStatus, stills, stillStatus])

  useEffect(() => {
    if (slidePaused || slides.length < 2 || prefersReducedMotion()) return
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length)
    }, SLIDE_MS)
    return () => window.clearInterval(timer)
  }, [slidePaused, slides.length])

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
      document.getElementById('make-it-a-game')?.focus({ focusVisible: true } as FocusOptions)
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
            <input id="home-q" name="q" placeholder="Hilux, 4x4, 22R" autoComplete="off" enterKeyHint="search" />
            <button type="submit" className="btn">Search</button>
          </div>
        </form>
        <TruckSlideshow
          stills={slides}
          status={photoStatus}
          index={slideIndex}
          onPause={setSlidePaused}
          onRetry={retry}
        />
      </div>
    </main>
  )
}
