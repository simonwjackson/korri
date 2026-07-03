import { describe, expect, it } from "bun:test"
import {
  type CliFailureKind,
  codeForFailure,
  ExitCode,
  fail,
  ok,
  renderOutcome,
} from "./cli-outcome"

const KIND_TO_CODE: ReadonlyArray<readonly [CliFailureKind, ExitCode]> = [
  ["internal", 1],
  ["usage", 2],
  ["not-found", 3],
  ["ambiguous", 4],
  ["host-unreachable", 5],
  ["host-service-off", 6],
  ["not-configured", 7],
  ["launch-invalid", 8],
  ["host-refused", 9],
  ["launch-failed", 10],
  ["stop-pending", 11],
  ["cancelled", 130],
]

describe("exit-code table", () => {
  for (const [kind, code] of KIND_TO_CODE) {
    it(`maps ${kind} to ${code}`, () => {
      expect(codeForFailure(kind)).toBe(code)
    })
  }

  it("keeps success at 0 and cancellation at 130", () => {
    expect(renderOutcome(ok()).code).toBe(0)
    expect(renderOutcome(fail("cancelled", "aborted")).code).toBe(130)
  })

  it("never emits a code in the reserved 126-165 or 255 range", () => {
    const allowed = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 130])
    for (const code of Object.values(ExitCode)) {
      expect(allowed.has(code)).toBe(true)
      expect(code === 130 || (code >= 0 && code <= 11)).toBe(true)
    }
  })
})

describe("renderOutcome", () => {
  it("returns the ok lines with code 0", () => {
    expect(renderOutcome(ok(["launched: snes/echo.smc"]))).toEqual({
      text: ["launched: snes/echo.smc"],
      code: 0,
    })
  })

  it("returns empty text for a bare ok", () => {
    expect(renderOutcome(ok())).toEqual({ text: [], code: 0 })
  })

  it("renders message then details for a failure", () => {
    expect(
      renderOutcome(
        fail("launch-invalid", "launch configuration failed", ["bad spec"]),
      ),
    ).toEqual({
      text: ["launch configuration failed", "bad spec"],
      code: 8,
    })
  })

  it("carries the child exit code in text but still returns 10 for launch-failed", () => {
    const rendered = renderOutcome(
      fail("launch-failed", "launch failed: exit=7", ["stderr tail"]),
    )
    expect(rendered.code).toBe(10)
    expect(rendered.text[0]).toContain("exit=7")
  })
})
