import { describe, expect, test } from "bun:test"
import {
  classifyElectrobunRuntime,
  hasNixDynamicLinkerFailure,
} from "./electrobun-runtime-check"

describe("electrobun runtime check", () => {
  test("reports ready when the package and Linux native probe succeed", () => {
    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: { exitCode: 0, stdout: "electrobun", stderr: "" },
    })

    expect(report.ok).toBe(true)
    expect(report.status).toBe("ready")
  })

  test("skips Linux native probing on non-Linux platforms", () => {
    const report = classifyElectrobunRuntime({
      platform: "darwin",
      packageJsonExists: true,
      cliShimExists: true,
    })

    expect(report.ok).toBe(true)
    expect(report.status).toBe("ready")
    expect(report.messages).toContain(
      "Non-Linux host detected; NixOS probe skipped.",
    )
  })

  test("fails with an actionable message when electrobun is not installed", () => {
    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: false,
      cliShimExists: false,
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("failed")
    expect(report.messages).toContain(
      "electrobun is not installed; run the dependency install before desktop checks.",
    )
  })

  test("recognizes NixOS dynamic linker failures", () => {
    const output = [
      "Could not start dynamically linked executable: node_modules/electrobun/bin/electrobun",
      "NixOS cannot run dynamically linked executables intended for generic linux environments out of the box.",
      "https://nix.dev/permalink/stub-ld",
    ].join("\n")

    expect(hasNixDynamicLinkerFailure(output)).toBe(true)

    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: { exitCode: 127, stdout: "", stderr: output },
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("failed")
    expect(report.messages).toContain(
      "Electrobun's Linux binary failed under the NixOS dynamic linker stub.",
    )
    expect(report.recommendations).toContain(
      "Enable nix-ld for local development, or add a wrapper/patchelf/Nix derivation before treating desktop packaging as supported on NixOS.",
    )
  })
})
