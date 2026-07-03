/**
 * Shift route hierarchy depth — drives the push/pop transition direction.
 *
 * Home sits at the root (0); the library and companion are one level in (1); a
 * game's detail is the deepest (2). Navigating to a greater depth is "forward"
 * (push, slide in from the right); a lesser depth is "back" (pop, slide in from
 * the left). Depth — not history internals — is the source of truth, so an
 * East/`back` pop and a programmatic navigate agree on direction.
 */
export function shiftRouteDepth(pathname: string): number {
  if (pathname === "/") return 0
  if (pathname.startsWith("/game")) return 2
  return 1
}

/**
 * +1 when navigating deeper (slide the incoming page in from the right), -1 when
 * going back (from the left), 0 for a same-depth swap (fade only).
 */
export function shiftSlideDirection(
  prevDepth: number,
  nextDepth: number,
): number {
  return Math.sign(nextDepth - prevDepth)
}
