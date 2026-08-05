import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"
import { useEffect, useRef, useState } from "react"

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
  const [value, setValue] = useState(control.interaction.value)
  const unavailable = !control.enabled
  const id = `gameplay-control-${control.id}`
  const descriptionId = control.description ? `${id}-description` : undefined
  const reasonId = unavailable && control.disabledReason ? `${id}-reason` : undefined
  const describedBy = [descriptionId, reasonId].filter(Boolean).join(" ") || undefined
  useEffect(() => {
    valueRef.current = control.interaction.value
    setValue(control.interaction.value)
  }, [control])
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
      setValue(next)
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

  const copy = (
    <span className="shift-sheet-control-copy">
      <span className="shift-sheet-control-label">{control.label}</span>
      {control.description ? (
        <span id={descriptionId} className="shift-sheet-control-description">
          {control.description}
        </span>
      ) : null}
      {reasonId ? (
        <span id={reasonId} className="shift-sheet-control-description">
          {control.disabledReason}
        </span>
      ) : null}
    </span>
  )

  if (reasonId) {
    return (
      <div
        id={id}
        className="shift-sheet-control shift-sheet-range"
        role="slider"
        tabIndex={0}
        aria-label={control.label}
        aria-disabled="true"
        aria-describedby={describedBy}
        aria-valuemin={control.interaction.min}
        aria-valuemax={control.interaction.max}
        aria-valuenow={value}
        data-unavailable="true"
        data-tone={control.destructive ? "danger" : "default"}
      >
        {copy}
        <span className="shift-sheet-range-value" aria-hidden="true">
          {value}
        </span>
      </div>
    )
  }

  return (
    <label
      className="shift-sheet-control shift-sheet-range"
      data-unavailable={unavailable ? "true" : undefined}
      data-tone={control.destructive ? "danger" : "default"}
    >
      {copy}
      <span className="shift-sheet-range-value">{value}</span>
      <input
        id={id}
        ref={inputRef}
        className="shift-sheet-range-input"
        type="range"
        aria-label={control.label}
        aria-disabled={unavailable}
        aria-describedby={describedBy}
        disabled={unavailable}
        data-korri-horizontal-control="range"
        value={value}
        min={control.interaction.min}
        max={control.interaction.max}
        step={control.interaction.step}
        onChange={event => {
          if (unavailable) return
          valueRef.current = event.currentTarget.valueAsNumber
          setValue(event.currentTarget.valueAsNumber)
          onChange(event.currentTarget.valueAsNumber)
        }}
      />
    </label>
  )
}
