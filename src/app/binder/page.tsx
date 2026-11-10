import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import { Dashboard } from '@/app/binder/dashboard'
import { LoginForm } from '@/app/binder/login-form'
import { BinderShell } from '@/app/binder/shell'
import { photoCounts, type PhotoCounts } from '@/lib/binder/photos'
import { getSession } from '@/lib/binder/session-cookie'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Binder',
  robots: { index: false, follow: false },
}

export default async function BinderPage() {
  const session = await getSession()
  if (!session) {
    return (
      <BinderShell>
        <PageHeader
          kicker="Binder"
          title="Photo library"
          lede="Sign in with the admin email. A one-time code arrives by email."
        />
        <LoginForm />
      </BinderShell>
    )
  }

  let counts: PhotoCounts | null = null
  try {
    counts = await photoCounts()
  } catch {
    console.error('binder: photo counts failed')
  }

  return (
    <BinderShell wide>
      <PageHeader
        kicker="Binder"
        title="Photo library"
        lede={`Signed in as ${session.email}. Nothing matches until you approve it.`}
      />
      <Dashboard initialCounts={counts} />
    </BinderShell>
  )
}
