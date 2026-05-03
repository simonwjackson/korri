import { afterEach, describe, expect, it } from "bun:test"
import { appRpcGroup } from "@shared/api/rpc/app-rpc-group"
import { NotFoundError } from "@shared/api/rpc/errors"
import {
  configureLibraryContextForTesting,
  resetLibraryContextForTesting,
} from "@shared/library/library-context"
import { createRocknixSource } from "@shared/library/rocknix/rocknix-source"
import { createShellLauncher } from "@shared/library/shell-launcher"
import { Cause, Effect, Exit } from "effect"
import { withTempLibrary } from "../../../../../tools/testing/library/with-temp-library"

import { handleLaunchLibrary } from "./launch.rpc-handler"

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  resetLibraryContextForTesting()
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

async function configureForFakeGame(exitCode: number): Promise<{
  rootDir: string
  cleanup: () => Promise<void>
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

  // Wrap the real launcher so we can inject KORRI_FAKE_GAME_EXIT into the
  // env on every spawn, without touching process.env globally.
  const realLauncher = createShellLauncher()
  const launcher = {
    run: (spec: Parameters<typeof realLauncher.run>[0]) =>
      realLauncher.run({
        ...spec,
        env: { ...(spec.env ?? {}), KORRI_FAKE_GAME_EXIT: String(exitCode) },
      }),
  }

  configureLibraryContextForTesting({
    source: createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    }),
    launcher,
  })
  return { rootDir: lib.rootDir, cleanup: lib.cleanup }
}

describe("app.library.launch handler (configured-real launcher + fake-game.sh)", () => {
  it("returns { status: 'launched' } for a known id with KORRI_FAKE_GAME_EXIT=0", async () => {
    await configureForFakeGame(0)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }),
    )
    expect(result).toEqual({ status: "launched" })
  })

  it("returns { status: 'failed', exitCode } and includes argv echoed by fake-game.sh in stderrTail", async () => {
    await configureForFakeGame(7)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }),
    )
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      // fake-game.sh writes "argv: <token>" lines for each argv element.
      // The launcher is real; the spec composer is real; the script is
      // real. If any of the three regresses, this assertion catches it.
      expect(result.stderrTail).toContain("-Psnes")
      expect(result.stderrTail).toContain("--core=snes9x")
      expect(result.stderrTail).toContain("--emulator=retroarch")
    }
  })

  it("fails with NotFoundError for unknown id (no spawn)", async () => {
    await configureForFakeGame(0)
    const exit = await Effect.runPromiseExit(
      handleLaunchLibrary({ id: "snes/does-not-exist.smc" }),
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
