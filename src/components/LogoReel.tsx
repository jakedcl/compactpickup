'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import SanityImage from '@/components/SanityImage'
import type { SanityImageValue } from '@/lib/sanityImage'
import { prefersReducedMotion } from '@/lib/vhsSession'

export type ReelBrand = {
  _id: string
  name: string
  slug: { current: string }
  logo?: SanityImageValue | null
}

const SPIN_MS = 3200

export default function LogoReel({
  brands,
  status,
  onRetry,
}: {
  brands: ReelBrand[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [slot, setSlot] = useState(72)
  const [smooth, setSmooth] = useState(true)
  const windowRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const touchY = useRef<number | null>(null)

  const count = brands.length
  const brand = brands[index]
  const href = brand ? `/${brand.slug.current}` : '/'

  useEffect(() => {
    indexRef.current = index
  }, [index])

  useEffect(() => {
    if (prefersReducedMotion()) setPaused(true)
  }, [])

  useEffect(() => {
    const node = windowRef.current
    if (!node) return
    const measure = () => setSlot(Math.max(48, node.clientHeight || 72))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [status])

  useEffect(() => {
    if (paused || status !== 'ready' || count < 2 || prefersReducedMotion()) return
    const timer = window.setInterval(() => {
      setSmooth(true)
      setIndex((value) => (value + 1) % count)
    }, SPIN_MS)
    return () => window.clearInterval(timer)
  }, [paused, status, count])

  const step = useCallback((direction: number) => {
    if (!count) return
    setPaused(true)
    const next = (indexRef.current + direction + count) % count
    const jump = Math.abs(next - indexRef.current)
    setSmooth(jump === 1 || jump === count - 1)
    setIndex(next)
  }, [count])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      step(event.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  return (
    <div className="tape-hero">
      <div className="tape-stage">
        <picture>
          <source srcSet="/vhs-tape.webp" type="image/webp" />
          <img className="tape-photo" src="/vhs-tape.png" alt="" width={453} height={255} />
        </picture>
        <div
          ref={windowRef}
          className="tape-window"
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Manufacturer reel"
          onTouchStart={(event) => {
            touchY.current = event.changedTouches[0]?.clientY ?? null
          }}
          onTouchEnd={(event) => {
            if (touchY.current == null) return
            const delta = (event.changedTouches[0]?.clientY ?? touchY.current) - touchY.current
            if (delta > 36) step(-1)
            if (delta < -36) step(1)
            touchY.current = null
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              event.stopPropagation()
              step(1)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              step(-1)
            }
          }}
        >
          {status === 'ready' && count > 0 ? (
            <ul
              className={smooth ? 'tape-track is-smooth' : 'tape-track'}
              style={{ transform: `translateY(${-index * slot}px)` }}
            >
              {brands.map((item, itemIndex) => (
                <li key={item._id} className={itemIndex === index ? 'tape-slot is-on' : 'tape-slot'} style={{ height: slot }} aria-hidden={itemIndex !== index}>
                  {item.logo?.asset?._ref ? (
                    <SanityImage image={item.logo} alt="" sizes="180px" width={200} height={80} className="reel-logo" />
                  ) : (
                    <span className="reel-fallback">{item.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tape-window-note">{status === 'error' ? 'Signal lost' : 'Loading'}</p>
          )}
        </div>
        {brand ? <Link href={href} className="tape-hit" tabIndex={-1} aria-hidden="true" /> : null}
      </div>

      <p className="tape-brand" aria-live="polite">{brand?.name ?? (status === 'error' ? 'Brands unavailable' : 'Loading brands')}</p>

      <div className="tape-controls">
        <button type="button" className="btn" onClick={() => step(-1)} disabled={!count} aria-label="Previous brand">
          Up
        </button>
        {brand ? (
          <Link href={href} className="btn btn-accent">Play</Link>
        ) : (
          <button type="button" className="btn btn-accent" disabled>Play</button>
        )}
        <button type="button" className="btn" onClick={() => step(1)} disabled={!count} aria-label="Next brand">
          Down
        </button>
      </div>
      {status === 'error' ? (
        <button type="button" className="btn" onClick={onRetry}>Retry</button>
      ) : null}
      {status === 'ready' && count === 0 ? <p className="state">No brands in the deck.</p> : null}
    </div>
  )
}
