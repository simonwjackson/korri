import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"
import { parse } from "yaml"

import { decodeAppPayload } from "../records/app"
import { decodeLibraryItemPayload } from "../records/library-item"
import { decodeRuntimePayload } from "../records/runtime"
import { decodeSystemPayload } from "../records/system"

const EXAMPLE_PATH = "korri-catalog-display-metadata.example.yaml"
const HOOKS_FIXTURE_PATH =
  "product/platform/library/config/fixtures/hooks.korri.yaml"
const RETROARCH_EXAMPLE_PATHS = [
  "docs/brainstorms/2026-06-08-004-retroarch-policy-minimal-v1.example.yaml",
  "docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml",
] as const
const STEAM_EXAMPLE_PATHS = [
  "product/platform/library/config/fixtures/steam-full.korri.yaml",
  "docs/brainstorms/2026-06-11-001-steam-readable-library-example.korri.yaml",
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
  examplePath: string = EXAMPLE_PATH,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-readable-example-"))
  try {
    const example = await readFile(examplePath, "utf8")
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

  it("fails closed for provider-qualified launches without registered integrations", async () => {
    const launches = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        const downwell = yield* Effect.exit(
          repository.resolveLaunchForPlayable("downwell"),
        )
        const sonicGenesis = yield* Effect.exit(
          repository.resolveLaunchForPlayable("sonic-the-hedgehog", {
            releaseId: "genesis",
          }),
        )
        const sonicSteam = yield* Effect.exit(
          repository.resolveLaunchForPlayable("sonic-the-hedgehog", {
            releaseId: "steam",
          }),
        )
        const containedGba = yield* Effect.exit(
          repository.resolveLaunchForPlayable(
            "super-mario-advance-2/super-mario-world",
          ),
        )
        const localMoonlight =
          yield* repository.resolveLocalLauncherPolicy("moonlight")

        return {
          downwell,
          sonicGenesis,
          sonicSteam,
          containedGba,
          localMoonlight,
        }
      }),
    )

    expect(launches.downwell._tag).toBe("Failure")
    expect(launches.sonicGenesis._tag).toBe("Failure")
    expect(launches.sonicSteam._tag).toBe("Failure")
    expect(launches.containedGba._tag).toBe("Failure")
    expect(launches.localMoonlight.moonlight).toMatchObject({
      command: "/run/current-system/sw/bin/moonlight",
      stream: {
        resolution: {
          min: { width: 640, height: 360 },
          start: { width: 1280, height: 720 },
          max: { width: 1920, height: 1080 },
        },
        fps: 120,
        bitrateKbps: { min: 500, start: 6000, max: 40000 },
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
    const wrapperProvider = `@korri:${["game", "scope"].join("")}`
    const companions = launches.localMoonlight.launchCompanions as Readonly<
      Record<string, unknown>
    >
    expect(
      (
        companions[wrapperProvider] as
          | { readonly window?: { readonly exposeWayland?: boolean } }
          | undefined
      )?.window?.exposeWayland,
    ).toBe(true)
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

  it("keeps RetroArch examples on the launcher generated-config contract", async () => {
    for (const path of RETROARCH_EXAMPLE_PATHS) {
      const example = await readFile(path, "utf8")
      const active = activeYaml(example)
      const parsed = parse(example) as {
        readonly launchers?: Record<string, Record<string, unknown>>
      }
      const retroarchLauncher =
        parsed.launchers?.["@korri:retroarch/retroarch"] ??
        parsed.launchers?.retroarch

      expect(retroarchLauncher).toBeDefined()
      if (retroarchLauncher === undefined) continue
      const decoded = Effect.try({
        try: () => decodeAppPayload(retroarchLauncher),
        catch: error => error,
      })
      const result = Effect.runSyncExit(decoded)
      if (result._tag === "Success") {
        expect(result.value.plugin).toMatch(/^(@korri:)?retroarch$/)
        expect(retroarchLauncher).not.toHaveProperty("retroarch")
        expect(retroarchLauncher).not.toHaveProperty("integration")
      }
      expect(active).not.toMatch(/\bintegration\s*:\s*retroarch\b/)
      expect(active).not.toMatch(
        /\bconfigFile:\s*\n(?:\s+[^\n]*\n)*\s+path\s*:/m,
      )
      expect(active).not.toMatch(/\bmode\s*:\s*(path|default)\b/)
    }
  })

  it("keeps Steam examples on the launchers-by-id authoring contract", async () => {
    for (const path of STEAM_EXAMPLE_PATHS) {
      const example = await readFile(path, "utf8")
      const parsed = parse(example) as {
        readonly systems?: Record<string, Record<string, unknown>>
        readonly launchers?: Record<string, Record<string, unknown>>
        readonly runtimes?: Record<string, Record<string, unknown>>
        readonly library?: Record<string, Record<string, unknown>>
      }

      const steamApp = decodeAppPayload(
        parsed.launchers?.["@korri:steam/steam"],
      )
      expect(steamApp.plugin).toBe("@korri:steam")
      expect(steamApp.settings?.plugin).toMatchObject({
        state: { root: "{storage:@korri:steam/steam}" },
      })
      expect(
        (steamApp.settings?.plugin as { readonly "launch-options"?: string })?.[
          "launch-options"
        ],
      ).toContain("%command%")
      expect(decodeSystemPayload(parsed.systems?.steam)).toMatchObject({
        name: "Steam",
      })
      expect(decodeRuntimePayload(parsed.runtimes?.["proton-arm64"]).tool).toBe(
        "proton-arm64",
      )
      expect(
        Object.values(parsed.library ?? {}).some(item =>
          decodeLibraryItemPayload(item).releases.some(
            release =>
              release.target?.kind === "provider-ref" &&
              release.target.provider === "@korri:steam" &&
              release.target.ref === "2379780" &&
              release.launch?.use === "@korri:steam/steam",
          ),
        ),
      ).toBe(true)
      for (const item of Object.values(parsed.library ?? {})) {
        for (const release of decodeLibraryItemPayload(item).releases) {
          expect(release).not.toHaveProperty("apps")
        }
      }
    }
  })

  it("round-trips the hooks authoring fixture with the documented fold ordering", async () => {
    const resolved = await withExampleLibrary(
      ({ repository }) =>
        repository.resolveLaunchForPlayable("wonder-demo", {
          releaseId: "gba",
        }),
      HOOKS_FIXTURE_PATH,
    )

    // `before` is execution order: host inline hooks outermost, then the
    // release layer — profile steps (via `use`) ahead of its inline steps.
    expect(resolved.hooks?.before.map(step => step.name)).toEqual([
      "display-60hz",
      "cap-clocks",
      "mark-session",
    ])
    // `after` stays in inheritance order; the executor reverses it so
    // teardown unwinds release → host.
    expect(resolved.hooks?.after.map(step => step.name)).toEqual([
      "display-120hz",
      "restore-clocks",
      "clear-session",
    ])

    const capClocks = resolved.hooks?.before.find(
      step => step.name === "cap-clocks",
    )
    // Multiline block scalar survives the round trip as one script.
    expect(capClocks?.run).toContain(
      "echo 1171200 | sudo -n tee /sys/devices/system/cpu/cpufreq/policy3/scaling_max_freq\n",
    )
    expect(capClocks?.run).toContain(
      "echo 220000000 | sudo -n tee /sys/class/devfreq/gpu/max_freq",
    )
    expect(capClocks?.["on-failure"]).toBe("warn")

    // Named `use` references resolve away before the fold — the resolved
    // artifact carries fully-expanded steps only.
    expect(resolved.hooks).not.toHaveProperty("use")
  })

  it("does not contain retired persisted-schema vocabulary", async () => {
    const example = await readFile(EXAMPLE_PATH, "utf8")
    const forbidden = [
      /\blauncher\b/i,
      /\bmodules\b/i,
      /\bgames\b/i,
      /\bconfig\.global\b/i,
      /\bsettings\.appid\b/i,
      /\bcontentPath\b/,
      /\bmodulePath\b/,
      /\benabled\s*:/,
      /\bforceXwayland\s*:/,
      /\bKORRI_MOONLIGHT_[A-Z0-9_]+\b/,
      /\baction\s*:/,
      // Retired top-level `config:` root. Nested `config:` is valid vocabulary
      // now (e.g. release.launch.overrides.config, launcher configFile).
      /^config\s*:/m,
      /\bpreset\s*:/,
      /\brequireInputPlumber\s*:/,
      /\bcommands\s*:/,
      /\bruntimeSettings\s*:/,
      /\badaptationSpike\s*:/,
      /^\s*wrapper\s*:/m,
    ]

    for (const pattern of forbidden) {
      expect(example).not.toMatch(pattern)
    }

    // Regression guard: `hooks` is live vocabulary — the hooks authoring
    // fixture must never trip the retired-vocabulary list.
    const hooksFixture = await readFile(HOOKS_FIXTURE_PATH, "utf8")
    for (const pattern of forbidden) {
      expect(hooksFixture).not.toMatch(pattern)
    }

    const lines = example.split("\n")
    for (const [index, line] of lines.entries()) {
      if (line.trim() !== '"@example:wrapper":') continue
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
