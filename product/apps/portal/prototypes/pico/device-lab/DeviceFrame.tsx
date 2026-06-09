/**
 * device-lab — a single device screen sized to its real-world dimensions.
 *
 * widthMm x heightMm are converted to px via the calibrated pxPerMm. The screen
 * is a `container-type: size` query container, so caller content authored in
 * cqw fills it at any physical size. TEXT / PAD scales are published as CSS
 * custom properties (`--<scaleVarPrefix>-text-scale` / `-pad-scale`).
 *
 * Display fit: a device physically larger than the viewport (a TV) cannot be
 * shown at 1:1. When `maxHeightPx` is given and the true frame is taller, the
 * whole frame is `transform: scale()`d DOWN to fit. This is display-only:
 * the screen keeps its true px size, so container queries resolve exactly as on
 * the real panel — only the painted result shrinks (like viewing from afar).
 */
import type { CSSProperties, ReactNode } from "react"

export function DeviceFrame({
  children,
  widthMm,
  heightMm,
  pxPerMm,
  textScale = 1,
  padScale = 1,
  scaleVarPrefix = "lab",
  maxHeightPx,
  bezel = true,
  bezelClassName,
  screenClassName,
}: {
  readonly children: ReactNode
  readonly widthMm: number
  readonly heightMm: number
  readonly pxPerMm: number
  readonly textScale?: number
  readonly padScale?: number
  readonly scaleVarPrefix?: string
  /** Max displayed frame height in px; oversized frames scale down to fit. */
  readonly maxHeightPx?: number
  /** Draw the device bezel/frame. Default true; false = bare panel (e.g. TV). */
  readonly bezel?: boolean
  readonly bezelClassName?: string
  readonly screenClassName?: string
}) {
  const widthPx = Math.round(widthMm * pxPerMm)
  const heightPx = Math.round(heightMm * pxPerMm)
  const pad = bezel ? Math.round(heightPx * 0.037) : 0
  const radius = bezel ? Math.round(heightPx * 0.047) : 0
  const outerW = widthPx + pad * 2
  const outerH = heightPx + pad * 2
  // Fit-to-viewport: shrink only (never enlarge past true physical size).
  const fit = maxHeightPx && outerH > maxHeightPx ? maxHeightPx / outerH : 1

  const screenStyle = {
    width: widthPx,
    height: heightPx,
    [`--${scaleVarPrefix}-text-scale`]: textScale,
    [`--${scaleVarPrefix}-pad-scale`]: padScale,
  } as CSSProperties

  return (
    <div
      className="lab-fit"
      style={{
        width: Math.round(outerW * fit),
        height: Math.round(outerH * fit),
      }}
      data-fit={fit < 1 ? fit.toFixed(3) : undefined}
    >
      <div
        className={cx(
          bezel ? "lab-bezel" : undefined,
          bezel ? bezelClassName : undefined,
        )}
        style={{
          padding: pad,
          borderRadius: radius,
          transform: fit < 1 ? `scale(${fit})` : undefined,
          transformOrigin: "top left",
        }}
      >
        <div className={cx("lab-screen", screenClassName)} style={screenStyle}>
          {children}
        </div>
      </div>
    </div>
  )
}

const cx = (...classes: readonly (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")
