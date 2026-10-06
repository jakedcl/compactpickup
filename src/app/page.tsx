import { revalidatePath, revalidateTag } from 'next/cache'
import HomeScreen from '@/components/HomeScreen'
import { getHomePageData } from '@/lib/getContent'

export const revalidate = 3600

async function refreshHome() {
  'use server'
  revalidateTag('home-shelf')
  revalidatePath('/')
}

export default async function HomePage() {
  const data = await getHomePageData()
  return <HomeScreen {...data} onRetry={refreshHome} />
}
