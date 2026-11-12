'use client'

import { useState } from 'react'
import { defaultSaveVisitorPhotoDeps, saveVisitorPhoto } from '@/lib/scan/visitor-save-photo'

export default function ScanSavePhotoButton({
  file,
  disabled,
}: {
  file: File
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      await saveVisitorPhoto(file, defaultSaveVisitorPhotoDeps())
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
