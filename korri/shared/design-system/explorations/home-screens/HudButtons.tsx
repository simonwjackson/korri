/**
 * Shared HUD button hints for the home-screen explorations.
 *
 * Renders three semantic action hints — confirm / back / options — using the
 * gamepad button glyphs (A / B / Y). Subscribes to the device-agnostic input
 * bus via `useInputAction` so a button press lights the matching glyph
 * regardless of input device (gamepad button, keyboard key, future remote).
 *
 * The HUD itself ships with no visual styling. Each exploration scopes its
 * own CSS via the `[data-exploration="..."]` attribute on the screen root,
 * targeting the class names below. That keeps both variants visually
 * distinct while the HUD's structure and behavior stay shared.
 *
 * Class hooks consumers may style:
 *   .hud
 *   .hud-hint        (one per action)
 *   .hud-hint[data-active]   (briefly, on press)
 *   .hud-glyph       (the A/B/Y circle)
 *   .hud-label       (the action's label text)
 *
 * The HUD is presentational only — it is `aria-hidden` and contains no
 * focusable elements, so it never competes with the grid/rail for spatial
 * navigation focus.
 */

import { useInputAction } from "@shared/navigation/use-input-action"
import { useCallback, useEffect, useRef, useState } from "react"

type Action = "confirm" | "back" | "options"

export interface HudButtonsProps {
  /** Label rendered next to the A/confirm glyph. Defaults to "Confirm". */
  readonly confirmLabel?: string
  /** Label rendered next to the B/back glyph. Defaults to "Back". */
  readonly backLabel?: string
  /** Label rendered next to the Y/options glyph. Defaults to "Options". */
  readonly optionsLabel?: string
}

const PULSE_MS = 220

export function HudButtons({
  confirmLabel = "Confirm",
  backLabel = "Back",
  optionsLabel = "Options",
}: HudButtonsProps) {
  const [pulse, setPulse] = useState<Action | null>(null)
  const pulseTimerRef = useRef<number | null>(null)

  const trigger = useCallback((which: Action) => {
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current)
    }
    setPulse(which)
    pulseTimerRef.current = window.setTimeout(() => {
      setPulse(null)
      pulseTimerRef.current = null
    }, PULSE_MS)
  }, [])

  useInputAction("confirm", () => trigger("confirm"))
  useInputAction("back", () => trigger("back"))
  useInputAction("options", () => trigger("options"))

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="hud" aria-hidden>
      <Hint glyph="A" label={confirmLabel} active={pulse === "confirm"} />
      <Hint glyph="B" label={backLabel} active={pulse === "back"} />
      <Hint glyph="Y" label={optionsLabel} active={pulse === "options"} />
    </div>
  )
}

interface HintProps {
  readonly glyph: string
  readonly label: string
  readonly active: boolean
}

function Hint({ glyph, label, active }: HintProps) {
  return (
    <div className="hud-hint" data-active={active ? "" : undefined}>
      <span className="hud-glyph">{glyph}</span>
      <span className="hud-label">{label}</span>
    </div>
  )
}
