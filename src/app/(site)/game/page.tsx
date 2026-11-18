import type { Metadata } from 'next'
import { revalidatePath, updateTag } from 'next/cache'
import GameScreen from '@/components/GameScreen'
import { getGameDeck } from '@/lib/getContent'
import { buildShareMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildShareMetadata({
  title: 'Name that truck · Compact Pickup',
  description: 'Name the truck in the still. Ten questions, four choices.',
  path: '/game',
})

export const revalidate = 3600

async function refreshGame() {
  'use server'
  updateTag('home-shelf')
  revalidatePath('/game')
  revalidatePath('/')
}

export default async function GamePage() {
  const deck = await getGameDeck()
  return <GameScreen stills={deck.stills} status={deck.status} onRetry={refreshGame} />
}
