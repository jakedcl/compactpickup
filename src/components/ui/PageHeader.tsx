import type { ReactNode } from 'react'

export default function PageHeader({
  kicker,
  title,
  lede,
}: {
  kicker?: ReactNode
  title?: string
  lede?: string | null
}) {
  const kickerOnly = Boolean(kicker && !title)
  return (
    <header className={kickerOnly ? 'page-header page-header--kicker-only' : 'page-header'}>
      {kicker ? (
        kickerOnly ? <h1 className="kicker">{kicker}</h1> : <p className="kicker">{kicker}</p>
      ) : null}
      {title ? <h1>{title}</h1> : null}
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  )
}
