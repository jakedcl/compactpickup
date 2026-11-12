'use client'

import { useState } from 'react'
import { defaultSaveVisitorPhotoDeps, saveVisitorPhoto } from '@/lib/scan/visitor-save-photo'

export default function ScanSavePhotoButton({
  file,
  disabled,
  onSaved,
  variant = 'modal',
}: {
  file: File
  disabled?: boolean
  onSaved?: () => void
  /** Primary placement in the results modal; quieter underline style on the consent island. */
  variant?: 'modal' | 'quiet'
}) {
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      const result = await saveVisitorPhoto(file, defaultSaveVisitorPhotoDeps())
      if (result === 'shared' || result === 'downloaded') onSaved?.()
    } finally {
      setBusy(false)
    }
  }

  const className = variant === 'quiet' ? 'scan-consent-island-quiet' : 'scan-save-photo'

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      onClick={() => void onClick()}
    >
      {busy ? 'Saving…' : 'Save photo'}
    </button>
  )
}
