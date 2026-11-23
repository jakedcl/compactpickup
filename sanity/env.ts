function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example and set your Sanity project id and dataset for Studio.`,
    )
  }
  return value
}

export const studioProjectId = requireEnv('SANITY_STUDIO_PROJECT_ID')
export const studioDataset = requireEnv('SANITY_STUDIO_DATASET')