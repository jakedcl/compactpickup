export const VHS_BOOT_KEY = 'cp-vhs-boot'

export function hasSeenBoot(): boolean {
  try {
    return sessionStorage.getItem(VHS_BOOT_KEY) === '1'
  } catch {
    return false
  }
}

export function markBootSeen(): void {
  try {
    sessionStorage.setItem(VHS_BOOT_KEY, '1')
  } catch {
    // Private browsing can block storage. The intro still ends.
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
