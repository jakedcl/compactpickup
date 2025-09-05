'use client'

import Link from 'next/link'
import { client, manufacturerBySlugQuery, truckModelsByManufacturerQuery } from '@/lib/sanity'
import { notFound } from 'next/navigation'
import { useState, useEffect } from 'react'

interface Manufacturer {
  _id: string
  name: string
  slug: { current: string }
}

interface TruckModel {
  _id: string
  title: string
  slug: { current: string }
  yearRange?: string
  manufacturer: {
    name: string
    slug: { current: string }
  }
}

interface Props {
  params: Promise<{ manufacturer: string }>
}

export default function ManufacturerPage({ params }: Props) {
  const [manufacturer, setManufacturer] = useState<Manufacturer | null>(null)
  const [truckModels, setTruckModels] = useState<TruckModel[]>([])
  const [manufacturerSlug, setManufacturerSlug] = useState('')
  const [currentTime, setCurrentTime] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)

  useEffect(() => {
    params.then(({ manufacturer: slug }) => {
      setManufacturerSlug(slug)
      
      // Get manufacturer
      client.fetch(manufacturerBySlugQuery, { slug }).then(manufacturerData => {
        if (!manufacturerData) {
          notFound()
          return
        }
        setManufacturer(manufacturerData)
        
        // Get truck models
        client.fetch(truckModelsByManufacturerQuery, {
          manufacturerId: manufacturerData._id
        }).then(setTruckModels)
      })
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
  }, [params])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
    } else if (e.key === 'ArrowDown' && selectedIndex < truckModels.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  if (!manufacturer) {
    return <div className="vhs-screen">Loading...</div>
  }

  return (
    <div className="vhs-screen" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* VHS Scan Line */}
      <div className="vhs-scan-line"></div>
      
      <div className="vhs-content">
        {/* Back Navigation */}
        <div className="mb-6 self-start">
          <Link 
            href="/"
            className="text-white/80 hover:text-white text-sm flex items-center gap-2 transition-colors"
          >
            <span>←</span>
            <span className="capitalize">Main Menu</span>
          </Link>
        </div>

        {/* Simple Header */}
        <div className="vhs-header mb-6">
          {manufacturer.name}
        </div>

        {/* Menu Instructions */}
        <div className="vhs-subtitle text-center text-white">
          Select Truck Model
        </div>

        {/* Truck Models Menu */}
        {truckModels.length > 0 ? (
          <div className="space-y-2 w-full flex flex-col items-center">
            {truckModels.map((model, index) => (
              <Link
                key={model._id}
                href={`/${manufacturerSlug}/${model.slug.current}`}
                className={`vhs-menu-item ${
                  index === selectedIndex ? 'selected' : ''
                }`}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseLeave={() => setSelectedIndex(-1)}
              >
                <span className="vhs-arrow">
                  ▶
                </span>
                <span className="flex-1">
                  <div className="capitalize">
                    {model.title}
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    {model.yearRange && model.yearRange}
                  </div>
                </span>
              </Link>
            ))}
            
          </div>
        ) : (
          <div className="text-center py-12 w-full flex flex-col items-center">
            <div className="vhs-menu-item justify-center">
              <span className="vhs-arrow"> </span>
              <span className="uppercase tracking-wider">No models found</span>
            </div>
            <div className="mt-4 text-white opacity-60 text-sm">
              ADD TRUCK MODELS FOR {manufacturer.name.toUpperCase()} IN STUDIO
            </div>
            <Link 
              href="https://compactpickup.sanity.studio" 
              target="_blank"
              className="vhs-button mt-4 inline-block"
            >
              Open Studio
            </Link>
          </div>
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
