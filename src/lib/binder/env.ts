export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export function requireEnvs(names: readonly string[]): void {
  for (const name of names) requireEnv(name)
}

export const BINDER_WRITE_ENV = [
  'DATABASE_URL_UNPOOLED',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const

/** The only address allowed to sign in. Comes from ADMIN_EMAIL. */
export function adminEmail(): string | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  return email
}

/** Cookie signing key. Rejects missing or short values so a blank secret cannot sign. */
export function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) return null
  return secret
}
