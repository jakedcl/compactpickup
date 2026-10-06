import type { ReactNode } from 'react'

export default function PageHeader({
  kicker,
  title,
  lede,
}: {
  kicker?: ReactNode
  title: string
  lede?: string | null
}) {
  return (
    <header className="page-header">
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <h1>{title}</h1>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  )
}
