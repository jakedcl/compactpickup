import Link from 'next/link'
import SectionHeading from '@/components/ui/SectionHeading'
import {cleanText, linkHref, linkLabel, visibleLinks, type TruckLink, type TruckSpecData} from '@/lib/truckDisplay'

function RelatedList({title, links}: {title: string; links: Array<NonNullable<TruckLink>>}) {
  if (!links.length) return null

  return (
    <div className="related-group">
      <h3 className="kicker">{title}</h3>
      <ul className="link-list">
        {links.map((link, index) => {
          const label = linkLabel(link)
          if (!label) return null
          const href = linkHref(link)
          const relation = cleanText(link.relation)
          const body = (
            <>
              <span>{label}</span>
              {relation ? <span className="meta">{relation}</span> : null}
            </>
          )
          return (
            <li key={link._key || `${title}-${label}-${index}`}>
              {href ? <Link href={href}>{body}</Link> : <span>{body}</span>}
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
    <section className="section">
      <SectionHeading title="Related" />
      <div className="related-groups">
        <RelatedList title="Predecessor" links={predecessor} />
        <RelatedList title="Successor" links={successor} />
        <RelatedList title="Siblings" links={siblings} />
      </div>
    </section>
  )
}
