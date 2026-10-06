import { dataset, projectId } from '@/lib/sanityConfig'

export { apiVersion, dataset, projectId } from '@/lib/sanityConfig'

/** Crop, hotspot, and the LQIP/dimensions needed for blur placeholders. */
export const sanityImageFields = `
  crop,
  hotspot,
  asset,
  "lqip": asset->metadata.lqip,
  "dimensions": asset->metadata.dimensions
`

export function fileUrlFor(source: { asset: { _ref: string } }) {
  const ref = source.asset._ref
  const [, id, extension] = ref.split('-')
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${id}.${extension}`
}

// GROQ queries
export const manufacturersQuery = `*[_type == "manufacturer"] | order(name asc) {
  _id,
  name,
  slug,
  logo { ${sanityImageFields} }
}`

export const manufacturerBySlugQuery = `*[_type == "manufacturer" && slug.current == $slug][0] {
  _id,
  name,
  slug,
  logo { ${sanityImageFields} },
  founded,
  hq,
  country,
  website,
  description,
  compactPickupHistory
}`

export const truckModelsByManufacturerQuery = `*[_type == "truckModel" && manufacturer._ref == $manufacturerId] {
  _id,
  title,
  slug,
  yearRange,
  productionStart,
  productionEnd,
  manufacturer->{name, slug}
}`

const relatedTruckProjection = `{
  _key,
  name,
  relation,
  "truck": truck->{
    title,
    "slug": slug.current,
    "manufacturerSlug": manufacturer->slug.current
  }
}`

export const truckModelBySlugQuery = `*[_type == "truckModel" && slug.current == $slug][0] {
  _id,
  title,
  slug,
  yearRange,
  generation,
  nameplate,
  productionStart,
  productionEnd,
  yearBasis,
  internalCodes,
  assemblyPlants,
  markets,
  bodyStyles,
  bedLengths,
  trims,
  transmissions,
  drivetrains,
  engines[]{
    _key,
    name,
    displacement,
    config,
    hp,
    torque,
    years,
    notes
  },
  dimensions{
    wheelbaseIn,
    lengthIn,
    widthIn,
    heightIn
  },
  curbWeight,
  payload,
  towing,
  launchMSRP,
  summary,
  sources,
  content[]{
    ...,
    _type == "image" => {
      ...,
      alt,
      caption,
      "lqip": asset->metadata.lqip,
      "dimensions": asset->metadata.dimensions
    }
  },
  model3d,
  manufacturer->{name, slug},
  "predecessor": predecessor${relatedTruckProjection},
  "successor": successor${relatedTruckProjection},
  "siblings": siblings[]${relatedTruckProjection}
}`

// Query to get all images from all truck models for homepage carousel
export const allTruckImagesQuery = `*[_type == "truckModel" && defined(content)] {
  _id,
  title,
  yearRange,
  manufacturer->{name, slug},
  "images": content[_type == "image"] {
    alt,
    caption,
    ${sanityImageFields},
    "truckTitle": ^.title,
    "yearRange": ^.yearRange,
    "manufacturerName": ^.manufacturer->name,
    "truckSlug": ^.slug.current,
    "manufacturerSlug": ^.manufacturer->slug.current
  }
}[count(images) > 0]`

// Query to get all truck models for timeline (grouped by decade)
export const timelineQuery = `*[_type == "truckModel" && defined(content)] | order(coalesce(productionStart, 9999) asc, yearRange asc) {
  _id,
  title,
  yearRange,
  productionStart,
  slug,
  manufacturer->{name, slug},
  "images": content[_type == "image"] {
    alt,
    caption,
    ${sanityImageFields}
  }
}[count(images) > 0]`

export const manufacturerParamsQuery = `*[_type == "manufacturer" && defined(slug.current)]{
  "manufacturer": slug.current
}`

export const truckParamsQuery = `*[_type == "truckModel" && defined(slug.current) && defined(manufacturer->slug.current)]{
  "manufacturer": manufacturer->slug.current,
  "model": slug.current
}`
