import { notFound } from 'next/navigation'
import { BinderDashboard } from '@/app/binder/dashboard-client'
import { BinderShell } from '@/app/binder/shell'

export const dynamic = 'force-dynamic'

/** Layout check for the review screen. Stays a 404 unless REVIEW_FIT=1. */
export default function ReviewFitPage() {
  if (process.env.REVIEW_FIT !== '1') notFound()
  return (
    <BinderShell wide>
      <BinderDashboard initialCounts={{ pending: 2, approved: 0, rejected: 0 }} />
    </BinderShell>
  )
}
