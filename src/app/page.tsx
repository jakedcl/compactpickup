'use client'

import Link from 'next/link'
import { client, manufacturersQuery, urlFor, allTruckImagesQuery } from '@/lib/sanity'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import ImageCarousel from '@/components/ImageCarousel'

interface Manufacturer {
  _id: string
  name: string
  slug: { current: string }
  logo?: {
    asset: {
      _ref: string
    }
  }
}

interface TruckImageData {
  alt?: string
  caption?: string
  asset: {
    _ref: string
  }
  truckTitle: string
  manufacturerName: string
  truckSlug: string
  manufacturerSlug: string
}

export default function HomePage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [allImages, setAllImages] = useState<TruckImageData[]>([])
  const [currentTime, setCurrentTime] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)

      useEffect(() => {
      // Get manufacturers and sort with special categories at the bottom
      client.fetch(manufacturersQuery).then((data) => {
        const sortedManufacturers = data.sort((a: Manufacturer, b: Manufacturer) => {
          // Put "More..." and "One-Off's" at the bottom
          if (a.name === "More..." || a.name === "One-Off's") return 1
          if (b.name === "More..." || b.name === "One-Off's") return -1
          // Regular alphabetical sort for everything else
          return a.name.localeCompare(b.name)
        })
        setManufacturers(sortedManufacturers)
      })

      // Get all images from all truck models
      client.fetch(allTruckImagesQuery).then((data: Array<{images: TruckImageData[]}>) => {
        const allImagesFlattened: TruckImageData[] = []
        data.forEach((truck) => {
          truck.images.forEach((image) => {
            allImagesFlattened.push(image)
          })
        })
        setAllImages(allImagesFlattened)
      })
    
    // Update time every second
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }))
    }
    
    updateTime()
    const interval = setInterval(updateTime, 1000)
    
    return () => clearInterval(interval)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
    } else if (e.key === 'ArrowDown' && selectedIndex < manufacturers.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  return (
    <div className="vhs-screen" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* VHS Scan Line */}
      <div className="vhs-scan-line"></div>
      
      <div className="vhs-content">
        {/* VHS Header */}
        <div className="vhs-header">
          Compact and Mid-Size Pickups
        </div>

        {/* Manufacturer Logos Row - Only show manufacturers with logos */}
        {manufacturers.filter(m => m.logo).length > 0 && (
          <div className="flex justify-center items-center mb-8 mt-6 px-2 w-full max-w-4xl mx-auto">
            {manufacturers
              .filter((manufacturer) => manufacturer.logo) // Only include manufacturers with logos
              .map((manufacturer) => (
                <Link
                  key={manufacturer._id}
                  href={`/${manufacturer.slug.current}`}
                  className="vhs-logo-container hover:scale-110 transition-transform"
                >
                  <Image
                    src={urlFor(manufacturer.logo!).url()}
                    alt={manufacturer.name}
                    width={120}
                    height={60}
                    className="vhs-logo"
                  />
                </Link>
              ))}
          </div>
        )}

        {/* Menu Instructions */}
        <div className="vhs-subtitle text-center text-white">
          U.S. Truck Market
        </div>

        {/* Manufacturers Menu - Text Only */}
        {manufacturers.length > 0 ? (
          <div className="space-y-2 w-full flex flex-col items-center">
            {manufacturers.map((manufacturer, index) => (
              <Link
                key={manufacturer._id}
                href={`/${manufacturer.slug.current}`}
                className={`vhs-menu-item flex items-center ${
                  index === selectedIndex ? 'selected' : ''
                }`}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseLeave={() => setSelectedIndex(-1)}
              >
                <span className="vhs-arrow">
                  ▶
                </span>
                <span className="flex-1 capitalize">
                  {manufacturer.name}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 w-full flex flex-col items-center">
            <div className="vhs-menu-item justify-center">
              <span className="vhs-arrow"> </span>
              <span className="uppercase tracking-wider">No manufacturers found</span>
            </div>
            <div className="mt-4 text-white opacity-60 text-sm">
              ADD MANUFACTURERS IN STUDIO
            </div>
          </div>
        )}

        {/* Image Carousel */}
        {allImages.length > 0 && (
          <ImageCarousel images={allImages} className="mt-8" />
        )}

      </div>

      {/* VHS Status Bar */}
      <div className="vhs-status">
        <div className="flex items-center gap-4">
          <Link 
            href="https://compactpickup.sanity.studio" 
            target="_blank"
            className="text-red-400 hover:text-red-300 font-bold"
          >
            ● REC
          </Link>
          <span>AUTO</span>
          <span>PAL</span>
          <span>NTSC</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="vhs-time">{currentTime}</span>
        </div>
      </div>
    </div>
  )
}
