/**
 * device-lab — a single device screen sized to its real-world dimensions.
 *
 * widthMm x heightMm are converted to px via the calibrated pxPerMm. The screen
 * is a `container-type: size` query container, so caller content authored in
 * cqw fills it at any physical size — no transform scaling. TEXT / PAD scales
 * are published as CSS custom properties (`--<scaleVarPrefix>-text-scale` and
 * `--<scaleVarPrefix>-pad-scale`) for the caller's stylesheet to consume.
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
  bezelClassName,
  screenClassName,
}: {
  readonly children: ReactNode
  readonly widthMm: number
  readonly heightMm: number
  readonly pxPerMm: number
  readonly textScale?: number
  readonly padScale?: number
  /** Prefix for the published scale custom properties. Default "lab". */
  readonly scaleVarPrefix?: string
  /** Extra class merged onto the bezel for template skinning. */
  readonly bezelClassName?: string
  /** Extra class merged onto the screen for template skinning. */
  readonly screenClassName?: string
}) {
  const widthPx = Math.round(widthMm * pxPerMm)
  const heightPx = Math.round(heightMm * pxPerMm)
  const bezel = Math.round(heightPx * 0.037)
  const radius = Math.round(heightPx * 0.047)
  const screenStyle = {
    width: widthPx,
    height: heightPx,
    [`--${scaleVarPrefix}-text-scale`]: textScale,
    [`--${scaleVarPrefix}-pad-scale`]: padScale,
  } as CSSProperties

  return (
    <div
      className={cx("lab-bezel", bezelClassName)}
      style={{ padding: bezel, borderRadius: radius }}
    >
      <div className={cx("lab-screen", screenClassName)} style={screenStyle}>
        {children}
      </div>
    </div>
  )
}

const cx = (...classes: readonly (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")
