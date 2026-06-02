import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
        args: ["content with spaces.smc"],
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
      expect(result.reason).toBe("GameNotFound")
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
      expect(result.reason).toBe("LauncherUnresolvable")
    }
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

      expect(result).toMatchObject({
        status: "resolved",
        app: { id: "retroarch", integration: "retroarch" },
        module: { id: "fake08", path: "/etc/korri/cores/fake08_libretro.so" },
        settings: { video_driver: "glcore", video_scale_integer: true },
      })
      if (result.status === "resolved") {
        expect(typeof result.artifacts?.paths.configPath).toBe("string")
      }
    })
  })
})
