import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-kiosk-module-eval.fixture.nix",
)

type ScenarioResult = {
  assertionsPassed: boolean
  assertionMessages: string[]
  warnings: string[]
  optionSurface: {
    server: boolean
    client: boolean
    inputd: boolean
    kiosk: boolean
    cli: boolean
  }
  cliEnabled: boolean
  cliPackage: string
  clientEnabled: boolean
  inputdEnabled: boolean
  kioskEnabled: boolean
  clientSystemPackages: string[]
  kioskUnitExists: boolean
  kioskWantedBy: string[]
  kioskWants: string[]
  kioskRequires: string[]
  kioskAfter: string[]
  kioskPath: string[]
  kioskServiceUser: string | null
  kioskServiceGroup: string | null
  kioskExecStart: string | null
  kioskRuntimeDirectory: string | null
  kioskStartLimitBurst: number | null
  kioskStartLimitIntervalSec: number | null
  kioskEnvironment: Record<string, string>
  inputdBefore: string[]
  inputdAfter: string[]
  inputdWants: string[]
  inputdEnvironment: Record<string, string>
  swayConfig: string | null
  clientLauncher: string | null
}

type Scenarios = {
  baseline: ScenarioResult
  clientPackageOnly: ScenarioResult
  kioskEnablesClient: ScenarioResult // also serves the CLI-default assertions
  swayPlatformFragment: ScenarioResult
  existingSessionBus: ScenarioResult
  existingSessionBusMissingAddress: ScenarioResult
  platformInputProvider: ScenarioResult
  inputplumberProvider: ScenarioResult
  inputOptOut: ScenarioResult
  inputRequiredWithoutProvider: ScenarioResult
  inputProviderOrderingWithoutProvider: ScenarioResult
  inputDisabled: ScenarioResult
  rootCreateUser: ScenarioResult
  clientCommandWithArgs: ScenarioResult
  platformUserNoGroup: ScenarioResult
  emptyUser: ScenarioResult
  relativeRuntimeDir: ScenarioResult
  runtimeDirOutsideRun: ScenarioResult
  cliOptedOut: ScenarioResult
  cliPackageOverridden: ScenarioResult
}

/**
 * Spawns `nix eval` exactly once and returns every scenario the fixture
 * defines as an in-memory attrset. Per-test access is `scenarios.<key>` -
 * no further subprocess work happens after this returns.
 *
 * Before this batching, the file spawned `nix eval` per `it(...)` (~12s
 * each) and totalled ~250s. Now: one eval, ~20s for the whole file.
 * See docs/plans/2026-05-24-006-refactor-nix-test-harness-plan.md U2 and
 * tools/testing/nix/korri-desktop-build-graph.test.ts for the exemplar.
 */
function evalAllScenarios(): Scenarios {
  const apply = `f: f { flakeRoot = ${FLAKE_ROOT}; }`
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
    throw new Error(`nix eval failed (exit ${child.status}):\n${child.stderr}`)
  }

  const parsed = JSON.parse(child.stdout) as { scenarios: Scenarios }
  return parsed.scenarios
}

const HARDWARE_FACT_PATTERN = /SM8550|AYN|Odin|DSI-1|DSI-2|UCM|RockNix/i

setDefaultTimeout(90_000)

describe("services.korri.kiosk NixOS module evaluation", () => {
  const scenarios = evalAllScenarios()

  it("aggregate korri module exposes server, client, inputd, kiosk, and cli roles", () => {
    expect(scenarios.baseline.optionSurface).toEqual({
      server: true,
      client: true,
      inputd: true,
      kiosk: true,
      cli: true,
    })
  })

  it("keeps client package installation separate from kiosk session ownership", () => {
    const result = scenarios.clientPackageOnly
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
    const result = scenarios.kioskEnablesClient
    expect(result.assertionsPassed).toBe(true)
    expect(result.clientEnabled).toBe(true)
    expect(result.kioskEnabled).toBe(true)
    expect(result.kioskUnitExists).toBe(true)
    expect(result.kioskWantedBy).toEqual(["multi-user.target"])
    expect(result.kioskServiceUser).toBe("root")
    expect(result.kioskExecStart).toContain("dbus-run-session")
    expect(result.kioskExecStart).toContain("sway")
    expect(result.kioskRuntimeDirectory).toBe("korri-kiosk")
    expect(result.kioskStartLimitBurst).toBe(5)
    expect(result.kioskStartLimitIntervalSec).toBe(60)
    expect(result.kioskEnvironment.DBUS_SESSION_BUS_ADDRESS).toBeUndefined()
    expect(result.swayConfig).toContain("default_border none")
    expect(result.swayConfig).toContain("default_floating_border none")
    expect(result.swayConfig).toContain("hide_edge_borders both")
    expect(result.swayConfig).toContain("korri-kiosk-client")
    expect(result.clientLauncher).toContain("while true")
    expect(result.clientLauncher).toContain("client exited with status")
    expect(result.clientLauncher).not.toContain("swaymsg exit")
    expect(result.kioskEnvironment.KORRI_NATIVE_BRIDGE_URL).toBe(
      "ws://127.0.0.1:3002",
    )
    expect(result.kioskEnvironment.KORRI_DESKTOP_INPUTD_URL).toBe(
      "ws://127.0.0.1:3002",
    )
    expect(result.kioskPath.some(path => path.includes("gamescope"))).toBe(
      true,
    )
  })

  it("accepts platform Sway fragments while keeping Korri client autostart product-owned", () => {
    const result = scenarios.swayPlatformFragment
    expect(result.swayConfig).not.toBeNull()
    const config = result.swayConfig as string
    expect(config).toContain("default_border none")
    expect(config).toContain("exec --no-startup-id")
    expect(result.clientLauncher).toContain("device-korri")
    expect(config).toContain("output DEVICE-PANEL transform 90")
  })

  it("can use a platform-owned existing session bus", () => {
    const result = scenarios.existingSessionBus
    expect(result.assertionsPassed).toBe(true)
    expect(result.kioskExecStart).not.toContain("dbus-run-session")
    expect(result.kioskExecStart).toContain("sway")
    expect(result.kioskRuntimeDirectory).toBeNull()
    expect(result.kioskEnvironment.XDG_RUNTIME_DIR).toBe("/run/user/0")
    expect(result.kioskEnvironment.DBUS_SESSION_BUS_ADDRESS).toBe(
      "unix:path=/run/user/0/bus",
    )
    expect(result.kioskRequires).toContain("platform-session-dbus.service")
    expect(result.kioskAfter).toContain("platform-session-dbus.service")
  })

  it("rejects existing session bus mode without an address", () => {
    const result = scenarios.existingSessionBusMissingAddress
    expect(result.assertionsPassed).toBe(false)
    expect(result.assertionMessages.join("\n")).toContain("sessionBus.address")
  })

  it("wires inputd and platform input dependencies before the kiosk when required", () => {
    const result = scenarios.platformInputProvider
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

  it("propagates InputPlumber provider ordering and required mode into inputd", () => {
    const result = scenarios.inputplumberProvider
    expect(result.assertionsPassed).toBe(true)
    expect(result.inputdWants).toContain("inputplumber.service")
    expect(result.inputdAfter).toContain("inputplumber.service")
    expect(
      result.inputdEnvironment.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD,
    ).toBe("1")
  })

  it("allows deliberate input opt-out for non-interactive kiosk variants", () => {
    expect(scenarios.inputOptOut.assertionsPassed).toBe(true)
  })

  it("rejects required appliance input without provider declaration or opt-out", () => {
    const result = scenarios.inputRequiredWithoutProvider
    expect(result.assertionsPassed).toBe(false)
    expect(result.assertionMessages.join("\n")).toContain(
      "services.korri.kiosk.input.required",
    )
  })

  it("rejects provider service ordering when the provider is disabled", () => {
    const result = scenarios.inputProviderOrderingWithoutProvider
    expect(result.assertionsPassed).toBe(false)
    expect(result.assertionMessages.join("\n")).toContain(
      "provider service ordering",
    )
  })

  it("can deliberately disable kiosk input integration", () => {
    const result = scenarios.inputDisabled
    expect(result.assertionsPassed).toBe(true)
    expect(result.inputdEnabled).toBe(false)
    expect(result.kioskEnvironment.KORRI_DESKTOP_INPUTD_URL).toBeUndefined()
    expect(result.kioskEnvironment.KORRI_NATIVE_BRIDGE_URL).toBeUndefined()
    expect(result.kioskWants).not.toContain("korri-inputd.service")
    expect(result.kioskAfter).not.toContain("korri-inputd.service")
  })

  it("rejects creating a managed root kiosk user", () => {
    const result = scenarios.rootCreateUser
    expect(result.assertionsPassed).toBe(false)
    expect(result.assertionMessages.join("\n")).toContain("createUser")
  })

  it("preserves client command arguments through the generated launcher", () => {
    const result = scenarios.clientCommandWithArgs
    expect(result.swayConfig).toContain("korri-kiosk-client")
    expect(result.clientLauncher).toContain(
      "korri-kiosk-client --profile kiosk",
    )
  })

  it("omits Group when a platform supplies an existing user without an explicit group", () => {
    const result = scenarios.platformUserNoGroup
    expect(result.assertionsPassed).toBe(true)
    expect(result.kioskServiceUser).toBe("platform-user")
    expect(result.kioskServiceGroup).toBeNull()
  })

  it("rejects empty and non-/run kiosk runtime directories", () => {
    const emptyUser = scenarios.emptyUser
    const relativeRuntime = scenarios.relativeRuntimeDir
    const outsideRun = scenarios.runtimeDirOutsideRun

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

  describe("korri CLI is installed by default when kiosk is enabled", () => {
    it("defaults services.korri.cli.enable = true when kiosk is enabled", () => {
      expect(scenarios.kioskEnablesClient.cliEnabled).toBe(true)
    })

    it("installs the korri-cli package into environment.systemPackages", () => {
      expect(
        scenarios.kioskEnablesClient.clientSystemPackages.some(path =>
          /-korri-cli-/.test(path),
        ),
      ).toBe(true)
    })

    it("respects an explicit services.korri.cli.enable = false opt-out", () => {
      const result = scenarios.cliOptedOut
      expect(result.cliEnabled).toBe(false)
      expect(
        result.clientSystemPackages.some(path => /-korri-cli-/.test(path)),
      ).toBe(false)
    })

    it("honors a caller-supplied services.korri.cli.package override", () => {
      const result = scenarios.cliPackageOverridden
      expect(result.cliPackage).toMatch(/korri-cli-stub/)
      expect(
        result.clientSystemPackages.some(path =>
          path.includes("korri-cli-stub"),
        ),
      ).toBe(true)
    })
  })

  it("keeps device-specific facts out of generic defaults", () => {
    const result = scenarios.kioskEnablesClient
    expect(result.swayConfig).not.toMatch(HARDWARE_FACT_PATTERN)
    expect(JSON.stringify(result.kioskEnvironment)).not.toMatch(
      HARDWARE_FACT_PATTERN,
    )
  })
})
