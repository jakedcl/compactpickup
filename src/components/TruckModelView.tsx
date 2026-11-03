'use client'

import Link from 'next/link'
import {PortableText, type PortableTextBlock} from '@portabletext/react'
import {useMemo, useState} from 'react'
import RelatedTrucks from '@/components/RelatedTrucks'
import SourceList from '@/components/SourceList'
import TruckArticlePanels from '@/components/TruckArticlePanels'
import TruckEnginePanels from '@/components/TruckEnginePanels'
import TruckSpecSheet from '@/components/TruckSpecSheet'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeading from '@/components/ui/SectionHeading'
import Lightbox from '@/components/ui/Lightbox'
import SanityImage from '@/components/SanityImage'
import {createVhsPortableTextComponents} from '@/components/vhsPortableText'
import {
  extractContentImages,
  parseArticleSections,
  visibleContentBlocks,
} from '@/lib/contentSections'
import {cleanText, contentFlags, glanceFacts, type TruckSpecData} from '@/lib/truckDisplay'
import {imageAlt} from '@/lib/imageAlt'

export interface TruckModel extends TruckSpecData {
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

export default function TruckModelView({
  truckModel,
  manufacturerSlug,
}: {
  truckModel: TruckModel
  manufacturerSlug: string
}) {
  const [photo, setPhoto] = useState<number | null>(null)

  const summary = cleanText(truckModel.summary)
  const flags = contentFlags(truckModel)
  const visibleContent = useMemo(
    () => visibleContentBlocks(truckModel.content, flags),
    [truckModel, flags],
  )
  const article = useMemo(() => parseArticleSections(visibleContent), [visibleContent])
  const photos = useMemo(() => extractContentImages(truckModel.content), [truckModel.content])
  const hero = photos[0]
  const portableTextComponents = useMemo(() => createVhsPortableTextComponents(), [])
  const glance = glanceFacts(truckModel, truckModel.yearRange)
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
        <TruckEnginePanels truck={truckModel} />
        <TruckArticlePanels
          trims={article.trims}
          cabBed={article.cabBed}
          drivetrain={article.drivetrain}
          highlights={article.highlights}
        />

        {photos.length > 0 ? (
          <section className="section">
            <SectionHeading title="Photos" />
            <ul className="gallery photo-grid">
              {photos.map((image, index) => (
                <li key={image.asset?._ref || `photo-${index}`}>
                  <button type="button" onClick={() => setPhoto(index)} aria-label={`Open photo ${index + 1}`}>
                    <SanityImage
                      image={image}
                      alt={imageAlt(image.alt, truckModel.title)}
                      sizes="(max-width: 520px) 100vw, (max-width: 800px) 50vw, 33vw"
                      fill
                      cropRatio={4 / 3}
                      className="sanity-cover"
                    />
                  </button>
                  <p className="photo-caption">{image.caption || imageAlt(image.alt, truckModel.title)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <RelatedTrucks truck={truckModel} />

        {article.overview.length > 0 ? (
          <section className="section prose">
            <SectionHeading title="Overview" />
            <PortableText value={article.overview} components={portableTextComponents} />
          </section>
        ) : !truckModel.content?.length ? (
          <div className="section">
            <p className="state">No article yet for {truckModel.title}.</p>
            <Link className="btn" href="/studio">Open Studio</Link>
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
