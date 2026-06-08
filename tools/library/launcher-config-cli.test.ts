import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { withTempProseqlLibrary } from "../testing/library/with-temp-proseql-library"
import { validateLauncherConfig } from "./launcher-config-cli"

async function withLaunchArtifactsRoot<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-launch-artifacts-"))
  const previous = process.env.KORRI_LAUNCH_ARTIFACTS_DIR
  process.env.KORRI_LAUNCH_ARTIFACTS_DIR = root
  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.KORRI_LAUNCH_ARTIFACTS_DIR
    } else {
      process.env.KORRI_LAUNCH_ARTIFACTS_DIR = previous
    }
    await rm(root, { recursive: true, force: true })
  }
}

describe("validateLauncherConfig", () => {
  it("resolves a game id to a LaunchSpec via the cascade", async () => {
    await using library = await withTempProseqlLibrary({
      systems: [
        {
          id: "snes",
          launcher: "echo",
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

  it("reports LauncherUnresolvable when no launcher is configured", async () => {
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
      expect(result.message).toContain("LauncherUnresolvable")
    }
  })

  it("reports materialized expanded RetroArch policy from the checked-in example", async () => {
    await withLaunchArtifactsRoot(async () => {
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
        })

        if (result.status !== "resolved") throw new Error("expected resolved")
        const generatedConfigArg = result.spec.args[1]
        expect(generatedConfigArg).toEqual(
          expect.stringMatching(/retroarch\.cfg$/),
        )
        expect(result).toMatchObject({
          status: "resolved",
          app: { id: "retroarch", integration: "retroarch" },
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
    await withLaunchArtifactsRoot(async () => {
      await using library = await withTempProseqlLibrary({
        apps: [{ id: "retroarch", settings: { video_driver: "glcore" } }],
        modules: [
          {
            id: "fake08",
            kind: "libretro-core",
            path: "/etc/korri/cores/fake08_libretro.so",
          },
        ],
        systems: [
          {
            id: "pico8",
            launch: {
              app: "retroarch",
              module: "fake08",
              settings: { video_scale_integer: true },
            },
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
      })

      const generatedConfigArg =
        result.status === "resolved" ? result.spec.args[1] : undefined

      expect(result).toMatchObject({
        status: "resolved",
        app: { id: "retroarch", integration: "retroarch" },
        module: { id: "fake08", path: "/etc/korri/cores/fake08_libretro.so" },
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
        expect(result.artifacts?.paths.configPath).toBe(generatedConfigArg)
      }
    })
  })
})
