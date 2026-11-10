'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function logout() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) {
        setError('Sign out did not finish.')
        return
      }
      router.refresh()
    } catch {
      setError('Sign out did not finish.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="binder-actions">
      <button type="button" className="btn" onClick={() => void logout()} disabled={pending}>
        {pending ? 'Signing out' : 'Sign out'}
      </button>
      {error ? (
        <p className="binder-note is-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
