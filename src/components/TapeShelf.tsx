'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { urlFor } from '@/lib/sanity'

export interface ShelfManufacturer {
  _id: string
  name: string
  slug: { current: string }
  logo?: {
    asset?: {
      _ref: string
    }
  } | null
}

const BANDS: Record<string, string> = {
  toyota: '#eb0a1e',
  ford: '#003478',
  chevy: '#c99700',
  gmc: '#cc1f1f',
  nissan: '#c3002f',
  mazda: '#111111',
  isuzu: '#1d4e89',
  other: '#6b6256',
}

const FALLBACK_BANDS = ['#eb0a1e', '#003478', '#c99700', '#111111', '#1d4e89', '#0b6b3a']

function bandFor(slug: string, index: number) {
  return BANDS[slug] ?? FALLBACK_BANDS[index % FALLBACK_BANDS.length]
}

function logoSrc(logo: ShelfManufacturer['logo']) {
  if (!logo?.asset?._ref) return null
  return urlFor({ asset: { _ref: logo.asset._ref } }).width(280).height(120).fit('max').auto('format').url()
}

export default function TapeShelf({
  manufacturers,
  status,
  onRetry,
  armed,
  onPress,
}: {
  manufacturers: ShelfManufacturer[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
  armed: boolean
  onPress: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const press = () => {
    if (armed) onPress()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const nav = event.currentTarget
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'))
    if (!links.length) return
    const current = links.findIndex((link) => link === document.activeElement)
    let next = current

    if (event.key === 'ArrowRight') next = current < 0 ? 0 : Math.min(current + 1, links.length - 1)
    else if (event.key === 'ArrowLeft') next = current < 0 ? links.length - 1 : Math.max(current - 1, 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = links.length - 1
    else return

    event.preventDefault()
    const target = links[next]
    if (!target) return
    setActiveId(target.dataset.id ?? null)
    target.focus({ focusVisible: true } as FocusOptions)
  }

  return (
    <section className="tape-section" aria-labelledby="tape-heading">
      <h2 id="tape-heading" className="tape-heading">Select a tape</h2>
      <p className="tape-hint">Arrows or swipe</p>

      {status === 'error' ? (
        <div className="tape-state" role="alert">
          <p>Signal lost. Could not load the shelf.</p>
          <button type="button" className="boot-skip tape-retry" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : status === 'ready' && manufacturers.length === 0 ? (
        <div className="tape-state">
          <p>No tapes in the deck.</p>
          <p className="tape-state-note">Add manufacturers in Studio.</p>
        </div>
      ) : (
        <nav
          id="manufacturer-shelf"
          className="tape-shelf"
          aria-label="Manufacturers"
          aria-busy={status === 'loading'}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <ul className="tape-row">
            {status === 'loading' &&
              Array.from({ length: 6 }, (_, index) => (
                <li key={`ghost-${index}`} aria-hidden="true">
                  <span className="tape tape-ghost" />
                </li>
              ))}
            {status === 'ready' &&
              manufacturers.map((manufacturer, index) => {
                const src = logoSrc(manufacturer.logo)
                const slug = manufacturer.slug.current
                return (
                  <li key={manufacturer._id}>
                    <Link
                      href={`/${slug}`}
                      data-id={manufacturer._id}
                      className={activeId === manufacturer._id ? 'tape is-active' : 'tape'}
                      style={{ ['--tilt' as string]: `${index % 2 === 0 ? -0.7 : 0.6}deg`, ['--band' as string]: bandFor(slug, index) }}
                      onPointerDown={press}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') press()
                      }}
                      onFocus={(event) => {
                        event.currentTarget.scrollIntoView({
                          inline: 'center',
                          block: 'nearest',
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                        })
                      }}
                      onBlur={(event) => {
                        const shelf = event.currentTarget.closest('#manufacturer-shelf')
                        const next = event.relatedTarget
                        if (!(next instanceof Node) || !shelf?.contains(next)) setActiveId(null)
                      }}
                    >
                      <span className="tape-shell">
                        <span className="tape-window" aria-hidden="true">
                          <span className="tape-reel" />
                          <span className="tape-reel" />
                        </span>
                        <span className="tape-sticker">
                          <span className="tape-band" aria-hidden="true" />
                          <span className="tape-logo-slot">
                            {src ? (
                              <Image
                                src={src}
                                alt=""
                                width={140}
                                height={48}
                                className="tape-logo"
                              />
                            ) : (
                              <span className="tape-initials" aria-hidden="true">
                                {manufacturer.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'CP'}
                              </span>
                            )}
                          </span>
                          <span className="tape-name">{manufacturer.name}</span>
                        </span>
                        <span className="tape-sp" aria-hidden="true">SP</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
          </ul>
          <div className="tape-deck" aria-hidden="true" />
        </nav>
      )}
    </section>
  )
}
