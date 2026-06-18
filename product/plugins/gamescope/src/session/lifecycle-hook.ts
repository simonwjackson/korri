import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { KorriSessiondLifecycleHook } from "@product/services/device/sessiond"
import {
  createProcessGamescopeControlBridge,
  type GamescopeControlBridgeProcessManager,
} from "../runtime-control"
import { createSystemGamescopeReaper, type GamescopeReaper } from "./reaper"

export interface GamescopeSessionLifecycleHookOptions {
  readonly reaper?: GamescopeReaper | false
  readonly controlBridge?: GamescopeControlBridgeProcessManager | false
  readonly env?: NodeJS.ProcessEnv
}

export function createGamescopeSessionLifecycleHook(
  options: GamescopeSessionLifecycleHookOptions = {},
): KorriSessiondLifecycleHook {
  const env = options.env ?? process.env
  const reaper =
    options.reaper === false
      ? undefined
      : (options.reaper ?? createSystemGamescopeReaper())
  const controlBridge = resolveGamescopeControlBridge(
    options.controlBridge,
    env,
  )

  return {
    id: "@korri:gamescope",
    failurePolicy: "fail-launch",
    afterChildRunning: controlBridge
      ? async ({ launchId }) => {
          const runtimeDir = join(
            gamescopeControlRuntimeRootFromEnv(env),
            launchId,
          )
          const socketPath = join(runtimeDir, "control.sock")
          await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
          const handle = await controlBridge.start({
            launchId,
            runtimeDir,
            socketPath,
            display: gamescopeControlDisplayFromEnv(env),
            xpropPath: gamescopeControlXpropPathFromEnv(env),
            xrandrPath: gamescopeControlXrandrPathFromEnv(env),
          })
          return {
            label: "gamescope-control-bridge",
            resource: handle.socketPath,
            stopBeforeCleanup: handle.stop,
          }
        }
      : undefined,
    cleanup: reaper
      ? async ({ processGroupId }) => {
          const outcome = await reaper({ pgid: processGroupId })
          return { cleaned: outcome.reaped, residual: outcome.residual }
        }
      : undefined,
  }
}

function resolveGamescopeControlBridge(
  configured: GamescopeSessionLifecycleHookOptions["controlBridge"],
  env: NodeJS.ProcessEnv,
): GamescopeControlBridgeProcessManager | undefined {
  if (configured === false) return undefined
  if (configured) return configured
  if (!gamescopeControlBridgeEnabledFromEnv(env)) return undefined
  return createProcessGamescopeControlBridge({
    command: gamescopeControlBridgeCommandFromEnv(env),
  })
}

function gamescopeControlBridgeEnabledFromEnv(env: NodeJS.ProcessEnv): boolean {
  const raw = env.KORRI_GAMESCOPE_CONTROL_BRIDGE?.trim()
  return raw === "1" || raw === "true" || raw === "enabled"
}

function gamescopeControlBridgeCommandFromEnv(env: NodeJS.ProcessEnv): string {
  return (
    env.KORRI_GAMESCOPE_CONTROL_BRIDGE_COMMAND ?? "gamescope-control-bridge"
  )
}

function gamescopeControlRuntimeRootFromEnv(env: NodeJS.ProcessEnv): string {
  return join(
    env.KORRI_GAMESCOPE_CONTROL_RUNTIME_ROOT ?? env.XDG_RUNTIME_DIR ?? "/tmp",
    "korri-gamescope-control",
  )
}

function gamescopeControlDisplayFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  return env.KORRI_GAMESCOPE_CONTROL_DISPLAY || env.DISPLAY
}

function gamescopeControlXpropPathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  return env.KORRI_GAMESCOPE_CONTROL_XPROP || undefined
}

function gamescopeControlXrandrPathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  return env.KORRI_GAMESCOPE_CONTROL_XRANDR || undefined
}
