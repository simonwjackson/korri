import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import {
  probeSessiondManagedLaunchStatus,
  type SessiondManagedLaunchClientOptions,
  terminateSessiondManagedLaunch,
} from "@platform/library/sessiond-managed-launch-client"

export type FakeSuspendAction = "toggle" | "suspend" | "resume"

export interface FakeSuspendCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

export type FakeSuspendCommandRunner = (
  command: FakeSuspendCommand,
) => Promise<void>

export type FakeSuspendResult =
  | { readonly status: "requested" }
  | { readonly status: "applied" }
  | { readonly status: "degraded"; readonly reason: string }
  | { readonly status: "noop"; readonly reason: string }

export interface FakeSuspendControllerOptions {
  readonly runtimeDir?: string
  readonly requestDir?: string
  readonly resultDir?: string
  readonly debounceMs?: number
  readonly ackTimeoutMs?: number
  readonly now?: () => number
  readonly commandRunner?: FakeSuspendCommandRunner
  readonly sessiond?: SessiondManagedLaunchClientOptions
  readonly env?: NodeJS.ProcessEnv
}

export interface FakeSuspendController {
  readonly run: (action: FakeSuspendAction) => Promise<FakeSuspendResult>
}

const DEFAULT_DEBOUNCE_MS = 2_000
const DEFAULT_ACK_TIMEOUT_MS = 1_500
const ACTIVE_MARKER_TEXT = "suspended\n"

export function createFakeSuspendController(
  options: FakeSuspendControllerOptions = {},
): FakeSuspendController {
  const env = options.env ?? process.env
  const runtimeDir =
    options.runtimeDir ?? env.XDG_RUNTIME_DIR ?? "/run/user/2000"
  const requestDir =
    options.requestDir ??
    env.KORRI_FAKESUSPEND_REQUEST_DIR ??
    "/run/rocknix-power/requests"
  const resultDir =
    options.resultDir ??
    env.KORRI_FAKESUSPEND_RESULT_DIR ??
    "/run/rocknix-power/status"
  const stateDir = join(runtimeDir, "korri-fakesuspend")
  const activeMarker = join(stateDir, "active")
  const lidClosedMarker = join(stateDir, "lid-closed")
  const lastToggleMarker = join(stateDir, "last-toggle")
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS
  const now = options.now ?? Date.now
  const commandRunner = options.commandRunner ?? runCommand
  const sessiond = options.sessiond ?? { env }

  async function run(action: FakeSuspendAction): Promise<FakeSuspendResult> {
    switch (action) {
      case "suspend":
        await ensureStateDir()
        await writeAtomic(lidClosedMarker, "1\n")
        return await suspend()
      case "resume":
        await ensureStateDir()
        await rm(lidClosedMarker, { force: true })
        return await resume()
      case "toggle":
        await ensureStateDir()
        if ((await exists(activeMarker)) && (await exists(lidClosedMarker))) {
          return { status: "noop", reason: "lid-closed" }
        }
        if (await isDebounced()) return { status: "noop", reason: "debounced" }
        await writeAtomic(lastToggleMarker, String(now()))
        return (await exists(activeMarker)) ? await resume() : await suspend()
    }
  }

  async function suspend(): Promise<FakeSuspendResult> {
    if (!(await directoryExists(requestDir))) {
      return { status: "degraded", reason: "request-dir-missing" }
    }

    await writeAtomic(activeMarker, "entering\n")
    await coordinateActiveSession()
    await setSwayPower("off")
    await writeAtomic(activeMarker, ACTIVE_MARKER_TEXT)
    await writeFile(join(requestDir, "enter.request"), "")
    return await requestResult("enter")
  }

  async function resume(): Promise<FakeSuspendResult> {
    if (!(await exists(activeMarker)))
      return { status: "noop", reason: "not-suspended" }
    if (!(await directoryExists(requestDir))) {
      return { status: "degraded", reason: "request-dir-missing" }
    }

    await writeFile(join(requestDir, "exit.request"), "")
    const result = await requestResult("exit")
    await setSwayPower("on")
    await rm(activeMarker, { force: true })
    return result
  }

  async function coordinateActiveSession(): Promise<void> {
    const status = await probeSessiondManagedLaunchStatus(sessiond)
    if (status.kind !== "ok") return
    const active = status.status.active
    if (!active) return
    if (isStreamActive(active.launchMetadata)) {
      await terminateSessiondManagedLaunch(
        { launchId: active.launchId },
        sessiond,
      )
    }
  }

  async function setSwayPower(power: "off" | "on"): Promise<void> {
    const socket = await firstSwaySocket(runtimeDir)
    if (!socket) return
    await commandRunner({
      command: "swaymsg",
      args: ["output", "*", "power", power],
      env: { SWAYSOCK: socket },
    })
  }

  async function requestResult(
    action: "enter" | "exit",
  ): Promise<FakeSuspendResult> {
    const deadline = now() + ackTimeoutMs
    do {
      const ack = await readLastRequestAck()
      if (ack?.action === action && ack.status === "processed") {
        return ack.result === "ok"
          ? { status: "applied" }
          : { status: "degraded", reason: `substrate-${ack.result}` }
      }
      if (ackTimeoutMs <= 0) return { status: "requested" }
      await sleep(50)
    } while (now() < deadline)
    return { status: "degraded", reason: "substrate-unavailable" }
  }

  async function readLastRequestAck(): Promise<
    | {
        readonly action?: string
        readonly status?: string
        readonly result?: string
      }
    | undefined
  > {
    try {
      const text = await readFile(join(resultDir, "last-request"), "utf8")
      const fields: Record<string, string> = {}
      for (const line of text.split("\n")) {
        const index = line.indexOf("=")
        if (index <= 0) continue
        fields[line.slice(0, index)] = line.slice(index + 1)
      }
      return fields
    } catch {
      return undefined
    }
  }

  async function isDebounced(): Promise<boolean> {
    try {
      const previous = Number(await readFile(lastToggleMarker, "utf8"))
      return Number.isFinite(previous) && now() - previous < debounceMs
    } catch {
      return false
    }
  }

  async function ensureStateDir(): Promise<void> {
    await mkdir(stateDir, { recursive: true, mode: 0o700 })
    await chmod(stateDir, 0o700)
  }

  return { run }
}

function isStreamActive(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const annotations = (metadata as { annotations?: unknown }).annotations
  if (!annotations || typeof annotations !== "object") return false
  return Object.keys(annotations).some(key => key === "@korri:stream")
}

async function firstSwaySocket(
  runtimeDir: string,
): Promise<string | undefined> {
  try {
    const entries = await readdir(runtimeDir)
    const socket = entries.find(
      entry => entry.startsWith("sway-ipc.") && entry.endsWith(".sock"),
    )
    return socket ? join(runtimeDir, socket) : undefined
  } catch {
    return undefined
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, content)
  await rename(tmp, path)
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function runCommand(command: FakeSuspendCommand): Promise<void> {
  const child = Bun.spawn([command.command, ...command.args], {
    env: { ...process.env, ...(command.env ?? {}) },
    stdout: "ignore",
    stderr: "ignore",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`${command.command} exited ${exitCode}`)
}

async function main(argv: readonly string[]): Promise<number> {
  const action = (argv[2] ?? "toggle") as FakeSuspendAction
  if (!["toggle", "suspend", "resume"].includes(action)) {
    console.error(
      "korri-fakesuspend-toggle: usage: korri-fakesuspend-toggle [toggle|suspend|resume]",
    )
    return 64
  }
  const controller = createFakeSuspendController()
  const result = await controller.run(action)
  console.error(
    `korri-fakesuspend-toggle: ${result.status}${"reason" in result ? ` (${result.reason})` : ""}`,
  )
  return result.status === "degraded" ? 2 : 0
}

if (import.meta.main) {
  process.exit(await main(process.argv))
}
