/**
 * Shift sheet — shared context for the slide-out side sheet.
 *
 * The sheet is a surface-agnostic overlay primitive: a panel that slides in from
 * a screen edge, dims what's behind it, and dismisses on the semantic `back`
 * action, a scrim press, or its close control. It is *controlled* — the host
 * owns whether it is open and what it is about (a focused game, a settings
 * target, …) and passes that down. Every compound below the Root reads the
 * open state, side, accessible label, and the close command from here rather
 * than through drilled props, so hosts compose distinct sheet trees without a
 * boolean-prop forest.
 */
import { createContext, useContext } from "react"

export type ShiftSheetSide = "right" | "left"

export interface ShiftSheetContextValue {
  /** Whether the sheet is currently presented. */
  readonly open: boolean
  /** Screen edge the panel is anchored to and slides from. */
  readonly side: ShiftSheetSide
  /** Accessible name for the dialog (e.g. "Actions for Hollow Knight"). */
  readonly label: string
  /** Dismiss the sheet. The host decides what that means for its state. */
  readonly close: () => void
}

const ShiftSheetContext = createContext<ShiftSheetContextValue | null>(null)

export const ShiftSheetProvider = ShiftSheetContext.Provider

export function useShiftSheet(): ShiftSheetContextValue {
  const value = useContext(ShiftSheetContext)
  if (!value) {
    throw new Error("Shift sheet parts must be used inside a ShiftSheetRoot")
  }
  return value
}
