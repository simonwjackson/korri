import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"
import { useEffect, useRef } from "react"

const DIRECTION_EVENT = "korri-semantic-direction"

interface SemanticDirectionDetail {
  readonly direction: "left" | "right"
  readonly repeat: boolean
}

export interface ShiftSheetRangeProps {
  readonly control: SurfaceGameplayControl & {
    readonly interaction: {
      readonly kind: "range"
      readonly value: number
      readonly min: number
      readonly max: number
      readonly step: number
    }
  }
  readonly onChange: (value: number) => void
}

/** A bounded native range. Semantic held directions advance one declared step. */
export function ShiftSheetRange({ control, onChange }: ShiftSheetRangeProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(control.interaction.value)
  const unavailable = !control.enabled
  useEffect(() => {
    valueRef.current = control.interaction.value
  }, [control.interaction.value])
  const adjust = (direction: "left" | "right") => {
    if (unavailable) return
    const { min, max, step } = control.interaction
    const current = valueRef.current
    const next = Math.min(
      max,
      Math.max(min, current + (direction === "left" ? -step : step)),
    )
    if (next !== current) {
      valueRef.current = next
      onChange(next)
    }
  }

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SemanticDirectionDetail>).detail
      adjust(detail.direction)
    }
    input.addEventListener(DIRECTION_EVENT, listener)
    return () => input.removeEventListener(DIRECTION_EVENT, listener)
  })

  return (
    <label
      className="shift-sheet-control shift-sheet-range"
      data-tone={control.destructive ? "danger" : "default"}
    >
      <span className="shift-sheet-control-copy">
        <span className="shift-sheet-control-label">{control.label}</span>
        {control.description ? (
          <span className="shift-sheet-control-description">
            {control.description}
          </span>
        ) : null}
        {control.disabledReason ? (
          <span className="shift-sheet-control-description">
            {control.disabledReason}
          </span>
        ) : null}
      </span>
      <span className="shift-sheet-range-value">{control.interaction.value}</span>
      <input
        ref={inputRef}
        className="shift-sheet-range-input"
        type="range"
        aria-label={control.label}
        aria-disabled={unavailable}
        disabled={unavailable && control.disabledReason === undefined}
        data-korri-horizontal-control="range"
        value={control.interaction.value}
        min={control.interaction.min}
        max={control.interaction.max}
        step={control.interaction.step}
        onChange={event => {
          if (!unavailable) onChange(event.currentTarget.valueAsNumber)
        }}
      />
    </label>
  )
}
