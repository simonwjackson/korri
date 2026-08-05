import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"
import { useEffect, useRef } from "react"

const DIRECTION_EVENT = "korri-semantic-direction"

interface SemanticDirectionDetail {
  readonly direction: "left" | "right"
  readonly repeat: boolean
}

export interface ShiftSheetChoiceProps {
  readonly control: SurfaceGameplayControl & {
    readonly interaction: {
      readonly kind: "choice"
      readonly value: string
      readonly options: readonly { readonly value: string; readonly label: string }[]
    }
  }
  readonly onChange: (value: string) => void
}

/** A materialized finite choice. Held directions are deliberately ignored. */
export function ShiftSheetChoice({ control, onChange }: ShiftSheetChoiceProps) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const unavailable = !control.enabled
  const chooseAdjacent = (direction: "left" | "right", repeat: boolean) => {
    if (unavailable || repeat) return
    const current = control.interaction.options.findIndex(
      option => option.value === control.interaction.value,
    )
    if (current < 0) return
    const offset = direction === "left" ? -1 : 1
    const next = control.interaction.options[current + offset]
    if (next) onChange(next.value)
  }

  useEffect(() => {
    const select = selectRef.current
    if (!select) return
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SemanticDirectionDetail>).detail
      chooseAdjacent(detail.direction, detail.repeat)
    }
    select.addEventListener(DIRECTION_EVENT, listener)
    return () => select.removeEventListener(DIRECTION_EVENT, listener)
  })

  return (
    <label
      className="shift-sheet-control shift-sheet-choice"
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
      <select
        ref={selectRef}
        className="shift-sheet-choice-input"
        aria-label={control.label}
        aria-disabled={unavailable}
        disabled={unavailable && control.disabledReason === undefined}
        data-korri-horizontal-control="choice"
        value={control.interaction.value}
        onChange={event => {
          if (!unavailable) onChange(event.currentTarget.value)
        }}
      >
        {control.interaction.options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export const SHIFT_SEMANTIC_DIRECTION_EVENT = DIRECTION_EVENT
