import { BinderShell } from '@/app/binder/shell'

export default function AdminLoading() {
  return (
    <BinderShell>
      <p className="kicker">Binder</p>
      <h1>Photo library</h1>
      <p>Loading…</p>
    </BinderShell>
  )
}
