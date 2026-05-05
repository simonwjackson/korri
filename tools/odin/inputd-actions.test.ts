import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  createInputdActionDispatcher,
  type InputdActionCommand,
  type InputdActionCommands,
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
  options: { readonly commands?: InputdActionCommands } = {},
) {
  const commands: InputdActionCommand[] = []
  const warnings: unknown[] = []
  const dispatcher = createInputdActionDispatcher({
    commands: options.commands,
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
  it("runs the active application kill/restart command by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("kill-current-game")

    expect(commands).toEqual([
      { command: "/storage/bin/korri-kill-active-application", args: [] },
    ])
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

  it("routes System panel to the session start command by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("system-panel")

    expect(commands).toEqual([
      { command: "/storage/bin/korri-session-toggle", args: ["start"] },
    ])
  })

  it("routes the session chord to the ES/Korri toggle by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("korri-session-toggle")

    expect(commands).toEqual([
      { command: "/storage/bin/korri-session-toggle", args: ["toggle"] },
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

  it("runs the installed bottom keyboard helper by default", async () => {
    const { dispatcher, commands } = createHarness()

    await dispatcher.dispatch("toggle-bottom-keyboard")

    expect(commands).toEqual([
      { command: "/storage/bin/korri-toggle-bottom-keyboard", args: [] },
    ])
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
  })
})

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
