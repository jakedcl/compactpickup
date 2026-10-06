'use client'

import Link from 'next/link'
import { client, manufacturerBySlugQuery, truckModelsByManufacturerQuery } from '@/lib/sanity'
import { notFound } from 'next/navigation'
import { useState, useEffect } from 'react'
import ManufacturerProfile from '@/components/ManufacturerProfile'
import { compareTrucksByYear, formatProduction } from '@/lib/truckDisplay'

interface Manufacturer {
  _id: string
  name: string
  slug: { current: string }
  founded?: string | null
  hq?: string | null
  country?: string | null
  website?: string | null
  description?: string | null
  compactPickupHistory?: string | null
  logo?: {
    asset?: {
      _ref: string
    }
  } | null
}

interface TruckModel {
  _id: string
  title: string
  slug: { current: string }
  yearRange?: string | null
  productionStart?: number | null
  productionEnd?: number | null
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
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false

    params.then(({ manufacturer: slug }) => {
      if (cancelled) return
      setManufacturerSlug(slug)
      setStatus('loading')
      
      client.fetch(manufacturerBySlugQuery, { slug }).then(manufacturerData => {
        if (cancelled) return
        if (!manufacturerData) {
          setStatus('missing')
          return
        }
        setManufacturer(manufacturerData)
        setStatus('ready')
        
        client.fetch(truckModelsByManufacturerQuery, {
          manufacturerId: manufacturerData._id
        }).then((models: TruckModel[]) => {
          if (cancelled) return
          setTruckModels([...models].sort(compareTrucksByYear))
        }).catch(() => {
          if (!cancelled) setStatus('error')
        })
      }).catch(() => {
        if (!cancelled) setStatus('error')
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
    
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [params])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
    } else if (e.key === 'ArrowDown' && selectedIndex < truckModels.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  if (status === 'missing') {
    notFound()
  }

  if (status === 'error') {
    return (
      <div className="vhs-screen">
        <div className="vhs-content">
          <div className="vhs-header mb-6">Signal lost</div>
          <p className="text-white/80 text-sm uppercase tracking-wider">Could not load this manufacturer.</p>
        </div>
      </div>
    )
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

        <ManufacturerProfile manufacturer={manufacturer} />

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
                    {model.yearRange || formatProduction(model.productionStart, model.productionEnd)}
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
