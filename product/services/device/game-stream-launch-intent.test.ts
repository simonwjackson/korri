import { describe, expect, it } from "bun:test"
import {
  chmod,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  createFileGameStreamLaunchIntentStore,
  createLaunchIntent,
  decodeLaunchIntent,
  defaultGameStreamIntentPath,
} from "./game-stream-launch-intent"

const launch: LaunchSpec = {
  command: "/nix/store/firefox/bin/firefox",
  args: ["https://korri.local"],
  env: { KORRI_TEST: "1" },
  cwd: "/tmp",
}
const companionProvider = "@test:wrapper" as const

describe("game stream launch intent store", () => {
  it("uses the runtime directory as the default intent path", () => {
    expect(
      defaultGameStreamIntentPath({ XDG_RUNTIME_DIR: "/run/user/1000" }),
    ).toBe("/run/user/1000/korri-game-stream/next-launch.json")
    expect(
      defaultGameStreamIntentPath({
        KORRI_GAME_STREAM_INTENT_PATH: "/tmp/custom.json",
      }),
    ).toBe("/tmp/custom.json")
    expect(() => defaultGameStreamIntentPath({})).toThrow("XDG_RUNTIME_DIR")
  })

  it("atomically enqueues, claims, and completes one arbitrary launch intent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const intent = createLaunchIntent(launch)

    await store.enqueue(intent)

    expect((await stat(intentPath)).mode & 0o777).toBe(0o600)
    const claim = await store.claim()
    expect(claim?.intent).toEqual(intent)
    await claim?.complete()
    await expect(store.claim()).resolves.toBeUndefined()
  })

  it("preserves launch env and envUnset across enqueue/claim", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const moonlightLaunch: LaunchSpec = {
      command: "/nix/store/moonlight/bin/moonlight",
      args: ["stream", "-app", "Korri Stream", "aka.local"],
      env: { MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/session/control.sock" },
      envUnset: ["OLD_MOONLIGHT_STATE_HOME"],
    }
    const intent = createLaunchIntent(moonlightLaunch)

    await store.enqueue(intent)

    const claim = await store.claim()
    expect(claim?.intent.launch).toEqual(moonlightLaunch)
    await claim?.complete()
  })

  it("preserves launch-scoped artifact metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const intent = createLaunchIntent(launch, {
      artifacts: {
        root: "/tmp/korri-launch-artifacts/session",
        paths: {
          contentPath: "/tmp/korri-launch-artifacts/session/game.gba",
          patch0: "/tmp/korri-launch-artifacts/session/game.ips",
        },
      },
    })

    await store.enqueue(intent)

    const claim = await store.claim()
    expect(claim?.intent.artifacts).toEqual(intent.artifacts)
    await claim?.complete()
  })

  it("preserves resolved launch companion policy", () => {
    const policy = {
      enable: true,
      command: "/run/current-system/sw/bin/korri-wrapper",
    }
    const intent = createLaunchIntent(launch, {
      launchCompanions: { [companionProvider]: policy },
    })

    expect(intent.launchCompanions).toEqual({
      [companionProvider]: policy,
    })
  })

  it("preserves provider-qualified launch metadata separately from launch companion policy", () => {
    const intent = createLaunchIntent(launch, {
      launchCompanions: { [companionProvider]: { enable: true } },
      launchMetadata: {
        appProviderId: "@korri:steam",
        annotations: { "@korri:steam": { steamSession: true } },
      },
    })

    expect(intent.launchCompanions).toEqual({
      [companionProvider]: { enable: true },
    })
    expect(intent.launchMetadata).toEqual({
      appProviderId: "@korri:steam",
      annotations: { "@korri:steam": { steamSession: true } },
    })
    expect(JSON.stringify(intent)).not.toContain("appIntegration")
  })

  it("rejects retired app integration launch intents", () => {
    expect(() =>
      decodeLaunchIntent({
        ...createLaunchIntent(launch),
        appIntegration: "steam",
      }),
    ).toThrow("appIntegration is retired")
  })

  it("rejects malformed provider-qualified launch metadata", () => {
    expect(() =>
      decodeLaunchIntent({
        ...createLaunchIntent(launch),
        launchMetadata: { appProviderId: "steam" },
      }),
    ).toThrow("appProviderId must be a provider id")
    expect(() =>
      decodeLaunchIntent({
        ...createLaunchIntent(launch),
        launchMetadata: { annotations: { steam: {} } },
      }),
    ).toThrow("annotation provider must be a provider id")
  })

  it("drops empty launch companion maps", () => {
    expect(
      createLaunchIntent(launch, { launchCompanions: {} }).launchCompanions,
    ).toBeUndefined()
  })

  it("does not delete a newer pending intent when completing an older claim", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const first = createLaunchIntent({ command: "/bin/first", args: [] })
    const second = createLaunchIntent({ command: "/bin/second", args: [] })

    await store.enqueue(first)
    const firstClaim = await store.claim()
    await store.enqueue(second)
    await firstClaim?.complete()

    const secondClaim = await store.claim()
    expect(secondClaim?.intent).toEqual(second)
  })

  it("uses latest enqueue wins semantics for a single pending intent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const first = createLaunchIntent({ command: "/bin/first", args: [] })
    const second = createLaunchIntent({ command: "/bin/second", args: [] })

    await store.enqueue(first)
    await store.enqueue(second)

    const claim = await store.claim()
    expect(claim?.intent).toEqual(second)
    await claim?.complete()
    await expect(store.claim()).resolves.toBeUndefined()
  })

  it("ignores stale retired launch companion fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    await writeFile(
      intentPath,
      JSON.stringify({
        ...createLaunchIntent(launch),
        retiredWrapper: { enabled: true },
      }),
      { mode: 0o600 },
    )

    const claim = await store.claim()
    expect(claim?.intent.launchCompanions).toBeUndefined()
  })

  it("rejects relative launch artifact metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    await writeFile(
      intentPath,
      JSON.stringify({
        ...createLaunchIntent(launch),
        artifacts: {
          root: "relative-root",
          paths: { contentPath: "/tmp/game.gba" },
        },
      }),
      { mode: 0o600 },
    )

    await expect(store.claim()).rejects.toThrow(
      "launch artifacts root must be an absolute path",
    )
  })

  it("rejects relative launch intent commands", async () => {
    expect(() => createLaunchIntent({ command: "nix", args: ["run"] })).toThrow(
      "LaunchSpec.command must be absolute",
    )

    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    await writeFile(
      intentPath,
      JSON.stringify({
        version: 1,
        id: "relative-command",
        createdAt: new Date().toISOString(),
        lifecycle: "foreground",
        launch: { command: "nix", args: ["run"] },
      }),
      { mode: 0o600 },
    )

    await expect(store.claim()).rejects.toThrow(
      "LaunchSpec.command must be absolute",
    )
  })

  it("rejects relative wait intent commands", async () => {
    expect(() =>
      createLaunchIntent(launch, {
        lifecycle: "session",
        wait: { command: "steam", args: [] },
      }),
    ).toThrow("LaunchSpec.command must be absolute")

    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    await writeFile(
      intentPath,
      JSON.stringify({
        version: 1,
        id: "relative-wait-command",
        createdAt: new Date().toISOString(),
        lifecycle: "session",
        launch,
        wait: { command: "steam", args: [] },
      }),
      { mode: 0o600 },
    )

    await expect(store.claim()).rejects.toThrow(
      "LaunchSpec.command must be absolute",
    )
  })

  it("quarantines malformed launch intents instead of wedging future launches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    await writeFile(intentPath, JSON.stringify({ version: 1 }), { mode: 0o600 })

    await expect(store.claim()).rejects.toThrow("launch intent id")
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()

    const valid = createLaunchIntent(launch)
    await store.enqueue(valid)
    await expect(store.claim()).resolves.toMatchObject({ intent: valid })
  })

  it("rejects stale launch intents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath, {
      maxAgeMs: 1,
    })
    await store.enqueue({
      ...createLaunchIntent(launch),
      createdAt: new Date(Date.now() - 10_000).toISOString(),
    })

    await expect(store.claim()).rejects.toThrow("launch intent expired")
    await expect(store.claim()).resolves.toBeUndefined()
  })

  it("requeues a claimed launch intent for retry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const intent = createLaunchIntent(launch)
    await store.enqueue(intent)

    const claim = await store.claim()
    await claim?.requeue()

    const retry = await store.claim()
    expect(retry?.intent).toEqual(intent)
  })

  it("rejects shared parent directories and symlinked intent files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    await chmod(dir, 0o777)
    const sharedStore = createFileGameStreamLaunchIntentStore(
      join(dir, "next-launch.json"),
    )
    await expect(
      sharedStore.enqueue(createLaunchIntent(launch)),
    ).rejects.toThrow("parent must not be group/world accessible")
    await chmod(dir, 0o700)

    const targetPath = join(dir, "target.json")
    const intentPath = join(dir, "next-launch.json")
    await writeFile(targetPath, JSON.stringify(createLaunchIntent(launch)), {
      mode: 0o600,
    })
    await symlink(targetPath, intentPath)

    const symlinkStore = createFileGameStreamLaunchIntentStore(intentPath)
    await expect(symlinkStore.claim()).rejects.toThrow()
  })
})
