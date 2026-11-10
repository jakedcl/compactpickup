'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'code' | 'sign-in' | null>(null)

  async function sendCode() {
    setError(null)
    setMessage(null)
    if (!email.trim()) {
      setError('Enter an email.')
      return
    }
    setPending('code')
    try {
      const response = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) {
        setError(data?.message ?? 'The code did not send.')
        return
      }
      setMessage(data?.message ?? 'If that address can sign in, a code is on the way.')
    } catch {
      setError('The code did not send.')
    } finally {
      setPending(null)
    }
  }

  async function signIn() {
    setError(null)
    setMessage(null)
    if (!email.trim()) {
      setError('Enter an email.')
      return
    }
    if (!code.trim()) {
      setError('Enter the code.')
      return
    }
    setPending('sign-in')
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) {
        setError(data?.message ?? 'Check the code and try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Check the code and try again.')
    } finally {
      setPending(null)
    }
  }

  const busy = pending !== null

  return (
    <form
      className="binder-form"
      onSubmit={(event) => {
        event.preventDefault()
        void signIn()
      }}
    >
      <label htmlFor="binder-email">Email</label>
      <input
        id="binder-email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={busy}
        required
      />
      <button type="button" className="btn" onClick={() => void sendCode()} disabled={busy}>
        {pending === 'code' ? 'Sending' : 'Send code'}
      </button>
      <label htmlFor="binder-code">Code</label>
      <input
        id="binder-code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={8}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
        disabled={busy}
      />
      <button type="submit" className="btn btn-accent" disabled={busy}>
        {pending === 'sign-in' ? 'Signing in' : 'Sign in'}
      </button>
      {message ? (
        <p className="binder-note" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="binder-note is-bad" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
