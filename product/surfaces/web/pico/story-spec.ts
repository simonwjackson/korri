/**
 * pico surface.
 *
 * The shape a co-located `*.story.tsx` default-exports for the workshop's "parts"
 * catalog. The collector (stories.tsx) infers `layer` from the folder
 * (ui/atoms → atom, …) and `name` from the filename, so a story only authors the
 * render (plus optional name/note/presentation overrides). Drop a `<Component>.story
 * .tsx` next to a component and it appears in the catalog automatically.
 */
import type { ReactNode } from "react"

export type StorySpec = {
  /** Override the catalog label (defaults to the filename, e.g. `Btn`). */
  readonly name?: string
  /** Short caption shown after the name. */
  readonly note?: string
  /** Full-surface component (overlay/screen) — gets a sized framed canvas. */
  readonly presentation?: "part" | "surface"
  readonly render: () => ReactNode
}
