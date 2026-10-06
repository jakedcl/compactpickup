'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import SanityImage from '@/components/SanityImage'
import TruckQuiz, { type QuizImage } from '@/components/TruckQuiz'
import { imageAlt } from '@/lib/imageAlt'
import { prefersReducedMotion } from '@/lib/vhsSession'

export interface TruckImageData extends QuizImage {
  yearRange?: string
  truckSlug: string
  manufacturerSlug: string
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function labelFor(image: TruckImageData): string {
  if (image.manufacturerName === 'More...') return image.truckTitle
  return `${image.manufacturerName} ${image.truckTitle}`
}

export default function ImageCarousel({ images: allImages, className = '' }: { images: TruckImageData[]; className?: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [images, setImages] = useState<TruckImageData[]>([])
  const [playing, setPlaying] = useState(true)
  const [quiz, setQuiz] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const nextImage = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const prevImage = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    if (!allImages?.length) return
    setImages(shuffleArray(allImages))
    setCurrentIndex(0)
  }, [allImages])

  useEffect(() => {
    if (!playing || images.length <= 1 || quiz || prefersReducedMotion()) return
    const interval = setInterval(nextImage, 5000)
    return () => clearInterval(interval)
  }, [images.length, playing, quiz, nextImage])

  const onTouchEnd = () => {
    if (touchStart == null || touchEnd == null || quiz) return
    const distance = touchStart - touchEnd
    if (distance > 50 && images.length > 1) nextImage()
    if (distance < -50 && images.length > 1) prevImage()
  }

  if (quiz) {
    return <TruckQuiz images={images} onExit={() => { setQuiz(false); setPlaying(true) }} />
  }

  if (!images.length) return null
  const current = images[currentIndex]

  return (
    <section className={`reel ${className}`} aria-label="Truck reel">
      <div
        className="reel-frame"
        onTouchStart={(event) => {
          setTouchEnd(null)
          setTouchStart(event.targetTouches[0]?.clientX ?? null)
        }}
        onTouchMove={(event) => setTouchEnd(event.targetTouches[0]?.clientX ?? null)}
        onTouchEnd={onTouchEnd}
        onMouseEnter={() => setPlaying(false)}
        onMouseLeave={() => setPlaying(true)}
      >
        <Link href={`/${current.manufacturerSlug}/${current.truckSlug}`} style={{ display: 'block', height: '100%' }}>
          <SanityImage
            key={current.asset?._ref}
            image={current}
            alt={imageAlt(current.alt, current.truckTitle)}
            fill
            sizes="(max-width: 768px) 100vw, 860px"
            className="sanity-cover"
          />
        </Link>
        {images.length > 1 ? (
          <>
            <button type="button" className="reel-nav prev" aria-label="Previous still" onClick={prevImage}>◀</button>
            <button type="button" className="reel-nav next" aria-label="Next still" onClick={nextImage}>▶</button>
          </>
        ) : null}
      </div>
      <div className="reel-meta">
        <div>
          <p className="kicker">{current.yearRange || `${currentIndex + 1} / ${images.length}`}</p>
          <h2 className="reel-title">{labelFor(current)}</h2>
        </div>
        <button type="button" className="btn btn-accent" onClick={() => { setPlaying(false); setQuiz(true) }}>
          Play
        </button>
      </div>
    </section>
  )
}
