import type { CSSProperties, ReactNode } from "react"
import type { ScreenConfig } from "../../device-lab"

const DEFAULT_SCREEN = {
  id: "compose-screen",
  widthMm: 156,
  heightMm: 85,
} satisfies ScreenConfig

/**
 * Logical screen frame for Compose.
 *
 * Unlike `DeviceFrame`, this does not convert millimetres to pixels and it never
 * draws a bezel. The selected screen contributes only its aspect ratio, so a
 * page remains a single device-agnostic screen while Device owns physical size,
 * bezels, and multi-screen arrangement.
 */
export function LabScreenFrame({
  children,
  screen,
}: {
  readonly children: ReactNode
  readonly screen: ScreenConfig | undefined
}) {
  const logical = screen ?? DEFAULT_SCREEN
  const style = {
    aspectRatio: `${logical.widthMm} / ${logical.heightMm}`,
  } as CSSProperties

  return (
    <div
      className="lab-compose-screen-frame"
      data-lab-frame="screen"
      data-lab-screen-id={logical.id}
      style={style}
    >
      <div className="lab-compose-screen">{children}</div>
    </div>
  )
}
