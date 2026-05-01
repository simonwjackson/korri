import { describe, expect, test } from "bun:test"
import {
  classifyElectrobunRuntime,
  hasNixDynamicLinkerFailure,
} from "./electrobun-runtime-check"

const nixStubOutput = [
  "Could not start dynamically linked executable: node_modules/electrobun/bin/electrobun",
  "NixOS cannot run dynamically linked executables intended for generic linux environments out of the box.",
  "https://nix.dev/permalink/stub-ld",
].join("\n")

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
    expect(report.messages).toContain(
      "Electrobun native binary probe succeeded.",
    )
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
    expect(hasNixDynamicLinkerFailure(nixStubOutput)).toBe(true)

    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: { exitCode: 127, stdout: "", stderr: nixStubOutput },
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("failed")
    expect(report.messages).toContain(
      "Electrobun's Linux binary failed under the NixOS dynamic linker stub.",
    )
    expect(report.recommendations.join("\n")).toContain("nix develop")
  })

  test("reports ready after a NixOS dynamic linker failure is auto-patched and re-probed", () => {
    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: { exitCode: 127, stdout: "", stderr: nixStubOutput },
      cliPatchAttempt: {
        ok: true,
        status: "applied",
        filePath: "node_modules/electrobun/bin/electrobun",
        messages: ["Patched node_modules/electrobun/bin/electrobun."],
        recommendations: [],
      },
      reprobe: { exitCode: 0, stdout: "electrobun", stderr: "" },
    })

    expect(report.ok).toBe(true)
    expect(report.status).toBe("ready")
    expect(report.messages).toContain(
      "Patched node_modules/electrobun/bin/electrobun.",
    )
    expect(report.messages).toContain(
      "Electrobun native binary probe succeeded after auto-patch.",
    )
  })

  test("surfaces patch failures with nix-ld fallback advice", () => {
    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: { exitCode: 127, stdout: "", stderr: nixStubOutput },
      cliPatchAttempt: {
        ok: false,
        status: "failed",
        filePath: "node_modules/electrobun/bin/electrobun",
        messages: ["Nix dynamic linker patch inputs are missing."],
        recommendations: ["Run inside nix develop."],
      },
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("failed")
    expect(report.messages).toContain(
      "Electrobun auto-patch failed after the NixOS dynamic linker probe failure.",
    )
    expect(report.recommendations.join("\n")).toContain("nix-ld")
  })

  test("surfaces the re-probe failure after a successful patch", () => {
    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: { exitCode: 127, stdout: "", stderr: nixStubOutput },
      cliPatchAttempt: {
        ok: true,
        status: "applied",
        filePath: "node_modules/electrobun/bin/electrobun",
        messages: ["Patched node_modules/electrobun/bin/electrobun."],
        recommendations: [],
      },
      reprobe: {
        exitCode: 1,
        stdout: "",
        stderr: "error while loading shared libraries: libwebkitgtk-4.1.so",
      },
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("failed")
    expect(report.messages.join("\n")).toContain("libwebkitgtk-4.1.so")
    expect(report.recommendations.join("\n")).toContain("GTK/WebKitGTK")
  })

  test("does not patch non-NixOS Linux probe failures", () => {
    const report = classifyElectrobunRuntime({
      platform: "linux",
      packageJsonExists: true,
      cliShimExists: true,
      probe: {
        exitCode: 1,
        stdout: "",
        stderr: "error while loading shared libraries: libwebkitgtk-4.1.so",
      },
      cliPatchAttempt: {
        ok: true,
        status: "applied",
        filePath: "node_modules/electrobun/bin/electrobun",
        messages: ["should not be included"],
        recommendations: [],
      },
    })

    expect(report.ok).toBe(false)
    expect(report.messages.join("\n")).not.toContain("should not be included")
    expect(report.messages.join("\n")).toContain("libwebkitgtk-4.1.so")
  })
})
