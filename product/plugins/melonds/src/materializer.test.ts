import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Cause, Effect, Exit } from "effect"
import {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_DEFAULT_COMMAND,
  KORRI_MELONDS_NDS_SYSTEM_ID,
  KORRI_MELONDS_PLUGIN_ID,
  KORRI_MELONDS_STATE_STORAGE_ID,
} from ".."
import { materializeReadableMelonDsLaunch } from "./materializer"

describe("melonDS materializer", () => {
  it("materializes a managed config and direct ROM launch", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-melonds-"))
    try {
      const rom = join(root, "Mario Kart DS.nds")
      const stateRoot = join(root, "melonDS")
      await writeFile(rom, "nds")

      const result = await Effect.runPromise(
        materializeReadableMelonDsLaunch({
          context: context({ contentPath: rom, stateRoot }),
        }),
      )

      expect(result.spec).toEqual({
        command: KORRI_MELONDS_DEFAULT_COMMAND,
        args: [rom],
        env: { XDG_CONFIG_HOME: root, XDG_DATA_HOME: root },
      })
      expect((await stat(join(stateRoot, "saves"))).isDirectory()).toBe(true)
      expect((await stat(join(stateRoot, "savestates"))).isDirectory()).toBe(
        true,
      )
      expect((await stat(join(stateRoot, "cheats"))).isDirectory()).toBe(true)

      const config = await readFile(join(stateRoot, "melonDS.toml"), "utf8")
      expect(config).toContain("[Instance0]")
      expect(config).toContain(
        `SaveFilePath = ${JSON.stringify(join(stateRoot, "saves"))}`,
      )
      expect(config).toContain("[Instance0.Window0]\nEnabled = true")
      expect(config).toContain("[Instance0.Window1]\nEnabled = false")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("adds fullscreen and preserves caller env", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-melonds-env-"))
    try {
      const rom = join(root, "Zelda.nds")
      const stateRoot = join(root, "melonDS")
      await writeFile(rom, "nds")

      const result = await Effect.runPromise(
        materializeReadableMelonDsLaunch({
          context: context({
            contentPath: rom,
            stateRoot,
            env: { WAYLAND_DISPLAY: "wayland-1" },
            policy: {
              state: { root: stateRoot },
              video: { fullscreen: true },
            },
          }),
        }),
      )

      expect(result.spec).toEqual({
        command: KORRI_MELONDS_DEFAULT_COMMAND,
        args: ["--fullscreen", rom],
        env: {
          WAYLAND_DISPLAY: "wayland-1",
          XDG_CONFIG_HOME: root,
          XDG_DATA_HOME: root,
        },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("resolves storage tokens in state.root", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-melonds-storage-"))
    try {
      const rom = join(root, "Kirby.nds")
      const stateRoot = join(root, "melonDS")
      await writeFile(rom, "nds")

      await Effect.runPromise(
        materializeReadableMelonDsLaunch({
          context: context({
            contentPath: rom,
            policy: {
              state: { root: `{storage:${KORRI_MELONDS_STATE_STORAGE_ID}}` },
            },
            storage: {
              [KORRI_MELONDS_STATE_STORAGE_ID]: {
                id: KORRI_MELONDS_STATE_STORAGE_ID,
                root: stateRoot,
              },
            },
          }),
        }),
      )

      await expect(
        stat(join(stateRoot, "melonDS.toml")),
      ).resolves.toMatchObject({})
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails before writing when the launch context is incomplete", async () => {
    const missingContent = await Effect.runPromiseExit(
      materializeReadableMelonDsLaunch({
        context: context({ contentPath: undefined }),
      }),
    )
    expectFailureReason(missingContent, "ROM path")

    const wrongPlugin = await Effect.runPromiseExit(
      materializeReadableMelonDsLaunch({
        context: context({ appPlugin: "@korri:retroarch" }),
      }),
    )
    expectFailureReason(wrongPlugin, "requires plugin")

    const relativeCommand = await Effect.runPromiseExit(
      materializeReadableMelonDsLaunch({
        context: context({ appCommand: "melonDS" }),
      }),
    )
    expectFailureReason(relativeCommand, "absolute command")
  })

  it("fails before writing when a storage token is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-melonds-missing-storage-"))
    try {
      const rom = join(root, "Game.nds")
      await writeFile(rom, "nds")

      const exit = await Effect.runPromiseExit(
        materializeReadableMelonDsLaunch({
          context: context({
            contentPath: rom,
            policy: {
              state: { root: `{storage:${KORRI_MELONDS_STATE_STORAGE_ID}}` },
            },
          }),
        }),
      )

      expectFailureReason(exit, KORRI_MELONDS_STATE_STORAGE_ID)
      await expect(
        stat(join(root, "melonDS", "melonDS.toml")),
      ).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("requires a melonDS state root basename", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-melonds-bad-root-"))
    try {
      const rom = join(root, "Game.nds")
      await writeFile(rom, "nds")

      const exit = await Effect.runPromiseExit(
        materializeReadableMelonDsLaunch({
          context: context({
            contentPath: rom,
            stateRoot: join(root, "state"),
          }),
        }),
      )

      expectFailureReason(exit, 'basename must be "melonDS"')
      await expect(stat(join(root, "state", "melonDS.toml"))).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps the ROM positional when argv overrides replace routed flags", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-melonds-overrides-"))
    try {
      const rom = join(root, "Game.nds")
      const stateRoot = join(root, "melonDS")
      await writeFile(rom, "nds")

      const result = await Effect.runPromise(
        materializeReadableMelonDsLaunch({
          context: context({
            contentPath: rom,
            stateRoot,
            overrides: {
              args: {
                prepend: ["--boot", "never"],
                replace: ["--fullscreen"],
                append: ["/games/slot2.gba"],
              },
            },
          }),
        }),
      )

      expect(result.spec.args).toEqual([
        "--boot",
        "never",
        "--fullscreen",
        "/games/slot2.gba",
        rom,
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function context(
  input: {
    readonly appPlugin?: string
    readonly appCommand?: string
    readonly contentPath?: string
    readonly stateRoot?: string
    readonly policy?: unknown
    readonly storage?: ReadableResolvedLaunchContext["storage"]
    readonly env?: ReadableResolvedLaunchContext["env"]
    readonly overrides?: ReadableResolvedLaunchContext["overrides"]
  } = {},
): ReadableResolvedLaunchContext {
  const stateRoot = input.stateRoot ?? "/tmp/melonDS"
  return {
    playableId: "Mario Kart DS",
    releaseId: "Mario Kart DS",
    itemId: "Mario Kart DS",
    system: KORRI_MELONDS_NDS_SYSTEM_ID,
    target: "Mario Kart DS.nds",
    app: {
      id: KORRI_MELONDS_APP_ID,
      plugin: input.appPlugin ?? KORRI_MELONDS_PLUGIN_ID,
      command: input.appCommand ?? KORRI_MELONDS_DEFAULT_COMMAND,
      policy: { allowedCommands: [KORRI_MELONDS_DEFAULT_COMMAND] },
    },
    ...(Object.hasOwn(input, "contentPath")
      ? input.contentPath === undefined
        ? {}
        : { content: { path: input.contentPath } }
      : { content: { path: "/tmp/Mario Kart DS.nds" } }),
    launchCompanions: {},
    plugin: {
      [KORRI_MELONDS_PLUGIN_ID]: input.policy ?? {
        state: { root: stateRoot },
      },
    },
    ...(input.storage !== undefined ? { storage: input.storage } : {}),
    ...(input.env !== undefined ? { env: input.env } : {}),
    ...(input.overrides !== undefined ? { overrides: input.overrides } : {}),
  }
}

function expectFailureReason(
  exit: Exit.Exit<unknown, unknown>,
  reason: string,
): void {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause)
    expect(error).toBeInstanceOf(AppMaterializationFailed)
    expect((error as AppMaterializationFailed).reason).toContain(reason)
  }
}

it("materializes matched presentation stylesheet and managed dual-window config", async () => {
  const root = await mkdtemp(join(tmpdir(), "korri-melonds-matched-"))
  try {
    const rom = join(root, "Tetris DS.nds")
    const stateRoot = join(root, "melonDS")
    await writeFile(rom, "nds")

    await Effect.runPromise(
      materializeReadableMelonDsLaunch({
        context: context({
          contentPath: rom,
          stateRoot,
          policy: {
            state: { root: stateRoot },
            display: { mode: "dual-window" },
            presentation: {
              intent: "matched-dual-screen",
              menu: { hide: true },
              wayland: {
                display: "wayland-1",
                compositorSocket: "/run/user/1000/sway-ipc.sock",
              },
              windows: {
                top: {
                  output: "TOP",
                  x: 407,
                  y: 250,
                  width: 1106,
                  height: 830,
                },
                bottom: {
                  output: "BOTTOM",
                  x: 0,
                  y: 0,
                  width: 1240,
                  height: 930,
                },
              },
              input: { profile: "inputplumber-xbox" },
            },
          },
        }),
      }),
    )

    const config = await readFile(join(stateRoot, "melonDS.toml"), "utf8")
    expect(config).toContain("[Instance0.Window1]\nEnabled = true")
    expect(config).toContain("[Instance0.Joystick]")
    await expect(
      readFile(join(stateRoot, "presentation", "hide-menubar.qss"), "utf8"),
    ).resolves.toContain("QMenuBar")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("writes a matched presenter payload and forces Wayland env", async () => {
  const root = await mkdtemp(join(tmpdir(), "korri-melonds-presenter-"))
  try {
    const rom = join(root, "Tetris DS.nds")
    const stateRoot = join(root, "melonDS")
    await writeFile(rom, "nds")

    const result = await Effect.runPromise(
      materializeReadableMelonDsLaunch({
        context: context({
          contentPath: rom,
          stateRoot,
          env: { DISPLAY: ":0", GDK_BACKEND: "x11" },
          policy: {
            state: { root: stateRoot },
            display: { mode: "dual-window" },
            presentation: {
              intent: "matched-dual-screen",
              menu: { hide: true },
              wayland: {
                display: "wayland-1",
                compositorSocket: "/run/user/1000/sway-ipc.sock",
              },
              windows: {
                top: {
                  output: "TOP",
                  x: 407,
                  y: 250,
                  width: 1106,
                  height: 830,
                },
                bottom: {
                  output: "BOTTOM",
                  x: 0,
                  y: 0,
                  width: 1240,
                  height: 930,
                },
              },
              secondaryOutput: { output: "BOTTOM", restore: "observed" },
            },
          },
        }),
      }),
    )

    expect(result.spec.command).toBe(
      "/run/current-system/sw/bin/korri-melonds-presenter",
    )
    expect(result.spec.args).toEqual([
      "--payload",
      join(stateRoot, "presentation", "matched-dual-screen.json"),
    ])
    expect(result.spec.env).toMatchObject({
      WAYLAND_DISPLAY: "wayland-1",
      SWAYSOCK: "/run/user/1000/sway-ipc.sock",
      QT_QPA_PLATFORM: "wayland",
    })
    expect(result.spec.env).not.toHaveProperty("DISPLAY")
    expect(result.spec.env).not.toHaveProperty("GDK_BACKEND")

    const payload = JSON.parse(
      await readFile(
        join(stateRoot, "presentation", "matched-dual-screen.json"),
        "utf8",
      ),
    )
    expect(payload.melonDs.command).toBe(KORRI_MELONDS_DEFAULT_COMMAND)
    expect(payload.melonDs.args).toEqual([rom])
    expect(payload.windows.top).toEqual({
      output: "TOP",
      x: 407,
      y: 250,
      width: 1106,
      height: 830,
    })
    expect(payload.selectors).toMatchObject({
      appId: "net.kuribo64.melonDS",
      topTitlePrefix: "[w1]",
      bottomTitlePrefix: "[w2]",
    })
    expect(payload.stylesheet).toBe(
      join(stateRoot, "presentation", "hide-menubar.qss"),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("fails matched presentation before spawn when geometry is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "korri-melonds-no-geometry-"))
  try {
    const rom = join(root, "Tetris DS.nds")
    await writeFile(rom, "nds")
    const exit = await Effect.runPromiseExit(
      materializeReadableMelonDsLaunch({
        context: context({
          contentPath: rom,
          stateRoot: join(root, "melonDS"),
          policy: {
            state: { root: join(root, "melonDS") },
            display: { mode: "dual-window" },
            presentation: {
              intent: "matched-dual-screen",
              wayland: {
                display: "wayland-1",
                compositorSocket: "/run/user/1000/sway-ipc.sock",
              },
            },
          },
        }),
      }),
    )
    expectFailureReason(exit, "window geometry")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("fails matched presentation before spawn when trusted compositor env is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "korri-melonds-no-sway-"))
  try {
    const rom = join(root, "Tetris DS.nds")
    await writeFile(rom, "nds")
    const exit = await Effect.runPromiseExit(
      materializeReadableMelonDsLaunch({
        context: context({
          contentPath: rom,
          stateRoot: join(root, "melonDS"),
          policy: {
            state: { root: join(root, "melonDS") },
            display: { mode: "dual-window" },
            presentation: {
              intent: "matched-dual-screen",
              windows: {
                top: {
                  output: "TOP",
                  x: 407,
                  y: 250,
                  width: 1106,
                  height: 830,
                },
                bottom: {
                  output: "BOTTOM",
                  x: 0,
                  y: 0,
                  width: 1240,
                  height: 930,
                },
              },
            },
          },
        }),
      }),
    )
    expectFailureReason(exit, "compositor")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
