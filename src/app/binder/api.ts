export class BinderApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'BinderApiError'
    this.status = status
  }
}

/** Most admin calls. Sanity import is allowed to match its 60s server limit. */
export const BINDER_API_TIMEOUT_MS = 15_000
export const SANITY_SYNC_TIMEOUT_MS = 60_000

function aborted(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

export async function binderApi<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(BINDER_API_TIMEOUT_MS),
    })
  } catch (error) {
    if (aborted(error)) throw new BinderApiError(408, 'That did not finish.')
    throw error
  }
  if (response.status === 401) {
    window.location.reload()
    throw new BinderApiError(401, 'Sign in again.')
  }
  const data = (await response.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!response.ok) {
    throw new BinderApiError(response.status, data?.error ?? 'That did not finish.')
  }
  return data as T
}
