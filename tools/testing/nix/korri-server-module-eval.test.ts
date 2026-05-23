import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-server-module-eval.fixture.nix",
)

type EvalResult = {
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

type EvalOutcome =
  | { kind: "ok"; result: EvalResult }
  | { kind: "error"; stderr: string }

function evalFixture(overridesNix: string): EvalOutcome {
  const apply = `f: f { flakeRoot = ${FLAKE_ROOT}; overrides = ${overridesNix}; }`
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
      apply,
    ],
    {
      cwd: FLAKE_ROOT,
      encoding: "utf8",
      env: { ...process.env, NIX_PATH: "" },
    },
  )

  if (child.status !== 0) {
    return { kind: "error", stderr: child.stderr }
  }

  return { kind: "ok", result: JSON.parse(child.stdout) as EvalResult }
}

function expectOk(outcome: EvalOutcome): EvalResult {
  if (outcome.kind === "error") {
    throw new Error(
      `expected eval to succeed but got error:\n${outcome.stderr}`,
    )
  }
  return outcome.result
}

describe("services.korri.server NixOS module evaluation", () => {
  describe('default user mode (serviceMode = "user")', () => {
    const result = expectOk(
      evalFixture(`{ services.korri.server = { enable = true; }; }`),
    )

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

    it("passes through to no tmpfiles entries", () => {
      expect(result.tmpfilesRunDir).toBeNull()
    })

    it("has no failing assertions", () => {
      expect(result.assertionsPassed).toBe(true)
      expect(result.assertionMessages).toEqual([])
    })
  })

  describe("explicit system mode", () => {
    const result = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          group = "users";
          streamHost.enable = true;
        };
      }`),
    )

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

  describe("inputd module defaults", () => {
    const defaultInputd = expectOk(
      evalFixture(`{ services.korri.inputd.enable = true; }`),
    )
    const remoteDebugInputd = expectOk(
      evalFixture(`{
        services.korri.inputd = {
          enable = true;
          hostname = "0.0.0.0";
        };
      }`),
    )

    it("binds the native input bridge to loopback by default", () => {
      expect(defaultInputd.inputdServiceEnv).not.toBeNull()
      const env = defaultInputd.inputdServiceEnv as Record<string, string>
      expect(env.KORRI_INPUT_BRIDGE_HOSTNAME).toBe("127.0.0.1")
      expect(env.KORRI_INPUT_BRIDGE_PORT).toBe("3002")
    })

    it("allows deliberate remote debugging by overriding the bind hostname", () => {
      const env = remoteDebugInputd.inputdServiceEnv as Record<string, string>
      expect(env.KORRI_INPUT_BRIDGE_HOSTNAME).toBe("0.0.0.0")
    })
  })

  describe("system mode safety assertions", () => {
    const missingUser = evalFixture(`{
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        library.root = "/var/lib/korri/library";
      };
    }`)
    const rootUser = evalFixture(`{
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "root";
        library.root = "/var/lib/korri/library";
      };
    }`)
    const userSpecifierPath = evalFixture(`{
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost = {
          enable = true;
          runtimeDir = "%t/korri-game-stream";
        };
      };
    }`)
    const relativePath = evalFixture(`{
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost = {
          enable = true;
          runtimeDir = "relative-dir";
        };
      };
    }`)
    const mismatchedParent = evalFixture(`{
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost = {
          enable = true;
          statusPath = "/tmp/status.json";
        };
      };
    }`)
    const undeducibleHome = evalFixture(`{
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "nonexistent";
      };
    }`)

    it("requires services.korri.server.user", () => {
      const result = expectOk(missingUser)
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain(
        "requires services.korri.server.user",
      )
    })

    it('rejects user = "root"', () => {
      const result = expectOk(rootUser)
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain('root"')
    })

    it("rejects %t paths in system mode", () => {
      const result = expectOk(userSpecifierPath)
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join(" ")).toMatch(
        /systemd\s+user\s+specifier/,
      )
    })

    it("rejects relative runtime paths in system mode", () => {
      const result = expectOk(relativePath)
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain("absolute path")
    })

    it("rejects mismatched stream file parents", () => {
      const result = expectOk(mismatchedParent)
      expect(result.assertionsPassed).toBe(false)
      expect(result.assertionMessages.join("\n")).toContain("must live under")
    })

    it("fails evaluation when library.root cannot be derived", () => {
      expect(undeducibleHome.kind).toBe("error")
      if (undeducibleHome.kind === "error") {
        expect(undeducibleHome.stderr).toContain(
          "library.root could not be derived",
        )
      }
    })
  })

  describe("LAN exposure warnings", () => {
    const globalFirewall = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          host = "0.0.0.0";
          openFirewall = true;
        };
      }`),
    )
    const scopedFirewall = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          host = "0.0.0.0";
          openFirewall = true;
          firewallInterfaces = [ "tailscale0" ];
        };
      }`),
    )
    const conflictingHeadlessSource = expectOk(
      evalFixture(`{
        services.korri = {
          server = {
            enable = true;
            user = "testuser";
          };
          headlessSource = {
            enable = true;
            libraryRoot = "/home/testuser/.local/share/korri/library";
          };
        };
      }`),
    )

    it("warns when system mode exposes non-loopback host on global firewall", () => {
      expect(globalFirewall.assertionsPassed).toBe(true)
      expect(globalFirewall.warnings.join("\n")).toContain("global firewall")
    })

    it("does not warn when firewallInterfaces scopes the opening", () => {
      expect(scopedFirewall.assertionsPassed).toBe(true)
      expect(scopedFirewall.firewallInterfaceNames).toEqual(["tailscale0"])
      expect(
        scopedFirewall.warnings.find(w => w.includes("global firewall")),
      ).toBeUndefined()
    })

    it("warns when headlessSource and server bind the same port", () => {
      expect(conflictingHeadlessSource.warnings.join("\n")).toContain(
        "port 3001",
      )
    })
  })

  describe("uinput defaults", () => {
    const disabled = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          streamHost.enable = true;
        };
        services.korri.gameStream.uinput.enable = false;
      }`),
    )

    it("can opt out when the host provides uinput permissions elsewhere", () => {
      expect(disabled.bootKernelModules).not.toContain("uinput")
      expect(disabled.udevExtraRules).not.toContain('KERNEL=="uinput"')
    })
  })

  describe("display environment compatibility defaults", () => {
    const defaults = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          streamHost.enable = true;
        };
      }`),
    )

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
      // Special characters get shell-escaped (semicolon, colon)
      expect(script).toMatch(/QT_QPA_PLATFORM:=['"]wayland;xcb['"]/)
      expect(script).toMatch(/DISPLAY:=['"]?:0['"]?/)
    })

    it("uses ${VAR:=value} so sessionEnvFile values still win", () => {
      const script = defaults.gameStreamWrapperScript!
      // Defensive form preserves anything inherited or sourced
      expect(script).not.toMatch(/^export SDL_VIDEODRIVER=wayland/m)
      expect(script).toMatch(/:\s"\$\{SDL_VIDEODRIVER:=/)
    })
  })

  describe("display environment compatibility — disabled", () => {
    const disabled = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          streamHost.enable = true;
        };
        services.korri.gameStream.displayCompat.enable = false;
      }`),
    )

    it("omits display compat exports when disabled", () => {
      expect(disabled.gameStreamDisplayCompatEnable).toBe(false)
      const script = disabled.gameStreamWrapperScript!
      expect(script).not.toContain("SDL_VIDEODRIVER")
      expect(script).not.toContain("QT_QPA_PLATFORM")
    })
  })

  describe("display environment compatibility — extraEnv", () => {
    const extra = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          streamHost.enable = true;
        };
        services.korri.gameStream.displayCompat.extraEnv = {
          MESA_GL_VERSION_OVERRIDE = "4.5";
          SDL_VIDEODRIVER = "x11";
        };
      }`),
    )

    it("merges extraEnv on top of defaults", () => {
      const script = extra.gameStreamWrapperScript!
      expect(script).toContain("MESA_GL_VERSION_OVERRIDE")
      expect(script).toContain("export MESA_GL_VERSION_OVERRIDE")
      // extraEnv override wins over defaults for SDL_VIDEODRIVER
      expect(script).toMatch(/SDL_VIDEODRIVER:=x11/)
      expect(script).not.toMatch(/SDL_VIDEODRIVER:=wayland,x11/)
    })
  })

  describe("system mode with explicit absolute path overrides", () => {
    const result = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          group = "users";
          streamHost = {
            enable = true;
            runtimeDir = "/var/run/korri";
            intentPath = "/var/run/korri/next-launch.json";
            statusPath = "/var/run/korri/status.json";
          };
        };
      }`),
    )

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
    const userMode = expectOk(
      evalFixture(`{ services.korri.server = { enable = true; }; }`),
    )
    const systemMode = expectOk(
      evalFixture(`{
        services.korri.server = {
          enable = true;
          serviceMode = "system";
          user = "testuser";
          group = "users";
        };
      }`),
    )
    const optedOut = expectOk(
      evalFixture(`{
        services.korri.server = { enable = true; };
        services.korri.cli.enable = false;
      }`),
    )
    const overridden = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.server = { enable = true; };
        services.korri.cli.package = pkgs.writeShellScriptBin "korri-cli-stub" "exit 0";
      })`),
    )

    it("defaults services.korri.cli.enable = true in user mode", () => {
      expect(userMode.cliEnabled).toBe(true)
      expect(
        userMode.systemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(true)
    })

    it("defaults services.korri.cli.enable = true in system mode", () => {
      expect(systemMode.cliEnabled).toBe(true)
      expect(
        systemMode.systemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(true)
    })

    it("respects an explicit services.korri.cli.enable = false opt-out", () => {
      expect(optedOut.cliEnabled).toBe(false)
      expect(
        optedOut.systemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(false)
    })

    it("honors a caller-supplied services.korri.cli.package override", () => {
      expect(overridden.cliPackage).toMatch(/korri-cli-stub/)
      expect(
        overridden.systemPackages.some(path => path.includes("korri-cli-stub")),
      ).toBe(true)
    })
  })
})
