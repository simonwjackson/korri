import { describe, expect, it } from "bun:test"
import { Effect, Exit } from "effect"
import { runKorriCli } from "./korri-cli"

describe("korri CLI", () => {
  it("renders help for the root command", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["--help"]))

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the stream launch command", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli(["stream", "launch", "--help"]),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("fails through the CLI framework for an unknown subcommand", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["does-not-exist"]))

    expect(Exit.isFailure(exit)).toBe(true)
  })
})
