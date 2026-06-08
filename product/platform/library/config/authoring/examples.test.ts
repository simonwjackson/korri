import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { parse } from "yaml"

import { decodeAppPayload } from "../records/app"

const EXAMPLE_PATH = "korri-catalog-display-metadata.example.yaml"
const RETROARCH_EXAMPLE_PATHS = [
  "docs/brainstorms/2026-06-08-004-retroarch-policy-minimal-v1.example.yaml",
  "docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml",
] as const

const activeYaml = (source: string): string =>
  source
    .split("\n")
    .map(line => line.replace(/#.*/, ""))
    .filter(line => line.trim() !== "")
    .join("\n")

async function withExampleLibrary<T>(
  fn: (args: {
    readonly root: string
    readonly repository: ReturnType<typeof createLibraryRepository>
  }) => Effect.Effect<T, unknown>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-readable-example-"))
  try {
    const example = await readFile(EXAMPLE_PATH, "utf8")
    await writeFile(join(root, "library.yaml"), example, "utf8")
    return await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          return yield* fn({ root, repository: createLibraryRepository(db) })
        }),
      ),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("checked-in readable library example", () => {
  it("decodes, lists derived playables, and preserves release order", async () => {
    const result = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        const entries = yield* repository.listPlayableEntries()
        return { entries }
      }),
    )

    expect(result.entries.map(entry => entry.id)).toEqual([
      "downwell",
      "sonic-the-hedgehog",
      "super-mario-advance-2/super-mario-world",
      "super-mario-advance-2/mario-bros",
    ])
    expect(
      result.entries
        .find(entry => entry.id === "sonic-the-hedgehog")
        ?.releases.map(release => release.id),
    ).toEqual(["genesis", "windows-known", "steam"])
    expect(
      result.entries.find(
        entry => entry.id === "super-mario-advance-2/super-mario-world",
      )?.containedId,
    ).toBe("super-mario-world")
  })

  it("resolves representative Steam URI, ROM, and local launcher policies", async () => {
    const launches = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        const downwell = yield* repository.resolveLaunchForPlayable("downwell")
        const sonicGenesis = yield* repository.resolveLaunchForPlayable(
          "sonic-the-hedgehog",
          { releaseId: "genesis" },
        )
        const sonicSteam = yield* repository.resolveLaunchForPlayable(
          "sonic-the-hedgehog",
          { releaseId: "steam" },
        )
        const containedGba = yield* repository.resolveLaunchForPlayable(
          "super-mario-advance-2/super-mario-world",
        )
        const localMoonlight =
          yield* repository.resolveLocalLauncherPolicy("moonlight")
        const sonicGenesisConfig = yield* Effect.promise(() =>
          readFile(String(sonicGenesis.artifacts?.paths.configPath), "utf8"),
        )
        const containedGbaConfig = yield* Effect.promise(() =>
          readFile(String(containedGba.artifacts?.paths.configPath), "utf8"),
        )

        return {
          downwell,
          sonicGenesis,
          sonicGenesisConfig,
          sonicSteam,
          containedGba,
          containedGbaConfig,
          localMoonlight,
        }
      }),
    )

    expect(launches.downwell.spec).toEqual({
      command: "steam",
      args: ["steam://rungameid/360740"],
    })
    expect(launches.sonicSteam.spec).toEqual({
      command: "steam",
      args: ["steam://rungameid/71113"],
    })
    expect(launches.sonicGenesis.spec).toEqual({
      command: "retroarch",
      args: [
        "-c",
        expect.stringMatching(/retroarch\.cfg$/),
        "-L",
        "/run/current-system/sw/lib/libretro/genesis_plus_gx_libretro.so",
        "/roms/genesis/Sonic The Hedgehog.md",
      ],
    })
    expect(launches.containedGba.spec).toEqual({
      command: "retroarch",
      args: [
        "-c",
        expect.stringMatching(/retroarch\.cfg$/),
        "-L",
        "/run/current-system/sw/lib/libretro/mgba_libretro.so",
        "/roms/gba/Super Mario Advance 2.gba",
      ],
    })
    expect(launches.sonicGenesisConfig).toContain("aspect_ratio_index = 24")
    expect(launches.sonicGenesisConfig).toContain("video_frame_delay = 0")
    expect(launches.sonicGenesisConfig).toContain("rewind_buffer_size = 20")
    expect(launches.sonicGenesisConfig).toContain(
      'notification_show_autoconfig = "false"',
    )
    expect(launches.containedGbaConfig).toContain('menu_driver = "ozone"')
    expect(launches.containedGbaConfig).toContain(
      'config_save_on_exit = "false"',
    )
    expect(launches.localMoonlight.moonlight).toMatchObject({
      command: "/run/current-system/sw/bin/moonlight",
      stream: {
        resolution: { width: 1280, height: 720 },
        fps: 60,
        bitrateKbps: 12000,
      },
      platform: { name: "v4l2m2m" },
      input: {
        mappingFile:
          "/run/current-system/sw/share/moonlight/gamecontrollerdb.txt",
        touch: { absolute: true, requireBounds: true },
      },
      window: { autoResize: true },
      control: { enable: true, authority: "controller" },
    })
    expect(launches.localMoonlight.gamescope.window?.exposeWayland).toBe(true)
  })

  it("rejects ambiguous and known-only release launches", async () => {
    const result = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        return {
          ambiguous: yield* Effect.exit(
            repository.resolveLaunchForPlayable("sonic-the-hedgehog"),
          ),
          knownOnly: yield* Effect.exit(
            repository.resolveLaunchForPlayable("sonic-the-hedgehog", {
              releaseId: "windows-known",
            }),
          ),
        }
      }),
    )

    expect(result.ambiguous._tag).toBe("Failure")
    expect(String(result.ambiguous)).toContain("AmbiguousRelease")
    expect(result.knownOnly._tag).toBe("Failure")
    expect(String(result.knownOnly)).toContain("ReleaseNotLaunchable")
  })

  it("keeps RetroArch examples on the app-flat generated-config contract", async () => {
    for (const path of RETROARCH_EXAMPLE_PATHS) {
      const example = await readFile(path, "utf8")
      const active = activeYaml(example)
      const parsed = parse(example) as {
        readonly apps?: Record<string, Record<string, unknown>>
      }
      const retroarchApp = parsed.apps?.retroarch

      expect(retroarchApp).toBeDefined()
      expect(() => decodeAppPayload(retroarchApp)).not.toThrow()
      expect(decodeAppPayload(retroarchApp).kind).toBe("retroarch")
      expect(retroarchApp).not.toHaveProperty("retroarch")
      expect(retroarchApp).not.toHaveProperty("integration")
      expect(retroarchApp).not.toHaveProperty("settings")
      expect(active).not.toMatch(/\bintegration\s*:\s*retroarch\b/)
      expect(active).not.toMatch(
        /\bconfigFile:\s*\n(?:\s+[^\n]*\n)*\s+path\s*:/m,
      )
      expect(active).not.toMatch(/\bmode\s*:\s*(path|default)\b/)
    }
  })

  it("does not contain retired persisted-schema vocabulary", async () => {
    const example = await readFile(EXAMPLE_PATH, "utf8")
    const forbidden = [
      /\blauncher\b/i,
      /\bmodules\b/i,
      /\bgames\b/i,
      /\bconfig\.global\b/i,
      /\bprovider\b/i,
      /\bsettings\.appid\b/i,
      /\bcontentPath\b/,
      /\bmodulePath\b/,
      /\benabled\s*:/,
      /\bforceXwayland\s*:/,
      /\bKORRI_MOONLIGHT_[A-Z0-9_]+\b/,
      /\baction\s*:/,
      /\bconfig\s*:/,
      /\bpreset\s*:/,
      /\brequireInputPlumber\s*:/,
      /\bcommands\s*:/,
      /\bruntimeSettings\s*:/,
      /\badaptationSpike\s*:/,
    ]

    for (const pattern of forbidden) {
      expect(example).not.toMatch(pattern)
    }

    const lines = example.split("\n")
    for (const [index, line] of lines.entries()) {
      if (line.trim() !== "gamescope:") continue
      const baseIndent = line.length - line.trimStart().length
      let directChildIndent: number | undefined
      for (const nested of lines.slice(index + 1)) {
        if (nested.trim() === "") continue
        const nestedIndent = nested.length - nested.trimStart().length
        if (nestedIndent <= baseIndent) break
        directChildIndent ??= nestedIndent
        if (nestedIndent !== directChildIndent) continue

        const trimmed = nested.trim()
        expect(trimmed).not.toMatch(
          /^(enabled|args|exposeWayland|forceXwayland)\s*:/,
        )
        expect(trimmed).not.toMatch(
          /^backend\s*:\s*(auto|drm|sdl|openvr|headless|wayland)\s*$/,
        )
      }
    }
  })
})
