import { describe, expect, it } from "bun:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import {
  materializeReadableRetroArchLaunch,
  retroarchReadableLaunchIntegration,
} from "./materializer"
import { KORRI_RETROARCH_APP_ID, KORRI_RETROARCH_PLUGIN_ID } from "./plugin"

const runPromise = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff)

async function withRoot<T>(fn: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "korri-retroarch-materializer-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const readableContext: ReadableResolvedLaunchContext = {
  playableId: "sonic",
  itemId: "sonic",
  releaseId: "genesis",
  system: "genesis",
  target: "genesis/Sonic.md",
  app: {
    id: KORRI_RETROARCH_APP_ID,
    plugin: KORRI_RETROARCH_PLUGIN_ID,
    command: "retroarch",
  },
  runtime: {
    id: "genesis-plus-gx",
    kind: "libretro-core",
    path: "/cores/genesis_plus_gx_libretro.so",
  },
  content: { path: "/games/genesis/Sonic.md" },
  launchCompanions: { "@example:wrapper": { enable: false } },
  plugin: {
    [KORRI_RETROARCH_PLUGIN_ID]: {
      configFile: { mode: "generated" },
      video: { aspectRatio: "full" },
      extraSettings: { video_frame_delay: 0 },
    },
  },
}

describe("retroarchReadableLaunchIntegration", () => {
  it("advertises provider ownership and the stable reporting label", () => {
    expect(retroarchReadableLaunchIntegration.providerId).toBe(
      KORRI_RETROARCH_PLUGIN_ID,
    )
    expect(retroarchReadableLaunchIntegration.kind).toBe(
      KORRI_RETROARCH_PLUGIN_ID,
    )
    expect(retroarchReadableLaunchIntegration.integration).toBe("retroarch")
  })

  it("requires content, libretro core, and decodable plugin policy", () => {
    expect(retroarchReadableLaunchIntegration.canResolve(readableContext)).toBe(
      true,
    )
    expect(
      retroarchReadableLaunchIntegration.canResolve({
        ...readableContext,
        runtime: undefined,
      }),
    ).toBe(false)
    expect(
      retroarchReadableLaunchIntegration.canResolve({
        ...readableContext,
        content: undefined,
      }),
    ).toBe(false)
    const nonLibretroRuntime = {
      id: "not-a-core",
      kind: "tool" as const,
      path: "/tools/not-a-core",
    }
    expect(
      retroarchReadableLaunchIntegration.canResolve({
        ...readableContext,
        runtime: nonLibretroRuntime,
      }),
    ).toBe(false)
    expect(
      retroarchReadableLaunchIntegration.canResolve({
        ...readableContext,
        runtime: nonLibretroRuntime,
        plugin: {
          [KORRI_RETROARCH_PLUGIN_ID]: {
            core: { path: "/cores/override.so" },
          },
        },
      }),
    ).toBe(false)
    expect(
      retroarchReadableLaunchIntegration.canResolve({
        ...readableContext,
        plugin: {
          [KORRI_RETROARCH_PLUGIN_ID]: { configFile: { mode: "path" } },
        },
      }),
    ).toBe(false)
  })
})

describe("materializeReadableRetroArchLaunch", () => {
  it("writes a generated config and typed RetroArch argv", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: readableContext,
          artifactsRoot: root,
        }),
      )

      expect(result.spec).toEqual({
        command: "retroarch",
        args: [
          "-c",
          expect.stringMatching(/retroarch\.cfg$/),
          "-L",
          "/cores/genesis_plus_gx_libretro.so",
          "/games/genesis/Sonic.md",
        ],
      })
      expect(result.artifacts?.paths.configPath).toBe(result.spec.args[1])
      const config = await readFile(String(result.spec.args[1]), "utf8")
      expect(config).toContain("aspect_ratio_index = 24")
      expect(config).toContain("video_frame_delay = 0")
    })
  })

  it("resolves relative log files under launch artifact logs", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            plugin: {
              [KORRI_RETROARCH_PLUGIN_ID]: {
                logging: { verbose: true, logFile: "retroarch.log" },
              },
            },
          },
          artifactsRoot: root,
        }),
      )

      expect(result.spec.args).toContain(
        `--log-file=${join(result.artifacts?.root ?? "", "logs", "retroarch.log")}`,
      )
    })
  })

  it("uses explicit content.path overrides instead of release content", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            plugin: {
              [KORRI_RETROARCH_PLUGIN_ID]: {
                content: { path: "/override/Sonic.md" },
              },
            },
          },
          artifactsRoot: root,
        }),
      )

      expect(result.spec.args.at(-1)).toBe("/override/Sonic.md")
    })
  })

  it("stages patched content and sidecars as symlinks", async () => {
    await withRoot(async root => {
      const rom = join(root, "roms", "game.gba")
      const patch = join(root, "patches", "color.ips")
      await mkdir(join(root, "roms"), { recursive: true })
      await mkdir(join(root, "patches"), { recursive: true })
      await writeFile(rom, "rom")
      await writeFile(patch, "patch")

      const result = await runPromise(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            system: "gba",
            content: { path: rom },
            patches: [patch],
            plugin: {
              [KORRI_RETROARCH_PLUGIN_ID]: {
                paths: { savefileDirectory: "/custom/saves" },
              },
            },
          },
          artifactsRoot: join(root, "artifacts"),
        }),
      )

      expect(await readlink(result.artifacts?.paths.contentPath ?? "")).toBe(
        rom,
      )
      expect(await readlink(result.artifacts?.paths.patch0 ?? "")).toBe(patch)
      expect(result.spec.args.at(-1)).toBe(result.artifacts?.paths.contentPath)
      const config = await readFile(
        String(result.artifacts?.paths.configPath),
        "utf8",
      )
      expect(config).toContain('savefile_directory = "/custom/saves"')
      expect(config).toContain("savestate_directory")
    })
  })

  it("fails before writing config when runtime is not a libretro core", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        materializeReadableRetroArchLaunch({
          context: {
            ...readableContext,
            runtime: {
              id: "not-a-core",
              kind: "tool" as const,
              path: "/tools/not-a-core",
            },
          },
          artifactsRoot: tmpdir(),
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "AppMaterializationFailed",
      appId: KORRI_RETROARCH_APP_ID,
    })
    expect((error as { readonly reason: string }).reason).toContain(
      "requires a libretro-core runtime",
    )
  })

  it("fails before writing config when runtime or content is missing", async () => {
    await withRoot(async root => {
      const noRuntime = await Effect.runPromiseExit(
        materializeReadableRetroArchLaunch({
          context: { ...readableContext, runtime: undefined },
          artifactsRoot: root,
        }),
      )
      const noContent = await Effect.runPromiseExit(
        materializeReadableRetroArchLaunch({
          context: { ...readableContext, content: undefined },
          artifactsRoot: root,
        }),
      )

      expect(noRuntime._tag).toBe("Failure")
      expect(noContent._tag).toBe("Failure")
    })
  })
})
