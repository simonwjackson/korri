import { describe, expect, it } from "bun:test"
import { Effect, Exit } from "effect"
import { runKorriCli } from "./korri-cli"

describe("korri CLI", () => {
  it("renders help for the root command", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["--help"]))

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the play command", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["play", "--help"]))

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the stream launch command", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli(["stream", "launch", "--help"]),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the stream remote-launch command", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli(["stream", "remote-launch", "--help"]),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("fails through the CLI framework for an unknown subcommand", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["does-not-exist"]))

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("reports missing stream runtime location as a prepare failure", async () => {
    const previousExitCode = process.exitCode
    const previousIntentPath = process.env.KORRI_GAME_STREAM_INTENT_PATH
    const previousRuntimeDir = process.env.XDG_RUNTIME_DIR
    const previousError = console.error
    const errors: string[] = []

    process.exitCode = undefined
    delete process.env.KORRI_GAME_STREAM_INTENT_PATH
    delete process.env.XDG_RUNTIME_DIR
    console.error = (line?: unknown) => {
      errors.push(String(line))
    }

    try {
      const exit = await Effect.runPromiseExit(
        runKorriCli(["stream", "launch", "snes/f-zero.smc"]),
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(Number(process.exitCode)).toBe(6)
      expect(errors.join("\n")).toContain(
        "KORRI_GAME_STREAM_INTENT_PATH or XDG_RUNTIME_DIR is required for launch intents",
      )
    } finally {
      console.error = previousError
      process.exitCode = previousExitCode ?? 0
      if (previousIntentPath === undefined) {
        delete process.env.KORRI_GAME_STREAM_INTENT_PATH
      } else {
        process.env.KORRI_GAME_STREAM_INTENT_PATH = previousIntentPath
      }
      if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR
      else process.env.XDG_RUNTIME_DIR = previousRuntimeDir
    }
  })
})
