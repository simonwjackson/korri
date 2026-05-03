import { afterEach, describe, expect, it } from "bun:test"
import { appRpcGroup } from "@shared/api/rpc/app-rpc-group"
import { NotFoundError } from "@shared/api/rpc/errors"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { createRocknixSource } from "@shared/library/rocknix/rocknix-source"
import { createShellLauncher } from "@shared/library/shell-launcher"
import { Cause, Effect, Exit, Layer } from "effect"
import { withTempLibrary } from "../../../../../tools/testing/library/with-temp-library"

import { handleLaunchLibrary } from "./launch.rpc-handler"

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

async function layerForFakeGame(exitCode: number): Promise<{
  layer: Layer.Layer<LibrarySource | Launcher>
}> {
  const lib = await withTempLibrary({
    systems: [
      {
        name: "snes",
        defaultEmulator: "retroarch",
        defaultCore: "snes9x",
        extension: [".smc"],
        games: [{ path: "echo.smc", name: "Echo" }],
      },
    ],
  })
  cleanups.push(lib.cleanup)

  const source = createRocknixSource({
    gamelistRoots: [lib.rootDir],
    esSystemsPath: lib.esSystemsPath,
    launchCommand: lib.launchCommand,
  })

  const realLauncher = createShellLauncher()
  const sourceLayer = Layer.succeed(LibrarySource)({
    list: () => Effect.tryPromise(() => source.list()),
    launchSpecFor: id => Effect.tryPromise(() => source.launchSpecFor(id)),
  })
  const launcherLayer = Layer.succeed(Launcher)({
    run: spec =>
      Effect.tryPromise({
        try: () =>
          realLauncher.run({
            ...spec,
            env: {
              ...(spec.env ?? {}),
              KORRI_FAKE_GAME_EXIT: String(exitCode),
            },
          }),
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })

  return { layer: Layer.merge(sourceLayer, launcherLayer) }
}

describe("app.library.launch handler (configured-real launcher + fake-game.sh)", () => {
  it("returns { status: 'launched' } for a known id with KORRI_FAKE_GAME_EXIT=0", async () => {
    const { layer } = await layerForFakeGame(0)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual({ status: "launched" })
  })

  it("returns { status: 'failed', exitCode } and includes argv echoed by fake-game.sh in stderrTail", async () => {
    const { layer } = await layerForFakeGame(7)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toContain("-Psnes")
      expect(result.stderrTail).toContain("--core=snes9x")
      expect(result.stderrTail).toContain("--emulator=retroarch")
    }
  })

  it("fails with NotFoundError for unknown id (no spawn)", async () => {
    const { layer } = await layerForFakeGame(0)
    const exit = await Effect.runPromiseExit(
      handleLaunchLibrary({ id: "snes/does-not-exist.smc" }).pipe(
        Effect.provide(layer),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(NotFoundError)
    }
  })

  it("integration: the launch RPC's tag is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.launch")
  })
})
