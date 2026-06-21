import { afterEach, describe, expect, it } from "bun:test"
import { LibrarySource } from "@platform/library/library-services"
import { Effect, Layer } from "effect"
import { CurrentInstallControl } from "./install-control-authorization"
import { handlePluginInstallStatus } from "./status.rpc-handler"

const original = process.env.KORRI_ENABLED_PLUGINS

afterEach(() => {
  if (original === undefined) delete process.env.KORRI_ENABLED_PLUGINS
  else process.env.KORRI_ENABLED_PLUGINS = original
})

describe("handlePluginInstallStatus", () => {
  it("rejects unauthorized callers", async () => {
    const result = await Effect.runPromiseExit(
      handlePluginInstallStatus({
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

  it("dispatches authorized status reads", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"
    const response = await Effect.runPromise(
      handlePluginInstallStatus({
        providerId: "@korri:steam",
        appId: "1029210",
        requestId: "request-1",
      }).pipe(
        Effect.provide(
          Layer.succeed(CurrentInstallControl, { authorized: true }),
        ),
        Effect.provide(libraryLayer()),
      ),
    )

    expect(response.providerId).toBe("@korri:steam")
    expect(response.appId).toBe("1029210")
  })
})

function libraryLayer() {
  return Layer.succeed(LibrarySource, {
    list: () => Effect.succeed([]),
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
