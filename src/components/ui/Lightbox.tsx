'use client'

import { useEffect, useRef, useState } from 'react'
import SanityImage from '@/components/SanityImage'
import type { SanityImageValue } from '@/lib/sanityImage'

export type GalleryImage = SanityImageValue & {
  alt?: string | null
  caption?: string | null
}

export default function Lightbox({
  images,
  index,
  onClose,
  onIndex,
}: {
  images: GalleryImage[]
  index: number
  onClose: () => void
  onIndex: (index: number) => void
}) {
  const image = images[index]
  const startX = useRef<number | null>(null)
  const [live, setLive] = useState('')

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onIndex((index + 1) % images.length)
      if (event.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [index, images.length, onClose, onIndex])

  useEffect(() => {
    setLive(`Photo ${index + 1} of ${images.length}`)
  }, [index, images.length])

  if (!image?.asset?._ref) return null

  function step(delta: number) {
    onIndex((index + delta + images.length) % images.length)
  }

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onTouchStart={(event) => {
        startX.current = event.changedTouches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        if (startX.current == null) return
        const delta = (event.changedTouches[0]?.clientX ?? startX.current) - startX.current
        if (delta > 48) step(-1)
        if (delta < -48) step(1)
        startX.current = null
      }}
    >
      <div className="lightbox-bar">
        <p className="kicker" style={{ margin: 0 }}>{index + 1} / {images.length}</p>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      <div className="lightbox-stage">
        <SanityImage
          image={image}
          alt={image.alt || 'Truck photo'}
          sizes="100vw"
          width={1600}
          height={1000}
          className="lightbox-photo"
        />
      </div>
      <div className="lightbox-foot">
        <button type="button" className="btn" onClick={() => step(-1)}>Prev</button>
        <p className="lightbox-caption">{image.caption || ' '}</p>
        <button type="button" className="btn" onClick={() => step(1)}>Next</button>
      </div>
      <p className="sr-only" aria-live="polite">{live}</p>
    </div>
  )
}
