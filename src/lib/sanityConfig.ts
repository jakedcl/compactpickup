function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example and set your Sanity project id and dataset.`,
    )
  }
  return value
}

export const projectId = requireEnv('NEXT_PUBLIC_SANITY_PROJECT_ID')
export const dataset = requireEnv('NEXT_PUBLIC_SANITY_DATASET')
export const apiVersion = '2026-11-01'