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

export function shouldBeginConsentIsland(verdict: ScanVerdict): boolean {
  return verdict !== 'idk'
}

export function hasActiveVisitorSession(session: VisitorScanSession | null): boolean {
  return Boolean(session?.file && shouldBeginConsentIsland(session.verdict))
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

export type VisitorProgressInput = {
  modelDownloading: boolean
  scanning: boolean
  cropBusy: boolean
}

export function visitorProgressLabel(input: VisitorProgressInput): string {
  if (input.modelDownloading) return 'Downloading the scanner…'
  if (input.scanning) return 'Scanning the truck…'
  return 'Cropping the truck…'
}

export function visitorProgressValue(input: VisitorProgressInput, cropProgress: number, scanProgress: number): number {
  if (input.modelDownloading) return Math.max(cropProgress, scanProgress)
  if (input.scanning) return scanProgress
  return cropProgress
}

export function visitorProgressVisible(input: VisitorProgressInput): boolean {
  return input.modelDownloading || input.cropBusy || input.scanning
}

/** Results modal Replace/Save row: half-and-half only on mobile after camera capture. */
export function modalPhotoActionLayout(
  offerSave: boolean,
  device: 'unknown' | 'mobile' | 'desktop',
): 'split' | 'single' {
  if (!offerSave) return 'single'
  if (device === 'mobile') return 'split'
  return 'single'
}
