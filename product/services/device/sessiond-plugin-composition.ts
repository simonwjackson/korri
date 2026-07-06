import { chmodSync, mkdirSync } from "node:fs"
import { isAbsolute, join, normalize } from "node:path"
import { createUnavailableSeatRuntime } from "@platform/input-seat/seat-runtime-port"
import { createUinputSeatBackend } from "@platform/input-seat/uinput-seat-backend"
import {
  createUinputSeatRuntime,
  type UinputSeatBackend,
} from "@platform/input-seat/uinput-seat-runtime"
import { firstPartySessionLifecycleHooksForRegistry } from "@product/plugin-host"
import { createFirstPartyPluginState } from "@product/plugin-host/state"
import type { KorriSessiondLifecycleHook } from "./sessiond"
import { createSessiondInputSeatPreSpawnGate } from "./sessiond-input-seat"
import type { KorriSessiondPreSpawnGate } from "./sessiond-pre-spawn"

export function sessionLifecycleHooksFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): readonly KorriSessiondLifecycleHook[] {
  const registry = createFirstPartyPluginState({
    env,
    mode: "runtime",
  }).registry
  return firstPartySessionLifecycleHooksForRegistry(registry, { env })
}

export interface SessiondPreSpawnGateCompositionOptions {
  readonly createSeatBackend?: () => UinputSeatBackend
}

export function sessiondPreSpawnGatesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: SessiondPreSpawnGateCompositionOptions = {},
): readonly KorriSessiondPreSpawnGate[] {
  const runtimeDir = env.KORRI_INPUT_SEAT_RUNTIME_DIR?.trim()
  if (!runtimeDir) {
    return [
      createSessiondInputSeatPreSpawnGate({
        runtime: createUnavailableSeatRuntime(),
      }),
    ]
  }

  const invalidRuntimeDir = inputSeatRuntimeDirError(runtimeDir)
  if (invalidRuntimeDir) {
    return [
      createSessiondInputSeatPreSpawnGate({
        runtime: createUnavailableSeatRuntime(invalidRuntimeDir),
      }),
    ]
  }

  try {
    mkdirSync(runtimeDir, { recursive: true, mode: 0o700 })
    chmodSync(runtimeDir, 0o700)
  } catch {
    return [
      createSessiondInputSeatPreSpawnGate({
        runtime: createUnavailableSeatRuntime(
          "input-seat runtime directory is not accessible",
        ),
      }),
    ]
  }

  const backend = createInputSeatBackendFromEnv(env, options)
  if (!backend) {
    return [
      createSessiondInputSeatPreSpawnGate({
        runtime: createUnavailableSeatRuntime(
          "input-seat uinput backend is not configured",
        ),
      }),
    ]
  }

  const socketPath = join(runtimeDir, "sunshine-input-seat.sock")
  const activeLaunchSidecarPath = join(
    runtimeDir,
    "sunshine-active-launch.json",
  )

  return [
    createSessiondInputSeatPreSpawnGate({
      runtime: createUinputSeatRuntime({ backend }),
      sunshineMirror: {
        socketPath,
        activeLaunchSidecarPath,
      },
    }),
  ]
}

const createInputSeatBackendFromEnv = (
  env: NodeJS.ProcessEnv,
  options: SessiondPreSpawnGateCompositionOptions,
): UinputSeatBackend | undefined => {
  const injected = options.createSeatBackend?.()
  if (injected) return injected

  const helperPath = env.KORRI_INPUT_SEAT_BACKEND_HELPER?.trim()
  if (!helperPath) return undefined

  try {
    return createUinputSeatBackend({ helperPath })
  } catch {
    return undefined
  }
}

const inputSeatRuntimeDirError = (runtimeDir: string): string | undefined => {
  if (!isAbsolute(runtimeDir)) {
    return "input-seat runtime directory must be absolute"
  }
  if (runtimeDir.includes("%")) {
    return "input-seat runtime directory must not contain systemd specifiers"
  }
  if (normalize(runtimeDir) !== runtimeDir) {
    return "input-seat runtime directory must be normalized"
  }
  return undefined
}
