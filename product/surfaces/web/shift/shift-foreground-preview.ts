/**
 * Design-tool seam: preview the Shift foreground-session gate without changing
 * the real bridge/sessiond lifecycle. Mirrors the catalog/launch preview
 * singletons: inert in production because only the lab sets it.
 */

import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import { Effect, Layer } from "effect"
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

/**
 * Shift's foreground gate states as real `ForegroundSessionStatusSource` layers
 * — the data set on the real edge (`foregroundSessionStatusLayerAtom`) to drive
 * the gate through each state with the production mechanism, no preview side
 * channel. The status source returns the gate state directly, so each layer just
 * yields its sample. Same samples as the gate dial, so they can't drift.
 */
function foregroundSourceLayer(
  state: ForegroundSessionGateState,
): Layer.Layer<ForegroundSessionStatusSource> {
  return Layer.succeed(ForegroundSessionStatusSource)({
    get: () => Effect.succeed(state),
  })
}

export const shiftForegroundSourceLayers = Object.fromEntries(
  FOREGROUND_SESSION_GATE_STATE_TAGS.map(tag => [
    tag,
    () => foregroundSourceLayer(foregroundStateSamples[tag]()),
  ]),
) as {
  readonly [Tag in ForegroundSessionGateState["_tag"]]: () => Layer.Layer<ForegroundSessionStatusSource>
}
