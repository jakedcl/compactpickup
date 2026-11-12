'use client'

import { useState } from 'react'
import { defaultSaveVisitorPhotoDeps, saveVisitorPhoto } from '@/lib/scan/visitor-save-photo'

export default function ScanSavePhotoButton({
  file,
  disabled,
  onSaved,
}: {
  file: File
  disabled?: boolean
  onSaved?: () => void
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

  return (
    <button
      type="button"
      className="scan-save-photo"
      disabled={disabled || busy}
      onClick={() => void onClick()}
    >
      {busy ? 'Saving…' : 'Save photo'}
    </button>
  )
}
