import Link from 'next/link'
import {cleanText, linkHref, linkLabel, visibleLinks, type TruckLink, type TruckSpecData} from '@/lib/truckDisplay'

function RelatedList({title, links}: {title: string; links: Array<NonNullable<TruckLink>>}) {
  if (!links.length) return null

  return (
    <div className="mb-4 last:mb-0">
      <h3 className="text-yellow-400 uppercase tracking-wider text-xs mb-2">{title}</h3>
      <ul className="space-y-1">
        {links.map((link, index) => {
          const label = linkLabel(link)
          if (!label) return null
          const href = linkHref(link)
          const relation = cleanText(link.relation)
          const body = (
            <>
              <span className="text-yellow-400 mr-2">▶</span>
              <span>
                {label}
                {relation ? <span className="text-white/50"> — {relation}</span> : null}
              </span>
            </>
          )

          return (
            <li key={link._key || `${title}-${label}-${index}`} className="text-sm">
              {href ? (
                <Link href={href} className="flex items-start text-white hover:text-yellow-400">
                  {body}
                </Link>
              ) : (
                <span className="flex items-start text-white/80">{body}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function RelatedTrucks({truck}: {truck: TruckSpecData}) {
  const predecessor = visibleLinks([truck.predecessor])
  const successor = visibleLinks([truck.successor])
  const siblings = visibleLinks(truck.siblings)

  if (!predecessor.length && !successor.length && !siblings.length) return null

  return (
    <section className="w-full bg-black/20 border border-white/20 p-6 mb-6">
      <h2 className="text-lg font-bold text-white mb-3 uppercase tracking-wider border-b border-white/20 pb-2">
        Related
      </h2>
      <RelatedList title="Predecessor" links={predecessor} />
      <RelatedList title="Successor" links={successor} />
      <RelatedList title="Siblings" links={siblings} />
    </section>
  )
}
