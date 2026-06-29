/**
 * Shift library — Reel geometry (pure).
 *
 * The Reel is a wheel of covers you spin; momentum coasts it and it snaps to a
 * centered hero. The page owns the physics, but the discrete bits — wrapping a
 * spin count to an index, and which neighbours to render either side of the
 * centre — are pure and testable here.
 */
export function reelIndexFromSteps(steps: number, length: number): number {
  if (length <= 0) return 0
  return ((steps % length) + length) % length
}

/**
 * The indices to render around the centre, nearest-first, e.g. radius 2 →
 * [center, +1, -1, +2, -2]. Wraps, and never repeats an index on a short reel.
 */
export function reelWindow(
  center: number,
  length: number,
  radius: number,
): readonly number[] {
  if (length <= 0) return []
  const seen = new Set<number>()
  const out: number[] = []
  const push = (raw: number) => {
    const index = reelIndexFromSteps(raw, length)
    if (seen.has(index)) return
    seen.add(index)
    out.push(index)
  }
  push(center)
  for (let offset = 1; offset <= radius; offset += 1) {
    push(center + offset)
    push(center - offset)
  }
  return out
}
