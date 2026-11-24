function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example and set your Sanity project id and dataset for Studio.`,
    )
  }
  return trimmed
}

// Literal process.env references so Next.js and the Sanity CLI Vite build can inline these values.
export const studioProjectId = required(
  'SANITY_STUDIO_PROJECT_ID',
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
)
export const studioDataset = required(
  'SANITY_STUDIO_DATASET',
  process.env.SANITY_STUDIO_DATASET || process.env.NEXT_PUBLIC_SANITY_DATASET,
)
