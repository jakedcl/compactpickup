import SectionHeading from '@/components/ui/SectionHeading'
import {cleanSources} from '@/lib/truckDisplay'

function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.host.replace(/^www\./, '')}${path}`
  } catch {
    return url
  }
}

export default function SourceList({sources}: {sources?: Array<string | null> | null}) {
  const urls = cleanSources(sources)
  if (!urls.length) return null

  return (
    <section className="section">
      <SectionHeading title="Sources" />
      <ul className="link-list source-list">
        {urls.map((url) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer">{sourceLabel(url)}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
