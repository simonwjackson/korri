/**
 * Shift atom — pill button.
 *
 * The base focusable button surface for header/footer chrome (search,
 * menu compositions). Native <button>; visual identity comes from the
 * `.shift-pill` class hook in shift.css. Consumers extend the visual
 * via `className` (for example, `shift-search-pill text-lg`).
 *
 * Atomic-design rules:
 *   - Stays a native HTML button so spatial-navigation focus reaches it
 *     without component-level adapters.
 *   - Defaults `type="button"` so a stray Enter inside a future <form>
 *     never submits.
 *   - Forwards every other button prop unchanged. Aria, click handlers,
 *     refs are the consumer's call.
 */

import { cn } from "@shared/primitives/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

export type ShiftPillProps = ComponentPropsWithoutRef<"button">

export function ShiftPill({
  className,
  type = "button",
  ...rest
}: ShiftPillProps) {
  return (
    <button {...rest} type={type} className={cn("shift-pill", className)} />
  )
}
