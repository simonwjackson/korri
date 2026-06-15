import { readdir, readFile } from "node:fs/promises"
import { logger as defaultLogger } from "@platform/logger"
import {
  probeSessiondManagedLaunchStatus,
  terminateSessiondManagedLaunch,
  type SessiondManagedLaunchClientOptions,
} from "@platform/library/sessiond-managed-launch-client"
import { buildBottomKeyboardCommand } from "./bottom-keyboard"
import { buildSwayShortcutCommand } from "./sway-actions"
import {
  collectSteamForegroundProcesses,
  formatSteamForegroundProcessForLog,
} from "./steam-foreground-processes"

export const KORRI_INPUTD_ACTION_IDS = [
  "system-panel",
  "kill-current-game",
  "volume-up",
  "volume-down",
  "brightness-up",
  "brightness-down",
  "power-suspend",
  "lid-closed",
  "lid-opened",
  "screen-switch",
  "toggle-bottom-screen",
  "toggle-top-screen",
  "workspace-prev",
  "workspace-next",
  "move-output-up",
  "move-output-down",
  "toggle-bottom-keyboard",
] as const

export type KorriInputdActionId = (typeof KORRI_INPUTD_ACTION_IDS)[number]

export interface InputdActionCommand {
  readonly command: string
  readonly args: readonly string[]
}

export type InputdActionRunner = (command: InputdActionCommand) => Promise<void>

export interface InputdActionLogger {
  debug: (input: unknown, message?: string) => void
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface InputdActionCommands {
  readonly systemPanel?: InputdActionCommand
  readonly killCurrentGame?: InputdActionCommand
  readonly volumeUp?: InputdActionCommand
  readonly volumeDown?: InputdActionCommand
  readonly brightnessUp?: InputdActionCommand
  readonly brightnessDown?: InputdActionCommand
  readonly powerSuspend?: InputdActionCommand
  readonly lidClosed?: InputdActionCommand
  readonly lidOpened?: InputdActionCommand
  readonly screenSwitch?: InputdActionCommand
  readonly toggleBottomScreen?: InputdActionCommand
  readonly toggleTopScreen?: InputdActionCommand
  readonly workspacePrev?: InputdActionCommand
  readonly workspaceNext?: InputdActionCommand
  readonly moveOutputUp?: InputdActionCommand
  readonly moveOutputDown?: InputdActionCommand
  readonly toggleBottomKeyboard?: InputdActionCommand
}

export interface InputdActionContext {
  readonly killFilePath?: string
}

export interface InputdActionDispatcher {
  readonly dispatch: (
    actionId: KorriInputdActionId,
    context?: InputdActionContext,
  ) => Promise<void>
}

export interface InputdProcessInfo {
  readonly pid: number
  readonly uid?: number
  readonly cmdline: readonly string[]
}

export type InputdProcessScanner = () => Promise<readonly InputdProcessInfo[]>
export type InputdProcessSignaler = (
  pid: number,
  signal: NodeJS.Signals,
) => void

export interface InputdActionDispatcherOptions {
  readonly runner?: InputdActionRunner
  readonly logger?: InputdActionLogger
  readonly commands?: InputdActionCommands
  readonly defaultKillFilePath?: string
  readonly sessiond?: SessiondManagedLaunchClientOptions
  readonly processScanner?: InputdProcessScanner
  readonly signalProcess?: InputdProcessSignaler
  readonly staleSteamKillGraceMs?: number
}

const FALLBACK_KILL_FILE_PATH = "/tmp/.process-kill-data"
const DEFAULT_STALE_STEAM_KILL_GRACE_MS = 1500

export function defaultKillFilePathFromEnv(env: NodeJS.ProcessEnv): string {
  return env.KORRI_INPUTD_KILL_FILE_PATH ?? FALLBACK_KILL_FILE_PATH
}

export function createInputdActionDispatcher(
  options: InputdActionDispatcherOptions = {},
): InputdActionDispatcher {
  const runner = options.runner ?? runCommand
  const logger = options.logger ?? defaultLogger
  const commands = { ...defaultCommands(), ...options.commands }
  const defaultKillFilePath =
    options.defaultKillFilePath ?? defaultKillFilePathFromEnv(process.env)
  const sessiond = options.sessiond ?? { env: process.env }
  const processScanner = options.processScanner ?? scanCurrentUserProcesses
  const signalProcess = options.signalProcess ?? signalProcessByPid
  const staleSteamKillGraceMs =
    options.staleSteamKillGraceMs ?? DEFAULT_STALE_STEAM_KILL_GRACE_MS

  async function runNamedCommand(
    actionId: KorriInputdActionId,
    command: InputdActionCommand | undefined,
  ) {
    if (!command) {
      logger.warn({ actionId }, "inputd action has no configured command")
      return
    }

    try {
      await runner(command)
    } catch (error) {
      logger.warn({ err: error, actionId, command }, "inputd action failed")
    }
  }

  return {
    async dispatch(actionId, context = {}) {
      switch (actionId) {
        case "system-panel":
          await runNamedCommand(actionId, commands.systemPanel)
          return
        case "kill-current-game":
          if (commands.killCurrentGame) {
            await runNamedCommand(actionId, commands.killCurrentGame)
            return
          }
          if (
            await dispatchSessiondTerminateActive({
              logger,
              processScanner,
              sessiond,
              signalProcess,
              staleSteamKillGraceMs,
            })
          )
            return
          await dispatchKillCurrentGame({
            killFilePath: context.killFilePath ?? defaultKillFilePath,
            logger,
            runner,
          })
          return
        case "volume-up":
          await runNamedCommand(actionId, commands.volumeUp)
          return
        case "volume-down":
          await runNamedCommand(actionId, commands.volumeDown)
          return
        case "brightness-up":
          await runNamedCommand(actionId, commands.brightnessUp)
          return
        case "brightness-down":
          await runNamedCommand(actionId, commands.brightnessDown)
          return
        case "power-suspend":
          await runNamedCommand(actionId, commands.powerSuspend)
          return
        case "lid-closed":
          await runNamedCommand(actionId, commands.lidClosed)
          return
        case "lid-opened":
          await runNamedCommand(actionId, commands.lidOpened)
          return
        case "screen-switch":
          await runNamedCommand(actionId, commands.screenSwitch)
          return
        case "toggle-bottom-screen":
          await runNamedCommand(actionId, commands.toggleBottomScreen)
          return
        case "toggle-top-screen":
          await runNamedCommand(actionId, commands.toggleTopScreen)
          return
        case "workspace-prev":
          await runNamedCommand(actionId, commands.workspacePrev)
          return
        case "workspace-next":
          await runNamedCommand(actionId, commands.workspaceNext)
          return
        case "move-output-up":
          await runNamedCommand(actionId, commands.moveOutputUp)
          return
        case "move-output-down":
          await runNamedCommand(actionId, commands.moveOutputDown)
          return
        case "toggle-bottom-keyboard":
          await runNamedCommand(actionId, commands.toggleBottomKeyboard)
          return
      }
    },
  }
}

async function dispatchSessiondTerminateActive(options: {
  readonly logger: InputdActionLogger
  readonly processScanner: InputdProcessScanner
  readonly sessiond: SessiondManagedLaunchClientOptions
  readonly signalProcess: InputdProcessSignaler
  readonly staleSteamKillGraceMs: number
}): Promise<boolean> {
  const status = await probeSessiondManagedLaunchStatus(options.sessiond)
  if (status.kind === "not-configured") return false
  if (status.kind !== "ok") {
    options.logger.warn(
      { status },
      "inputd kill-current-game failed; sessiond status unavailable",
    )
    return true
  }

  const active = status.status.active
  if (!active) {
    options.logger.warn(
      { mode: status.status.mode },
      "inputd kill-current-game found no active sessiond launch; checking stale Steam foreground processes",
    )
    return await dispatchStaleSteamForegroundKill({
      logger: options.logger,
      processScanner: options.processScanner,
      signalProcess: options.signalProcess,
      graceMs: options.staleSteamKillGraceMs,
    })
  }

  const terminated = await terminateSessiondManagedLaunch(
    { launchId: active.launchId },
    options.sessiond,
  )
  if (terminated.kind !== "ok") {
    options.logger.warn(
      { status: terminated, launchId: active.launchId },
      "inputd kill-current-game failed; sessiond terminate rejected",
    )
    return true
  }

  options.logger.info(
    { launchId: active.launchId, response: terminated.response },
    "inputd terminated active sessiond launch",
  )
  return true
}

async function dispatchStaleSteamForegroundKill(options: {
  readonly logger: InputdActionLogger
  readonly processScanner: InputdProcessScanner
  readonly signalProcess: InputdProcessSignaler
  readonly graceMs: number
}): Promise<boolean> {
  const targets = collectSteamForegroundProcesses(await options.processScanner())
  if (targets.length === 0) return false

  const targetPids = new Set(targets.map(process => process.pid))
  options.logger.info(
    { targets: targets.map(process => formatSteamForegroundProcessForLog(process)) },
    "inputd killing stale Steam foreground processes",
  )

  for (const process of targets) {
    signalProcessSafely(options.signalProcess, process.pid, "SIGTERM")
  }

  if (options.graceMs > 0) {
    await new Promise(resolve => setTimeout(resolve, options.graceMs))
  }

  const residual = collectSteamForegroundProcesses(
    await options.processScanner(),
  ).filter(process => targetPids.has(process.pid))
  for (const process of residual) {
    signalProcessSafely(options.signalProcess, process.pid, "SIGKILL")
  }

  if (residual.length > 0) {
    options.logger.warn(
      { residual: residual.map(process => formatSteamForegroundProcessForLog(process)) },
      "inputd escalated stale Steam foreground kill",
    )
  }

  return true
}

function signalProcessSafely(
  signalProcess: InputdProcessSignaler,
  pid: number,
  signal: NodeJS.Signals,
): void {
  try {
    signalProcess(pid, signal)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") return
    throw error
  }
}

async function scanCurrentUserProcesses(): Promise<
  readonly InputdProcessInfo[]
> {
  let entries: readonly import("node:fs").Dirent[]
  try {
    entries = await readdir("/proc", { withFileTypes: true })
  } catch {
    return []
  }

  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : undefined
  const processes: InputdProcessInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
    const pid = Number(entry.name)
    const [uid, cmdline] = await Promise.all([
      readProcUid(pid),
      readProcCmdline(pid),
    ])
    if (cmdline.length === 0) continue
    if (currentUid !== undefined && uid !== undefined && uid !== currentUid) {
      continue
    }
    processes.push({ pid, ...(uid !== undefined ? { uid } : {}), cmdline })
  }
  return processes
}

async function readProcUid(pid: number): Promise<number | undefined> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8")
    const uidLine = status.split("\n").find(line => line.startsWith("Uid:"))
    const realUid = uidLine?.trim().split(/\s+/)[1]
    return realUid ? Number(realUid) : undefined
  } catch {
    return undefined
  }
}

async function readProcCmdline(pid: number): Promise<readonly string[]> {
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`, "utf8")
    return raw.split("\0").filter(Boolean)
  } catch {
    return []
  }
}

function signalProcessByPid(pid: number, signal: NodeJS.Signals): void {
  process.kill(pid, signal)
}

async function dispatchKillCurrentGame(options: {
  readonly killFilePath: string
  readonly logger: InputdActionLogger
  readonly runner: InputdActionRunner
}) {
  let raw: string
  try {
    raw = await readFile(options.killFilePath, "utf8")
  } catch (error) {
    options.logger.warn(
      { err: error, killFilePath: options.killFilePath },
      "inputd kill-current-game skipped; kill file missing",
    )
    return
  }

  const targets = raw.trim().split(/\s+/).filter(Boolean)
  if (targets.length === 0) {
    options.logger.warn(
      { killFilePath: options.killFilePath },
      "inputd kill-current-game skipped; kill file empty",
    )
    return
  }

  try {
    options.logger.info({ targets }, "inputd killing current game")
    await options.runner({ command: "killall", args: targets })
  } catch (error) {
    options.logger.warn(
      { err: error, targets },
      "inputd kill-current-game failed",
    )
  }
}

function defaultCommands(): InputdActionCommands {
  const bottomKeyboardCommand = buildBottomKeyboardCommand({
    configuredCommand: process.env.KORRI_INPUTD_BOTTOM_KEYBOARD,
    configuredOutput: process.env.KORRI_INPUTD_BOTTOM_KEYBOARD_OUTPUT,
  })

  return {
    systemPanel: commandFromEnv("KORRI_INPUTD_SYSTEM_PANEL", "swaymsg", [
      "exec",
      "korri-desktop-device",
    ]),
    killCurrentGame: commandFromEnvOptional("KORRI_INPUTD_KILL_CURRENT_GAME"),
    volumeUp: commandFromEnv("KORRI_INPUTD_VOLUME_UP", "pactl", [
      "set-sink-volume",
      "@DEFAULT_SINK@",
      "+5%",
    ]),
    volumeDown: commandFromEnv("KORRI_INPUTD_VOLUME_DOWN", "pactl", [
      "set-sink-volume",
      "@DEFAULT_SINK@",
      "-5%",
    ]),
    brightnessUp: commandFromEnv(
      "KORRI_INPUTD_BRIGHTNESS_UP",
      "brightnessctl",
      ["set", "+5%"],
    ),
    brightnessDown: commandFromEnv(
      "KORRI_INPUTD_BRIGHTNESS_DOWN",
      "brightnessctl",
      ["set", "5%-"],
    ),
    powerSuspend: commandFromEnv("KORRI_INPUTD_POWER_SUSPEND", "systemctl", [
      "suspend",
    ]),
    lidClosed: commandFromEnv("KORRI_INPUTD_LID_CLOSED", "systemctl", [
      "suspend",
    ]),
    lidOpened: commandFromEnv("KORRI_INPUTD_LID_OPENED", "true", []),
    screenSwitch: commandFromEnv("KORRI_INPUTD_SCREEN_SWITCH", "swaymsg", [
      "focus",
      "output",
      "down",
    ]),
    toggleBottomScreen: commandFromEnv(
      "KORRI_INPUTD_TOGGLE_BOTTOM_SCREEN",
      "swaymsg",
      ["output", "DSI-1", "power", "toggle"],
    ),
    toggleTopScreen: commandFromEnv(
      "KORRI_INPUTD_TOGGLE_TOP_SCREEN",
      "swaymsg",
      ["output", "DSI-2", "power", "toggle"],
    ),
    workspacePrev: buildSwayShortcutCommand("workspace-prev"),
    workspaceNext: buildSwayShortcutCommand("workspace-next"),
    moveOutputUp: buildSwayShortcutCommand("move-output-up"),
    moveOutputDown: buildSwayShortcutCommand("move-output-down"),
    toggleBottomKeyboard: bottomKeyboardCommand.command,
  }
}

function commandFromEnvOptional(
  envName: string,
): InputdActionCommand | undefined {
  const raw = process.env[envName]
  if (!raw?.trim()) return undefined

  const [command, ...args] = raw.trim().split(/\s+/)
  return command ? { command, args } : undefined
}

function commandFromEnv(
  envName: string,
  fallbackCommand: string,
  fallbackArgs: readonly string[],
): InputdActionCommand {
  const raw = process.env[envName]
  if (!raw?.trim()) return { command: fallbackCommand, args: fallbackArgs }

  const [command, ...args] = raw.trim().split(/\s+/)
  return { command: command ?? fallbackCommand, args }
}

async function runCommand(command: InputdActionCommand): Promise<void> {
  const proc = Bun.spawn({
    cmd: [command.command, ...command.args],
    stdout: "ignore",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  if (exitCode === 0) return

  const stderr = await new Response(proc.stderr).text()
  throw new Error(
    `command failed (${exitCode}): ${command.command} ${command.args.join(" ")} ${stderr}`,
  )
}
