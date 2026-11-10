import { scanPost } from '@/lib/binder/scan-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return scanPost(request)
}
