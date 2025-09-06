import { createClient } from 'next-sanity'
import imageUrlBuilder from '@sanity/image-url'

export const projectId = 'xbw6uf6e'
export const dataset = 'production'
export const apiVersion = '2024-01-01'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
})

const builder = imageUrlBuilder(client)

export function urlFor(source: { asset: { _ref: string } }) {
  return builder.image(source)
}

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
  logo
}`

export const manufacturerBySlugQuery = `*[_type == "manufacturer" && slug.current == $slug][0] {
  _id,
  name,
  slug,
  logo
}`

export const truckModelsByManufacturerQuery = `*[_type == "truckModel" && manufacturer._ref == $manufacturerId] | order(yearRange asc) {
  _id,
  title,
  slug,
  yearRange,
  manufacturer->{name, slug}
}`

export const truckModelBySlugQuery = `*[_type == "truckModel" && slug.current == $slug][0] {
  _id,
  title,
  slug,
  yearRange,
  content,
  model3d,
  manufacturer->{name, slug}
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
    asset,
    "truckTitle": ^.title,
    "yearRange": ^.yearRange,
    "manufacturerName": ^.manufacturer->name,
    "truckSlug": ^.slug.current,
    "manufacturerSlug": ^.manufacturer->slug.current
  }
}[count(images) > 0]`
