import SanityImage from '@/components/SanityImage'
import {cleanText} from '@/lib/truckDisplay'
import type {SanityImageValue} from '@/lib/sanityImage'

type ManufacturerProfileData = {
  name: string
  founded?: string | null
  hq?: string | null
  country?: string | null
  website?: string | null
  description?: string | null
  compactPickupHistory?: string | null
  logo?: SanityImageValue | null
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
    <section className="section">
      {logo?.asset?._ref && (
        <SanityImage
          image={logo}
          alt={manufacturer.name}
          sizes="120px"
          width={160}
          height={80}
          eager
          className="vhs-logo"
        />
      )}
      {description ? <p className="lede">{description}</p> : null}
      {(facts.length > 0 || website) && (
        <dl className="spec-list">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
          {website ? (
            <div>
              <dt>Website</dt>
              <dd><a href={website} target="_blank" rel="noreferrer">{siteLabel(website)}</a></dd>
            </div>
          ) : null}
        </dl>
      )}
      {history ? <p className="prose">{history}</p> : null}
    </section>
  )
}
