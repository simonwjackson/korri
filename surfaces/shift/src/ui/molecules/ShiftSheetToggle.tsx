import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"

export interface ShiftSheetToggleProps {
  readonly control: SurfaceGameplayControl & {
    readonly interaction: { readonly kind: "toggle"; readonly value: boolean }
  }
  readonly onChange: (value: boolean) => void
}

/** A gameplay boolean rendered as one native, touchable switch row. */
export function ShiftSheetToggle({ control, onChange }: ShiftSheetToggleProps) {
  const unavailable = !control.enabled
  return (
    <button
      type="button"
      className="shift-sheet-control shift-sheet-toggle"
      role="switch"
      aria-label={control.label}
      aria-checked={control.interaction.value}
      aria-disabled={unavailable}
      title={control.disabledReason}
      data-tone={control.destructive ? "danger" : "default"}
      onClick={() => {
        if (!unavailable) onChange(!control.interaction.value)
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
          <span className="shift-sheet-control-description">
            {control.disabledReason}
          </span>
        ) : null}
      </span>
      <span className="shift-sheet-control-value" aria-hidden="true">
        {control.interaction.value ? "On" : "Off"}
      </span>
    </button>
  )
}
