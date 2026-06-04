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
 *
 * Not in the contract:
 *   - Raw React state setters. Mutations are domain-level.
 *   - Loading / error transport state. The home is local-only today;
 *     when a server-backed Root replaces the in-memory one, the
 *     contract should grow a `status` field — not a transport bag.
 *   - Render decisions. The contract carries data, not booleans
 *     controlling which subtree renders.
 *
 * Stateful logic lives in `ShiftHomeRoot.tsx`, the only place that
 * calls `useState` and creates the Provider.
 */

import type { GameRecord } from "@platform/fixtures/games/game"
import { createContext, type RefObject, useContext } from "react"

export interface ShiftHomeContextValue {
  readonly items: ReadonlyArray<GameRecord>
  readonly resumeTarget: GameRecord
  readonly focused: GameRecord
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
