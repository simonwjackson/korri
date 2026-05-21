import { afterEach, describe, expect, it } from "bun:test"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { ValidationError } from "@shared/api/rpc/errors"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { Cause, Effect, Exit } from "effect"
import { withTempProseqlLibrary } from "../../../../../tools/testing/library/with-temp-proseql-library"
import { handleListSource } from "./list.rpc-handler"

const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  headlessSourceOnly: process.env.KORRI_HEADLESS_SOURCE_ONLY,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("KORRI_HEADLESS_SOURCE_ONLY", originalEnv.headlessSourceOnly)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.source.list handler", () => {
  it("fails closed when stream control is not enabled", async () => {
    await setupLibrary({ enabled: false })

    const exit = await Effect.runPromiseExit(
      handleListSource({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ValidationError)
    }
  })

  it("returns minimal streamable catalog games when enabled", async () => {
    await setupLibrary({ enabled: true })

    const result = await Effect.runPromise(
      handleListSource({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )

    expect(result.games).toEqual([
      { id: "gba/wario-land-4", displayName: "Wario Land 4", streamable: true },
    ])
  })

  // The legacy `KORRI_HEADLESS_SOURCE_ONLY` gate on `app.library.list` was
  // removed in commit 952766d when the desktop refactor codified the
  // server as the library: `app.library.list` and `app.source.list` are
  // peers on the same RPC group, with no env var rejecting either. The
  // test that previously asserted the gate has been deleted with the gate.

  it("integration: app.source.list is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.source.list")
  })
})

async function setupLibrary(options: { readonly enabled: boolean }) {
  const library = await withTempProseqlLibrary({
    games: [
      { id: "gba/wario-land-4", metadata: { name: "Wario Land 4" } },
      { id: "snes/no-launch.sfc", metadata: { name: "No Launch" } },
    ],
    launcherProfiles: [
      {
        id: "nixpkgs.mgba.gba",
        command: "/bin/echo",
        args: ["{contentPath}"],
      },
    ],
    launchTargets: [
      {
        id: "gba/wario-land-4",
        profile: "nixpkgs.mgba.gba",
        contentPath: "/srv/games/wl4.gba",
      },
    ],
  })
  cleanups.push(library.cleanup)
  process.env.KORRI_LIBRARY_ROOT = library.root
  process.env.KORRI_STREAM_CONTROL_ENABLED = options.enabled ? "1" : "0"
  delete process.env.KORRI_HEADLESS_SOURCE_ONLY
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
