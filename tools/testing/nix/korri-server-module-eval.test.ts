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
  systemNoNewPrivileges: boolean | null
  systemProtectSystem: string | boolean | null
  systemRestart: string | null
  userServiceEnv: Record<string, string> | null
  systemServiceEnv: Record<string, string> | null
  tmpfilesRunDir: { user?: string; group?: string; mode?: string } | null
  gameStreamRuntimeDir: string | null
  gameStreamIntentPath: string | null
  gameStreamStatusPath: string | null
  firewallTcpPorts: number[]
  firewallInterfaceNames: string[]
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

    it("has no failing assertions", () => {
      expect(result.assertionsPassed).toBe(true)
      expect(result.assertionMessages).toEqual([])
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
})
