import { revalidatePath, revalidateTag } from 'next/cache'
import HomeScreen from '@/components/HomeScreen'
import { getGameDeck, getHomePageData } from '@/lib/getContent'

export const revalidate = 3600

async function refreshHome() {
  'use server'
  revalidateTag('home-shelf')
  revalidatePath('/')
  revalidatePath('/game')
}

export default async function HomePage() {
  const [shelf, deck] = await Promise.all([getHomePageData(), getGameDeck()])
  return (
    <HomeScreen
      manufacturers={shelf.manufacturers}
      makerStatus={shelf.makerStatus}
      preview={deck.stills[0] ?? null}
      stillStatus={deck.status}
      onRetry={refreshHome}
    />
  )
}
