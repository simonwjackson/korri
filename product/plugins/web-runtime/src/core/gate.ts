// Start/focus-gate decision logic.
//
// Web engines guard the start of play differently. The runtime distinguishes:
//   - none           : the engine self-starts; nothing to do.
//   - synthetic       : synthetic DOM events are enough (e.g. Construct load flow).
//   - trusted-click   : the engine gates on browser User Activation (e.g. the
//                       GameMaker focus gate). Synthetic events are isTrusted=false
//                       and do NOT grant activation, so a real OS/CDP gesture is
//                       required. Delivery of that gesture is a runtime seam; this
//                       module only decides WHEN it is needed.

export type GateStrategy = "none" | "synthetic" | "trusted-click"

export interface GateState {
  readonly hasCanvas: boolean
  /** navigator.userActivation.hasBeenActive, or null when unobservable */
  readonly userActivationHasBeen: boolean | null
}

export type GateAction =
  | { readonly kind: "wait" }
  | { readonly kind: "done" }
  | { readonly kind: "synthetic-events" }
  | { readonly kind: "trusted-gesture" }

export function nextGateAction(
  strategy: GateStrategy,
  state: GateState,
): GateAction {
  if (!state.hasCanvas) return { kind: "wait" }
  switch (strategy) {
    case "none":
      return { kind: "done" }
    case "synthetic":
      return { kind: "synthetic-events" }
    case "trusted-click":
      return state.userActivationHasBeen === true
        ? { kind: "done" }
        : { kind: "trusted-gesture" }
  }
}
