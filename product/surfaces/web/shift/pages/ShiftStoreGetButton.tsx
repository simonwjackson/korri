/**
 * Shift store — the acquire affordance (atom).
 *
 * The one action every store entry carries. There is no purchase in the store,
 * so the verb is about ACQUISITION, not payment: an available entry shows
 * "Get", one being pulled down shows "Getting…" (inert), and an already
 * acquired entry shows "Play". The button is a native <button> so the platform
 * focus engine drives it like every other Shift control.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import type { ShiftStoreEntryStatus } from "./shift-store-entry"

export interface ShiftStoreGetButtonProps {
  readonly status: ShiftStoreEntryStatus
  readonly title: string
  /** Acquire the entry (Get) or launch it (Play). Inert while acquiring. */
  readonly onActivate?: () => void
}

const LABEL: Record<ShiftStoreEntryStatus, string> = {
  available: "Get",
  acquiring: "Getting…",
  ready: "Play",
}

export function ShiftStoreGetButton({
  status,
  title,
  onActivate,
}: ShiftStoreGetButtonProps) {
  const label = LABEL[status]
  return (
    <button
      type="button"
      className="shift-store-get"
      data-status={status}
      data-primary={status === "ready" ? true : undefined}
      aria-label={`${label} ${title}`}
      disabled={status === "acquiring"}
      onClick={() => status !== "acquiring" && onActivate?.()}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeGetButton)}
    >
      {label}
    </button>
  )
}
