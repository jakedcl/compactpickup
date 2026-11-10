import { handleCoverage } from '@/lib/binder/admin-handlers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

export function GET(request: Request) {
  return handleCoverage(request)
}
