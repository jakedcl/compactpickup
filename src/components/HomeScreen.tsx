'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ImageCarousel, { type TruckImageData } from '@/components/ImageCarousel'
import TapeShelf, { type ShelfManufacturer } from '@/components/TapeShelf'
import VhsBoot from '@/components/VhsBoot'
import { createVhsClick } from '@/lib/vhsClick'
import { hasSeenBoot, markBootSeen, prefersReducedMotion } from '@/lib/vhsSession'
import '@/components/vhs-hero.css'

export default function HomeScreen({
  manufacturers,
  makerStatus,
  images,
  onRetry,
}: {
  manufacturers: ShelfManufacturer[]
  makerStatus: 'ready' | 'error'
  images: TruckImageData[]
  onRetry: () => Promise<void>
}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [boot, setBoot] = useState<'unknown' | 'play' | 'menu'>('unknown')
  const [clickOn, setClickOn] = useState(false)
  const clicker = useRef(createVhsClick())

  const retry = useCallback(() => {
    setRetrying(true)
    void onRetry()
      .then(() => router.refresh())
      .catch(() => setRetrying(false))
  }, [onRetry, router])

  useEffect(() => {
    setRetrying(false)
  }, [manufacturers, makerStatus])

  useEffect(() => {
    if (prefersReducedMotion() || hasSeenBoot()) {
      markBootSeen()
      setBoot('menu')
    } else {
      setBoot('play')
    }
  }, [])

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const finishBoot = useCallback((viaKeyboard: boolean) => {
    markBootSeen()
    setBoot('menu')
    if (!viaKeyboard) return
    window.setTimeout(() => {
      const shelf = document.getElementById('manufacturer-shelf')
      const first = shelf?.querySelector<HTMLAnchorElement>('a')
      if (first) first.focus({ focusVisible: true } as FocusOptions)
      else shelf?.focus()
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
        <TapeShelf
          manufacturers={manufacturers}
          status={retrying ? 'loading' : makerStatus}
          onRetry={retry}
          armed={clickOn}
          onPress={() => clicker.current.blip()}
        />
        {boot === 'menu' && images.length > 0 ? <ImageCarousel images={images} /> : null}
        <div className="deck-status">
          <span className="vhs-time">{currentTime}</span>
          <button
            type="button"
            className={`vhs-click-toggle ${clickOn ? 'is-on' : ''}`}
            aria-pressed={clickOn}
            onClick={() => {
              clicker.current.arm()
              setClickOn((on) => !on)
            }}
          >
            Click {clickOn ? 'on' : 'off'}
          </button>
          <Link href="https://compactpickup.sanity.studio" target="_blank">Studio</Link>
        </div>
      </div>
    </main>
  )
}
