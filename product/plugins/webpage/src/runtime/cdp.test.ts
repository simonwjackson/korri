import { describe, expect, it } from "bun:test"
import { runtimeEvaluateValue } from "./cdp"

describe("CDP evaluate", () => {
  it("throws JavaScript exception details instead of returning undefined", () => {
    expect(() =>
      runtimeEvaluateValue({
        result: {
          type: "object",
          subtype: "error",
          description: "Error: boom",
        },
        exceptionDetails: {
          text: "Uncaught",
          exception: { description: "Error: boom" },
        },
      }),
    ).toThrow("Error: boom")
  })

  it("returns normal by-value evaluation results", () => {
    expect(
      runtimeEvaluateValue({ result: { value: { status: "ready" } } }),
    ).toEqual({
      status: "ready",
    })
  })
})
