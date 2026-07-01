import type { ReactNode } from "react"

/**
 * Theme + size scope for standalone Shift parts in the dev-lab.
 *
 * Shift's design tokens and component CSS live under `[data-shift-home]`, and its
 * type scale is container-query driven (`--intrinsic-base` reads `cqi`/`cqh`), so
 * an isolated atom or molecule needs a sized, scoped ancestor to render at the
 * right scale and colours. This plays the role pico's adapter `previewScope`
 * plays centrally — kept per-part here because Shift's page parts already
 * self-scope, so we don't retrofit the whole adapter for the first slice.
 */
export function ShiftPartFrame({
  children,
}: {
  readonly children: ReactNode
  readonly width?: number
  readonly height?: number
}) {
  return (
    <div
      data-shift-home
      className="shift-cine intrinsic"
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  )
}
