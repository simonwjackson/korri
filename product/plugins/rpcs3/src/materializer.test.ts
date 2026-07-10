import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Cause, Effect, Exit } from "effect"
import { parse } from "yaml"
import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_DEFAULT_COMMAND,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
  rpcs3ReadableLaunchIntegration,
} from ".."
import { materializeReadableRpcs3Launch } from "./materializer"

describe("RPCS3 readable launch integration", () => {
  it("can resolve only RPCS3 contexts with file content", () => {
    expect(rpcs3ReadableLaunchIntegration.canResolve(context({}))).toBe(true)
    expect(
      rpcs3ReadableLaunchIntegration.canResolve(
        context({ contentPath: undefined }),
      ),
    ).toBe(false)
    expect(
      rpcs3ReadableLaunchIntegration.canResolve(
        context({ appPlugin: "@korri:retroarch" }),
      ),
    ).toBe(false)
  })

  it("materializes PS3_DISC.SFB content into a no-gui launch for its parent folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-materializer-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )

      expect(result.spec).toEqual({
        command: KORRI_RPCS3_DEFAULT_COMMAND,
        args: ["--no-gui", gameFolder],
        env: { XDG_CONFIG_HOME: root, HOME: root },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("writes a per-launch config and passes --config when settings are present", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-config-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
              video: { fullscreen: false },
              boot: { exitOnFinish: true },
            },
          }),
        }),
      )

      const args = result.spec.args
      expect(args).not.toContain("--fullscreen")
      const configIndex = args.indexOf("--config")
      expect(configIndex).toBeGreaterThanOrEqual(0)
      const configPath = args[configIndex + 1] as string
      expect(configPath).toBe(
        join(stateRoot, "korri", "config-Skate-3-BLUS30464.yml"),
      )
      expect(args.at(-1)).toBe(gameFolder)

      expect(parse(await readFile(configPath, "utf8"))).toEqual({
        Miscellaneous: {
          "Start games in fullscreen mode": false,
          "Exit RPCS3 when process finishes": true,
        },
      })

      // The operator's canonical config.yml is never created/clobbered.
      await expect(stat(join(stateRoot, "config.yml"))).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("preseeds CurrentSettings.ini for suppressPopups and preserves unrelated keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-ini-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")
      await mkdir(join(stateRoot, "GuiConfigs"), { recursive: true })
      await writeFile(
        join(stateRoot, "GuiConfigs", "CurrentSettings.ini"),
        "[main_window]\ngeometry=@ByteArray(keep)\n",
      )

      await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
              boot: { suppressPopups: true },
            },
          }),
        }),
      )

      const ini = await readFile(
        join(stateRoot, "GuiConfigs", "CurrentSettings.ini"),
        "utf8",
      )
      expect(ini).toContain("geometry=@ByteArray(keep)")
      expect(ini).toContain("confirmationBoxExitGame=false")
      expect(ini).toContain("infoBoxEnabledWelcome=false")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("leaves CurrentSettings.ini untouched when suppression is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-ini-noop-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )

      await expect(
        stat(join(stateRoot, "GuiConfigs", "CurrentSettings.ini")),
      ).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("read-merges the operator canonical config without clobbering it", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-merge-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")
      const canonicalText =
        "Video:\n  Renderer: Vulkan\n  Resolution: 1920x1080\n"
      await writeFile(join(stateRoot, "config.yml"), canonicalText)

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
              video: { resolution: "1280x720" },
            },
          }),
        }),
      )

      const args = result.spec.args
      const configPath = args[args.indexOf("--config") + 1] as string
      expect(parse(await readFile(configPath, "utf8"))).toEqual({
        Video: { Renderer: "Vulkan", Resolution: "1280x720" },
      })
      // Canonical config.yml is left exactly as the operator wrote it.
      expect(await readFile(join(stateRoot, "config.yml"), "utf8")).toBe(
        canonicalText,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("authors an input profile and passes --input-config, sparing operator profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-input-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")
      // An operator-authored profile that Korri must never clobber.
      await mkdir(join(stateRoot, "input_configs", "global"), {
        recursive: true,
      })
      const operatorProfile = "Player 1 Input:\n  Handler: Evdev\n"
      await writeFile(
        join(stateRoot, "input_configs", "global", "Default.yml"),
        operatorProfile,
      )

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
              input: {
                players: [
                  {
                    handler: "evdev",
                    device: "Sunshine X-Box One (virtual) pad",
                    buttons: { cross: "BTN_SOUTH" },
                    sticks: { left: { deadzone: 40 } },
                  },
                ],
              },
            },
          }),
        }),
      )

      const args = result.spec.args
      const inputIndex = args.indexOf("--input-config")
      expect(inputIndex).toBeGreaterThanOrEqual(0)
      expect(args[inputIndex + 1]).toBe("korri-Skate-3-BLUS30464")
      expect(args.at(-1)).toBe(gameFolder)

      const profilePath = join(
        stateRoot,
        "input_configs",
        "global",
        "korri-Skate-3-BLUS30464.yml",
      )
      const parsed = parse(await readFile(profilePath, "utf8"))
      expect(parsed["Player 1 Input"]).toEqual({
        Handler: "Evdev",
        Device: "Sunshine X-Box One (virtual) pad",
        Config: { Cross: "BTN_SOUTH", "Left Stick Deadzone": 40 },
      })
      expect(parsed["Player 2 Input"]).toEqual({ Handler: "Null" })

      // The operator's Default.yml is left exactly as written.
      expect(
        await readFile(
          join(stateRoot, "input_configs", "global", "Default.yml"),
          "utf8",
        ),
      ).toBe(operatorProfile)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("derives an RPCS3 input profile from input-seat launch companions", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-input-seat-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            launchCompanions: {
              "@korri:input-seat": {
                runtimeSupportsExtraSeats: true,
              },
            },
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
              input: {
                derivedSeatDefaults: {
                  sticks: { right: { multiplier: 125 } },
                },
              },
            },
          }),
        }),
      )

      const args = result.spec.args
      const inputIndex = args.indexOf("--input-config")
      expect(inputIndex).toBeGreaterThanOrEqual(0)
      expect(args[inputIndex + 1]).toBe("korri-Skate-3-BLUS30464")

      const parsed = parse(
        await readFile(
          join(
            stateRoot,
            "input_configs",
            "global",
            "korri-Skate-3-BLUS30464.yml",
          ),
          "utf8",
        ),
      )
      expect(parsed["Player 1 Input"]).toEqual({
        Handler: "Evdev",
        Device: "Korri Seat P1",
        Config: { "Right Stick Multiplier": 125 },
      })
      expect(parsed["Player 2 Input"]).toEqual({
        Handler: "Evdev",
        Device: "Korri Seat P2",
        Config: { "Right Stick Multiplier": 125 },
      })
      expect(parsed["Player 3 Input"]).toEqual({
        Handler: "Evdev",
        Device: "Korri Seat P3",
        Config: { "Right Stick Multiplier": 125 },
      })
      expect(parsed["Player 4 Input"]).toEqual({
        Handler: "Evdev",
        Device: "Korri Seat P4",
        Config: { "Right Stick Multiplier": 125 },
      })
      expect(parsed["Player 5 Input"]).toEqual({ Handler: "Null" })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("writes no input profile and no --input-config when input is unset", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-input-noop-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )

      expect(result.spec.args).not.toContain("--input-config")
      await expect(stat(join(stateRoot, "input_configs"))).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("resolves storage tokens in policy roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-storage-"))
    try {
      const gameFolder = join(root, "games", "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            storage: {
              "@korri:rpcs3/state": { id: "state", root: stateRoot },
            },
            policy: {
              state: { root: "{storage:@korri:rpcs3/state}" },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )

      expect(result.spec.args.at(-1)).toBe(gameFolder)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails before spawn when content, command, or firmware is missing", async () => {
    const missingContent = await Effect.runPromiseExit(
      materializeReadableRpcs3Launch({
        context: context({ contentPath: undefined }),
      }),
    )
    expectFailureReason(
      missingContent,
      "require a resolved PS3 disc marker path",
    )

    const relativeCommand = await Effect.runPromiseExit(
      materializeReadableRpcs3Launch({
        context: context({
          appCommand: "rpcs3",
          policy: { state: { root: "/tmp/rpcs3" } },
        }),
      }),
    )
    expectFailureReason(relativeCommand, "require an absolute RPCS3 command")

    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-missing-fw-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(stateRoot, { recursive: true })

      const missingFirmware = await Effect.runPromiseExit(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
            },
          }),
        }),
      )
      expectFailureReason(missingFirmware, "RPCS3 firmware is missing")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("surfaces a non-ENOENT canonical config read error instead of dropping it", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-cfgerr-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "rpcs3")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")
      // A directory where config.yml is expected makes readFile throw EISDIR
      // (a non-ENOENT error) that must NOT be silently swallowed.
      await mkdir(join(stateRoot, "config.yml"), { recursive: true })

      const exit = await Effect.runPromiseExit(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
              video: { resolution: "1280x720" },
            },
          }),
        }),
      )
      expect(Exit.isFailure(exit)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects a state.root whose basename is not rpcs3", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-basename-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "weird")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const exit = await Effect.runPromiseExit(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )
      expectFailureReason(exit, "must be an rpcs3 config dir")
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
    readonly policy?: unknown
    readonly storage?: ReadableResolvedLaunchContext["storage"]
    readonly launchCompanions?: ReadableResolvedLaunchContext["launchCompanions"]
  } = {},
): ReadableResolvedLaunchContext {
  return {
    playableId: "Skate 3 [BLUS30464]",
    releaseId: "Skate 3 [BLUS30464]",
    itemId: "Skate 3 [BLUS30464]",
    system: KORRI_RPCS3_PS3_SYSTEM_ID,
    target: "Skate 3 [BLUS30464]/PS3_DISC.SFB",
    app: {
      id: KORRI_RPCS3_APP_ID,
      plugin: input.appPlugin ?? KORRI_RPCS3_PLUGIN_ID,
      command: input.appCommand ?? KORRI_RPCS3_DEFAULT_COMMAND,
      policy: { allowedCommands: [KORRI_RPCS3_DEFAULT_COMMAND] },
    },
    runtime: {
      id: KORRI_RPCS3_RUNTIME_ID,
      kind: "emulator",
      path: KORRI_RPCS3_DEFAULT_COMMAND,
    },
    ...(Object.hasOwn(input, "contentPath")
      ? input.contentPath === undefined
        ? {}
        : { content: { path: input.contentPath } }
      : { content: { path: "/tmp/Skate 3 [BLUS30464]/PS3_DISC.SFB" } }),
    launchCompanions: input.launchCompanions ?? {},
    plugin: {
      [KORRI_RPCS3_PLUGIN_ID]: input.policy ?? {
        state: { root: "/tmp/rpcs3" },
      },
    },
    storage: input.storage,
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
