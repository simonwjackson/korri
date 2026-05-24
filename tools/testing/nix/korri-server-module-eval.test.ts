import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-server-module-eval.fixture.nix",
)

type ScenarioResult = {
  assertionsPassed: boolean
  assertionMessages: string[]
  warnings: string[]
  systemUnitExists: boolean
  userUnitExists: boolean
  systemWantedBy: string[] | null
  userWantedBy: string[] | null
  systemServiceUser: string | null
  systemServiceGroup: string | null
  systemRuntimeDirectory: string | null
  systemRuntimeDirectoryMode: string | null
  systemStateDirectory: string | null
  systemStateDirectoryMode: string | null
  systemCacheDirectory: string | null
  systemCacheDirectoryMode: string | null
  systemExecStartPre: string[] | string | null
  systemNoNewPrivileges: boolean | null
  systemProtectSystem: string | boolean | null
  systemRestart: string | null
  userServiceEnv: Record<string, string> | null
  systemServiceEnv: Record<string, string> | null
  inputdServiceEnv: Record<string, string> | null
  tmpfilesRunDir: { user?: string; group?: string; mode?: string } | null
  gameStreamRuntimeDir: string | null
  gameStreamIntentPath: string | null
  gameStreamStatusPath: string | null
  gameStreamDisplayCompatEnable: boolean | null
  gameStreamDisplayCompatDefaults: Record<string, string> | null
  gameStreamDisplayCompatExtra: Record<string, string> | null
  bootKernelModules: string[]
  udevExtraRules: string
  gameStreamWrapperScript: string | null
  firewallTcpPorts: number[]
  firewallInterfaceNames: string[]
  systemPackages: string[]
  cliEnabled: boolean
  cliPackage: string
}

type Scenarios = {
  defaultUserMode: ScenarioResult
  explicitSystemMode: ScenarioResult
  publicApiBaseUrl: ScenarioResult
  defaultInputd: ScenarioResult
  remoteDebugInputd: ScenarioResult
  missingUser: ScenarioResult
  rootUser: ScenarioResult
  userSpecifierPath: ScenarioResult
  relativePath: ScenarioResult
  mismatchedParent: ScenarioResult
  globalFirewall: ScenarioResult
  scopedFirewall: ScenarioResult
  conflictingHeadlessSource: ScenarioResult
  uinputDisabled: ScenarioResult
  displayCompatDefaults: ScenarioResult
  displayCompatDisabled: ScenarioResult
  displayCompatExtraEnv: ScenarioResult
  systemModeAbsolutePathOverrides: ScenarioResult
  cliSystemMode: ScenarioResult
  cliOptedOut: ScenarioResult
  cliOverridden: ScenarioResult
}

type EvalOutcome =
  | { kind: "ok"; result: ScenarioResult }
  | { kind: "error"; stderr: string }

function runNixEval(applyExpr: string): {
  status: number | null
  stdout: string
  stderr: string
} {
  const child = spawnSync(
    "nix",
    [
      "--extra-experimental-features",
      "nix-command flakes",
      "eval",
      "--impure",
      "--json",
      "--file",
      FIXTURE_PATH,
      "--apply",
      applyExpr,
    ],
    {
      cwd: FLAKE_ROOT,
      encoding: "utf8",
      env: { ...process.env, NIX_PATH: "" },
    },
  )
  return { status: child.status, stdout: child.stdout, stderr: child.stderr }
}

/**
 * Single nix eval that returns every pre-enumerated scenario in one shot.
 * Per-test access is `scenarios.<key>`. See
 * docs/plans/2026-05-24-006-refactor-nix-test-harness-plan.md U3 and
 * tools/testing/nix/korri-desktop-build-graph.test.ts for the exemplar.
 */
function evalAllScenarios(): Scenarios {
  const { status, stdout, stderr } = runNixEval(
    `f: f { flakeRoot = ${FLAKE_ROOT}; }`,
  )
  if (status !== 0) {
    throw new Error(`nix eval failed (exit ${status}):\n${stderr}`)
  }
  return (JSON.parse(stdout) as { scenarios: Scenarios }).scenarios
}

/**
 * Per-call eval for scenarios that intentionally crash nix evaluation
 * itself (the batched form can't host them because one hard failure
 * poisons every other scenario in the shared attrset).
 */
function evalFixture(overridesNix: string): EvalOutcome {
  const { status, stdout, stderr } = runNixEval(
    `f: f { flakeRoot = ${FLAKE_ROOT}; overrides = ${overridesNix}; }`,
  )
  if (status !== 0) {
    return { kind: "error", stderr }
  }
  return { kind: "ok", result: JSON.parse(stdout) as ScenarioResult }
}

// Module-load: one batched eval for all batchable scenarios, plus the one
// scenario that intentionally crashes nix eval and therefore can't share
// the attrset. Both happen at file-load time so per-`it()` timeouts (5s
// default) don't fire against a multi-second nix call.
const scenarios = evalAllScenarios()
const undeducibleHomeOutcome = evalFixture(`{
  services.korri.server = {
    enable = true;
    serviceMode = "system";
    user = "nonexistent";
  };
}`)

describe("services.korri.server NixOS module evaluation", () => {

  describe('default user mode (serviceMode = "user")', () => {
    const result = scenarios.defaultUserMode

    it("preserves user-service compatibility by default", () => {
      expect(result.userUnitExists).toBe(true)
      expect(result.systemUnitExists).toBe(false)
      expect(result.userWantedBy).toEqual(["default.target"])
    })

    it("uses %t runtime path defaults", () => {
      expect(result.userServiceEnv).not.toBeNull()
      const env = result.userServiceEnv as Record<string, string>
      expect(env.KORRI_GAME_STREAM_RUNTIME_DIR).toBe("%t/korri-game-stream")
      expect(env.KORRI_GAME_STREAM_INTENT_PATH).toBe(
        "%t/korri-game-stream/next-launch.json",
      )
      expect(env.KORRI_GAME_STREAM_STATUS_PATH).toBe(
        "%t/korri-game-stream/status.json",
      )
      expect(env.KORRI_LIBRARY_ROOT).toBe("%h/.local/share/korri/library")
    })

    it("keeps conservative LAN defaults", () => {
      expect(result.userServiceEnv).not.toBeNull()
      const env = result.userServiceEnv as Record<string, string>
      expect(env.HOST).toBe("127.0.0.1")
      expect(env.KORRI_STREAM_CONTROL_ENABLED).toBe("0")
      expect(env.KORRI_SERVER_ADVERTISE_ENABLED).toBe("0")
      expect(result.firewallTcpPorts).toEqual([])
      expect(result.firewallInterfaceNames).toEqual([])
    })

    it("omits KORRI_PUBLIC_API_BASE_URL by default", () => {
      expect(result.userServiceEnv).not.toBeNull()
      const env = result.userServiceEnv as Record<string, string>
      expect(env.KORRI_PUBLIC_API_BASE_URL).toBeUndefined()
    })

    it("passes through to no tmpfiles entries", () => {
      expect(result.tmpfilesRunDir).toBeNull()
    })

    it("has no failing assertions", () => {
      expect(result.assertionsPassed).toBe(true)
      expect(result.assertionMessages).toEqual([])
    })
  })

  describe("explicit system mode", () => {
    const result = scenarios.explicitSystemMode

    it("emits a boot-scoped system unit and not a user unit", () => {
      expect(result.systemUnitExists).toBe(true)
      expect(result.userUnitExists).toBe(false)
      expect(result.systemWantedBy).toEqual(["multi-user.target"])
    })

    it("runs as the configured non-root user/group", () => {
      expect(result.systemServiceUser).toBe("testuser")
      expect(result.systemServiceGroup).toBe("users")
    })

    it("derives /run/korri-game-stream defaults", () => {
      const env = result.systemServiceEnv as Record<string, string>
      expect(env.KORRI_GAME_STREAM_RUNTIME_DIR).toBe("/run/korri-game-stream")
      expect(env.KORRI_GAME_STREAM_INTENT_PATH).toBe(
        "/run/korri-game-stream/next-launch.json",
      )
      expect(env.KORRI_GAME_STREAM_STATUS_PATH).toBe(
        "/run/korri-game-stream/status.json",
      )
    })

    it("derives library.root from the configured user's home", () => {
      const env = result.systemServiceEnv as Record<string, string>
      expect(env.KORRI_LIBRARY_ROOT).toBe(
        "/home/testuser/.local/share/korri/library",
      )
    })

    it("manages /run/korri-game-stream via systemd and tmpfiles", () => {
      expect(result.systemRuntimeDirectory).toBe("korri-game-stream")
      expect(result.systemRuntimeDirectoryMode).toBe("0700")
      expect(result.tmpfilesRunDir).toMatchObject({
        user: "testuser",
        group: "users",
        mode: "0700",
        age: "-",
      } as never)
    })

    it("provides writable state and cache directories under system hardening", () => {
      const env = result.systemServiceEnv as Record<string, string>
      expect(result.systemStateDirectory).toBe("korri-server")
      expect(result.systemStateDirectoryMode).toBe("0700")
      expect(result.systemCacheDirectory).toBe("korri-server")
      expect(result.systemCacheDirectoryMode).toBe("0700")
      expect(env.HOME).toBe("/var/lib/korri-server")
      expect(env.XDG_CACHE_HOME).toBe("/var/cache/korri-server")
      expect(env.BUN_RUNTIME_TRANSPILER_CACHE_PATH).toBe(
        "/var/cache/korri-server/bun-transpiler-cache",
      )
      expect(JSON.stringify(result.systemExecStartPre)).toContain(
        "/var/cache/korri-server/bun-transpiler-cache",
      )
    })

    it("applies conservative systemd hardening", () => {
      expect(result.systemNoNewPrivileges).toBe(true)
      expect(result.systemProtectSystem).toBe("strict")
      expect(result.systemRestart).toBe("on-failure")
    })

    it("wires services.korri.gameStream to the system runtime paths", () => {
      expect(result.gameStreamRuntimeDir).toBe("/run/korri-game-stream")
      expect(result.gameStreamIntentPath).toBe(
        "/run/korri-game-stream/next-launch.json",
      )
      expect(result.gameStreamStatusPath).toBe(
        "/run/korri-game-stream/status.json",
      )
    })

    it("enables uinput access for Sunshine-streamed sessions", () => {
      expect(result.bootKernelModules).toContain("uinput")
      expect(result.udevExtraRules).toContain('KERNEL=="uinput"')
      expect(result.udevExtraRules).toContain('GROUP="input"')
      expect(result.udevExtraRules).toContain('TAG+="uaccess"')
    })

    it("has no failing assertions", () => {
      expect(result.assertionsPassed).toBe(true)
      expect(result.assertionMessages).toEqual([])
    })
  })

  describe("publicApiBaseUrl option", () => {
    it("exposes the configured public API base URL via env", () => {
      const env = scenarios.publicApiBaseUrl.userServiceEnv as Record<
        string,
        string
      >
      expect(env.KORRI_PUBLIC_API_BASE_URL).toBe("http://192.168.1.117:3001")
    })
  })

  describe("inputd module defaults", () => {
    it("binds the native input bridge to loopback by default", () => {
      expect(scenarios.defaultInputd.inputdServiceEnv).not.toBeNull()
      const env = scenarios.defaultInputd.inputdServiceEnv as Record<
        string,
        string
      >
      expect(env.KORRI_INPUT_BRIDGE_HOSTNAME).toBe("127.0.0.1")
      expect(env.KORRI_INPUT_BRIDGE_PORT).toBe("3002")
    })

    it("allows deliberate remote debugging by overriding the bind hostname", () => {
      const env = scenarios.remoteDebugInputd.inputdServiceEnv as Record<
        string,
        string
      >
      expect(env.KORRI_INPUT_BRIDGE_HOSTNAME).toBe("0.0.0.0")
    })
  })

  describe("system mode safety assertions", () => {
    it("requires services.korri.server.user", () => {
      const result = scenarios.missingUser
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain(
        "requires services.korri.server.user",
      )
    })

    it('rejects user = "root"', () => {
      const result = scenarios.rootUser
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain('root"')
    })

    it("rejects %t paths in system mode", () => {
      const result = scenarios.userSpecifierPath
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join(" ")).toMatch(
        /systemd\s+user\s+specifier/,
      )
    })

    it("rejects relative runtime paths in system mode", () => {
      const result = scenarios.relativePath
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain("absolute path")
    })

    it("rejects mismatched stream file parents", () => {
      const result = scenarios.mismatchedParent
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain("must live under")
    })

    it("fails evaluation when library.root cannot be derived", () => {
      // Not batched: this scenario crashes nix eval itself, which would
      // poison every other scenario in the shared attrset. The eval ran
      // at module-load (see top of file) so this assertion is just
      // reading the cached outcome.
      expect(undeducibleHomeOutcome.kind).toBe("error")
      if (undeducibleHomeOutcome.kind === "error") {
        expect(undeducibleHomeOutcome.stderr).toContain(
          "library.root could not be derived",
        )
      }
    })
  })

  describe("LAN exposure warnings", () => {
    it("warns when system mode exposes non-loopback host on global firewall", () => {
      const result = scenarios.globalFirewall
      expect(result.assertionsPassed).toBe(true)
      expect(result.warnings.join("\n")).toContain("global firewall")
    })

    it("does not warn when firewallInterfaces scopes the opening", () => {
      const result = scenarios.scopedFirewall
      expect(result.assertionsPassed).toBe(true)
      expect(result.firewallInterfaceNames).toEqual(["tailscale0"])
      expect(
        result.warnings.find(w => w.includes("global firewall")),
      ).toBeUndefined()
    })

    it("warns when headlessSource and server bind the same port", () => {
      expect(
        scenarios.conflictingHeadlessSource.warnings.join("\n"),
      ).toContain("port 3001")
    })
  })

  describe("uinput defaults", () => {
    it("can opt out when the host provides uinput permissions elsewhere", () => {
      const result = scenarios.uinputDisabled
      expect(result.bootKernelModules).not.toContain("uinput")
      expect(result.udevExtraRules).not.toContain('KERNEL=="uinput"')
    })
  })

  describe("display environment compatibility defaults", () => {
    const defaults = scenarios.displayCompatDefaults

    it("enables displayCompat by default with curated defaults", () => {
      expect(defaults.gameStreamDisplayCompatEnable).toBe(true)
      const env = defaults.gameStreamDisplayCompatDefaults!
      expect(env.SDL_VIDEODRIVER).toBe("wayland,x11")
      expect(env.QT_QPA_PLATFORM).toBe("wayland;xcb")
      expect(env.GDK_BACKEND).toBe("wayland,x11")
      expect(env.CLUTTER_BACKEND).toBe("wayland")
      expect(env.WINIT_UNIX_BACKEND).toBe("wayland")
      expect(env.XDG_SESSION_TYPE).toBe("wayland")
      expect(env._JAVA_AWT_WM_NONREPARENTING).toBe("1")
      expect(env.DISPLAY).toBe(":0")
    })

    it("bakes display compat exports into the Sunshine wrapper script", () => {
      const script = defaults.gameStreamWrapperScript!
      expect(script).toContain('"${SDL_VIDEODRIVER:=wayland,x11}"')
      expect(script).toContain("export SDL_VIDEODRIVER")
      expect(script).toMatch(/QT_QPA_PLATFORM:=['"]wayland;xcb['"]/)
      expect(script).toMatch(/DISPLAY:=['"]?:0['"]?/)
    })

    it("uses ${VAR:=value} so sessionEnvFile values still win", () => {
      const script = defaults.gameStreamWrapperScript!
      expect(script).not.toMatch(/^export SDL_VIDEODRIVER=wayland/m)
      expect(script).toMatch(/:\s"\$\{SDL_VIDEODRIVER:=/)
    })
  })

  describe("display environment compatibility — disabled", () => {
    it("omits display compat exports when disabled", () => {
      const disabled = scenarios.displayCompatDisabled
      expect(disabled.gameStreamDisplayCompatEnable).toBe(false)
      const script = disabled.gameStreamWrapperScript!
      expect(script).not.toContain("SDL_VIDEODRIVER")
      expect(script).not.toContain("QT_QPA_PLATFORM")
    })
  })

  describe("display environment compatibility — extraEnv", () => {
    it("merges extraEnv on top of defaults", () => {
      const script = scenarios.displayCompatExtraEnv.gameStreamWrapperScript!
      expect(script).toContain("MESA_GL_VERSION_OVERRIDE")
      expect(script).toContain("export MESA_GL_VERSION_OVERRIDE")
      expect(script).toMatch(/SDL_VIDEODRIVER:=x11/)
      expect(script).not.toMatch(/SDL_VIDEODRIVER:=wayland,x11/)
    })
  })

  describe("system mode with explicit absolute path overrides", () => {
    const result = scenarios.systemModeAbsolutePathOverrides

    it("passes overrides to both server env and game-stream module", () => {
      const env = result.systemServiceEnv as Record<string, string>
      expect(env.KORRI_GAME_STREAM_RUNTIME_DIR).toBe("/var/run/korri")
      expect(env.KORRI_GAME_STREAM_INTENT_PATH).toBe(
        "/var/run/korri/next-launch.json",
      )
      expect(env.KORRI_GAME_STREAM_STATUS_PATH).toBe(
        "/var/run/korri/status.json",
      )
      expect(result.gameStreamRuntimeDir).toBe("/var/run/korri")
      expect(result.gameStreamIntentPath).toBe(
        "/var/run/korri/next-launch.json",
      )
      expect(result.gameStreamStatusPath).toBe("/var/run/korri/status.json")
    })

    it("does not use RuntimeDirectory for non-default runtime dirs", () => {
      expect(result.systemRuntimeDirectory).toBeNull()
      expect(result.tmpfilesRunDir).toBeNull()
    })
  })

  describe("korri CLI is installed by default when server is enabled", () => {
    it("defaults services.korri.cli.enable = true in user mode", () => {
      const userMode = scenarios.defaultUserMode
      expect(userMode.cliEnabled).toBe(true)
      expect(
        userMode.systemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(true)
    })

    it("defaults services.korri.cli.enable = true in system mode", () => {
      const systemMode = scenarios.cliSystemMode
      expect(systemMode.cliEnabled).toBe(true)
      expect(
        systemMode.systemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(true)
    })

    it("respects an explicit services.korri.cli.enable = false opt-out", () => {
      const optedOut = scenarios.cliOptedOut
      expect(optedOut.cliEnabled).toBe(false)
      expect(
        optedOut.systemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(false)
    })

    it("honors a caller-supplied services.korri.cli.package override", () => {
      const overridden = scenarios.cliOverridden
      expect(overridden.cliPackage).toMatch(/korri-cli-stub/)
      expect(
        overridden.systemPackages.some(path =>
          path.includes("korri-cli-stub"),
        ),
      ).toBe(true)
    })
  })
})
