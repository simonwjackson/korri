/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: template.
 *
 * Content-agnostic page skeleton: optional status bar (title) + scrolling main +
 * optional button bar (hints). Omit title/hints for full-bleed overlays (boot,
 * toast). This is the canonical home of what was `kit.tsx` `Screen`; `kit`
 * re-exports it as `Screen` so the not-yet-migrated screens keep working.
 */
import type { ReactNode } from "react"
import { PicoButtonBar, PicoStatusBar } from "../../PicoStatusBar"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export type Hint = { readonly key: "a" | "b" | "y"; readonly label: string }

export function ScreenShell({
  title,
  hints,
  children,
  className,
  tone,
}: {
  readonly title?: string
  readonly hints?: readonly Hint[]
  readonly children: ReactNode
  readonly className?: string
  readonly tone?: "default" | "dim" | "alert"
}) {
  return (
    <div
      className={`pc-root ${tone ? `tone-${tone}` : ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.screenShell)}
    >
      {title !== undefined ? <PicoStatusBar label={title} /> : null}
      <div className={`pc-main ${className ?? ""}`}>{children}</div>
      {hints ? <PicoButtonBar hints={hints} /> : null}
    </div>
  )
}
