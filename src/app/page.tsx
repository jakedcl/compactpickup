import { revalidatePath, revalidateTag } from 'next/cache'
import HomeScreen from '@/components/HomeScreen'
import type { CatalogTruck } from '@/lib/catalog'
import { getGameDeck, getHomePageData } from '@/lib/getContent'
import { getCatalog } from '@/lib/getCatalog'

export const revalidate = 3600

async function refreshHome() {
  'use server'
  revalidateTag('home-shelf')
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
