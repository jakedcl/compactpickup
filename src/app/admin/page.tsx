import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import { LoginForm } from '@/app/admin/login-form'
import { LogoutButton } from '@/app/admin/logout-button'
import { BinderShell } from '@/app/admin/shell'
import { photoCounts, type PhotoCounts } from '@/lib/binder/photos'
import { getSession } from '@/lib/binder/session-cookie'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Binder',
  robots: { index: false, follow: false },
}

const labels: { key: keyof PhotoCounts; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

export default async function AdminPage() {
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
  const total = counts ? counts.pending + counts.approved + counts.rejected : 0

  return (
    <BinderShell>
      <PageHeader
        kicker="Binder"
        title="Photo library"
        lede={`Signed in as ${session.email}. Review tools come later.`}
      />
      {counts ? (
        <ul className="binder-counts">
          {labels.map((item) => (
            <li key={item.key} className="binder-count">
              <span>{item.label}</span>
              <strong>{counts[item.key]}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="binder-note is-bad" role="alert">
          The photo counts did not load.
        </p>
      )}
      {counts && total === 0 ? <p>No photos yet. Import runs after the database migration.</p> : null}
      <LogoutButton />
    </BinderShell>
  )
}
