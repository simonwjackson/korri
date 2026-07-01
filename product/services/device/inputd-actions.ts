import { readFile } from "node:fs/promises"
import {
  probeSessiondManagedLaunchStatus,
  type SessiondManagedLaunchClientOptions,
  terminateSessiondManagedLaunch,
  toggleSessiondHomeLane,
} from "@platform/library/sessiond-managed-launch-client"
import { logger as defaultLogger } from "@platform/logger"
import { buildBottomKeyboardCommand } from "./bottom-keyboard"
import { buildSwayShortcutCommand } from "./sway-actions"

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

export interface InputdActionDispatcherOptions {
  readonly runner?: InputdActionRunner
  readonly logger?: InputdActionLogger
  readonly commands?: InputdActionCommands
  readonly defaultKillFilePath?: string
  readonly sessiond?: SessiondManagedLaunchClientOptions
}

const FALLBACK_KILL_FILE_PATH = "/tmp/.process-kill-data"
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
          if (
            await dispatchSessiondHomeToggle({
              logger,
              sessiond,
            })
          )
            return
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
              sessiond,
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

async function dispatchSessiondHomeToggle(options: {
  readonly logger: InputdActionLogger
  readonly sessiond: SessiondManagedLaunchClientOptions
}): Promise<boolean> {
  const status = await probeSessiondManagedLaunchStatus(options.sessiond)
  if (status.kind === "not-configured") return false
  if (status.kind !== "ok") {
    options.logger.warn(
      { status },
      "inputd Home lane toggle unavailable; falling back to legacy command",
    )
    return false
  }
  if (status.status.capabilities.laneToggle !== true) return false

  const toggled = await toggleSessiondHomeLane(options.sessiond)
  if (toggled.kind !== "ok") {
    options.logger.warn(
      { status: toggled },
      "inputd Home lane toggle failed; falling back to legacy command",
    )
    return false
  }
  if (toggled.response.status === "unsupported") return false

  options.logger.info(
    { response: toggled.response },
    "inputd routed Home through sessiond lane toggle",
  )
  return true
}

async function dispatchSessiondTerminateActive(options: {
  readonly logger: InputdActionLogger
  readonly sessiond: SessiondManagedLaunchClientOptions
}): Promise<boolean> {
  const status = await probeSessiondManagedLaunchStatus(options.sessiond)
  if (status.kind === "not-configured") return false
  if (status.kind !== "ok") {
    options.logger.warn(
      { status },
      "inputd kill-current-game failed; falling back to kill file",
    )
    return false
  }

  const active = status.status.active
  if (!active) {
    options.logger.warn(
      { mode: status.status.mode },
      "inputd kill-current-game found no active sessiond launch",
    )
    return false
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
      "workspace",
      "korri:hub",
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
