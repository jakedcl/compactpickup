const MOBILE_FIND_MEDIA = '(max-width: 799px)'

function isMobileFind(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_FIND_MEDIA).matches
}

/** How far below the layout viewport top the anchor should sit (sticky site header). */
function focusScrollPaddingPx(): number {
  const header = document.querySelector('.site-header')
  if (header instanceof HTMLElement) {
    return Math.ceil(header.getBoundingClientRect().height) + 4
  }
  return 8
}

/** Pixels the document must scroll so `elementTop` lines up under the visual viewport + padding. */
export function visualViewportScrollDelta(
  elementTop: number,
  viewportOffsetTop: number,
  paddingTop: number,
): number {
  return elementTop - viewportOffsetTop - paddingTop
}

function scrollAnchorFor(input: HTMLElement): HTMLElement {
  const homeFind = input.closest('.home-find')
  if (homeFind) {
    const label = homeFind.querySelector('label[for]')
    if (label instanceof HTMLElement) return label
    const row = input.closest('.home-find-row')
    if (row instanceof HTMLElement) return row
  }
  return input
}

function pinDialogSearch(input: HTMLElement): void {
  const dialog = input.closest('.find-dialog')
  if (!(dialog instanceof HTMLElement)) return
  const heading = dialog.querySelector('h2')
  const targetTop = input.offsetTop - (heading instanceof HTMLElement ? heading.offsetHeight + 8 : 8)
  dialog.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })

  const backdrop = input.closest('.find-dialog-backdrop')
  if (backdrop instanceof HTMLElement) {
    backdrop.style.alignItems = 'flex-start'
    backdrop.style.paddingTop = 'max(env(safe-area-inset-top, 0px), 8px)'
  }
}

function pinToVisualViewport(anchor: HTMLElement): void {
  const padding = focusScrollPaddingPx()
  const vv = window.visualViewport
  const viewportTop = vv?.offsetTop ?? 0
  const rect = anchor.getBoundingClientRect()
  const delta = visualViewportScrollDelta(rect.top, viewportTop, padding)
  if (Math.abs(delta) < 2) return
  window.scrollBy({ top: delta, left: 0, behavior: 'auto' })
}

/** On narrow screens, pin the search control to the top of the visible viewport (keyboard-safe). */
export function scrollMobileFindFieldToTop(input: HTMLElement): void {
  if (!isMobileFind()) return

  if (input.closest('.find-dialog')) {
    pinDialogSearch(input)
    window.setTimeout(() => pinDialogSearch(input), 120)
    window.setTimeout(() => pinDialogSearch(input), 350)
    return
  }

  const anchor = scrollAnchorFor(input)
  const run = () => pinToVisualViewport(anchor)

  run()
  requestAnimationFrame(run)

  const vv = window.visualViewport
  if (vv) {
    const onViewportChange = () => run()
    vv.addEventListener('resize', onViewportChange)
    vv.addEventListener('scroll', onViewportChange)
    window.setTimeout(() => {
      vv.removeEventListener('resize', onViewportChange)
      vv.removeEventListener('scroll', onViewportChange)
    }, 900)
  }

  for (const delay of [60, 180, 380, 650]) {
    window.setTimeout(run, delay)
  }
}
