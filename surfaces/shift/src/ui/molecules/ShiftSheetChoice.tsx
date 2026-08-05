import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"
import { useEffect, useRef, useState } from "react"

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
  const [value, setValue] = useState(control.interaction.value)
  useEffect(() => setValue(control.interaction.value), [control])
  const id = `gameplay-control-${control.id}`
  const descriptionId = control.description ? `${id}-description` : undefined
  const reasonId = unavailable && control.disabledReason ? `${id}-reason` : undefined
  const describedBy = [descriptionId, reasonId].filter(Boolean).join(" ") || undefined
  const selectedLabel = control.interaction.options.find(
    option => option.value === value,
  )?.label
  const chooseAdjacent = (direction: "left" | "right", repeat: boolean) => {
    if (unavailable || repeat) return
    const current = control.interaction.options.findIndex(
      option => option.value === value,
    )
    if (current < 0) return
    const offset = direction === "left" ? -1 : 1
    const next = control.interaction.options[current + offset]
    if (next) {
      setValue(next.value)
      onChange(next.value)
    }
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
        className="shift-sheet-control shift-sheet-choice"
        role="combobox"
        tabIndex={0}
        aria-label={control.label}
        aria-expanded="false"
        aria-disabled="true"
        aria-describedby={describedBy}
        data-unavailable="true"
        data-tone={control.destructive ? "danger" : "default"}
      >
        {copy}
        <span className="shift-sheet-control-value" aria-hidden="true">
          {selectedLabel}
        </span>
      </div>
    )
  }

  return (
    <label
      className="shift-sheet-control shift-sheet-choice"
      data-unavailable={unavailable ? "true" : undefined}
      data-tone={control.destructive ? "danger" : "default"}
    >
      {copy}
      <select
        id={id}
        ref={selectRef}
        className="shift-sheet-choice-input"
        aria-label={control.label}
        aria-disabled={unavailable}
        aria-describedby={describedBy}
        disabled={unavailable}
        data-korri-horizontal-control="choice"
        value={value}
        onChange={event => {
          if (unavailable) return
          setValue(event.currentTarget.value)
          onChange(event.currentTarget.value)
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
