import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import TruckModelView from '@/components/TruckModelView'
import PageHeader from '@/components/ui/PageHeader'
import { getTruckBySlug, getTruckParams } from '@/lib/getContent'
import { displayModelTitle } from '@/lib/makes'
import { extractContentImages } from '@/lib/contentSections'
import { buildShareMetadata, sanityOgImageUrl } from '@/lib/metadata'
import { cleanText } from '@/lib/truckDisplay'

export const revalidate = 3600

type Props = {
  params: Promise<{ manufacturer: string; model: string }>
}

export async function generateStaticParams() {
  try {
    return await getTruckParams()
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { manufacturer: manufacturerSlug, model } = await params
  try {
    const truck = await getTruckBySlug(model)
    if (!truck) {
      return {
        title: 'This tape is blank · Compact Pickup',
        description: 'That page is not in the catalog.',
      }
    }
    const description = cleanText(truck.summary)
    const title = `${displayModelTitle(truck.manufacturer?.name, truck.title)} · Compact Pickup`
    const slug = truck.manufacturer?.slug?.current ?? manufacturerSlug
    const hero = extractContentImages(truck.content)[0]
    const imageUrl = hero ? sanityOgImageUrl(hero) : null
    return buildShareMetadata({
      title,
      description,
      path: `/${slug}/${model}`,
      imageUrl,
    })
  } catch {
    return {}
  }
}

function signalLost() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="Signal lost" title="Could not load this truck" />
        <Link href="/" className="btn">Home</Link>
      </div>
    </main>
  )
}

export default async function TruckModelPage({ params }: Props) {
  const { manufacturer: manufacturerSlug, model } = await params

  let truck
  try {
    truck = await getTruckBySlug(model)
  } catch {
    return signalLost()
  }
  if (!truck) notFound()

  const canonical = truck.manufacturer?.slug?.current
  if (canonical && manufacturerSlug !== canonical) redirect(`/${canonical}/${model}`)

  return <TruckModelView truckModel={truck} manufacturerSlug={canonical ?? manufacturerSlug} />
}
