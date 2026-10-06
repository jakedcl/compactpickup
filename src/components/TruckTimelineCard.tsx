'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SanityImage from '@/components/SanityImage'
import { imageAlt } from '@/lib/imageAlt'
import type { SanityImageValue } from '@/lib/sanityImage'

export interface TimelineTruck {
  _id: string
  title: string
  yearRange?: string
  productionStart?: number | null
  slug: { current: string }
  manufacturer: {
    name: string
    slug: { current: string }
  }
  images: Array<SanityImageValue & { asset: { _ref: string } }>
}

export default function TruckTimelineCard({ truck }: { truck: TimelineTruck }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useEffect(() => {
    if (truck.images.length <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % truck.images.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [truck.images.length])

  const currentImage = truck.images[currentImageIndex]

  return (
    <Link href={`/${truck.manufacturer.slug.current}/${truck.slug.current}`} className="card">
      <span className="card-still">
        {currentImage?.asset?._ref ? (
          <SanityImage
            image={currentImage}
            alt={imageAlt(currentImage.alt, truck.title)}
            fill
            cropRatio={0.75}
            sizes="(max-width: 800px) 46vw, 320px"
            className="sanity-cover"
          />
        ) : (
          <span className="card-still-empty">No still</span>
        )}
      </span>
      <span className="card-copy">
        <span className="card-label">{truck.manufacturer.name}{truck.yearRange ? ` · ${truck.yearRange}` : ''}</span>
        <span className="card-title">{truck.title}</span>
      </span>
    </Link>
  )
}
