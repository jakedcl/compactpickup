import { BinderShell } from '@/app/admin/shell'

export default function AdminLoading() {
  return (
    <BinderShell>
      <p className="kicker">Binder</p>
      <h1>Photo library</h1>
      <p>Loading…</p>
    </BinderShell>
  )
}
