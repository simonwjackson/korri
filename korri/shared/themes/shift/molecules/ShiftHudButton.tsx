/**
 * Shift molecule — input-bus-aware HUD chip.
 *
 * One subscription, one chip. Renders a single `.shift-hud-hint` row
 * inside its own `.shift-hud` wrapper so a cluster can compose two or
 * three of these alongside a static `ShiftHudChip`, matching the
 * Switch home convention `+ Options · X Close · A Continue`.
 *
 * Subscribes via `useInputAction(action)` so a press of the matching
 * semantic action — gamepad button, keyboard equivalent, future remote
 * — pulses the chip for ~220ms via `data-active`. The chip is
 * presentational (`aria-hidden`) and never receives spatial-nav focus;
 * it is feedback for an action handled elsewhere, not a target.
 *
 * This replaces the array-driven `HudButtons` from the prior Sunlit
 * exploration. The single-instance shape matches the React skill's
 * "no array forest" rule: layout (which actions appear, in what order)
 * is composition by the parent organism, not config inside one
 * component.
 */

import { useInputAction } from "@shared/navigation/use-input-action"
import { useCallback, useEffect, useRef, useState } from "react"
import { ShiftHudGlyph } from "../atoms/ShiftHudGlyph"

export type ShiftHudAction = "confirm" | "back" | "options"

export interface ShiftHudButtonProps {
  readonly action: ShiftHudAction
  readonly glyph: string
  readonly label: string
}

const PULSE_MS = 220

export function ShiftHudButton({ action, glyph, label }: ShiftHudButtonProps) {
  const [active, setActive] = useState(false)
  const timerRef = useRef<number | null>(null)

  const onAction = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    setActive(true)
    timerRef.current = window.setTimeout(() => {
      setActive(false)
      timerRef.current = null
    }, PULSE_MS)
  }, [])

  useInputAction(action, onAction)

  // Clear pending timer on unmount so the setState callback never fires
  // on a torn-down component.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <div className="shift-hud" aria-hidden>
      <div className="shift-hud-hint" data-active={active ? "" : undefined}>
        <ShiftHudGlyph>{glyph}</ShiftHudGlyph>
        <span className="shift-hud-label">{label}</span>
      </div>
    </div>
  )
}
