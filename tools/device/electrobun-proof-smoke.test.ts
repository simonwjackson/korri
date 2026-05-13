import { describe, expect, it } from "bun:test"
import {
  evaluateElectrobunProof,
  forbiddenFallbackFlags,
} from "./electrobun-proof-smoke"

const readyInput = {
  status: {
    url: "http://127.0.0.1:4321/",
    pid: 123,
    profile: "device",
  },
  healthOk: true,
  webkitProcessAlive: true,
  korriWindowCount: 1,
  focusedFullscreenWindow: true,
  rendererFatalLogLines: [],
  forbiddenFallbackFlags: [],
  positiveGpuEvidence: true,
}

describe("Electrobun proof smoke evaluation", () => {
  it("accepts a live focused fullscreen Electrobun app with positive GPU evidence", () => {
    expect(evaluateElectrobunProof(readyInput)).toEqual({
      ok: true,
      gpuAccepted: true,
      issues: [],
      warnings: [],
    })
  })

  it("distinguishes API liveness from GPU acceptance", () => {
    const report = evaluateElectrobunProof({
      ...readyInput,
      positiveGpuEvidence: false,
    })

    expect(report.ok).toBe(true)
    expect(report.gpuAccepted).toBe(false)
    expect(report.warnings.join("\n")).toContain("positive device-screen")
  })

  it("rejects API-only success when WebKit or Sway evidence is missing", () => {
    const report = evaluateElectrobunProof({
      ...readyInput,
      webkitProcessAlive: false,
      korriWindowCount: 0,
      focusedFullscreenWindow: false,
    })

    expect(report.ok).toBe(false)
    expect(report.issues).toContain(
      "WebKit/Electrobun render process was not observed alive",
    )
    expect(report.issues).toContain(
      "Sway did not report a Korri Electrobun window",
    )
  })

  it("rejects a missing status file", () => {
    const report = evaluateElectrobunProof({
      ...readyInput,
      status: undefined,
      healthOk: false,
    })

    expect(report.ok).toBe(false)
    expect(report.issues).toContain("Electrobun status file was not written")
    expect(report.issues).toContain(
      "Electrobun loopback /api/health did not respond",
    )
  })

  it("rejects non-loopback status URLs", () => {
    const report = evaluateElectrobunProof({
      ...readyInput,
      status: { ...readyInput.status, url: "http://192.168.1.2:4321/" },
    })

    expect(report.ok).toBe(false)
    expect(report.issues.join("\n")).toContain("not loopback")
  })

  it("rejects fatal renderer log evidence even when liveness checks pass", () => {
    const report = evaluateElectrobunProof({
      ...readyInput,
      rendererFatalLogLines: [
        "Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...",
      ],
    })

    expect(report.ok).toBe(false)
    expect(report.gpuAccepted).toBe(false)
    expect(report.issues.join("\n")).toContain("EGL_BAD_PARAMETER")
  })

  it("blocks GPU acceptance for known fallback flags", () => {
    const report = evaluateElectrobunProof({
      ...readyInput,
      forbiddenFallbackFlags: ["GSK_RENDERER=cairo"],
    })

    expect(report.ok).toBe(true)
    expect(report.gpuAccepted).toBe(false)
    expect(report.warnings.join("\n")).toContain("GSK_RENDERER=cairo")
  })

  it("detects forbidden fallback environment flags", () => {
    expect(
      forbiddenFallbackFlags({
        GSK_RENDERER: "cairo",
        WEBKIT_DISABLE_COMPOSITING_MODE: "1",
        WEBKIT_DISABLE_DMABUF_RENDERER: "1",
      }),
    ).toEqual([
      "GSK_RENDERER=cairo",
      "WEBKIT_DISABLE_COMPOSITING_MODE=1",
      "WEBKIT_DISABLE_DMABUF_RENDERER=1",
    ])
  })
})
