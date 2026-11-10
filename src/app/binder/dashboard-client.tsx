'use client'

import dynamic from 'next/dynamic'
import type { PhotoStatus } from '@/lib/binder/types'

const Dashboard = dynamic(() => import('./dashboard').then((mod) => mod.Dashboard), {
  ssr: false,
  loading: () => <p>Loading the library…</p>,
})

export function BinderDashboard({ initialCounts }: { initialCounts: Record<PhotoStatus, number> | null }) {
  return <Dashboard initialCounts={initialCounts} />
}
