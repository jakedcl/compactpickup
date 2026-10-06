'use client'

import Link from 'next/link'
import {client, truckModelBySlugQuery} from '@/lib/sanity'
import {notFound} from 'next/navigation'
import {PortableText, PortableTextBlock} from '@portabletext/react'
import {useEffect, useMemo, useState} from 'react'
import RelatedTrucks from '@/components/RelatedTrucks'
import SourceList from '@/components/SourceList'
import TruckSpecSheet from '@/components/TruckSpecSheet'
import {createVhsPortableTextComponents} from '@/components/vhsPortableText'
import {visibleContentBlocks} from '@/lib/contentSections'
import {cleanText, contentFlags, type TruckSpecData} from '@/lib/truckDisplay'

interface TruckModel extends TruckSpecData {
  _id: string
  title: string
  slug: {current: string}
  yearRange?: string
  content?: PortableTextBlock[]
  model3d?: {asset: {_ref: string}}
  manufacturer: {
    name: string
    slug: {current: string}
  }
}

interface Props {
  params: Promise<{manufacturer: string; model: string}>
}

export default function TruckModelPage({params}: Props) {
  const [truckModel, setTruckModel] = useState<TruckModel | null>(null)
  const [manufacturerSlug, setManufacturerSlug] = useState('')
  const [currentTime, setCurrentTime] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false

    params.then(({manufacturer: mSlug, model: modelSlug}) => {
      if (cancelled) return
      setManufacturerSlug(mSlug)
      setStatus('loading')

      client
        .fetch(truckModelBySlugQuery, {slug: modelSlug})
        .then((modelData: TruckModel | null) => {
          if (cancelled) return
          if (!modelData) {
            setStatus('missing')
            return
          }
          setTruckModel(modelData)
          setStatus('ready')
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
    })

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

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [params])

  const summary = cleanText(truckModel?.summary)
  const flags = truckModel ? contentFlags(truckModel) : null
  const visibleContent = useMemo(
    () => (truckModel && flags ? visibleContentBlocks(truckModel.content, flags) : []),
    [truckModel, flags],
  )
  const portableTextComponents = useMemo(
    () => createVhsPortableTextComponents(truckModel?.title || 'Truck photo'),
    [truckModel?.title],
  )

  if (status === 'missing') {
    notFound()
  }

  if (status === 'error') {
    return (
      <div className="vhs-screen">
        <div className="vhs-content">
          <div className="vhs-header mb-6">Signal lost</div>
          <p className="text-white/80 text-sm uppercase tracking-wider">Could not load this truck.</p>
        </div>
      </div>
    )
  }

  if (!truckModel || !flags) {
    return <div className="vhs-screen">Loading...</div>
  }

  return (
    <div className="vhs-screen">
      <div className="vhs-scan-line"></div>

      <div className="vhs-content">
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

        <div className="vhs-header mb-6">
          {truckModel.title}
        </div>

        <div className="bg-black/40 border border-white/30 p-4 mb-6 w-full">
          <div className="flex justify-between items-center text-sm gap-4">
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

        {summary && (
          <p className="w-full bg-black/40 border border-white/30 p-4 mb-6 text-sm text-white/90 leading-relaxed">
            {summary}
          </p>
        )}

        {/* 3D model viewer stays off until attribution is filled in. */}

        <TruckSpecSheet truck={truckModel} />
        <RelatedTrucks truck={truckModel} />

        {visibleContent.length > 0 ? (
          <div className="bg-black/20 border border-white/20 p-6 min-h-96 w-full">
            <div className="prose prose-white max-w-none">
              <PortableText
                value={visibleContent}
                components={portableTextComponents}
              />
            </div>
          </div>
        ) : !truckModel.content?.length ? (
          <div className="bg-black/20 border border-white/20 p-6 min-h-96 w-full">
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
          </div>
        ) : null}

        <div className="mt-6 w-full">
          <SourceList sources={truckModel.sources} />
        </div>
      </div>

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
