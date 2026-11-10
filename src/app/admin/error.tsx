'use client'

import { BinderShell } from '@/app/admin/shell'

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <BinderShell>
      <p className="kicker">Binder</p>
      <h1>Photo library</h1>
      <p>The page did not finish loading.</p>
      <button type="button" className="btn" onClick={() => reset()}>
        Try again
      </button>
    </BinderShell>
  )
}
