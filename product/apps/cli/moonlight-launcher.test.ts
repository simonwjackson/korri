import { describe, expect, it } from "bun:test"
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import {
  type CommandRunner,
  launchMoonlight,
  type ManagedMoonlightSessionHandle,
} from "./moonlight-launcher"

const PROC_FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")
const wrapperProvider = "@example:wrapper"
const wrapperRegistry = createPluginRegistry(
  [
    plugin({
      namespace: "@example",
      name: "wrapper",
      contributes: {
        handlers: [
          {
            id: "example-wrapper-compose",
            operation: "launch.compose",
            capabilities: ["launch.compose"],
            run: context => {
              const input = context.input as {
                readonly spec: LaunchSpec
                readonly policy?: {
                  readonly enable?: boolean
                  readonly command?: string
                  readonly args?: readonly string[]
                }
              }
              if (input.policy?.enable === false) return input.spec
              return {
                command: input.policy?.command ?? "wrapper",
                args: [
                  ...(input.policy?.args ?? []),
                  "--",
                  input.spec.command,
                  ...input.spec.args,
                ],
                ...(input.spec.env ? { env: input.spec.env } : {}),
                ...(input.spec.envUnset
                  ? { envUnset: input.spec.envUnset }
                  : {}),
              }
            },
          },
        ],
      },
    }),
  ],
  { enabledPluginIds: [wrapperProvider] },
)

const wrapperOptions = (
  policy: {
    readonly enable?: boolean
    readonly command?: string
    readonly args?: readonly string[]
  } = {},
) => ({
  launchCompanions: { [wrapperProvider]: policy },
  pluginRegistry: wrapperRegistry,
})

describe("moonlight launcher", () => {
  it("propagates managed session handles returned by the command runner", async () => {
    const session = {
      id: "child-1",
      processId: 4242,
      exited: Promise.resolve({ exitCode: 0 }),
      terminate: () => undefined,
      terminateNow: () => undefined,
    }

    const result = await launchMoonlight({
      host: "aka.local",
      runner: runner(() => ({ status: "started", session })),
    })

    expect(result).toEqual({
      status: "started",
      command: "moonlight",
      session,
    })
  })

  it("launches typed Moonlight policy directly by default", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      moonlight: { window: { autoResize: true } },
      runner: recordingRunner(calls),
    })

    expect(result).toEqual({ status: "started", command: "moonlight" })
    expect(calls).toEqual([
      "moonlight stream -autowindowresize -app Korri Stream aka.local",
    ])
  })

  it("uses typed Moonlight command and does not read KORRI_MOONLIGHT_COMMAND", async () => {
    const previous = Bun.env.KORRI_MOONLIGHT_COMMAND
    const calls: string[] = []
    try {
      Bun.env.KORRI_MOONLIGHT_COMMAND = "/ignored/moonlight"
      const result = await launchMoonlight({
        host: "192.168.1.117",
        moonlight: { command: "/nix/store/moonlight/bin/moonlight" },
        allowNixFallback: false,
        runner: recordingRunner(calls),
      })

      expect(result).toEqual({
        status: "started",
        command: "/nix/store/moonlight/bin/moonlight",
      })
      expect(calls).toEqual([
        "/nix/store/moonlight/bin/moonlight stream -app Korri Stream 192.168.1.117",
      ])
    } finally {
      if (previous === undefined) delete Bun.env.KORRI_MOONLIGHT_COMMAND
      else Bun.env.KORRI_MOONLIGHT_COMMAND = previous
    }
  })

  it("uses a configured launch companion wrapper command", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      ...wrapperOptions({
        command: "/run/current-system/sw/bin/example-wrapper",
        args: ["--mode", "nested"],
      }),
      runner: recordingRunner(calls),
    })

    expect(result).toEqual({
      status: "started",
      command: "/run/current-system/sw/bin/example-wrapper",
    })
    expect(calls).toEqual([
      "/run/current-system/sw/bin/example-wrapper --mode nested -- moonlight stream -app Korri Stream aka.local",
    ])
  })

  it("launches moonlight unwrapped when a launch companion is explicitly disabled", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      ...wrapperOptions({ enable: false }),
      runner: recordingRunner(calls),
    })

    expect(result).toEqual({ status: "started", command: "moonlight" })
    expect(calls).toEqual(["moonlight stream -app Korri Stream aka.local"])
  })

  it("falls back to nix moonlight-embedded when installed moonlight is missing", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      moonlight: { window: { autoResize: true } },
      ...wrapperOptions(),
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return calls.length === 1
          ? { status: "failed", message: "ENOENT" }
          : { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "wrapper" })
    expect(calls).toEqual([
      "wrapper -- moonlight stream -autowindowresize -app Korri Stream aka.local",
      "wrapper -- nix run nixpkgs#moonlight-embedded -- stream -autowindowresize -app Korri Stream aka.local",
    ])
  })

  it("preflights and passes the InputPlumber virtual controller to Moonlight", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      moonlight: {
        input: {
          mappingFile:
            "/nix/store/moonlight/share/moonlight/gamecontrollerdb.txt",
        },
        window: { autoResize: true },
      },
      ...wrapperOptions(),
      requireInputPlumberInput: true,
      readProcDevices: async () =>
        readFileSync(
          join(PROC_FIXTURES_DIR, "bus-input-devices-inputplumber-virtual.txt"),
          "utf8",
        ),
      runner: recordingRunner(calls),
    })

    expect(result).toEqual({ status: "started", command: "wrapper" })
    expect(calls).toEqual([
      "wrapper -- moonlight stream -mapping /nix/store/moonlight/share/moonlight/gamecontrollerdb.txt -input /dev/input/event10 -autowindowresize -app Korri Stream 192.168.1.117",
    ])
  })

  it("fails closed without spawning moonlight when appliance input is missing", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      requireInputPlumberInput: true,
      readProcDevices: async () =>
        readFileSync(
          join(
            PROC_FIXTURES_DIR,
            "bus-input-devices-inputplumber-raw-only.txt",
          ),
          "utf8",
        ),
      runner: recordingRunner(calls),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.message).toContain("InputPlumber virtual gamepad")
    }
    expect(calls).toEqual([])
  })

  it("fails closed without spawning moonlight when appliance input is ambiguous", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      requireInputPlumberInput: true,
      readProcDevices: async () =>
        readFileSync(
          join(
            PROC_FIXTURES_DIR,
            "bus-input-devices-inputplumber-ambiguous.txt",
          ),
          "utf8",
        ),
      runner: recordingRunner(calls),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.message).toContain("Multiple InputPlumber")
    }
    expect(calls).toEqual([])
  })

  it("renders typed policy input, platform, touch bounds, env, and envUnset", async () => {
    const calls: Array<{
      readonly command: string
      readonly args: readonly string[]
      readonly env: Readonly<Record<string, string>> | undefined
      readonly envUnset: readonly string[] | undefined
    }> = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      moonlight: {
        platform: { name: "sdl" },
        input: {
          devices: ["/dev/input/event10"],
          touch: {
            absolute: true,
            requireBounds: true,
            bounds: { x: 0, y: 0, w: 1080, h: 1920 },
          },
        },
        environment: { SDL_VIDEODRIVER: "wayland", OLD_ENV: null },
      },
      runner: {
        run: async (command, args, options) => {
          calls.push({
            command,
            args,
            env: options?.env,
            envUnset: options?.envUnset,
          })
          return { status: "started" }
        },
      },
    })

    expect(result).toEqual({ status: "started", command: "moonlight" })
    expect(calls[0]?.args.join(" ")).toContain(
      "stream -platform sdl -input /dev/input/event10 -absolutetouch -absolutetouchrequirebounds -absolutetouchbounds 0,0,1080,1920 -app Korri Stream 192.168.1.117",
    )
    expect(calls[0]?.env).toEqual({ SDL_VIDEODRIVER: "wayland" })
    expect(calls[0]?.envUnset).toEqual(["OLD_ENV"])
  })

  it("reports launch companion diagnostics without spawning", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      launchCompanions: { [wrapperProvider]: { enable: true } },
      runner: recordingRunner(calls),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.message).toContain(wrapperProvider)
    }
    expect(calls).toEqual([])
  })

  it("reports an early non-zero Moonlight exit during the startup observation window", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "korri-moonlight-test-"))
    const command = resolve(dir, "moonlight-fails")
    writeFileSync(command, "#!/usr/bin/env bash\nexit 42\n")
    chmodSync(command, 0o755)
    try {
      const result = await launchMoonlight({
        host: "aka.local",
        moonlight: { command },
        allowNixFallback: false,
        startupObserveMs: 250,
      })
      expect(result.status).toBe("failed")
      if (result.status === "failed") {
        expect(result.message).toContain("exited early")
        expect(result.message).toContain("42")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("passes a generated local control handle through Moonlight env", async () => {
    const calls: Array<{
      readonly env: Readonly<Record<string, string>> | undefined
    }> = []
    const result = await launchMoonlight({
      host: "aka.local",
      moonlightControl: {
        enabled: true,
        runtimeDir: "/run/user/1000/korri-moonlight/session-1",
        socketPath: "/run/user/1000/korri-moonlight/session-1/control.sock",
        sessionId: "session-1",
        authority: "controller",
      },
      runner: {
        run: async (_command, _args, options) => {
          calls.push({ env: options?.env })
          return { status: "started" }
        },
      },
    })

    expect(result).toEqual({
      status: "started",
      command: "moonlight",
      moonlightControl: {
        authority: "controller",
        runtimeDir: "/run/user/1000/korri-moonlight/session-1",
        sessionId: "session-1",
        socketPath: "/run/user/1000/korri-moonlight/session-1/control.sock",
      },
    })
    expect(calls[0]?.env).toEqual({
      MOONLIGHT_LOCAL_CONTROL_AUTHORITY: "controller",
      MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR:
        "/run/user/1000/korri-moonlight/session-1",
      MOONLIGHT_LOCAL_CONTROL_SESSION_ID: "session-1",
      MOONLIGHT_LOCAL_CONTROL_SOCKET:
        "/run/user/1000/korri-moonlight/session-1/control.sock",
    })
  })

  it("reports both failures without throwing", async () => {
    const result = await launchMoonlight({
      host: "aka.local",
      runner: runner(command => ({
        status: "failed",
        message: `${command} missing`,
      })),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.message).toContain("moonlight missing")
      expect(result.message).toContain("nix fallback")
    }
  })
})

function recordingRunner(calls: string[]): CommandRunner {
  return runner((command, args) => {
    calls.push([command, ...args].join(" "))
    return { status: "started" }
  })
}

function runner(
  fn: (
    command: string,
    args: readonly string[],
  ) =>
    | {
        readonly status: "started"
        readonly session?: ManagedMoonlightSessionHandle
      }
    | { readonly status: "failed"; readonly message: string },
): CommandRunner {
  return { run: async (command, args) => fn(command, args) }
}
