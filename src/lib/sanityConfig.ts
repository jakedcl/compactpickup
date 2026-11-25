function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example and set your Sanity project id and dataset.`,
    )
  }
  return trimmed
}

// Next.js only inlines NEXT_PUBLIC_* vars into the client bundle when they are referenced literally.
export const projectId = required('NEXT_PUBLIC_SANITY_PROJECT_ID', process.env.NEXT_PUBLIC_SANITY_PROJECT_ID)
export const dataset = required('NEXT_PUBLIC_SANITY_DATASET', process.env.NEXT_PUBLIC_SANITY_DATASET)
export const apiVersion = '2026-11-01'
