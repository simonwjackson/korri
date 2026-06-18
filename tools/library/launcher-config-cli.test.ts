import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
} from "@product/plugins/retroarch"
import { withTempProseqlLibrary } from "../testing/library/with-temp-proseql-library"
import { validateLauncherConfig } from "./launcher-config-cli"

async function withLaunchArtifactsRoot<T>(
  fn: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-launch-artifacts-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const retroarchCliEnv = (launchArtifactsRoot: string) => ({
  KORRI_LAUNCH_ARTIFACTS_DIR: launchArtifactsRoot,
  KORRI_ENABLED_PLUGINS: KORRI_RETROARCH_PLUGIN_ID,
})

describe("validateLauncherConfig", () => {
  it("resolves a game id to a LaunchSpec via the cascade", async () => {
    await using library = await withTempProseqlLibrary({
      systems: [
        {
          id: "snes",
          apps: [{ id: "echo", runtime: "snes9x_libretro.so" }],
          cores: { echo: "snes9x_libretro.so" },
        },
      ],
      launchers: [
        {
          id: "echo",
          command: "/bin/echo",
          args: ["{contentPath}"],
          systems: ["snes"],
        },
      ],
      games: [
        {
          id: "game-1",
          system: "snes",
          contentPath: "content with spaces.smc",
          metadata: { name: "Game 1" },
        },
      ],
    })

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "game-1",
    })

    expect(result).toMatchObject({
      status: "resolved",
      gameId: "game-1",
      spec: {
        command: "/bin/echo",
        args: ["/content with spaces.smc"],
      },
    })
  })

  it("reports a GameNotFound diagnostic for an unknown game", async () => {
    await using library = await withTempProseqlLibrary({})

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "missing",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("LibraryError")
      expect(result.message).toContain("PlayableNotFound")
    }
  })

  it("reports ReleaseNotLaunchable when no app choice is configured", async () => {
    await using library = await withTempProseqlLibrary({
      games: [
        {
          id: "game-1",
          system: "snes",
          contentPath: "/storage/roms/game-1.smc",
        },
      ],
    })

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "game-1",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("LibraryError")
      expect(result.message).toContain("ReleaseNotLaunchable")
    }
  })

  it("reports materialized expanded RetroArch policy from the checked-in example", async () => {
    await withLaunchArtifactsRoot(async launchArtifactsRoot => {
      const root = await mkdtemp(join(tmpdir(), "korri-launcher-cli-example-"))
      try {
        await writeFile(
          join(root, "library.yaml"),
          await readFile("korri-catalog-display-metadata.example.yaml", "utf8"),
          "utf8",
        )

        const result = await validateLauncherConfig({
          root,
          gameId: "super-mario-advance-2/super-mario-world",
          env: retroarchCliEnv(launchArtifactsRoot),
        })

        if (result.status !== "resolved") throw new Error("expected resolved")
        const generatedConfigArg = result.spec.args[1]
        expect(generatedConfigArg).toEqual(
          expect.stringMatching(/retroarch\.cfg$/),
        )
        expect(result).toMatchObject({
          status: "resolved",
          app: { id: KORRI_RETROARCH_APP_ID, integration: "retroarch" },
          module: {
            id: "mgba",
            path: "/run/current-system/sw/lib/libretro/mgba_libretro.so",
          },
          spec: {
            command: "retroarch",
            args: [
              "-c",
              generatedConfigArg,
              "-L",
              "/run/current-system/sw/lib/libretro/mgba_libretro.so",
              "/roms/gba/Super Mario Advance 2.gba",
            ],
          },
        })
        expect(result.artifacts?.root).toStartWith(launchArtifactsRoot)
        expect(result.artifacts?.paths.configPath).toBe(generatedConfigArg)
        const config = await readFile(
          String(result.artifacts?.paths.configPath),
          "utf8",
        )
        expect(config).toContain("aspect_ratio_index = 24")
        expect(config).toContain("video_frame_delay = 0")
        expect(config).toContain("rewind_buffer_size = 20")
        expect(config).toContain('notification_show_autoconfig = "false"')
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  })

  it("reports app/module/settings/materialized artifact details for built-in RetroArch", async () => {
    await withLaunchArtifactsRoot(async launchArtifactsRoot => {
      await using library = await withTempProseqlLibrary({
        apps: [
          {
            id: KORRI_RETROARCH_APP_ID,
            kind: KORRI_RETROARCH_PLUGIN_ID,
            command: "retroarch",
            args: [
              "-c",
              "{configPath}",
              "-L",
              "{runtime.path}",
              "{content.path}",
            ],
            plugin: {
              [KORRI_RETROARCH_PLUGIN_ID]: {
                extraSettings: {
                  video_driver: "glcore",
                  video_scale_integer: true,
                },
              },
            },
          },
        ],
        runtimes: [
          {
            id: "@korri:pico8/fake08",
            kind: "libretro-core",
            app: KORRI_RETROARCH_APP_ID,
            path: "/etc/korri/cores/fake08_libretro.so",
            supports: { systems: ["pico8"] },
          },
        ],
        systems: [
          {
            id: "pico8",
            apps: [
              {
                id: KORRI_RETROARCH_APP_ID,
                runtime: "@korri:pico8/fake08",
              },
            ],
          },
        ],
        games: [
          {
            id: "porklike",
            system: "pico8",
            contentPath: "/storage/roms/pico8/porklike.p8",
          },
        ],
      })

      const result = await validateLauncherConfig({
        root: library.root,
        gameId: "porklike",
        env: retroarchCliEnv(launchArtifactsRoot),
      })

      const generatedConfigArg =
        result.status === "resolved" ? result.spec.args[1] : undefined

      expect(result).toMatchObject({
        status: "resolved",
        app: { id: KORRI_RETROARCH_APP_ID, integration: "retroarch" },
        module: {
          id: "@korri:pico8/fake08",
          path: "/etc/korri/cores/fake08_libretro.so",
        },
        spec: {
          command: "retroarch",
          args: [
            "-c",
            expect.stringMatching(/retroarch\.cfg$/),
            "-L",
            "/etc/korri/cores/fake08_libretro.so",
            "/storage/roms/pico8/porklike.p8",
          ],
        },
      })
      if (result.status === "resolved") {
        expect(result.artifacts?.root).toStartWith(launchArtifactsRoot)
        expect(result.artifacts?.paths.configPath).toBe(generatedConfigArg)
      }
    })
  })
})
