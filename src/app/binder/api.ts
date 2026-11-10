export class BinderApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function binderApi<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const response = await fetch(url, { ...init, headers })
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
