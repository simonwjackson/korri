import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-kiosk-module-eval.fixture.nix",
)

type EvalResult = {
  assertionsPassed: boolean
  assertionMessages: string[]
  warnings: string[]
  optionSurface: {
    server: boolean
    client: boolean
    inputd: boolean
    kiosk: boolean
  }
  clientEnabled: boolean
  inputdEnabled: boolean
  kioskEnabled: boolean
  clientSystemPackages: string[]
  kioskUnitExists: boolean
  kioskWantedBy: string[]
  kioskWants: string[]
  kioskRequires: string[]
  kioskAfter: string[]
  kioskServiceUser: string | null
  kioskServiceGroup: string | null
  kioskExecStart: string | null
  kioskEnvironment: Record<string, string>
  inputdBefore: string[]
  inputdAfter: string[]
  inputdWants: string[]
  swayConfig: string | null
  clientLauncher: string | null
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

const HARDWARE_FACT_PATTERN = /SM8550|AYN|Odin|DSI-1|DSI-2|UCM|RockNix/i

setDefaultTimeout(30_000)

describe("services.korri.kiosk NixOS module evaluation", () => {
  it("aggregate korri module exposes server, client, inputd, and kiosk roles", () => {
    const result = expectOk(evalFixture("{ }"))

    expect(result.optionSurface).toEqual({
      server: true,
      client: true,
      inputd: true,
      kiosk: true,
    })
  })

  it("keeps client package installation separate from kiosk session ownership", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.client = {
          enable = true;
          package = pkgs.writeShellScriptBin "korri-client-only" "exit 0";
        };
      })`),
    )

    expect(result.clientEnabled).toBe(true)
    expect(
      result.clientSystemPackages.some(path =>
        path.includes("korri-client-only"),
      ),
    ).toBe(true)
    expect(result.kioskUnitExists).toBe(false)
    expect(result.inputdEnabled).toBe(false)
  })

  it("enabling kiosk mkDefault-enables client and emits one product session service", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )

    expect(result.assertionsPassed).toBe(true)
    expect(result.clientEnabled).toBe(true)
    expect(result.kioskEnabled).toBe(true)
    expect(result.kioskUnitExists).toBe(true)
    expect(result.kioskWantedBy).toEqual(["multi-user.target"])
    expect(result.kioskServiceUser).toBe("root")
    expect(result.kioskExecStart).toContain("sway")
    expect(result.swayConfig).toContain("korri-kiosk-client")
    expect(result.kioskEnvironment.KORRI_NATIVE_BRIDGE_URL).toBe(
      "ws://127.0.0.1:3002",
    )
  })

  it("accepts platform Sway fragments while keeping Korri client autostart product-owned", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "device-korri" "exit 0"}/bin/device-korri";
          sway.extraConfig = ''
            output DEVICE-PANEL transform 90
          '';
        };
      })`),
    )

    expect(result.swayConfig).not.toBeNull()
    const config = result.swayConfig as string
    expect(config).toContain("exec --no-startup-id")
    expect(result.clientLauncher).toContain("device-korri")
    expect(config).toContain("output DEVICE-PANEL transform 90")
  })

  it("wires inputd and platform input dependencies before the kiosk when required", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input = {
            required = true;
            provider = {
              enable = true;
              name = "platform-input";
              services = [ "platform-input.service" ];
            };
          };
        };
      })`),
    )

    expect(result.assertionsPassed).toBe(true)
    expect(result.inputdEnabled).toBe(true)
    expect(result.kioskWants).toEqual(
      expect.arrayContaining([
        "korri-inputd.service",
        "platform-input.service",
      ]),
    )
    expect(result.kioskAfter).toEqual(
      expect.arrayContaining([
        "korri-inputd.service",
        "platform-input.service",
      ]),
    )
    expect(result.kioskRequires).toEqual(
      expect.arrayContaining([
        "korri-inputd.service",
        "platform-input.service",
      ]),
    )
    expect(result.inputdBefore).toEqual(
      expect.arrayContaining(["korri-kiosk.service"]),
    )
  })

  it("allows deliberate input opt-out for non-interactive kiosk variants", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input = {
            required = true;
            provider.enable = false;
            optOutReason = "automated visual fixture";
          };
        };
      })`),
    )

    expect(result.assertionsPassed).toBe(true)
  })

  it("rejects required appliance input without provider declaration or opt-out", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input.required = true;
          input.provider.enable = false;
        };
      })`),
    )

    expect(result.assertionsPassed).toBe(false)
    expect(result.assertionMessages.join("\n")).toContain(
      "services.korri.kiosk.input.required",
    )
  })

  it("rejects creating a managed root kiosk user", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = true;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )

    expect(result.assertionsPassed).toBe(false)
    expect(result.assertionMessages.join("\n")).toContain("createUser")
  })

  it("preserves client command arguments through the generated launcher", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client --profile kiosk";
        };
      })`),
    )

    expect(result.swayConfig).toContain("korri-kiosk-client")
    expect(result.clientLauncher).toContain(
      "korri-kiosk-client --profile kiosk",
    )
  })

  it("omits Group when a platform supplies an existing user without an explicit group", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        users.users.platform-user = {
          isNormalUser = true;
          group = "users";
        };
        services.korri.kiosk = {
          enable = true;
          user = "platform-user";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )

    expect(result.assertionsPassed).toBe(true)
    expect(result.kioskServiceUser).toBe("platform-user")
    expect(result.kioskServiceGroup).toBeNull()
  })

  it("rejects empty and non-/run kiosk runtime directories", () => {
    const emptyUser = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )
    const relativeRuntime = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          runtimeDir = "korri-kiosk";
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )
    const outsideRun = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          runtimeDir = "/tmp/korri-kiosk";
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )

    expect(emptyUser.assertionsPassed).toBe(false)
    expect(emptyUser.assertionMessages.join("\n")).toContain(
      "must not be empty",
    )
    expect(relativeRuntime.assertionsPassed).toBe(false)
    expect(relativeRuntime.assertionMessages.join("\n")).toContain(
      "absolute path",
    )
    expect(outsideRun.assertionsPassed).toBe(false)
    expect(outsideRun.assertionMessages.join("\n")).toContain("under /run")
  })

  it("keeps device-specific facts out of generic defaults", () => {
    const result = expectOk(
      evalFixture(`({ pkgs, ... }: {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "\${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      })`),
    )

    expect(result.swayConfig).not.toMatch(HARDWARE_FACT_PATTERN)
    expect(JSON.stringify(result.kioskEnvironment)).not.toMatch(
      HARDWARE_FACT_PATTERN,
    )
  })
})
