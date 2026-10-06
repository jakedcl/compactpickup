'use client'

import Link from 'next/link'
import { client, manufacturersQuery, allTruckImagesQuery } from '@/lib/sanity'
import { useCallback, useEffect, useRef, useState } from 'react'
import ImageCarousel from '@/components/ImageCarousel'
import TapeShelf, { type ShelfManufacturer } from '@/components/TapeShelf'
import VhsBoot from '@/components/VhsBoot'
import { createVhsClick } from '@/lib/vhsClick'
import { hasSeenBoot, markBootSeen, prefersReducedMotion } from '@/lib/vhsSession'
import '@/components/vhs-hero.css'

interface TruckImageData {
  alt?: string
  caption?: string
  asset: { _ref: string }
  truckTitle: string
  manufacturerName: string
  truckSlug: string
  manufacturerSlug: string
  yearRange?: string
}

function sortManufacturers(data: ShelfManufacturer[]) {
  return [...data].sort((a, b) => {
    if (a.name === "More..." || a.name === "One-Off's") return 1
    if (b.name === "More..." || b.name === "One-Off's") return -1
    return a.name.localeCompare(b.name)
  })
}

export default function HomePage() {
  const [manufacturers, setManufacturers] = useState<ShelfManufacturer[]>([])
  const [makerStatus, setMakerStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [allImages, setAllImages] = useState<TruckImageData[]>([])
  const [currentTime, setCurrentTime] = useState('')
  const [boot, setBoot] = useState<'unknown' | 'play' | 'menu'>('unknown')
  const [clickOn, setClickOn] = useState(false)
  const clicker = useRef(createVhsClick())

  const loadManufacturers = useCallback(() => {
    setMakerStatus('loading')
    client.fetch(manufacturersQuery)
      .then((data: ShelfManufacturer[]) => {
        setManufacturers(sortManufacturers(data ?? []))
        setMakerStatus('ready')
      })
      .catch(() => setMakerStatus('error'))
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
    loadManufacturers()
    client.fetch(allTruckImagesQuery)
      .then((data: Array<{ images: TruckImageData[] }>) => {
        const flat: TruckImageData[] = []
        data.forEach((truck) => {
          truck.images?.forEach((image) => flat.push(image))
        })
        setAllImages(flat)
      })
      .catch(() => setAllImages([]))
  }, [loadManufacturers])

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
          status={makerStatus}
          onRetry={loadManufacturers}
          armed={clickOn}
          onPress={() => clicker.current.blip()}
        />
        {boot === 'menu' && allImages.length > 0 ? <ImageCarousel images={allImages} /> : null}
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
