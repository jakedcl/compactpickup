import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import TruckModelView from '@/components/TruckModelView'
import PageHeader from '@/components/ui/PageHeader'
import { getTruckBySlug, getTruckParams } from '@/lib/getContent'
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
  const { model } = await params
  try {
    const truck = await getTruckBySlug(model)
    if (!truck) return {}
    const description = cleanText(truck.summary)
    return {
      title: `${truck.title} · Compact Pickup`,
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
        <PageHeader kicker="Signal lost" title="Could not load this truck" />
        <Link href="/" className="btn">Back to the shelf</Link>
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

  return <TruckModelView truckModel={truck} manufacturerSlug={manufacturerSlug} />
}
