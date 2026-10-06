'use client'
// THIS IS NOT PART OF THE PROJECT. I AM NOT DONE WITH IT YET, BUT DON'T WANT TO REMOVE IT JUST FOR THE SUBMISSION.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import SanityImage from '@/components/SanityImage'
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
  // React useState hooks for component state management
  const [timelineData, setTimelineData] = useState<DecadeGroup[]>([])
  const [loading, setLoading] = useState(true)

  // React useEffect for data fetching on component mount
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

        // Group trucks by decade using reduce method
        const grouped = sorted.reduce((acc: { [key: string]: TimelineTruck[] }, truck) => {
          const decade = getDecadeFromYear(truck)
          if (!acc[decade]) {
            acc[decade] = []
          }
          acc[decade].push(truck)
          return acc
        }, {})

        // Convert to array and sort decades
        const timelineGroups = Object.entries(grouped)
          .map(([decade, trucks]) => ({ decade, trucks }))
          .sort((a, b) => a.decade.localeCompare(b.decade))

        setTimelineData(timelineGroups)
      } catch (error) {
        console.error('Error fetching timeline data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTimelineData()
  }, [])

  const getDecadeFromYear = (truck: TimelineTruck): string => {
    const firstYear = truckSortYear(truck)
    if (firstYear === 9999) return 'Unknown'
    
    const decade = Math.floor(firstYear / 10) * 10
    return `${decade}s`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl font-mono">Loading timeline...</div>
      </div>
    )
  }

  return (
    <div className="vhs-screen">
      {/* VHS Scan Line */}
      <div className="vhs-scan-line"></div>
      
      <div className="vhs-content" style={{ maxWidth: '1400px', width: '100%' }}>
        {/* VHS Header */}
        <div className="vhs-header">
          <div className="flex justify-between items-center">
            <span>TRUCK EVOLUTION TIMELINE</span>
            <Link 
              href="/" 
              className="text-yellow-400 hover:text-yellow-300 transition-colors font-mono text-sm"
            >
              HOME
            </Link>
          </div>
        </div>

        {/* Timeline */}
        <div className="w-full px-2 py-12">
          {timelineData.map((group, groupIndex) => (
            <div key={group.decade} className="mb-20">
              {/* Decade Header */}
              <div className="sticky top-4 z-10 mb-8">
                <div className="vhs-menu-item text-center w-full">
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-mono font-bold text-white">
                    {group.decade.toUpperCase()}
                  </h2>
                </div>
              </div>

              {/* Trucks Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 w-full">
                {group.trucks.map((truck) => (
                  <TruckTimelineCard key={truck._id} truck={truck} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Child component that receives props from parent
function TruckTimelineCard({ truck }: { truck: TimelineTruck }) {
  // React useState for image rotation state
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  // React useEffect for auto-rotating images
  useEffect(() => {
    if (truck.images.length <= 1) return

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % truck.images.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [truck.images.length])

  // React event handlers for user interactions
  const handleMouseEnter = () => setIsHovered(true)
  const handleMouseLeave = () => setIsHovered(false)

  const currentImage = truck.images[currentImageIndex]

  return (
    <Link 
      href={`/${truck.manufacturer.slug.current}/${truck.slug.current}`}
      className="vhs-timeline-card group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative h-64">
         <SanityImage
          image={currentImage}
          alt={imageAlt(currentImage.alt, truck.title)}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="sanity-cover"
        />
        
        {/* Year Badge */}
        <div className="absolute top-2 right-2 bg-yellow-400 text-black px-2 py-1 rounded text-sm font-mono font-bold">
          {truck.yearRange}
        </div>
      </div>
      
      <div className="p-4">
        <h3 className="text-lg font-mono font-bold text-white mb-1">
          {truck.title}
        </h3>
        <p className="text-gray-300 text-sm font-mono">
          {truck.manufacturer.name}
        </p>
      </div>
    </Link>
  )
}