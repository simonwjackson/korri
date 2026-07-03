/**
 * Assembles the overlay hold-handler for inputd from the environment.
 *
 * Returns null when KORRI_OVERLAY_RENDERER_BIN is unset (no renderer available),
 * so inputd keeps its no-overlay behavior (only fired -> force-quit). When the
 * renderer is present, returns a handler that drives the full ring + decision
 * menu, using inputd's compositor wayland + system-bus environment for the
 * renderer child process and the busctl/gdbus intercept.
 */
import type { ChordHoldUpdate } from "@platform/input/native/chord-hold-supervisor"
import { createOverlayInterceptController } from "./overlay-intercept"
import { createLiveInterceptPort } from "./overlay-intercept-live"
import {
  createBunInterceptSubprocess,
  createBunRendererSpawner,
} from "./overlay-live-processes"
import type { OverlaySessionKind } from "./overlay-menu"
import { createOverlayOrchestrator } from "./overlay-orchestrator"
import { createOverlayRendererProcessClient } from "./overlay-renderer-client"

export function createOverlayHoldHandlerFromEnv(deps: {
  readonly env: Record<string, string | undefined>
  readonly forceQuit: () => void | Promise<void>
  readonly closeRemoteGame?: () => void | Promise<void>
  readonly sessionKind?: () => OverlaySessionKind
}): ((update: ChordHoldUpdate) => void) | null {
  const bin = deps.env.KORRI_OVERLAY_RENDERER_BIN
  if (!bin) return null

  const renderer = createOverlayRendererProcessClient(
    createBunRendererSpawner({ bin, env: deps.env }),
  )
  const intercept = createOverlayInterceptController(
    createLiveInterceptPort({
      subprocess: createBunInterceptSubprocess({ env: deps.env }),
      busctl: deps.env.KORRI_BUSCTL_BIN,
      gdbus: deps.env.KORRI_GDBUS_BIN,
    }),
  )
  const orchestrator = createOverlayOrchestrator({
    renderer,
    intercept,
    actions: {
      forceQuit: deps.forceQuit,
      closeRemoteGame: deps.closeRemoteGame ?? (() => {}),
    },
    sessionKind: deps.sessionKind ?? (() => "local"),
  })
  return update => orchestrator.onHoldUpdate(update)
}
