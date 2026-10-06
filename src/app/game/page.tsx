import type { Metadata } from 'next'
import GameScreen from '@/components/GameScreen'

export const metadata: Metadata = {
  title: 'Name that truck · Compact Pickup',
  description: 'Name the truck in the still. Ten questions, four choices.',
}

export default function GamePage() {
  return <GameScreen />
}
