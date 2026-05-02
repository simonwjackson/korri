/**
 * Shared HUD button hints for the home-screen explorations.
 *
 * Renders semantic action hints — confirm / back / options — using gamepad
 * button glyphs. Subscribes to the device-agnostic input bus via
 * `useInputAction` so a button press lights the matching glyph regardless
 * of input device (gamepad button, keyboard key, future remote).
 *
 * Two extension points keep the component reusable across explorations
 * without forking it:
 *
 *   - `actions` selects which chips render and in which order. Defaults to
 *     all three in canonical order, so legacy callers (Hero, Mosaic) stay
 *     byte-identical. Sunlit instantiates the component twice with
 *     different `actions` so a story-local static chip can sit between
 *     them, matching the Switch home's `+ Options · Ⓧ Close · A Continue`
 *     layout.
 *   - `confirmGlyph` / `backGlyph` / `optionsGlyph` swap the rendered
 *     character. Defaults are A/B/Y so existing variants are unchanged;
 *     Sunlit passes `+` for options to match the Switch start button.
 *
 * Subscriptions to the input bus are unconditional (React forbids
 * conditional hooks). The pulse handler gates on `actions.includes(...)`,
 * so a chip omitted from `actions` never receives `data-active` even if
 * the input bus emits its action. This matches user intuition: the chip
 * isn't shown, so it shouldn't react.
 *
 * The HUD itself ships with no visual styling. Each exploration scopes its
 * own CSS via the `[data-exploration="..."]` attribute on the screen root,
 * targeting the class names below. That keeps variants visually distinct
 * while the HUD's structure and behavior stay shared.
 *
 * Class hooks consumers may style:
 *   .hud
 *   .hud-hint        (one per rendered action)
 *   .hud-hint[data-active]   (briefly, on press)
 *   .hud-glyph       (the A/B/Y/+ circle)
 *   .hud-label       (the action's label text)
 *
 * The HUD is presentational only — it is `aria-hidden` and contains no
 * focusable elements, so it never competes with the grid/rail for spatial
 * navigation focus.
 */

import { useInputAction } from "@shared/navigation/use-input-action"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Action = "confirm" | "back" | "options"

const DEFAULT_ACTIONS: readonly Action[] = ["confirm", "back", "options"]

export interface HudButtonsProps {
  /**
   * Which action chips to render, and in what order. Default renders all
   * three in canonical order (`confirm`, `back`, `options`), which matches
   * the legacy A/B/Y layout used by Hero and Mosaic.
   */
  readonly actions?: readonly Action[]
  /** Label rendered next to the confirm glyph. Defaults to "Confirm". */
  readonly confirmLabel?: string
  /** Label rendered next to the back glyph. Defaults to "Back". */
  readonly backLabel?: string
  /** Label rendered next to the options glyph. Defaults to "Options". */
  readonly optionsLabel?: string
  /** Character rendered inside the confirm chip. Defaults to "A". */
  readonly confirmGlyph?: string
  /** Character rendered inside the back chip. Defaults to "B". */
  readonly backGlyph?: string
  /** Character rendered inside the options chip. Defaults to "Y". */
  readonly optionsGlyph?: string
}

const PULSE_MS = 220

export function HudButtons({
  actions = DEFAULT_ACTIONS,
  confirmLabel = "Confirm",
  backLabel = "Back",
  optionsLabel = "Options",
  confirmGlyph = "A",
  backGlyph = "B",
  optionsGlyph = "Y",
}: HudButtonsProps) {
  const [pulse, setPulse] = useState<Action | null>(null)
  const pulseTimerRef = useRef<number | null>(null)

  // Stable membership check, recomputed only when `actions` changes
  // identity. Used inside each subscription callback to suppress pulses
  // for chips the consumer didn't render.
  const includes = useMemo(() => {
    const set = new Set(actions)
    return (a: Action) => set.has(a)
  }, [actions])

  const trigger = useCallback(
    (which: Action) => {
      if (!includes(which)) return
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current)
      }
      setPulse(which)
      pulseTimerRef.current = window.setTimeout(() => {
        setPulse(null)
        pulseTimerRef.current = null
      }, PULSE_MS)
    },
    [includes],
  )

  // Subscriptions are unconditional (React forbids conditional hooks).
  // `trigger` itself gates by `includes(...)`, so omitted actions never
  // produce a visible pulse.
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
      {actions.map(action => {
        const { glyph, label } = describe(action, {
          confirmGlyph,
          backGlyph,
          optionsGlyph,
          confirmLabel,
          backLabel,
          optionsLabel,
        })
        return (
          <Hint
            key={action}
            glyph={glyph}
            label={label}
            active={pulse === action}
          />
        )
      })}
    </div>
  )
}

interface DescribeArgs {
  readonly confirmGlyph: string
  readonly backGlyph: string
  readonly optionsGlyph: string
  readonly confirmLabel: string
  readonly backLabel: string
  readonly optionsLabel: string
}

function describe(
  action: Action,
  {
    confirmGlyph,
    backGlyph,
    optionsGlyph,
    confirmLabel,
    backLabel,
    optionsLabel,
  }: DescribeArgs,
): { glyph: string; label: string } {
  switch (action) {
    case "confirm":
      return { glyph: confirmGlyph, label: confirmLabel }
    case "back":
      return { glyph: backGlyph, label: backLabel }
    case "options":
      return { glyph: optionsGlyph, label: optionsLabel }
  }
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
