import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"
import { useEffect, useState } from "react"

export interface ShiftSheetToggleProps {
  readonly control: SurfaceGameplayControl & {
    readonly interaction: { readonly kind: "toggle"; readonly value: boolean }
  }
  readonly onChange: (value: boolean) => void
}

/** A gameplay boolean rendered as one native, touchable switch row. */
export function ShiftSheetToggle({ control, onChange }: ShiftSheetToggleProps) {
  const unavailable = !control.enabled
  const [value, setValue] = useState(control.interaction.value)
  useEffect(() => setValue(control.interaction.value), [control.interaction.value])
  const id = `gameplay-control-${control.id}`
  const reasonId = control.disabledReason ? `${id}-reason` : undefined
  return (
    <button
      id={id}
      type="button"
      className="shift-sheet-control shift-sheet-toggle"
      role="switch"
      aria-label={control.label}
      aria-checked={value}
      aria-disabled={unavailable}
      aria-describedby={reasonId}
      disabled={unavailable && control.disabledReason === undefined}
      data-tone={control.destructive ? "danger" : "default"}
      onClick={() => {
        if (unavailable) return
        const next = !value
        setValue(next)
        onChange(next)
      }}
    >
      <span className="shift-sheet-control-copy">
        <span className="shift-sheet-control-label">{control.label}</span>
        {control.description ? (
          <span className="shift-sheet-control-description">
            {control.description}
          </span>
        ) : null}
        {control.disabledReason ? (
          <span id={reasonId} className="shift-sheet-control-description">
            {control.disabledReason}
          </span>
        ) : null}
      </span>
      <span className="shift-sheet-control-value" aria-hidden="true">
        {value ? "On" : "Off"}
      </span>
    </button>
  )
}
