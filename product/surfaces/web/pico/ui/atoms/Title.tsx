/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: atom.
 *
 * Display-font heading. Size via `size` -> token step (`--pico-text-*`); the
 * class owns font-size (never inline). Moved from `kit.tsx`; `kit` re-exports.
 */
import type { ReactNode } from "react"

export function Title({
  children,
  size = 1,
}: {
  readonly children: ReactNode
  readonly size?: -2 | -1 | 0 | 1 | 2 | 3
}) {
  return <h1 className={`pc-title pc-t${size}`}>{children}</h1>
}
