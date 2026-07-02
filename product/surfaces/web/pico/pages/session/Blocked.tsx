/**
 * pico surface. ATOMIC LAYER: page. Launch blocked (static).
 */
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const BLOCK_REASONS: readonly {
  readonly id: string
  readonly label: string
}[] = [
  { id: "preparing", label: "PREPARING STREAM" },
  { id: "running", label: "GAME RUNNING" },
  { id: "cooling", label: "COOLING DOWN" },
  { id: "recovering", label: "RECOVERING" },
]

export function Blocked() {
  return (
    <ScreenShell
      title="PICO ▸ LAUNCH"
      tone="alert"
      hints={[
        { key: "a", label: "WAIT" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <Hero
        glyph="⊘"
        glyphTone="bad"
        title="LAUNCH BLOCKED"
        message="Another cart's already in the slot. Hang tight — you can launch the moment this host frees up."
      >
        <div className="pcSes-reasons">
          {BLOCK_REASONS.map(reason => (
            <span
              key={reason.id}
              className={`pcSes-reason ${reason.id === "running" ? "active" : ""}`}
            >
              {reason.label}
            </span>
          ))}
        </div>
      </Hero>
    </ScreenShell>
  )
}
