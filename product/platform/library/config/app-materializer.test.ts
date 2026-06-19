import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { resolveAppDescriptor } from "./app-integrations"
import {
  cleanupLaunchArtifacts,
  materializeAppLaunch,
} from "./app-materializer"
import type { ResolvedLaunchContext } from "./resolved-launch-context"

const runPromise = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff)

const app = (id: string) =>
  Effect.runSync(
    resolveAppDescriptor({
      appId: id,
      readableLaunchers: new Map(),
      launchers: new Map(),
    }),
  )

const context: ResolvedLaunchContext = {
  gameId: "porklike",
  launcherId: "mame",
  appId: "mame",
  system: "arcade",
  contentPath: "/storage/roms/arcade/game.zip",
  launchCompanions: {
    "@example:wrapper": {
      enable: true,
      backend: { type: "wayland" },
    },
  },
  settings: { joystick: true, video: "opengl" },
}

async function withRoot<T>(fn: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "korri-app-materializer-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("materializeAppLaunch", () => {
  it("fails before writing artifacts when an app needs materialization and no artifact root is configured", async () => {
    const previous = process.env.KORRI_LAUNCH_ARTIFACTS_DIR
    delete process.env.KORRI_LAUNCH_ARTIFACTS_DIR
    try {
      const exit = await Effect.runPromiseExit(
        materializeAppLaunch({ app: app("mame"), context }),
      )
      expect(exit._tag).toBe("Failure")
    } finally {
      if (previous !== undefined) {
        process.env.KORRI_LAUNCH_ARTIFACTS_DIR = previous
      }
    }
  })

  it("materializes MAME and Dolphin isolated config roots", async () => {
    await withRoot(async root => {
      const mame = await runPromise(
        materializeAppLaunch({
          app: app("mame"),
          context,
          artifactsRoot: root,
        }),
      )
      expect(mame.context.configDir).toContain("mame")
      expect(
        await readFile(mame.artifacts?.paths.configPath ?? "", "utf8"),
      ).toContain("joystick = 1")

      const dolphin = await runPromise(
        materializeAppLaunch({
          app: app("dolphin"),
          context: {
            ...context,
            launcherId: "dolphin",
            appId: "dolphin",
            settings: { video_backend: "Vulkan" },
          },
          artifactsRoot: root,
        }),
      )
      expect(dolphin.context.userDir).toContain("dolphin-user")
      expect(
        await readFile(dolphin.artifacts?.paths.configPath ?? "", "utf8"),
      ).toContain("video_backend = Vulkan")
    })
  })

  it("materializes Solarus state isolation even though its argv is direct", async () => {
    await withRoot(async root => {
      const result = await runPromise(
        materializeAppLaunch({
          app: app("solarus"),
          context: {
            ...context,
            launcherId: "solarus",
            appId: "solarus",
          },
          artifactsRoot: root,
        }),
      )
      expect(result.artifacts?.paths.stateDir).toContain("solarus-state")
      expect(result.context.env?.XDG_STATE_HOME).toBe(
        result.artifacts?.paths.stateDir,
      )
    })
  })

  it("fails closed for provider-qualified app kinds without a materializer", async () => {
    const providerApp = Effect.runSync(
      resolveAppDescriptor({
        appId: "@example:host/app",
        readableLaunchers: new Map([
          [
            "@example:host/app",
            {
              id: "@example:host/app",
              plugin: "@example:host",
              command: "example-host",
              args: ["{content.path}"],
            },
          ],
        ]),
        launchers: new Map(),
      }),
    )

    await withRoot(async root => {
      const error = await Effect.runPromise(
        Effect.flip(
          materializeAppLaunch({
            app: providerApp,
            context,
            artifactsRoot: root,
          }),
        ),
      )

      expect(error).toMatchObject({
        _tag: "AppMaterializationFailed",
        appId: "@example:host/app",
      })
      expect((error as { readonly reason: string }).reason).toContain(
        "no launch integration registered",
      )
    })
  })

  it("rejects patches on generic platform materialization", async () => {
    await withRoot(async root => {
      await mkdir(join(root, "patches"), { recursive: true })
      const patch = join(root, "patches", "game.ips")
      await writeFile(patch, "patch")

      const exit = await Effect.runPromiseExit(
        materializeAppLaunch({
          app: app("dolphin"),
          context: { ...context, patches: [patch] },
          artifactsRoot: root,
        }),
      )

      expect(exit._tag).toBe("Failure")
    })
  })
})

describe("cleanupLaunchArtifacts", () => {
  it("removes materialized artifact roots", async () => {
    await withRoot(async root => {
      const artifactRoot = join(root, "artifacts")
      await mkdir(artifactRoot, { recursive: true })
      await writeFile(join(artifactRoot, "file"), "artifact")

      await runPromise(
        cleanupLaunchArtifacts({ root: artifactRoot, paths: { file: "file" } }),
      )

      await expect(
        readFile(join(artifactRoot, "file"), "utf8"),
      ).rejects.toThrow()
    })
  })
})
