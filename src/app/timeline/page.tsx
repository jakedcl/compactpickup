'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import SanityImage from '@/components/SanityImage'
import PageHeader from '@/components/ui/PageHeader'
import { client } from '@/lib/sanity'
import { imageAlt } from '@/lib/imageAlt'
import { sanityImageFields, type SanityImageValue } from '@/lib/sanityImage'
import { truckSortYear } from '@/lib/truckDisplay'

interface TimelineTruck {
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

interface DecadeGroup {
  decade: string
  trucks: TimelineTruck[]
}

export default function TimelinePage() {
  const [timelineData, setTimelineData] = useState<DecadeGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    async function fetchTimelineData() {
      try {
        const data: TimelineTruck[] = await client.fetch(`*[_type == "truckModel" && defined(content)] | order(coalesce(productionStart, 9999) asc, yearRange asc) {
          _id,
          title,
          yearRange,
          productionStart,
          slug,
          manufacturer->{name, slug},
          "images": content[_type == "image"] {
            alt,
            caption,
            ${sanityImageFields}
          }
        }[count(images) > 0]`)

        const sorted = [...data].sort((a, b) => truckSortYear(a) - truckSortYear(b) || a.title.localeCompare(b.title))
        const grouped = sorted.reduce((acc: { [key: string]: TimelineTruck[] }, truck) => {
          const decade = decadeLabel(truck)
          if (!acc[decade]) acc[decade] = []
          acc[decade].push(truck)
          return acc
        }, {})

        setTimelineData(
          Object.entries(grouped)
            .map(([decade, trucks]) => ({ decade, trucks }))
            .sort((a, b) => a.decade.localeCompare(b.decade)),
        )
      } catch {
        setFailed(true)
      } finally {
        setLoading(false)
      }
    }

    fetchTimelineData()
  }, [])

  return (
    <main className="screen">
      <div className="wrap">
        <PageHeader kicker="Catalog" title="Timeline" lede="Every truck with a still, in the order they showed up." />
        {loading ? <p className="state">Loading the timeline...</p> : null}
        {failed ? <p className="state">Signal lost. Could not load the timeline.</p> : null}
        {!loading && !failed && timelineData.length === 0 ? <p className="state">No trucks in the timeline yet.</p> : null}
        {timelineData.map((group) => (
          <section key={group.decade} className="section">
            <h2 className="section-heading">{group.decade}</h2>
            <ul className="card-grid">
              {group.trucks.map((truck) => (
                <li key={truck._id}>
                  <TruckTimelineCard truck={truck} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}

function decadeLabel(truck: TimelineTruck): string {
  const firstYear = truckSortYear(truck)
  if (firstYear === 9999) return 'Unknown'
  return `${Math.floor(firstYear / 10) * 10}s`
}

function TruckTimelineCard({ truck }: { truck: TimelineTruck }) {
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
