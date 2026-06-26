/**
 * Design-tool seam: preview the Shift foreground-session gate without changing
 * the real bridge/sessiond lifecycle. Mirrors the catalog/launch preview
 * singletons: inert in production because only the lab sets it.
 */

import {
  type StateVariant,
  stateVariants,
} from "@platform/state/state-variants"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { useSyncExternalStore } from "react"

let preview: ForegroundSessionGateState | null = null
const subscribers = new Set<() => void>()

function emit(): void {
  for (const notify of subscribers) notify()
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

export function setShiftForegroundPreview(
  next: ForegroundSessionGateState | null,
): void {
  preview = next
  emit()
}

/** Non-reactive read of the current foreground pin (null when live). Used by
 * design tools to capture the current coordinate; product code consults the hook. */
export function getShiftForegroundPreview(): ForegroundSessionGateState | null {
  return preview
}

export function useShiftForegroundPreview(): ForegroundSessionGateState | null {
  return useSyncExternalStore(
    subscribe,
    () => preview,
    () => null,
  )
}

const PREVIEW_GAME = "preview"
const PREVIEW_REQUEST = "preview-request"

/** One representative ForegroundSessionGateState per case — exhaustive by type. */
export const foregroundStateSamples: {
  readonly [Tag in ForegroundSessionGateState["_tag"]]: () => ForegroundSessionGateState
} = {
  Ready: () => ({ _tag: "Ready" }),
  Preparing: () => ({
    _tag: "Preparing",
    state: "Preparing",
    requestId: PREVIEW_REQUEST,
    gameId: PREVIEW_GAME,
  }),
  Running: () => ({
    _tag: "Running",
    requestId: PREVIEW_REQUEST,
    gameId: PREVIEW_GAME,
  }),
  Cooling: () => ({
    _tag: "Cooling",
    state: "VerifyingReady",
    requestId: PREVIEW_REQUEST,
    gameId: PREVIEW_GAME,
  }),
  Recovering: () => ({
    _tag: "Recovering",
    state: "Recovering",
    requestId: PREVIEW_REQUEST,
    gameId: PREVIEW_GAME,
    stage: "preview",
    message: "Recovering foreground session",
  }),
  Unknown: () => ({ _tag: "Unknown", state: "preview" }),
  LoadError: () => ({ _tag: "LoadError", message: "Unable to read sessiond" }),
}

export const FOREGROUND_SESSION_GATE_STATE_TAGS = Object.keys(
  foregroundStateSamples,
) as readonly ForegroundSessionGateState["_tag"][]

/** Every foreground gate state as a labeled variant — the shared list views render. */
export const FOREGROUND_SESSION_GATE_STATE_VARIANTS: readonly StateVariant<
  ForegroundSessionGateState["_tag"],
  ForegroundSessionGateState
>[] = stateVariants<
  ForegroundSessionGateState["_tag"],
  ForegroundSessionGateState
>({ tags: FOREGROUND_SESSION_GATE_STATE_TAGS }, foregroundStateSamples)

/** The tag the knob treats as "no override — let the live gate drive". */
export const FOREGROUND_LIVE_TAG: ForegroundSessionGateState["_tag"] = "Ready"
