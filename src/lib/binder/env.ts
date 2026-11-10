export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

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
