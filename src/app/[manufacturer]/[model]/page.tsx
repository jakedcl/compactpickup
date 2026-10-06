'use client'

import Link from 'next/link'
import {client, truckModelBySlugQuery} from '@/lib/sanity'
import {notFound} from 'next/navigation'
import {PortableText, PortableTextBlock} from '@portabletext/react'
import {useEffect, useMemo, useState} from 'react'
import RelatedTrucks from '@/components/RelatedTrucks'
import SourceList from '@/components/SourceList'
import TruckSpecSheet from '@/components/TruckSpecSheet'
import PageHeader from '@/components/ui/PageHeader'
import Lightbox, {type GalleryImage} from '@/components/ui/Lightbox'
import SanityImage from '@/components/SanityImage'
import {createVhsPortableTextComponents} from '@/components/vhsPortableText'
import {visibleContentBlocks} from '@/lib/contentSections'
import {cleanText, contentFlags, glanceFacts, type TruckSpecData} from '@/lib/truckDisplay'
import {imageAlt} from '@/lib/imageAlt'

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

function articleImages(content?: PortableTextBlock[]): GalleryImage[] {
  if (!Array.isArray(content)) return []
  return content.filter((block): block is PortableTextBlock & GalleryImage => {
    return block._type === 'image' && Boolean((block as GalleryImage).asset?._ref)
  })
}

export default function TruckModelPage({params}: Props) {
  const [truckModel, setTruckModel] = useState<TruckModel | null>(null)
  const [manufacturerSlug, setManufacturerSlug] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [photo, setPhoto] = useState<number | null>(null)

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

    return () => {
      cancelled = true
    }
  }, [params])

  const summary = cleanText(truckModel?.summary)
  const flags = truckModel ? contentFlags(truckModel) : null
  const visibleContent = useMemo(
    () => (truckModel && flags ? visibleContentBlocks(truckModel.content, flags) : []),
    [truckModel, flags],
  )
  const photos = useMemo(() => articleImages(truckModel?.content), [truckModel])
  const hero = photos[0]
  const portableTextComponents = useMemo(
    () => createVhsPortableTextComponents(truckModel?.title || 'Truck photo', {
      hideRef: hero?.asset?._ref,
      onOpen: (image) => {
        const index = photos.findIndex((item) => item.asset?._ref === image.asset?._ref)
        setPhoto(index >= 0 ? index : 0)
      },
    }),
    [truckModel?.title, hero?.asset?._ref, photos],
  )
  const glance = truckModel ? glanceFacts(truckModel, truckModel.yearRange) : []

  if (status === 'missing') notFound()

  if (status === 'error') {
    return (
      <main className="screen">
        <div className="wrap narrow">
          <PageHeader kicker="Signal lost" title="Could not load this truck" />
          <Link href="/" className="btn">Back to the shelf</Link>
        </div>
      </main>
    )
  }

  if (!truckModel || !flags) {
    return (
      <main className="screen">
        <div className="wrap"><p className="state">Loading the entry...</p></div>
      </main>
    )
  }

  const years = cleanText(truckModel.yearRange)

  return (
    <main className="screen">
      <article className="wrap">
        {hero?.asset?._ref ? (
          <figure className="hero">
            <button type="button" onClick={() => setPhoto(0)} aria-label="Open the lead photo">
              <SanityImage
                image={hero}
                alt={imageAlt(hero.alt, truckModel.title)}
                sizes="(max-width: 800px) 100vw, 1120px"
                fill
                cropRatio={0.625}
                eager
                className="sanity-cover"
              />
            </button>
            {hero.caption ? <figcaption>{hero.caption}</figcaption> : null}
          </figure>
        ) : null}

        <PageHeader
          kicker={
            <>
              <Link href={`/${manufacturerSlug}`}>{truckModel.manufacturer.name}</Link>
              {years ? ` · ${years}` : null}
            </>
          }
          title={truckModel.title}
          lede={summary}
        />

        {glance.length > 0 ? (
          <dl className="glance">
            {glance.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <TruckSpecSheet truck={truckModel} />
        <RelatedTrucks truck={truckModel} />

        {visibleContent.length > 0 ? (
          <div className="section prose">
            <PortableText value={visibleContent} components={portableTextComponents} />
          </div>
        ) : !truckModel.content?.length ? (
          <div className="section">
            <p className="state">No article yet for {truckModel.title}.</p>
            <a className="btn" href="https://compactpickup.sanity.studio" target="_blank" rel="noreferrer">Open Studio</a>
          </div>
        ) : null}

        <SourceList sources={truckModel.sources} />
      </article>
      {photo !== null && photos.length > 0 ? (
        <Lightbox
          images={photos}
          index={photo}
          onClose={() => setPhoto(null)}
          onIndex={setPhoto}
        />
      ) : null}
    </main>
  )
}
