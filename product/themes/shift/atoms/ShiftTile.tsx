/**
 * Shift atom — tile button.
 *
 * The focusable cell that lives inside the home rail. Pure presentation:
 * the `.shift-tile` class hook in shift.css owns the visual identity
 * (rounded corners, sunken surface, lavender focus halo via ::after).
 *
 * Designed to receive `cellProps` from `TilegridCells`'s `renderCell`
 * callback. The grid contributes `style`, `tabIndex`, `aria-label`, and
 * `data-tile-id`; this atom forwards them all.
 *
 * Atomic-design rules:
 *   - Native <button> so spatial navigation reaches it.
 *   - Defaults `type="button"` to keep stray Enter from submitting.
 *   - The focus-ring contract lives in CSS (::after) per
 *     docs/solutions/ui-bugs/inset-outline-clipped-by-overflow-hidden-2026-05-01.md.
 *     Consumers must not re-implement focus styling with `outline`.
 */

import { cn } from "@platform/react/primitives/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

export type ShiftTileProps = ComponentPropsWithoutRef<"button">

export function ShiftTile({
  className,
  type = "button",
  ...rest
}: ShiftTileProps) {
  return (
    <button {...rest} type={type} className={cn("shift-tile", className)} />
  )
}
