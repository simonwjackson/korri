import type { ScreenConfig } from "../../device-lab"

function screenLabel(screen: ScreenConfig, index: number): string {
  if (index === 0 || screen.role === "primary") return "Main"
  return screen.label ?? `Screen ${index + 1}`
}

/**
 * Top-bar screen sub-selector for the Workshop. A device with multiple physical
 * screens can only show one at a time on the board (there is no arrangement in
 * Workshop — that's the Preview's job), so this picks which screen renders.
 * Shown only when the active device has more than one screen.
 */
export function LabScreenSelect({
  screens,
  activeId,
  onChange,
}: {
  readonly screens: readonly ScreenConfig[]
  readonly activeId: string
  readonly onChange: (id: string) => void
}) {
  return (
    <div
      className="pt-seg pt-seg-sm"
      role="toolbar"
      aria-label="Screen selection"
    >
      {screens.map((screen, index) => (
        <button
          key={screen.id}
          type="button"
          aria-pressed={screen.id === activeId}
          className={`pt-seg-btn${screen.id === activeId ? " is-on" : ""}`}
          onClick={() => onChange(screen.id)}
        >
          {screenLabel(screen, index)}
        </button>
      ))}
    </div>
  )
}
