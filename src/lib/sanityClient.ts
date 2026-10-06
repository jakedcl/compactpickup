import 'server-only'
import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '@/lib/sanityConfig'

/**
 * Sanity API client. Importing this from a client component fails the build.
 * Pages pass fetched data as props so preview origins never call the API.
 */
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
})
