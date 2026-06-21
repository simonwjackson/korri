import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LibrarySource } from "@platform/library/library-services"
import { CurrentInstallControl } from "./install-control-authorization"
import { Effect, Layer } from "effect"
import { handleRequestPluginInstall } from "./request.rpc-handler"

const original = {
  enabled: process.env.KORRI_ENABLED_PLUGINS,
  helper: process.env.KORRI_STEAM_APP_INSTALL_HELPER,
}

afterEach(() => {
  restore("KORRI_ENABLED_PLUGINS", original.enabled)
  restore("KORRI_STEAM_APP_INSTALL_HELPER", original.helper)
})

describe("handleRequestPluginInstall", () => {
  it("rejects unauthorized callers before dispatch", async () => {
    const result = await Effect.runPromiseExit(
      handleRequestPluginInstall({
        providerId: "@korri:steam",
        appId: "1029210",
      }).pipe(
        Effect.provide(
          Layer.succeed(CurrentInstallControl, { authorized: false }),
        ),
        Effect.provide(libraryLayer()),
      ),
    )

    expect(result._tag).toBe("Failure")
  })

  it("dispatches authorized requests to the Steam plugin", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"
    const dir = await mkdtemp(join(tmpdir(), "korri-install-helper-"))
    try {
      const helper = join(dir, "helper.sh")
      await writeFile(helper, "#!/bin/sh\nexit 0\n")
      await chmod(helper, 0o755)
      process.env.KORRI_STEAM_APP_INSTALL_HELPER = helper

      const response = await Effect.runPromise(
        handleRequestPluginInstall({
          providerId: "@korri:steam",
          appId: "1029210",
          playableId: "thirty-xx",
        }).pipe(
          Effect.provide(
            Layer.succeed(CurrentInstallControl, { authorized: true }),
          ),
          Effect.provide(libraryLayer()),
        ),
      )

      expect(response.outcome).toBe("accepted")
      expect(response.state).toBe("requested")
      expect(response.providerId).toBe("@korri:steam")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

function libraryLayer() {
  return Layer.succeed(LibrarySource, {
    list: () =>
      Effect.succeed([
        {
          id: "thirty-xx",
          itemId: "thirty-xx",
          title: "30XX",
          launchable: true,
          releases: [
            {
              id: "steam",
              system: "steam",
              launchable: true,
              install: {
                providerId: "@korri:steam",
                appId: "1029210",
                canRequestInstall: true,
              },
            },
          ],
        } as never,
      ]),
    listPlayableEntries: () =>
      Effect.succeed([
        {
          id: "thirty-xx",
          itemId: "thirty-xx",
          title: "30XX",
          launchable: true,
          releases: [
            {
              id: "steam",
              system: "steam",
              launchable: true,
              install: {
                providerId: "@korri:steam",
                appId: "1029210",
                canRequestInstall: true,
              },
            },
          ],
        },
      ]),
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () => Effect.die("not used"),
  })
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
