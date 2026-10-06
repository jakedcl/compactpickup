import {cleanSources} from '@/lib/truckDisplay'

export default function SourceList({sources}: {sources?: Array<string | null> | null}) {
  const urls = cleanSources(sources)
  if (!urls.length) return null

  return (
    <section className="w-full bg-black/20 border border-white/20 p-6 mb-6">
      <h2 className="text-lg font-bold text-white mb-3 uppercase tracking-wider border-b border-white/20 pb-2">
        Sources
      </h2>
      <ul className="space-y-2">
        {urls.map((url) => (
          <li key={url} className="flex items-start text-sm">
            <span className="text-yellow-400 mr-2">▶</span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-white/80 hover:text-white break-all"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
