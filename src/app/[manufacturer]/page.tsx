'use client'

import Link from 'next/link'
import { client, manufacturerBySlugQuery, truckModelsByManufacturerQuery } from '@/lib/sanity'
import { notFound } from 'next/navigation'
import { useState, useEffect } from 'react'
import ManufacturerProfile from '@/components/ManufacturerProfile'
import PageHeader from '@/components/ui/PageHeader'
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

    return () => {
      cancelled = true
    }
  }, [params])

  if (status === 'missing') notFound()

  if (status === 'error') {
    return (
      <main className="screen">
        <div className="wrap narrow">
          <PageHeader kicker="Signal lost" title="Could not load this maker" />
          <Link href="/" className="btn">Back to the shelf</Link>
        </div>
      </main>
    )
  }

  if (!manufacturer) {
    return (
      <main className="screen">
        <div className="wrap"><p className="state">Loading the shelf...</p></div>
      </main>
    )
  }

  return (
    <main className="screen">
      <div className="wrap">
        <PageHeader kicker="Manufacturer" title={manufacturer.name} />
        <ManufacturerProfile manufacturer={manufacturer} />
        <section className="section">
          <h2 className="section-heading">Models</h2>
          {truckModels.length > 0 ? (
            <ul className="maker-list">
              {truckModels.map((model) => (
                <li key={model._id}>
                  <Link href={`/${manufacturerSlug}/${model.slug.current}`}>
                    <span className="card-title">{model.title}</span>
                    <span className="meta">{model.yearRange || formatProduction(model.productionStart, model.productionEnd) || ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="state">No models for {manufacturer.name} yet.</p>
              <a className="btn" href="https://compactpickup.sanity.studio" target="_blank" rel="noreferrer">Open Studio</a>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
