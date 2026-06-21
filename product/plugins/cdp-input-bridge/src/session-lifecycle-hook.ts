import { readFile } from "node:fs/promises"
import {
  type DiscoveredDevice,
  parseProcBusInputDevices,
} from "@platform/input/native/discover-devices"
import { resolveInputPlumberVirtualGamepad } from "@platform/input/native/inputplumber-virtual-gamepad"
import type { KorriSessionLifecycleHook } from "@platform/plugin/session-lifecycle"
import {
  type CdpInputBridgeProcessManager,
  createProcessCdpInputBridge,
} from "./bridge-process"
import {
  CDP_INPUT_BRIDGE_PLUGIN_ID,
  decodeCdpInputBridgePolicy,
  policyAnnotationFromMetadata,
} from "./policy"

export interface CdpInputBridgeSessionLifecycleHookOptions {
  readonly devices?: () => Promise<readonly DiscoveredDevice[]>
  readonly processManager?: CdpInputBridgeProcessManager | false
  readonly killPid?: (pid: number) => Promise<void> | void
  readonly env?: NodeJS.ProcessEnv
}

export function createCdpInputBridgeSessionLifecycleHook(
  options: CdpInputBridgeSessionLifecycleHookOptions = {},
): KorriSessionLifecycleHook {
  const env = options.env ?? process.env
  const processManager =
    options.processManager === false
      ? undefined
      : (options.processManager ??
        createProcessCdpInputBridge({ command: bridgeCommandFromEnv(env) }))
  const devices = options.devices ?? systemInputDevices
  const killPid = options.killPid ?? signalPid

  return {
    id: CDP_INPUT_BRIDGE_PLUGIN_ID,
    failurePolicy: "fail-launch",
    afterChildRunning: async ({ launchId, launchMetadata }) => {
      const policy = decodeCdpInputBridgePolicy(
        policyAnnotationFromMetadata(launchMetadata),
      )
      if (!processManager || !policy.enabled) return undefined

      const source = resolveInputPlumberVirtualGamepad(await devices(), {
        preferredNames: policy.sourcePreference?.names,
        preferredEventNodes: policy.sourcePreference?.eventNodes,
      })
      if (source.status === "missing") {
        throw new Error(
          `missing InputPlumber virtual controller (raw gamepads: ${source.rawGamepads})`,
        )
      }
      if (source.status === "ambiguous") {
        throw new Error(
          `ambiguous InputPlumber virtual controller: ${source.devices
            .map(device => `${device.name} ${device.eventNode}`)
            .join(", ")}`,
        )
      }

      let stoppingForCleanup = false
      const handle = await processManager.start({
        launchId,
        devicePath: source.path,
        cdpHost: policy.cdpHost,
        cdpPort: policy.cdpPort,
        mappingName: policy.mappingName,
        ...(policy.target ? { target: policy.target } : {}),
        ...(policy.watchPid ? { watchPid: policy.watchPid } : {}),
        attachTimeoutMs: policy.attachTimeoutMs,
        failClosed: policy.failClosed,
      })

      const watchedPid = policy.watchPid
      if (handle.exited && policy.failClosed && watchedPid !== undefined) {
        void handle.exited.then(async () => {
          if (!stoppingForCleanup) await killPid(watchedPid)
        })
      }

      return {
        label: "cdp-input-bridge",
        resource: source.path,
        stopBeforeCleanup: async () => {
          stoppingForCleanup = true
          await handle.stop()
        },
      }
    },
  }
}

async function systemInputDevices(): Promise<readonly DiscoveredDevice[]> {
  return parseProcBusInputDevices(
    await readFile("/proc/bus/input/devices", "utf8"),
  )
}

async function signalPid(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM")
  } catch {
    // The watched process already exited; cleanup is complete from the hook's perspective.
  }
}

function bridgeCommandFromEnv(env: NodeJS.ProcessEnv): string {
  return env.KORRI_CDP_INPUT_BRIDGE_COMMAND ?? "korri-cdp-input-bridge"
}
