import type { ScanCatalogTruck, ScanVerdict } from '@/lib/binder/scan-types'

export type VisitorCorrection =
  | { kind: 'catalog'; truck: ScanCatalogTruck }
  | { kind: 'custom'; text: string }

export type VisitorSubmitPhase = 'idle' | 'sending' | 'sent' | 'duplicate' | 'error'

export type VisitorScanSession = {
  file: File
  previewUrl: string | null
  verdict: ScanVerdict
  correction: VisitorCorrection | null
  /** First match from the scan API — always used for guessedTruckId/Slug on submit. */
  topGuess: ScanCatalogTruck
  submitPhase: VisitorSubmitPhase
  submitMessage: string
  /** After Yes or No the island collapses to Scan another only. */
  consentAnswered: boolean
  /** True when the photo came from mobile Take photo (camera capture). */
  fromCameraCapture: boolean
  /** Set after a successful share-sheet or download save (user gesture). */
  photoSaved: boolean
}

export function verdictFromGuessIndex(index: number): ScanVerdict {
  return index === 0 ? 'right' : 'wrong'
}

export function correctionFromGuessIndex(
  index: number,
  match: ScanCatalogTruck,
): VisitorCorrection | null {
  if (index === 0) return null
  return { kind: 'catalog', truck: match }
}

export function hasActiveVisitorSession(session: VisitorScanSession | null): boolean {
  return Boolean(session?.file)
}

/** Whether auto-scan should run after the crop step finishes. */
export function shouldAutoScanAfterCrop(input: {
  cropPhase: 'idle' | 'cropping' | 'ready' | 'error'
  hasFile: boolean
  scanning: boolean
  hasResult: boolean
  cropError: boolean
}): boolean {
  if (input.cropError || input.cropPhase !== 'ready') return false
  if (!input.hasFile || input.scanning || input.hasResult) return false
  return true
}

export function visitorProgressLabel(scanning: boolean): string {
  return scanning ? 'Scanning the truck…' : 'Cropping the truck…'
}

export function visitorProgressValue(scanning: boolean, cropProgress: number, scanProgress: number): number {
  return scanning ? scanProgress : cropProgress
}

export function visitorProgressVisible(cropBusy: boolean, scanning: boolean): boolean {
  return cropBusy || scanning
}
