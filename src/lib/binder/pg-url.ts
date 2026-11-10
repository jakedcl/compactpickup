/** Neon and node-pg want sslmode=verify-full. Local databases are left alone. */
export function connectionStringForPg(connectionString: string): string {
  const host = connectionHost(connectionString)
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return connectionString
  if (/sslmode=verify-full(?:&|$)/.test(connectionString)) return connectionString
  if (/sslmode=[^&]*/.test(connectionString)) {
    return connectionString.replace(/sslmode=[^&]*/, 'sslmode=verify-full')
  }
  const join = connectionString.includes('?') ? '&' : '?'
  return `${connectionString}${join}sslmode=verify-full`
}

function connectionHost(connectionString: string): string {
  const match = connectionString.match(/@([^/?]+)/)
  if (!match) return ''
  return match[1].replace(/:\d+$/, '')
}
