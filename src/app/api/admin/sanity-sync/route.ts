import { handleSanitySync } from '@/lib/binder/admin-handlers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export function POST(request: Request) {
  return handleSanitySync(request)
}
