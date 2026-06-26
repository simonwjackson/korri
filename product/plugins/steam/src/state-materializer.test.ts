import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  materializeSteamDesiredState,
  parseVdf,
  renderVdf,
  steamStateRootProcessRunningInSnapshot,
  type SteamLifecycle,
  type SteamStateFileSystem,
  type SteamStateLock,
  steamConfigPath,
  steamLocalConfigPath,
} from "./state-materializer"
import { applySteamGateSeeds } from "./steam-gate-seed"

const memoryFs = (
  initial: Readonly<Record<string, string>> = {},
  options: {
    readonly directories?: Readonly<Record<string, readonly string[]>>
    readonly existingPaths?: readonly string[]
    readonly executablePaths?: readonly string[]
  } = {},
) => {
  const files = new Map(Object.entries(initial))
  const writes: string[] = []
  const existingPaths = new Set(options.existingPaths ?? [])
  const executablePaths = new Set(options.executablePaths ?? [])
  const enforceExistingPaths = options.existingPaths !== undefined
  const enforceExecutablePaths = options.executablePaths !== undefined
  const fs: SteamStateFileSystem = {
    readText: async path =>
      files.get(path) ??
      (!enforceExistingPaths && path.endsWith("/toolmanifest.vdf")
        ? '"manifest" {}'
        : undefined),
    writeTextAtomic: async (path, content) => {
      writes.push(path)
      files.set(path, content)
    },
    mkdirp: async path => {
      existingPaths.add(path)
    },
    listDirectories: async path => options.directories?.[path] ?? [],
    pathExists: async path =>
      enforceExistingPaths ? existingPaths.has(path) || files.has(path) : true,
    isExecutableFile: async path =>
      enforceExecutablePaths
        ? executablePaths.has(path)
        : enforceExistingPaths
          ? existingPaths.has(path) || files.has(path)
          : true,
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
  it("does not treat the Steam state-root probe command as a running Steam process", () => {
    const probeOnlySnapshot = `
      100 timeout 5 pgrep -f /var/lib/korri/steam
      101 pgrep -f /var/lib/korri/steam
      102 timeout 5 ps -eo pid=,args=
    `
    const liveSteamSnapshot = `
      200 /usr/bin/FEX /var/lib/korri/steam/steamapps/common/30XX/30XX.exe
    `

    expect(
      steamStateRootProcessRunningInSnapshot(
        "/var/lib/korri/steam",
        probeOnlySnapshot,
      ),
    ).toBe(false)
    expect(
      steamStateRootProcessRunningInSnapshot(
        "/var/lib/korri/steam",
        liveSteamSnapshot,
      ),
    ).toBe(true)
  })

  it("uses a fail-closed default lifecycle before production VDF writes", async () => {
    const source = await Bun.file(
      "product/plugins/steam/src/state-materializer.ts",
    ).text()

    expect(source).toContain("/run/wrappers/bin/sudo")
    expect(source).toContain("korri-steam-service-control")
    expect(source).toContain('commandExitCode("timeout"')
    expect(source).toContain("systemctl status probe exited")
    expect(source).toContain(
      "timed out waiting for Steam shutdown before VDF write",
    )
  })

  it("reasserts LaunchOptions and compat-tool mapping before returning the managed wrapper", async () => {
    const stateRoot = "/steam-home"
    const events: string[] = []
    const { fs, files, writes } = memoryFs()

    const result = await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          command: "steam",
          target: "steam://rungameid/2379780",
          launchOptions: "wrapper -- %command%",
          defaultCompatTool: "proton-cachyos-arm64",
          extraArgs: ["-silent", "-gamepadui"],
        },
        fs,
        lifecycle: lifecycle(events),
        lock: inlineLock,
      }),
    )

    expect(result.spec).toEqual({
      command: "/run/current-system/sw/bin/korri-steam-app",
      args: ["2379780"],
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
                "2379780": { LaunchOptions: "wrapper -- %command%" },
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
                  "0": {
                    name: "proton-cachyos-arm64",
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

  it("preserves existing VDF entries while patching the selected app", async () => {
    const stateRoot = "/steam-home"
    const localconfig = steamLocalConfigPath(stateRoot)
    const config = steamConfigPath(stateRoot)
    const { fs, files } = memoryFs({
      [localconfig]: `"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"999"
					{
						"LaunchOptions"		"legacy options"
					}
				}
			}
		}
	}
}
`,
      [config]: `"InstallConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"CompatToolMapping"
				{
					"999"
					{
						"name"		"proton-old"
						"config"		""
						"priority"		"250"
					}
				}
			}
		}
	}
}
`,
    })

    await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          target: "steam://rungameid/2379780",
          launchOptions: "wrapper -- %command%",
          defaultCompatTool: "proton-cachyos-arm64",
          compatToolOverrides: { "2379780": "proton-arm64" },
        },
        fs,
        lifecycle: lifecycle([]),
        lock: inlineLock,
      }),
    )

    expect(parseVdf(files.get(localconfig) ?? "")).toMatchObject({
      UserLocalConfigStore: {
        Software: {
          Valve: {
            Steam: {
              apps: {
                "999": { LaunchOptions: "legacy options" },
                "2379780": { LaunchOptions: "wrapper -- %command%" },
              },
            },
          },
        },
      },
    })
    expect(parseVdf(files.get(config) ?? "")).toMatchObject({
      InstallConfigStore: {
        Software: {
          Valve: {
            Steam: {
              CompatToolMapping: {
                "0": {
                  name: "proton-cachyos-arm64",
                  config: "",
                  priority: "250",
                },
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
    })
  })

  it("seeds every discovered userdata localconfig for first-launch gates", async () => {
    const stateRoot = "/steam-home"
    const userA = "/steam-home/userdata/80924811/config/localconfig.vdf"
    const userB = "/steam-home/userdata/anonymous/config/localconfig.vdf"
    const { fs, files, writes } = memoryFs(
      {
        [userA]: `"UserLocalConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t\t"Steam"\n\t\t\t{\n\t\t\t\t"apps"\n\t\t\t\t{\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n`,
        [userB]: "",
      },
      { directories: { "/steam-home/userdata": ["80924811", "anonymous"] } },
    )

    await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          target: "steam://rungameid/400",
          suppressInterstitials: true,
          acceptEulas: true,
        },
        fs,
        lifecycle: lifecycle([]),
        lock: inlineLock,
      }),
    )

    expect(writes).toEqual([userA, userB])
    for (const path of [userA, userB]) {
      const seeded = parseVdf(files.get(path) ?? "")
      expect(seeded).toMatchObject({
        UserLocalConfigStore: {
          Software: {
            Valve: {
              Steam: {
                Deck_ConfiguratorInterstitialsVersionSeen_Intro: "99",
                Deck_ConfiguratorInterstitialsCheckbox_AppHasSmallText: "1",
                apps: {
                  "400": {
                    "400_eula_0": "1",
                    "400_eula_1": "1",
                    "400_eula_2": "1",
                  },
                },
              },
            },
          },
        },
      })
    }
  })

  it("preserves a warm session when desired VDF state already matches", async () => {
    const stateRoot = "/steam-home"
    const localconfig = steamLocalConfigPath(stateRoot)
    const config = steamConfigPath(stateRoot)
    const events: string[] = []
    const compatToolRoot =
      "/steam-home/compatibilitytools.d/proton-cachyos-arm64"
    const { fs, writes } = memoryFs(
      {
        [`${compatToolRoot}/toolmanifest.vdf`]: '"manifest" {}',
        [localconfig]: renderVdf(
          applySteamGateSeeds(
            {
              UserLocalConfigStore: {
                Software: {
                  Valve: {
                    Steam: {
                      apps: {
                        "2379780": {
                          LaunchOptions: "wrapper -- %command%",
                        },
                      },
                    },
                  },
                },
              },
            },
            {
              appIds: ["2379780"],
              suppressInterstitials: true,
              acceptEulas: true,
            },
          ),
        ),
        [config]: `"InstallConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"CompatToolMapping"
				{
					"0"
					{
						"name"		"proton-cachyos-arm64"
						"config"		""
						"priority"		"250"
					}
				}
			}
		}
	}
}
`,
      },
      {
        existingPaths: [compatToolRoot, `${compatToolRoot}/proton`],
      },
    )

    const result = await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          command: "steam",
          target: "steam://rungameid/2379780",
          launchOptions: "wrapper -- %command%",
          defaultCompatTool: "proton-cachyos-arm64",
          suppressInterstitials: true,
          acceptEulas: true,
          extraArgs: ["-silent", "-gamepadui"],
        },
        fs,
        lifecycle: lifecycle(events),
        lock: inlineLock,
      }),
    )

    expect(result.spec).toEqual({
      command: "/run/current-system/sw/bin/korri-steam-app",
      args: ["2379780"],
    })
    expect(events).toEqual([])
    expect(writes).toEqual([])
  })

  it("re-reads VDF state after shutdown before writing", async () => {
    const stateRoot = "/steam-home"
    const localconfig = steamLocalConfigPath(stateRoot)
    const { fs, files, writes } = memoryFs()
    const events: string[] = []
    const postShutdownConfig = renderVdf({
      UserLocalConfigStore: {
        Software: {
          Valve: {
            Steam: {
              OtherSteamKey: "preserve-me",
            },
          },
        },
      },
    })

    await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          command: "steam",
          target: "steam://rungameid/2379780",
          launchOptions: "wrapper -- %command%",
        },
        fs,
        lifecycle: {
          ...lifecycle(events),
          waitForShutdown: async () => {
            events.push("wait-shutdown")
            files.set(localconfig, postShutdownConfig)
          },
        },
        lock: inlineLock,
      }),
    )

    expect(writes).toEqual([localconfig])
    expect(files.get(localconfig)).toContain("preserve-me")
    expect(files.get(localconfig)).toContain("LaunchOptions")
  })

  it("fails loudly before writing when the configured compat tool is absent", async () => {
    const stateRoot = "/steam-home"
    const { fs, writes } = memoryFs(
      {},
      { existingPaths: ["/steam-home/compatibilitytools.d/other-tool"] },
    )

    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot,
            target: "steam://rungameid/400",
            defaultCompatTool: "missing-tool",
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "SteamCompatToolMissing",
      tool: "missing-tool",
    })
    expect(writes).toEqual([])
  })

  it("fails loudly before writing when the configured compat tool lacks a real proton launcher", async () => {
    const stateRoot = "/steam-home"
    const { fs, writes } = memoryFs(
      {},
      { existingPaths: ["/steam-home/compatibilitytools.d/broken-tool"] },
    )

    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot,
            target: "steam://rungameid/400",
            defaultCompatTool: "broken-tool",
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "SteamCompatToolMissing",
      tool: "broken-tool",
    })
    expect(writes).toEqual([])
  })

  it("fails loudly before writing when the compat tool proton path is not executable", async () => {
    const stateRoot = "/steam-home"
    const toolRoot = "/steam-home/compatibilitytools.d/placeholder-tool"
    const { fs, writes } = memoryFs(
      { [`${toolRoot}/toolmanifest.vdf`]: '"manifest" {}' },
      {
        existingPaths: [toolRoot, `${toolRoot}/proton`],
        executablePaths: [],
      },
    )

    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot,
            target: "steam://rungameid/400",
            defaultCompatTool: "placeholder-tool",
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "SteamCompatToolMissing",
      tool: "placeholder-tool",
    })
    expect(writes).toEqual([])
  })

  it("fails loudly before writing when the compat tool manifest is absent", async () => {
    const stateRoot = "/steam-home"
    const toolRoot = "/steam-home/compatibilitytools.d/proton-cachyos-arm64"
    const { fs, writes } = memoryFs(
      {},
      {
        existingPaths: [toolRoot, `${toolRoot}/proton`],
        executablePaths: [`${toolRoot}/proton`],
      },
    )

    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot,
            target: "steam://rungameid/400",
            defaultCompatTool: "proton-cachyos-arm64",
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "SteamCompatToolMissing",
      tool: "proton-cachyos-arm64",
    })
    expect(writes).toEqual([])
  })

  it("fails loudly before writing when the compat tool manifest requires an unavailable tool appid", async () => {
    const stateRoot = "/steam-home"
    const toolRoot = "/steam-home/compatibilitytools.d/proton-cachyos-arm64"
    const { fs, writes } = memoryFs(
      {
        [`${toolRoot}/toolmanifest.vdf`]: `"manifest" { "require_tool_appid" "1628350" }`,
      },
      { existingPaths: [toolRoot, `${toolRoot}/proton`] },
    )

    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot,
            target: "steam://rungameid/400",
            defaultCompatTool: "proton-cachyos-arm64",
          },
          fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "SteamCompatToolMissing",
      tool: "proton-cachyos-arm64",
    })
    expect(writes).toEqual([])
  })

  it("reconciles authored compat mappings over manual Steam UI edits", async () => {
    const stateRoot = "/steam-home"
    const config = steamConfigPath(stateRoot)
    const { fs, files } = memoryFs({
      [config]: `"InstallConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t\t"Steam"\n\t\t\t{\n\t\t\t\t"CompatToolMapping"\n\t\t\t\t{\n\t\t\t\t\t"0"\n\t\t\t\t\t{\n\t\t\t\t\t\t"name"\t\t"manual-default"\n\t\t\t\t\t}\n\t\t\t\t\t"400"\n\t\t\t\t\t{\n\t\t\t\t\t\t"name"\t\t"manual-game"\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n`,
    })

    await Effect.runPromise(
      materializeSteamDesiredState({
        desired: {
          stateRoot,
          target: "steam://rungameid/400",
          defaultCompatTool: "proton-cachyos-arm64",
          compatToolOverrides: { "400": "per-game-tool" },
        },
        fs,
        lifecycle: lifecycle([]),
        lock: inlineLock,
      }),
    )

    expect(parseVdf(files.get(config) ?? "")).toMatchObject({
      InstallConfigStore: {
        Software: {
          Valve: {
            Steam: {
              CompatToolMapping: {
                "0": {
                  name: "proton-cachyos-arm64",
                  config: "",
                  priority: "250",
                },
                "400": { name: "per-game-tool", config: "", priority: "250" },
              },
            },
          },
        },
      },
    })
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

  it("fails unterminated VDF strings before clobbering persistent state", async () => {
    const stateRoot = "/steam-home"
    const localconfig = steamLocalConfigPath(stateRoot)
    const content = '"UserLocalConfigStore" { "Software'
    const { fs, files, writes } = memoryFs({ [localconfig]: content })

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

    expect(error._tag).toBe("SteamStateMutationFailed")
    expect("reason" in error ? error.reason : "").toContain(
      "unterminated string",
    )
    expect(writes).toEqual([])
    expect(files.get(localconfig)).toBe(content)
  })

  it("surfaces invalid Steam targets as typed errors", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        materializeSteamDesiredState({
          desired: {
            stateRoot: "/steam-home",
            target: "steam://rungameid/not-a-number",
            launchOptions: "%command%",
          },
          fs: memoryFs().fs,
          lifecycle: lifecycle([]),
          lock: inlineLock,
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "InvalidSteamTarget" })
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
