/**
 * Shift home — template context.
 *
 * The contract every Shift home child can read. Per the React skill,
 * the contract is small and intentionally domain-shaped: data
 * (`items`, `resumeTarget`, `focused`, `isResumeFocused`,
 * `captionAnchorX`, Labs state, UI scale), domain mutations
 * (`focusTile`, Labs open/close, scale changes), and one infrastructure
 * ref (`railRef`) that the rail organism attaches and the Root reads to
 * drive measurement / initial focus.
 */

import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { EntrySourceTag } from "@platform/library/entry-key"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { createContext, type RefObject, useContext } from "react"

export type ShiftHomeInputItem = (PlayableLibraryEntry | ResolvedGameRecord) & {
  readonly source?: EntrySourceTag
}
export type ShiftHomeItem = ShiftHomeInputItem

export interface ShiftHomeContextValue {
  readonly items: ReadonlyArray<ShiftHomeItem>
  readonly resumeTarget: ShiftHomeItem
  readonly focused: ShiftHomeItem
  readonly isResumeFocused: boolean
  readonly captionAnchorX: number
  readonly railRef: RefObject<HTMLDivElement | null>
  readonly isLabsOpen: boolean
  readonly isSystemPanelOpen: boolean
  readonly uiScale: number
  readonly focusTile: (id: string) => void
  readonly openLabs: () => void
  readonly closeLabs: () => void
  readonly openSystemPanel: () => void
  readonly closeSystemPanel: () => void
  readonly changeUiScale: (scale: number) => void
  readonly resetUiScale: () => void
}

export const ShiftHomeCtx = createContext<ShiftHomeContextValue | null>(null)

export function useShiftHome(): ShiftHomeContextValue {
  const ctx = useContext(ShiftHomeCtx)
  if (!ctx) {
    throw new Error("useShiftHome must be used inside a ShiftHomeRoot")
  }
  return ctx
}
