import type { Metadata } from 'next'
import { revalidatePath, updateTag } from 'next/cache'
import HomeScreen from '@/components/HomeScreen'
import type { CatalogTruck } from '@/lib/catalog'
import { getGameDeck, getHomePageData } from '@/lib/getContent'
import { getCatalog } from '@/lib/getCatalog'
import { buildShareMetadata } from '@/lib/metadata'

export const revalidate = 3600

export const metadata: Metadata = buildShareMetadata({
  title: 'Compact Pickup',
  description: 'A field guide to compact and mid-size pickup trucks sold in the U.S.',
  path: '/',
})

async function refreshHome() {
  'use server'
  updateTag('home-shelf')
  revalidatePath('/')
  revalidatePath('/game')
}

export default async function HomePage() {
  const [shelf, deck, catalog] = await Promise.all([
    getHomePageData(),
    getGameDeck(),
    getCatalog()
      .then((trucks) => ({ trucks, status: 'ready' as const }))
      .catch(() => ({ trucks: [] as CatalogTruck[], status: 'error' as const })),
  ])
  return (
    <HomeScreen
      manufacturers={shelf.manufacturers}
      makerStatus={shelf.makerStatus}
      stills={deck.stills}
      stillStatus={deck.status}
      trucks={catalog.trucks}
      catalogStatus={catalog.status}
      onRetry={refreshHome}
    />
  )
}
