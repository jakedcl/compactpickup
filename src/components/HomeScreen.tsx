'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SanityImage from '@/components/SanityImage'
import SearchSuggest, { suggestionPressing } from '@/components/SearchSuggest'
import VhsBoot from '@/components/VhsBoot'
import type { ShelfManufacturer } from '@/components/TapeShelf'
import { EMPTY_FILTERS, filtersToQuery, searchSuggestions, suggestionHref, type CatalogTruck, type SearchSuggestion } from '@/lib/catalog'
import { filterEligibleStills, randomShuffle, type GameStill } from '@/lib/gameDeck'
import { HOME_SLIDE_MS } from '@/lib/homeSlideshow'
import { modelTitle } from '@/lib/makes'
import { scrollMobileFindFieldToTop } from '@/lib/find-search-focus'
import { hasSeenBoot, markBootSeen, prefersReducedMotion } from '@/lib/vhsSession'
import '@/components/find.css'
import '@/components/home-game.css'
import '@/components/vhs-hero.css'

function TruckSlideshow({
  stills,
  status,
  index,
  onRetry,
}: {
  stills: GameStill[]
  status: 'loading' | 'ready' | 'error'
  index: number
  onRetry: () => void
}) {
  const slides = stills.filter((still) => still.asset?._ref && still.manufacturerSlug && still.truckSlug)
  const slide = slides[index % Math.max(slides.length, 1)]

  return (
    <section className="home-reel" aria-roledescription="carousel" aria-label="Trucks">
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
            <span className="home-slide-name">{modelTitle(slide.manufacturerName, slide.truckTitle)}</span>
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
  trucks,
  catalogStatus,
  onRetry,
}: {
  manufacturers: ShelfManufacturer[]
  makerStatus: 'ready' | 'error'
  stills: GameStill[]
  stillStatus: 'ready' | 'error'
  trucks: CatalogTruck[]
  catalogStatus: 'ready' | 'error'
  onRetry: () => Promise<void>
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [boot, setBoot] = useState<'unknown' | 'play' | 'menu'>('unknown')
  const [slideIndex, setSlideIndex] = useState(0)
  const [previewStills, setPreviewStills] = useState<GameStill[] | null>(null)

  const retry = useCallback(() => {
    setRetrying(true)
    void onRetry()
      .then(() => router.refresh())
      .catch(() => setRetrying(false))
  }, [onRetry, router])

  useEffect(() => {
    setRetrying(false)
  }, [manufacturers, makerStatus, stills, stillStatus])

  useLayoutEffect(() => {
    setPreviewStills(randomShuffle(filterEligibleStills(stills)))
    setSlideIndex(0)
  }, [stills])

  const slideshowStills = previewStills ?? []
  const slideshowStatus =
    stillStatus === 'ready' && previewStills === null ? 'loading' : retrying ? 'loading' : stillStatus

  useEffect(() => {
    if (slideshowStills.length < 2) return
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slideshowStills.length)
    }, HOME_SLIDE_MS)
    return () => window.clearInterval(timer)
  }, [slideshowStills.length])

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

  const suggestions = useMemo(() => {
    if (catalogStatus !== 'ready' || !q.trim()) return []
    return searchSuggestions(trucks, q)
  }, [catalogStatus, q, trucks])

  const showSuggest = suggestOpen && q.trim().length > 0
  const browseHref = `/browse${filtersToQuery({ ...EMPTY_FILTERS, q })}`

  function blurSearch() {
    const input = searchRef.current
    input?.blur()
    window.setTimeout(() => input?.blur(), 0)
  }

  function runSearch(event?: { preventDefault: () => void }) {
    event?.preventDefault()
    blurSearch()
    setSuggestOpen(false)
    router.push(browseHref)
  }

  function pickSuggestion(suggestion: SearchSuggestion) {
    blurSearch()
    setSuggestOpen(false)
    router.push(suggestionHref(suggestion))
  }

  const brandStatus = retrying ? 'loading' : makerStatus
  const photoStatus = slideshowStatus
  const fieldStatus = retrying ? 'loading' : catalogStatus
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
        <form className="home-find" role="search" action="/browse" method="get" onSubmit={runSearch}>
          <label htmlFor="home-q">What truck are you looking at?</label>
          <div
            className="home-find-field"
            onBlur={(event) => {
              const field = event.currentTarget
              const next = event.relatedTarget
              if (next instanceof Node && field.contains(next)) return
              window.setTimeout(() => {
                if (suggestionPressing()) return
                if (field.contains(document.activeElement)) return
                setSuggestOpen(false)
              }, 0)
            }}
          >
            <div className="home-find-row">
              <input
                ref={searchRef}
                id="home-q"
                name="q"
                type="search"
                value={q}
                placeholder="Hilux, 4x4, 22R"
                autoComplete="off"
                enterKeyHint="search"
                role="combobox"
                aria-expanded={showSuggest}
                aria-controls="home-hits"
                aria-autocomplete="list"
                onChange={(event) => {
                  setQ(event.target.value)
                  setSuggestOpen(true)
                }}
                onFocus={(event) => {
                  setSuggestOpen(true)
                  scrollMobileFindFieldToTop(event.currentTarget)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runSearch(event)
                }}
              />
              <button type="submit" className="btn">Search</button>
            </div>
            {showSuggest ? (
              <div className="find-suggest">
                {fieldStatus === 'loading' ? <p className="find-empty">Loading trucks...</p> : null}
                {fieldStatus === 'error' ? (
                  <p className="find-empty">
                    Signal lost.{' '}
                    <button type="button" className="find-text-button" onClick={retry}>Retry</button>
                  </p>
                ) : null}
                {fieldStatus === 'ready' && suggestions.length === 0 ? <p className="find-empty">No trucks match.</p> : null}
                <SearchSuggest listId="home-hits" suggestions={suggestions} onPick={pickSuggestion} />
              </div>
            ) : null}
          </div>
        </form>
        <div className="home-scan">
          <Link href="/scan" className="btn btn-accent">
            Scan a truck
          </Link>
        </div>
        <TruckSlideshow
          stills={slideshowStills}
          status={photoStatus}
          index={slideIndex}
          onRetry={retry}
        />
      </div>
    </main>
  )
}
