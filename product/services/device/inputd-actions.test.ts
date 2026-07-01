import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  createInputdActionDispatcher,
  defaultKillFilePathFromEnv,
  type InputdActionCommand,
  KORRI_INPUTD_ACTION_IDS,
} from "./inputd-actions"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function tempDir() {
  const path = join(
    process.cwd(),
    "out/tmp/inputd-actions",
    crypto.randomUUID(),
  )
  await mkdir(path, { recursive: true })
  tempDirs.push(path)
  return path
}

function createHarness(
  options: Parameters<typeof createInputdActionDispatcher>[0] = {},
) {
  const commands: InputdActionCommand[] = []
  const warnings: unknown[] = []
  const dispatcher = createInputdActionDispatcher({
    ...options,
    runner: async command => {
      commands.push(command)
      if (command.command === "fail") throw new Error("runner failed")
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: input => warnings.push(input),
      error: () => {},
    },
  })
  return { dispatcher, commands, warnings }
}

describe("inputd actions", () => {
  it("uses the ROCKNIX kill file by default unless explicitly overridden", () => {
    expect(defaultKillFilePathFromEnv({} as NodeJS.ProcessEnv)).toBe(
      "/tmp/.process-kill-data",
    )
    expect(
      defaultKillFilePathFromEnv({
        XDG_RUNTIME_DIR: "/run/user/1000",
      } as NodeJS.ProcessEnv),
    ).toBe("/tmp/.process-kill-data")
    expect(
      defaultKillFilePathFromEnv({
        KORRI_INPUTD_KILL_FILE_PATH:
          "/run/user/1000/korri-inputd/process-kill-data",
      } as NodeJS.ProcessEnv),
    ).toBe("/run/user/1000/korri-inputd/process-kill-data")
  })

  it("terminates the active sessiond launch when sessiond is configured", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const { dispatcher, commands, warnings } = createHarness({
      sessiond: {
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async (input, init) => {
          requests.push({ input, init })
          if (String(input).endsWith("/managed-launch/status")) {
            return Response.json({
              schemaVersion: 1,
              mode: "game",
              capabilities: {
                managedLaunch: true,
                lifecycleEvents: true,
                perLaunchTermination: true,
                sessionLifecycle: true,
              },
              active: { launchId: "launch-1", mode: "game" },
              restoreAttempts: 0,
            })
          }
          return Response.json({ status: "accepted", launchId: "launch-1" })
        },
      },
    })

    await dispatcher.dispatch("kill-current-game")

    expect(commands).toEqual([])
    expect(warnings).toEqual([])
    expect(requests.map(request => request.input)).toEqual([
      "http://korri-sessiond/managed-launch/status",
      "http://korri-sessiond/managed-launch/terminate",
    ])
    expect((requests[1].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({
      launchId: "launch-1",
    })
  })

  it("falls back to the kill file when configured sessiond is unavailable", async () => {
    const dir = await tempDir()
    const killFilePath = join(dir, "process-kill-data")
    await writeFile(killFilePath, "retroarch\n")
    const { dispatcher, commands, warnings } = createHarness({
      sessiond: {
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async () => {
          throw new Error("connection refused")
        },
      },
    })

    await dispatcher.dispatch("kill-current-game", { killFilePath })

    expect(commands).toEqual([{ command: "killall", args: ["retroarch"] }])
    expect(warnings).toHaveLength(1)
  })

  it("falls back to the kill file when sessiond has no active launch", async () => {
    const dir = await tempDir()
    const killFilePath = join(dir, "process-kill-data")
    await writeFile(killFilePath, "retroarch\n")
    const { dispatcher, commands, warnings } = createHarness({
      sessiond: {
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async input => {
          expect(String(input)).toBe(
            "http://korri-sessiond/managed-launch/status",
          )
          return Response.json({
            schemaVersion: 1,
            mode: "home",
            capabilities: {
              managedLaunch: true,
              lifecycleEvents: true,
              perLaunchTermination: true,
              sessionLifecycle: true,
            },
            restoreAttempts: 0,
          })
        },
      },
    })

    await dispatcher.dispatch("kill-current-game", { killFilePath })

    expect(commands).toEqual([{ command: "killall", args: ["retroarch"] }])
    expect(warnings).toHaveLength(1)
  })

  it("can still fall back to the ROCKNIX process-kill-data file", async () => {
    const dir = await tempDir()
    const killFilePath = join(dir, "process-kill-data")
    await writeFile(killFilePath, "retroarch retroarch32\n")
    const { dispatcher, commands } = createHarness({
      commands: { killCurrentGame: undefined },
    })

    await dispatcher.dispatch("kill-current-game", { killFilePath })

    expect(commands).toEqual([
      { command: "killall", args: ["retroarch", "retroarch32"] },
    ])
  })

  it("no-ops and warns when the kill file is missing", async () => {
    const { dispatcher, commands, warnings } = createHarness({
      commands: { killCurrentGame: undefined },
    })

    await dispatcher.dispatch("kill-current-game", {
      killFilePath: "/tmp/korri-missing-process-kill-data",
    })

    expect(commands).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it("no-ops and warns when the kill file is empty", async () => {
    const dir = await tempDir()
    const killFilePath = join(dir, "process-kill-data")
    await writeFile(killFilePath, " \n\t ")
    const { dispatcher, commands, warnings } = createHarness({
      commands: { killCurrentGame: undefined },
    })

    await dispatcher.dispatch("kill-current-game", { killFilePath })

    expect(commands).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it("logs runner failures without throwing", async () => {
    const dir = await tempDir()
    const killFilePath = join(dir, "process-kill-data")
    await writeFile(killFilePath, "retroarch")
    const commands: InputdActionCommand[] = []
    const warnings: unknown[] = []
    const dispatcher = createInputdActionDispatcher({
      commands: { killCurrentGame: undefined },
      runner: async command => {
        commands.push(command)
        throw new Error("runner failed")
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: input => warnings.push(input),
        error: () => {},
      },
    })

    await expect(
      dispatcher.dispatch("kill-current-game", { killFilePath }),
    ).resolves.toBeUndefined()
    expect(commands).toHaveLength(1)
    expect(warnings).toHaveLength(1)
  })

  it("routes Home through sessiond when lane toggle is supported", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const { dispatcher, commands, warnings } = createHarness({
      sessiond: {
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async (input, init) => {
          requests.push({ input, init })
          if (String(input).endsWith("/managed-launch/status")) {
            return Response.json({
              schemaVersion: 1,
              mode: "home",
              capabilities: {
                managedLaunch: true,
                lifecycleEvents: true,
                perLaunchTermination: true,
                laneToggle: true,
              },
              restoreAttempts: 0,
            })
          }
          return Response.json({ status: "no-live-game" })
        },
      },
    })

    await dispatcher.dispatch("system-panel")

    expect(commands).toEqual([])
    expect(warnings).toEqual([])
    expect(requests.map(request => request.input)).toEqual([
      "http://korri-sessiond/managed-launch/status",
      "http://korri-sessiond/managed-launch/home-toggle",
    ])
  })

  it("routes Home panel to direct Sway Korri launch by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("system-panel")

    expect(commands).toEqual([
      { command: "swaymsg", args: ["exec", "korri-desktop-device"] },
    ])
  })

  it("runs direct Sway screen focus by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("screen-switch")

    expect(commands).toEqual([
      { command: "swaymsg", args: ["focus", "output", "down"] },
    ])
  })

  it("runs direct Sway screen power toggle commands by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("toggle-bottom-screen")
    await dispatcher.dispatch("toggle-top-screen")

    expect(commands).toEqual([
      { command: "swaymsg", args: ["output", "DSI-1", "power", "toggle"] },
      { command: "swaymsg", args: ["output", "DSI-2", "power", "toggle"] },
    ])
  })

  it("runs the configured screen switch command", async () => {
    const commands: InputdActionCommand[] = []
    const dispatcher = createInputdActionDispatcher({
      commands: {
        screenSwitch: { command: "/custom/screen_switch", args: [] },
      },
      runner: async command => {
        commands.push(command)
      },
      logger: silentLogger,
    })

    await dispatcher.dispatch("screen-switch")

    expect(commands).toEqual([{ command: "/custom/screen_switch", args: [] }])
  })

  it("runs configured Sway workspace and output commands", async () => {
    const commands: InputdActionCommand[] = []
    const dispatcher = createInputdActionDispatcher({
      runner: async command => {
        commands.push(command)
      },
      logger: silentLogger,
    })

    await dispatcher.dispatch("workspace-prev")
    await dispatcher.dispatch("workspace-next")
    await dispatcher.dispatch("move-output-up")
    await dispatcher.dispatch("move-output-down")

    expect(commands).toEqual([
      { command: "swaymsg", args: ["workspace prev_on_output"] },
      { command: "swaymsg", args: ["workspace next_on_output"] },
      { command: "swaymsg", args: ["move container to output up"] },
      { command: "swaymsg", args: ["move container to output down"] },
    ])
  })

  it("does not run a bottom keyboard command until configured", async () => {
    const { dispatcher, commands, warnings } = createHarness()

    await dispatcher.dispatch("toggle-bottom-keyboard")

    expect(commands).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it("runs configured bottom keyboard command", async () => {
    const commands: InputdActionCommand[] = []
    const dispatcher = createInputdActionDispatcher({
      commands: {
        toggleBottomKeyboard: { command: "osk", args: ["toggle"] },
      },
      runner: async command => {
        commands.push(command)
      },
      logger: silentLogger,
    })

    await dispatcher.dispatch("toggle-bottom-keyboard")

    expect(commands).toEqual([{ command: "osk", args: ["toggle"] }])
  })

  it("runs configured volume and brightness commands", async () => {
    const commands: InputdActionCommand[] = []
    const dispatcher = createInputdActionDispatcher({
      commands: {
        volumeUp: { command: "volume", args: ["up"] },
        brightnessDown: { command: "brightness", args: ["down"] },
      },
      runner: async command => {
        commands.push(command)
      },
      logger: silentLogger,
    })

    await dispatcher.dispatch("volume-up")
    await dispatcher.dispatch("brightness-down")

    expect(commands).toEqual([
      { command: "volume", args: ["up"] },
      { command: "brightness", args: ["down"] },
    ])
  })

  it("runs configured power and lid commands", async () => {
    const commands: InputdActionCommand[] = []
    const dispatcher = createInputdActionDispatcher({
      commands: {
        powerSuspend: { command: "systemctl", args: ["suspend"] },
        lidClosed: { command: "lid", args: ["closed"] },
        lidOpened: { command: "lid", args: ["opened"] },
      },
      runner: async command => {
        commands.push(command)
      },
      logger: silentLogger,
    })

    await dispatcher.dispatch("power-suspend")
    await dispatcher.dispatch("lid-closed")
    await dispatcher.dispatch("lid-opened")

    expect(commands).toEqual([
      { command: "systemctl", args: ["suspend"] },
      { command: "lid", args: ["closed"] },
      { command: "lid", args: ["opened"] },
    ])
  })

  it("does not define dropped input_sense actions", () => {
    expect(KORRI_INPUTD_ACTION_IDS).not.toContain("screenshot")
    expect(KORRI_INPUTD_ACTION_IDS).not.toContain("game-guide")
    expect(KORRI_INPUTD_ACTION_IDS).not.toContain("mangohud-toggle")
    expect(KORRI_INPUTD_ACTION_IDS).not.toContain("touch-keyboard")
    expect(KORRI_INPUTD_ACTION_IDS).not.toContain("korri-session-toggle")
  })
})

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
