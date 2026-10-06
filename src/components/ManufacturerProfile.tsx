import Image from 'next/image'
import {cleanText} from '@/lib/truckDisplay'
import {urlFor} from '@/lib/sanity'

type ManufacturerProfileData = {
  name: string
  founded?: string | null
  hq?: string | null
  country?: string | null
  website?: string | null
  description?: string | null
  compactPickupHistory?: string | null
  logo?: {
    asset?: {
      _ref: string
    }
  } | null
}

function siteLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function ManufacturerProfile({manufacturer}: {manufacturer: ManufacturerProfileData}) {
  const description = cleanText(manufacturer.description)
  const history = cleanText(manufacturer.compactPickupHistory)
  const facts = [
    {label: 'Founded', value: cleanText(manufacturer.founded)},
    {label: 'HQ', value: cleanText(manufacturer.hq)},
    {label: 'Country', value: cleanText(manufacturer.country)},
  ].filter((fact) => fact.value)
  const website = cleanText(manufacturer.website)
  const logo = manufacturer.logo?.asset ? manufacturer.logo : null

  if (!description && !history && !facts.length && !website && !logo) return null

  return (
    <section className="w-full bg-black/20 border border-white/20 p-6 mb-6">
      {logo?.asset?._ref && (
        <Image
          src={urlFor({asset: {_ref: logo.asset._ref}}).height(80).url()}
          alt={manufacturer.name}
          width={160}
          height={80}
          className="vhs-logo mb-4"
        />
      )}
      {description && (
        <p className="text-white/90 text-sm leading-relaxed mb-4">{description}</p>
      )}
      {(facts.length > 0 || website) && (
        <dl className="divide-y divide-white/15 mb-4">
          {facts.map((fact) => (
            <div key={fact.label} className="grid grid-cols-1 sm:grid-cols-[9.5rem_1fr] gap-x-3 py-2">
              <dt className="text-yellow-400 uppercase tracking-wider text-xs">{fact.label}</dt>
              <dd className="text-sm text-white/90">{fact.value}</dd>
            </div>
          ))}
          {website && (
            <div className="grid grid-cols-1 sm:grid-cols-[9.5rem_1fr] gap-x-3 py-2">
              <dt className="text-yellow-400 uppercase tracking-wider text-xs">Website</dt>
              <dd className="text-sm">
                <a href={website} target="_blank" rel="noreferrer" className="text-white/90 hover:text-white">
                  {siteLabel(website)}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
      {history && (
        <p className="text-white/80 text-sm leading-relaxed">{history}</p>
      )}
    </section>
  )
}
