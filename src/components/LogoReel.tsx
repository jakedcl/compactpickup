'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SanityImage from '@/components/SanityImage'
import type { SanityImageValue } from '@/lib/sanityImage'
import { prefersReducedMotion } from '@/lib/vhsSession'

export type ReelBrand = {
  _id: string
  name: string
  slug: { current: string }
  logo?: SanityImageValue | null
}

const SPIN_MS = 2200
const FADE_MS = 280
const LOOPS = 5
const COPIES = 8

function easeOutQuart(t: number) {
  return 1 - (1 - t) ** 4
}

export default function LogoReel({
  brands,
  status,
  onRetry,
}: {
  brands: ReelBrand[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
}) {
  const [landed, setLanded] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [slot, setSlot] = useState(72)
  const windowRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLUListElement>(null)
  const offsetRef = useRef(0)
  const slotRef = useRef(72)
  const rafRef = useRef<number | null>(null)
  const reduceRef = useRef(false)
  const startedRef = useRef(false)
  const count = brands.length
  const brand = landed != null ? brands[landed] : null
  const href = brand ? `/${brand.slug.current}` : '/'

  const strip = useMemo(() => {
    const rows: Array<{ brand: ReelBrand; key: string }> = []
    for (let copy = 0; copy < COPIES; copy += 1) {
      brands.forEach((item) => {
        rows.push({ brand: item, key: `${item._id}-${copy}` })
      })
    }
    return rows
  }, [brands])

  const paint = useCallback((pos: number, blur: number, opacity = 1) => {
    const node = trackRef.current
    if (!node) return
    node.style.transform = `translate3d(0, ${-pos * slotRef.current}px, 0)`
    node.style.filter = blur > 0.4 ? `blur(${blur}px)` : 'none'
    node.style.opacity = String(opacity)
  }, [])

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const spinTo = useCallback((index: number) => {
    if (!count) return
    stop()
    if (reduceRef.current) {
      offsetRef.current = index
      paint(index, 0, 0.15)
      setLanded(index)
      setSpinning(true)
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / FADE_MS)
        paint(index, 0, 0.15 + 0.85 * t)
        if (t < 1) rafRef.current = requestAnimationFrame(tick)
        else setSpinning(false)
      }
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const start = offsetRef.current % count
    const delta = (index - Math.round(start) + count) % count
    const end = start + LOOPS * count + delta
    offsetRef.current = start
    setLanded(null)
    setSpinning(true)
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / SPIN_MS)
      let pos = start + (end - start) * easeOutQuart(t)
      if (t > 0.72) {
        const u = (t - 0.72) / 0.28
        pos += Math.sin(u * Math.PI) * 0.42 * (1 - u * 0.15)
      }
      const blur = t < 0.5 ? 6 : t < 0.78 ? 2.5 : 0
      offsetRef.current = pos
      paint(pos, blur, 1)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      offsetRef.current = end
      paint(end, 0, 1)
      setLanded(index)
      setSpinning(false)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [count, paint, stop])

  useEffect(() => {
    reduceRef.current = prefersReducedMotion()
  }, [])

  useEffect(() => {
    slotRef.current = slot
    paint(offsetRef.current, 0, trackRef.current ? Number(trackRef.current.style.opacity || 1) : 1)
  }, [slot, paint])

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
    if (status !== 'ready' || count < 1 || startedRef.current) return
    startedRef.current = true
    spinTo(Math.floor(Math.random() * count))
  }, [status, count, spinTo])

  useEffect(() => () => stop(), [stop])

  function respin() {
    if (spinning || !count) return
    let next = Math.floor(Math.random() * count)
    if (count > 1 && landed != null) {
      while (next === landed) next = Math.floor(Math.random() * count)
    }
    spinTo(next)
  }

  const label = status === 'error'
    ? 'Brands unavailable'
    : status !== 'ready'
      ? 'Loading brands'
      : spinning && landed == null
        ? 'Spinning'
        : brand?.name ?? ''

  return (
    <div className="tape-hero">
      <div className="tape-stage">
        <picture>
          <source srcSet="/vhs-tape.webp" type="image/webp" />
          <img className="tape-photo" src="/vhs-tape.png" alt="" width={438} height={240} />
        </picture>
        <div ref={windowRef} className="tape-window" aria-hidden={spinning || !brand}>
          {status === 'ready' && count > 0 ? (
            <ul ref={trackRef} className="tape-track">
              {strip.map((item, itemIndex) => (
                <li key={item.key} className="tape-slot" style={{ height: slot }} aria-hidden={itemIndex % count !== landed}>
                  {item.brand.logo?.asset?._ref ? (
                    <SanityImage image={item.brand.logo} alt="" sizes="220px" width={200} height={80} eager className="reel-logo" />
                  ) : (
                    <span className="reel-fallback">{item.brand.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tape-window-note">{status === 'error' ? 'Signal lost' : 'Loading'}</p>
          )}
        </div>
        {!spinning && brand ? <Link href={href} className="tape-hit" aria-label={brand.name} /> : null}
      </div>

      <p className="tape-brand" aria-live="polite">{label}</p>

      <div className="tape-controls">
        <button type="button" className="btn btn-accent" onClick={respin} disabled={spinning || status !== 'ready' || !count}>
          Respin
        </button>
        {status === 'error' ? (
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        ) : null}
      </div>
      {status === 'ready' && count === 0 ? <p className="state">No brands in the deck.</p> : null}
    </div>
  )
}
