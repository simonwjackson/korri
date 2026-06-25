import type { EntrySource } from "@platform/api/rpc/entry-source"
import type { InputListener } from "@platform/input/types"
import type { LaunchAlternative } from "@platform/library/launch-alternative"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"

export interface KorriLibraryLaunchInput {
  readonly id: string
  readonly source?: EntrySource
  readonly launchAlternatives?: readonly LaunchAlternative[]
}

export interface KorriPlatformBridge {
  readonly library: {
    readonly list: () => Promise<readonly unknown[]>
    readonly launch: (input: KorriLibraryLaunchInput) => Promise<void>
  }
  readonly input: {
    readonly subscribe: (listener: InputListener) => () => void
  }
  readonly foregroundSession: {
    readonly get: () => Promise<ForegroundSessionGateState>
  }
  readonly api: {
    readonly rpc: (method: string, payload: unknown) => Promise<unknown>
  }
}

export interface KorriSurfaceMountContext {
  readonly bridge: KorriPlatformBridge
}

export interface KorriSurfaceEntrypoint {
  readonly id: string
  mount(
    host: HTMLElement,
    context: KorriSurfaceMountContext,
  ): undefined | (() => void)
}

export function installKorriPlatformBridge(
  targetWindow: Window,
  bridge: KorriPlatformBridge,
): () => void {
  const previous = targetWindow.korri
  targetWindow.korri = bridge
  return () => {
    targetWindow.korri = previous
  }
}

declare global {
  interface Window {
    korri?: KorriPlatformBridge
  }
}
