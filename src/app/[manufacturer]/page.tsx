import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ManufacturerProfile from '@/components/ManufacturerProfile'
import PageHeader from '@/components/ui/PageHeader'
import {
  getManufacturerBySlug,
  getManufacturerParams,
  getTrucksForManufacturer,
  type ManufacturerRecord,
} from '@/lib/getContent'
import { cleanText, formatProduction } from '@/lib/truckDisplay'

export const revalidate = 3600

type Props = {
  params: Promise<{ manufacturer: string }>
}

export async function generateStaticParams() {
  try {
    return await getManufacturerParams()
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { manufacturer: slug } = await params
  try {
    const manufacturer = await getManufacturerBySlug(slug)
    if (!manufacturer) return {}
    const description = cleanText(manufacturer.description)
    return {
      title: `${manufacturer.name} · Compact Pickup`,
      ...(description ? { description } : {}),
    }
  } catch {
    return {}
  }
}

function signalLost() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="Signal lost" title="Could not load this maker" />
        <Link href="/" className="btn">Back to the shelf</Link>
      </div>
    </main>
  )
}

export default async function ManufacturerPage({ params }: Props) {
  const { manufacturer: slug } = await params

  let manufacturer: ManufacturerRecord | null
  try {
    manufacturer = await getManufacturerBySlug(slug)
  } catch {
    return signalLost()
  }
  if (!manufacturer) notFound()

  let truckModels
  try {
    truckModels = await getTrucksForManufacturer(manufacturer._id)
  } catch {
    return signalLost()
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
                  <Link href={`/${slug}/${model.slug.current}`}>
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
