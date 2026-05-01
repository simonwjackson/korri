import { afterEach, describe, expect, test } from "bun:test"
import type { ParsedScenario } from "./parser"
import { After, Before, clearRegistry, Given, Then } from "./registry"
import { executeScenario, executeScenarioWithCallbacks } from "./resolver"
import { BddWorld } from "./world"

afterEach(() => {
  clearRegistry()
})

function scenario(steps: string[]): ParsedScenario {
  return {
    name: "Runtime seam",
    tags: [],
    steps: steps.map(text => ({ text, argument: undefined })),
  }
}

describe("BDD scenario execution", () => {
  test("runs step-level callbacks around each step", async () => {
    const events: string[] = []
    Before(() => {
      events.push("before-hook")
    })
    After(() => {
      events.push("after-hook")
    })
    Given("the first step runs", () => {
      events.push("first-step")
    })
    Then("the second step runs", () => {
      events.push("second-step")
    })

    await executeScenarioWithCallbacks(
      new BddWorld(),
      scenario(["the first step runs", "the second step runs"]),
      {
        beforeStep: ({ stepIndex, step }) => {
          events.push(`before-step-${stepIndex}:${step.text}`)
        },
        afterStep: ({ stepIndex, step, error }) => {
          events.push(
            `after-step-${stepIndex}:${step.text}:${error ? "error" : "ok"}`,
          )
        },
      },
    )

    expect(events).toEqual([
      "before-hook",
      "before-step-0:the first step runs",
      "first-step",
      "after-step-0:the first step runs:ok",
      "before-step-1:the second step runs",
      "second-step",
      "after-step-1:the second step runs:ok",
      "after-hook",
    ])
  })

  test("runs after hooks and reports failing steps to callbacks", async () => {
    const events: string[] = []
    Given("the failing step runs", () => {
      events.push("failing-step")
      throw new Error("step failed")
    })
    After(() => {
      events.push("after-hook")
    })

    await expect(
      executeScenarioWithCallbacks(
        new BddWorld(),
        scenario(["the failing step runs"]),
        {
          afterStep: ({ error }) => {
            events.push(error instanceof Error ? error.message : "no error")
          },
        },
      ),
    ).rejects.toThrow("step failed")

    expect(events).toEqual(["failing-step", "step failed", "after-hook"])
  })

  test("keeps executeScenario as the callback-free entry point", async () => {
    const events: string[] = []
    Given("the scenario step runs", () => {
      events.push("step")
    })

    await executeScenario(new BddWorld(), scenario(["the scenario step runs"]))

    expect(events).toEqual(["step"])
  })
})
