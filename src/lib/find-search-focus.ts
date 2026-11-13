/** On narrow screens, scroll the search field to the top so suggestions clear the keyboard. */
export function scrollMobileFindFieldToTop(input: HTMLElement): void {
  if (typeof window === 'undefined') return
  if (!window.matchMedia('(max-width: 799px)').matches) return
  const field =
    input.closest<HTMLElement>('.home-find-field')
    ?? input.closest<HTMLElement>('.find-search')
    ?? input
  field.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
