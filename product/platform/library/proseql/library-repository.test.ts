import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import type { LibraryItemRecord } from "../config/records/library-item"
import { LibraryError } from "../library-services"
import { openKorriLibraryDb } from "./library-db"
import { createLibraryRepository } from "./library-repository"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-readable-repository-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const downwell: LibraryItemRecord = {
  id: "downwell",
  title: "Downwell",
  source: "steam",
  releases: [
    {
      id: "windows",
      system: "windows",
      target: "steam://rungameid/360740",
      app: "steam",
    },
  ],
}

const sonic: LibraryItemRecord = {
  id: "sonic-the-hedgehog",
  title: "Sonic the Hedgehog",
  source: "roms",
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: "genesis/Sonic.md",
      app: "retroarch",
      runtime: "genesis-plus-gx",
    },
    {
      id: "windows-known",
      system: "windows",
      source: "pcgamingwiki",
      display: { aspect: "unrestricted" },
    },
    {
      id: "steam",
      system: "windows",
      source: "steam",
      target: "steam://rungameid/71113",
      app: "steam",
    },
  ],
}

const marioPackage: LibraryItemRecord = {
  id: "super-mario-advance-2",
  title: "Super Mario Advance 2",
  source: "roms",
  contains: {
    "super-mario-world": { title: "Super Mario World" },
  },
  releases: [
    {
      id: "gba",
      system: "gba",
      target: "gba/Super Mario Advance 2.gba",
      app: "retroarch",
      runtime: "mgba",
    },
  ],
}

async function seedReadableLibrary(root: string) {
  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
        yield* db.host.upsert({
          where: { id: "local" },
          create: { id: "local", title: "Test Host" },
          update: { id: "local", title: "Test Host" },
        })
        yield* db.storage.upsert({
          where: { id: "roms" },
          create: { id: "roms", root: "/games" },
          update: { id: "roms", root: "/games" },
        })
        yield* db.sources.upsert({
          where: { id: "roms" },
          create: { id: "roms", kind: ["files"], storage: "roms" },
          update: { id: "roms", kind: ["files"], storage: "roms" },
        })
        yield* db.sources.upsert({
          where: { id: "steam" },
          create: { id: "steam", kind: ["service", "metadata"], app: "steam" },
          update: { id: "steam", kind: ["service", "metadata"], app: "steam" },
        })
        yield* db.sources.upsert({
          where: { id: "pcgamingwiki" },
          create: { id: "pcgamingwiki", kind: ["metadata"] },
          update: { id: "pcgamingwiki", kind: ["metadata"] },
        })
        yield* db.systems.upsert({
          where: { id: "genesis" },
          create: { id: "genesis", name: "Genesis" },
          update: { id: "genesis", name: "Genesis" },
        })
        yield* db.systems.upsert({
          where: { id: "gba" },
          create: { id: "gba", name: "Game Boy Advance" },
          update: { id: "gba", name: "Game Boy Advance" },
        })
        yield* db.systems.upsert({
          where: { id: "windows" },
          create: { id: "windows", name: "Windows" },
          update: { id: "windows", name: "Windows" },
        })
        yield* db.apps.upsert({
          where: { id: "steam" },
          create: { id: "steam", command: "steam", args: ["{target}"] },
          update: { id: "steam", command: "steam", args: ["{target}"] },
        })
        yield* db.apps.upsert({
          where: { id: "retroarch" },
          create: {
            id: "retroarch",
            command: "retroarch",
            args: ["-L", "{runtime.path}", "{content.path}"],
          },
          update: {
            id: "retroarch",
            command: "retroarch",
            args: ["-L", "{runtime.path}", "{content.path}"],
          },
        })
        for (const runtime of [
          {
            id: "genesis-plus-gx",
            kind: "libretro-core" as const,
            path: "/cores/genesis_plus_gx.so",
          },
          {
            id: "mgba",
            kind: "libretro-core" as const,
            path: "/cores/mgba.so",
          },
        ]) {
          yield* db.runtimes.upsert({
            where: { id: runtime.id },
            create: runtime,
            update: runtime,
          })
        }
        for (const item of [downwell, sonic, marioPackage]) {
          yield* db.library.upsert({
            where: { id: item.id },
            create: item,
            update: item,
          })
        }
        return createLibraryRepository(db)
      }),
    ),
  )
}

function expectLibraryConfigFailure(error: unknown, text: string) {
  expect(error).toBeInstanceOf(LibraryError)
  expect((error as LibraryError).reason).toBe("config")
  expect((error as LibraryError).message).toContain(text)
}

describe("createLibraryRepository — readable playable entries", () => {
  it("lists playable entries derived from library items, contains, and ordered releases", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const entries = await Effect.runPromise(repo.listPlayableEntries())

      expect(entries.map(entry => entry.id)).toEqual([
        "downwell",
        "sonic-the-hedgehog",
        "super-mario-advance-2/super-mario-world",
      ])
      expect(
        entries
          .find(entry => entry.id === "sonic-the-hedgehog")
          ?.releases.map(release => release.id),
      ).toEqual(["genesis", "windows-known", "steam"])
      expect(
        entries
          .find(entry => entry.id === "sonic-the-hedgehog")
          ?.releases.map(release => release.launchable),
      ).toEqual([true, false, true])
    })
  })

  it("launches a single launchable release without an explicit release id", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("downwell"),
      )

      expect(resolved.release.id).toBe("windows")
      expect(resolved.spec).toEqual({
        command: "steam",
        args: ["steam://rungameid/360740"],
      })
    })
  })

  it("requires an explicit release id when multiple releases are launchable", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      try {
        await Effect.runPromise(
          repo.resolveLaunchForPlayable("sonic-the-hedgehog"),
        )
        throw new Error("expected ambiguous launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "AmbiguousRelease")
      }
    })
  })

  it("resolves local launcher Moonlight and sibling Gamescope policy from readable host/app layers", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      await Effect.runPromise(
        repo.upsertApp({
          id: "moonlight",
          command: "moonlight",
          args: ["stream"],
          gamescope: { extraArgs: ["--expose-wayland"] },
          moonlight: {
            platform: { name: "v4l2m2m" },
            input: { devices: ["/dev/input/event-app"] },
            extraArgs: ["app"],
          },
        }),
      )
      await Effect.runPromise(
        repo.upsertGlobalConfig({
          title: "Test Host",
          moonlight: {
            environment: { FROM_HOST: "1", UNSET_ME: "1" },
            input: { devices: ["/dev/input/event-host"] },
            extraArgs: ["host"],
          },
        }),
      )

      const policy = await Effect.runPromise(
        repo.resolveLocalLauncherPolicy("moonlight", {
          override: { moonlight: { environment: { UNSET_ME: null } } },
        }),
      )

      expect(policy.gamescope.extraArgs).toEqual(["--expose-wayland"])
      expect(policy.moonlight).toEqual({
        environment: { FROM_HOST: "1", UNSET_ME: null },
        platform: { name: "v4l2m2m" },
        input: {
          devices: ["/dev/input/event-host", "/dev/input/event-app"],
        },
        extraArgs: ["host", "app"],
      })
    })
  })

  it("launches the selected release and resolves file-backed content paths", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable("sonic-the-hedgehog", {
          releaseId: "genesis",
        }),
      )

      expect(resolved.release.id).toBe("genesis")
      expect(resolved.content?.path).toBe("/games/genesis/Sonic.md")
      expect(resolved.spec.args).toEqual([
        "-L",
        "/cores/genesis_plus_gx.so",
        "/games/genesis/Sonic.md",
      ])
    })
  })

  it("applies package releases to contained playable ids", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const resolved = await Effect.runPromise(
        repo.resolveLaunchForPlayable(
          "super-mario-advance-2/super-mario-world",
        ),
      )

      expect(resolved.playable.id).toBe(
        "super-mario-advance-2/super-mario-world",
      )
      expect(resolved.release.id).toBe("gba")
      expect(resolved.content?.path).toBe(
        "/games/gba/Super Mario Advance 2.gba",
      )
    })
  })

  it("keeps known-only releases visible but rejects launching them", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const entries = await Effect.runPromise(repo.listPlayableEntries())
      expect(
        entries
          .find(entry => entry.id === "sonic-the-hedgehog")
          ?.releases.find(release => release.id === "windows-known")
          ?.launchable,
      ).toBe(false)

      try {
        await Effect.runPromise(
          repo.resolveLaunchForPlayable("sonic-the-hedgehog", {
            releaseId: "windows-known",
          }),
        )
        throw new Error("expected known-only launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "ReleaseNotLaunchable")
      }
    })
  })

  it("reports launch selection errors as graceful LibraryError at the public seam", async () => {
    await withTempRoot(async root => {
      const repo = await seedReadableLibrary(root)
      const source = repo.asLibrarySource()
      try {
        await source.resolveLaunchForGame("sonic-the-hedgehog")
        throw new Error("expected launch to fail")
      } catch (error) {
        expectLibraryConfigFailure(error, "AmbiguousRelease")
      }
    })
  })
})
