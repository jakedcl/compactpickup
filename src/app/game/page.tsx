import type { Metadata } from 'next'
import { revalidatePath, revalidateTag } from 'next/cache'
import GameScreen from '@/components/GameScreen'
import { getGameDeck } from '@/lib/getContent'

export const metadata: Metadata = {
  title: 'Name that truck · Compact Pickup',
  description: 'Name the truck in the still. Ten questions, four choices.',
}

export const revalidate = 3600

async function refreshGame() {
  'use server'
  revalidateTag('home-shelf')
  revalidatePath('/game')
  revalidatePath('/')
}

export default async function GamePage() {
  const deck = await getGameDeck()
  return <GameScreen stills={deck.stills} status={deck.status} onRetry={refreshGame} />
}
