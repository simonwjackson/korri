import type { GameplayOverlayConfig } from "@contracts/bridge/korri-native-bridge"
import type { OverlayController } from "./overlay-controller"
import type { NativeOverlayConnection } from "./overlay-native"

export interface NativeOverlayHost {
  dispose(): void
}

function authorityIdentity(config: GameplayOverlayConfig): string {
  return `${config.korridPort}:${config.korridCapability}:${config.launchId}`
}

/** Owns native config identity, controller replacement, and page lifetime. */
export function createNativeOverlayHost({
  connection,
  page,
  createController,
  mount,
  unmount,
}: {
  readonly connection: NativeOverlayConnection
  readonly page: Pick<Window, "addEventListener" | "removeEventListener">
  readonly createController: (config: GameplayOverlayConfig) => OverlayController
  readonly mount: (controller: OverlayController, identity: string) => void
  readonly unmount: () => void
}): NativeOverlayHost {
  let identity: string | undefined
  let controller: OverlayController | undefined
  let disposed = false

  const stopConnection = connection.start(config => {
    if (disposed) return
    const nextIdentity = authorityIdentity(config)
    if (identity === nextIdentity) return
    controller?.destroy()
    controller = createController(config)
    identity = nextIdentity
    mount(controller, nextIdentity)
  })

  const dispose = () => {
    if (disposed) return
    disposed = true
    page.removeEventListener("pagehide", dispose)
    stopConnection()
    controller?.destroy()
    controller = undefined
    unmount()
  }
  page.addEventListener("pagehide", dispose)

  return { dispose }
}
