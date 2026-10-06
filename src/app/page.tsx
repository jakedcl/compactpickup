'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import LogoReel, { type ReelBrand } from '@/components/LogoReel'
import SanityImage from '@/components/SanityImage'
import VhsBoot from '@/components/VhsBoot'
import { buildDeck, type GameStill } from '@/lib/gameDeck'
import { client, manufacturersQuery, allTruckImagesQuery } from '@/lib/sanity'
import { hasSeenBoot, markBootSeen, prefersReducedMotion } from '@/lib/vhsSession'
import '@/components/home-game.css'
import '@/components/vhs-hero.css'

function sortBrands(data: ReelBrand[]) {
  return [...data].sort((a, b) => {
    if (a.name === "More..." || a.name === "One-Off's") return 1
    if (b.name === "More..." || b.name === "One-Off's") return -1
    return a.name.localeCompare(b.name)
  })
}

export default function HomePage() {
  const [brands, setBrands] = useState<ReelBrand[]>([])
  const [brandStatus, setBrandStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [preview, setPreview] = useState<GameStill | null>(null)
  const [stillStatus, setStillStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [boot, setBoot] = useState<'unknown' | 'play' | 'menu'>('unknown')

  const loadBrands = useCallback(() => {
    setBrandStatus('loading')
    client
      .fetch(manufacturersQuery)
      .then((data: ReelBrand[]) => {
        setBrands(sortBrands(data ?? []))
        setBrandStatus('ready')
      })
      .catch(() => setBrandStatus('error'))
  }, [])

  const loadStills = useCallback(() => {
    setStillStatus('loading')
    client
      .fetch(allTruckImagesQuery)
      .then((data: Array<{ images?: GameStill[] }>) => {
        setPreview(buildDeck(data)[0] ?? null)
        setStillStatus('ready')
      })
      .catch(() => setStillStatus('error'))
  }, [])

  useEffect(() => {
    if (prefersReducedMotion() || hasSeenBoot()) {
      markBootSeen()
      setBoot('menu')
    } else {
      setBoot('play')
    }
  }, [])

  useEffect(() => {
    loadBrands()
    loadStills()
  }, [loadBrands, loadStills])

  const finishBoot = useCallback((viaKeyboard: boolean) => {
    markBootSeen()
    setBoot('menu')
    if (!viaKeyboard) return
    window.setTimeout(() => {
      document.getElementById('name-that-truck')?.focus({ focusVisible: true } as FocusOptions)
    }, 0)
  }, [])

  return (
    <main className="screen">
      {boot === 'play' && <VhsBoot onDone={finishBoot} />}
      <div className={boot === 'unknown' ? 'home-hold' : 'home-live'} inert={boot !== 'menu'}>
        <div className="wrap home-intro">
          <p className="kicker">U.S. truck market</p>
          <p className="lede">Compact and mid-size pickups, on tape.</p>
        </div>
        <div className="home-grid">
          <LogoReel brands={brands} status={brandStatus} onRetry={loadBrands} />
          <section className="home-play" aria-labelledby="name-that-truck-title">
            <p className="kicker" id="name-that-truck-title">Name that truck</p>
            <div className="home-still">
              {stillStatus === 'ready' && preview?.asset?._ref ? (
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
                <p className="still-empty">{stillStatus === 'error' ? 'Signal lost' : 'Loading a still'}</p>
              )}
            </div>
            {stillStatus === 'error' ? (
              <button type="button" className="btn" onClick={loadStills}>Retry</button>
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
