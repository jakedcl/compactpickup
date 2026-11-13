/** Max finger movement that still counts as a tap on suggestion rows. */
export const FIND_SUGGESTION_TAP_SLOP_PX = 12

export function pointerMovedBeyondTapSlop(
  dx: number,
  dy: number,
  slop = FIND_SUGGESTION_TAP_SLOP_PX,
): boolean {
  return Math.hypot(dx, dy) > slop
}
