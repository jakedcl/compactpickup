'use client'

import Link from 'next/link'
import { client, truckModelBySlugQuery } from '@/lib/sanity'
import { notFound } from 'next/navigation'
import { PortableText, PortableTextBlock, PortableTextComponents } from '@portabletext/react'
import { urlFor, fileUrlFor } from '@/lib/sanity'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { ReactNode } from 'react'
import TruckModel3D from '@/components/TruckModel3D'

interface ImageValue {
  alt?: string
  caption?: string
  asset: {
    _ref: string
  }
}

interface TruckModel {
  _id: string
  title: string
  slug: { current: string }
  yearRange?: string
  content?: PortableTextBlock[]
  model3d?: { asset: { _ref: string } }
  manufacturer: {
    name: string
    slug: { current: string }
  }
}

interface Props {
  params: Promise<{ manufacturer: string; model: string }>
}

const vhsPortableTextComponents: PortableTextComponents = {
  types: {
    image: ({ value }: { value: ImageValue }) => (
      <div className="my-6 border border-white/30 p-3 bg-black/20">
        <Image
          src={urlFor(value).width(600).height(400).url()}
          alt={value.alt || ''}
          width={600}
          height={400}
          className="w-full h-auto"
        />
        {value.caption && (
          <p className="text-white/80 text-xs mt-2 text-center uppercase tracking-wider">
            {value.caption}
          </p>
        )}
      </div>
    ),
  },
  block: {
    h1: ({ children }: { children?: ReactNode }) => (
      <div className="vhs-header mb-4">
        {children}
      </div>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="text-lg font-bold text-white mb-3 uppercase tracking-wider border-b border-white/20 pb-2">
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
        {children}
      </h3>
    ),
    normal: ({ children }: { children?: ReactNode }) => (
      <p className="text-white/90 mb-3 text-sm leading-relaxed">
        {children}
      </p>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <div className="border-l-2 border-white/40 pl-4 my-4 text-white/80 italic bg-black/20 p-3">
        {children}
      </div>
    ),
  },
  list: {
    bullet: ({ children }: { children?: ReactNode }) => (
      <ul className="list-none text-white/90 mb-4 space-y-1">
        {Array.isArray(children) && children?.map((child: ReactNode, index: number) => (
          <li key={index} className="flex items-start">
            <span className="text-yellow-400 mr-2">▶</span>
            <span className="text-sm">{child}</span>
          </li>
        ))}
      </ul>
    ),
    number: ({ children }: { children?: ReactNode }) => (
      <ol className="list-none text-white/90 mb-4 space-y-1">
        {Array.isArray(children) && children?.map((child: ReactNode, index: number) => (
          <li key={index} className="flex items-start">
            <span className="text-yellow-400 mr-2">{index + 1}.</span>
            <span className="text-sm">{child}</span>
          </li>
        ))}
      </ol>
    ),
  },
  marks: {
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="text-white font-bold uppercase">{children}</strong>
    ),
    em: ({ children }: { children?: ReactNode }) => (
      <em className="text-yellow-400">{children}</em>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <code className="bg-white/20 px-1 py-0.5 text-yellow-400 text-xs">
        {children}
      </code>
    ),
  },
}

export default function TruckModelPage({ params }: Props) {
  const [truckModel, setTruckModel] = useState<TruckModel | null>(null)
  const [manufacturerSlug, setManufacturerSlug] = useState('')
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    params.then(({ manufacturer: mSlug, model: modelSlug }) => {
      setManufacturerSlug(mSlug)
      
      // Get truck model
      client.fetch(truckModelBySlugQuery, { slug: modelSlug }).then(modelData => {
        if (!modelData) {
          notFound()
          return
        }
        setTruckModel(modelData)
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

  if (!truckModel) {
    return <div className="vhs-screen">Loading...</div>
  }

  return (
    <div className="vhs-screen">
      {/* VHS Scan Line */}
      <div className="vhs-scan-line"></div>
      
      <div className="vhs-content">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 text-sm text-center">
          <Link 
            href="/"
            className="text-white/60 hover:text-white uppercase tracking-wider"
          >
            MAIN
          </Link>
          <span className="text-white/40 mx-2">&gt;</span>
          <Link 
            href={`/${manufacturerSlug}`}
            className="text-white/60 hover:text-white uppercase tracking-wider"
          >
            {truckModel.manufacturer.name}
          </Link>
          <span className="text-white/40 mx-2">&gt;</span>
          <span className="text-white uppercase tracking-wider">
            {truckModel.title}
          </span>
        </div>

        {/* Simple Header */}
        <div className="vhs-header mb-6">
          {truckModel.title}
        </div>
        {/* Model Info Bar */}
        <div className="bg-black/40 border border-white/30 p-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <div>
              <span className="text-yellow-400 uppercase tracking-wider">Model:</span>
              <span className="text-white ml-2">{truckModel.title}</span>
            </div>
            {truckModel.yearRange && (
              <div>
                <span className="text-yellow-400 uppercase tracking-wider">Years:</span>
                <span className="text-white ml-2">{truckModel.yearRange}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3D Model Viewer */}
        {truckModel.model3d && (
          <TruckModel3D 
            modelUrl={fileUrlFor(truckModel.model3d)}
            className="mb-6"
            attribution={{
              creator: "David Holiday",
              source: "https://sketchfab.com/3d-models/ford-ranger-2002-63515c5e20914d6496d1470ddc366a78",
              license: "CC Attribution"
            }}
          />
        )}

        {/* Content */}
        <div className="bg-black/20 border border-white/20 p-6 min-h-96">
          {truckModel.content && truckModel.content.length > 0 ? (
            <div className="prose prose-white max-w-none">
              <PortableText 
                value={truckModel.content} 
                components={vhsPortableTextComponents}
              />
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-white text-lg mb-4 uppercase tracking-wider">
                No Content Found
              </div>
              <div className="text-white/60 text-sm mb-6 uppercase tracking-wide">
                Add content for {truckModel.title} in Studio
              </div>
              <Link 
                href="https://compactpickup.sanity.studio" 
                target="_blank"
                className="vhs-button"
              >
                Open Studio
              </Link>
            </div>
          )}
        </div>


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
