import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  materializeSteamDesiredState,
  parseVdf,
  type SteamLifecycle,
  type SteamStateFileSystem,
  type SteamStateLock,
  steamConfigPath,
  steamLocalConfigPath,
} from "./steam-state-materializer"

const memoryFs = (initial: Readonly<Record<string, string>> = {}) => {
  const files = new Map(Object.entries(initial))
  const writes: string[] = []
  const fs: SteamStateFileSystem = {
    readText: async path => files.get(path),
    writeTextAtomic: async (path, content) => {
      writes.push(path)
      files.set(path, content)
    },
    mkdirp: async () => {},
  }
  return { fs, files, writes }
}

const lifecycle = (events: string[]): SteamLifecycle => ({
  shutdown: async () => {
    events.push("shutdown")
  },
  waitForShutdown: async () => {
    events.push("wait-shutdown")
  },
  start: async input => {
    events.push(`start:${input.args.join(" ")}`)
  },
  waitUntilReady: async () => {
    events.push("ready")
  },
})

const inlineLock: SteamStateLock = {
  withLock: async (_key, run) => run(),
}

describe("materializeSteamDesiredState", () => {
  it("reasserts LaunchOptions and compat-tool mapping before returning applaunch", async () => {
    const stateRoot = "/steam-home"
    const events: string[] = []
    const { fs, files, writes } = memoryFs()

    const result = await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          command: "steam",
          target: "steam://rungameid/2379780",
          launchOptions: "gamescope -- %command%",
          runtime: {
            id: "proton-arm64",
            path: "/compat/proton-arm64",
            tool: "proton-arm64",
          },
          extraArgs: ["-silent", "-gamepadui"],
        },
        fs,
        lifecycle: lifecycle(events),
        lock: inlineLock,
      }),
    )

    expect(result.spec).toEqual({
      command: "steam",
      args: ["-applaunch", "2379780"],
    })
    expect(events).toEqual([
      "shutdown",
      "wait-shutdown",
      "start:-silent -gamepadui",
      "ready",
    ])
    expect(writes).toEqual([
      steamLocalConfigPath(stateRoot),
      steamConfigPath(stateRoot),
    ])
    expect(
      parseVdf(files.get(steamLocalConfigPath(stateRoot)) ?? ""),
    ).toMatchObject({
      UserLocalConfigStore: {
        Software: {
          Valve: {
            Steam: {
              apps: {
                "2379780": { LaunchOptions: "gamescope -- %command%" },
              },
            },
          },
        },
      },
    })
    expect(parseVdf(files.get(steamConfigPath(stateRoot)) ?? "")).toMatchObject(
      {
        InstallConfigStore: {
          Software: {
            Valve: {
              Steam: {
                CompatToolMapping: {
                  "2379780": {
                    name: "proton-arm64",
                    config: "",
                    priority: "250",
                  },
                },
              },
            },
          },
        },
      },
    )
  })

  it("fails malformed VDF before clobbering persistent state", async () => {
    const stateRoot = "/steam-home"
    const localconfig = steamLocalConfigPath(stateRoot)
    const { fs, files, writes } = memoryFs({ [localconfig]: '"broken"\n{\n' })

    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot,
            target: "steam://rungameid/2379780",
            launchOptions: "%command%",
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "SteamStateMutationFailed" })
    expect(writes).toEqual([])
    expect(files.get(localconfig)).toBe('"broken"\n{\n')
  })

  it("fails selected runtimes without a Steam tool name", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot: "/steam-home",
            target: "steam://rungameid/2379780",
            runtime: { id: "proton", path: "/compat/proton" },
          },
          fs: memoryFs().fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "SteamRuntimeToolMissing" })
  })

  it("serializes concurrent materializations through the injected lock", async () => {
    const order: string[] = []
    let tail = Promise.resolve()
    const lock: SteamStateLock = {
      withLock: async (key, run) => {
        const previous = tail
        let release!: () => void
        tail = new Promise<void>(resolve => {
          release = resolve
        })
        await previous
        order.push(`enter:${key}`)
        try {
          return await run()
        } finally {
          order.push(`exit:${key}`)
          release()
        }
      },
    }

    await Promise.all([
      Effect.runPromise(
        materializeSteamDesiredState({
          desired: {
            stateRoot: "/steam-home",
            target: "steam://rungameid/1",
            launchOptions: "%command%",
          },
          fs: memoryFs().fs,
          lifecycle: lifecycle(order),
          lock,
        }),
      ),
      Effect.runPromise(
        materializeSteamDesiredState({
          desired: {
            stateRoot: "/steam-home",
            target: "steam://rungameid/2",
            launchOptions: "%command%",
          },
          fs: memoryFs().fs,
          lifecycle: lifecycle(order),
          lock,
        }),
      ),
    ])

    expect(order).toEqual([
      "enter:/steam-home",
      "shutdown",
      "wait-shutdown",
      "start:",
      "ready",
      "exit:/steam-home",
      "enter:/steam-home",
      "shutdown",
      "wait-shutdown",
      "start:",
      "ready",
      "exit:/steam-home",
    ])
  })
})
