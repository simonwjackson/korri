import { describe, expect, it } from "bun:test"
import { plugin } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import { prepareLaunch } from "./launch-prepare"

const provider = "@fixture:prepare" as const
const spec = { command: "game", args: ["--run"] }

describe("prepareLaunch", () => {
  it("runs enabled launch.prepare handlers in check mode without changing the spec", async () => {
    const calls: unknown[] = []
    const registry = createPluginRegistry(
      [
        plugin({
          namespace: "@fixture",
          name: "prepare",
          contributes: {
            handlers: [
              {
                id: "prepare.launch-prepare",
                operation: "launch.prepare",
                capabilities: ["launch.prepare"],
                run: context => {
                  calls.push(context.input)
                  return undefined
                },
              },
            ],
          },
        }),
      ],
      { enabledPluginIds: [provider] },
    )

    await expect(
      Effect.runPromise(
        prepareLaunch({
          spec,
          launchPrepare: { [provider]: { profileId: 37 } },
          registry,
          options: { mode: "check" },
        }),
      ),
    ).resolves.toEqual({ _tag: "LaunchPrepared", spec })
    expect(calls).toEqual([
      {
        spec,
        policy: { profileId: 37 },
        mode: "check",
      },
    ])
  })

  it("accepts a prepared launch spec from a handler", async () => {
    const registry = createPluginRegistry(
      [
        plugin({
          namespace: "@fixture",
          name: "prepare",
          contributes: {
            handlers: [
              {
                id: "prepare.launch-prepare",
                operation: "launch.prepare",
                capabilities: ["launch.prepare"],
                run: () => ({ spec: { command: "prepared", args: [] } }),
              },
            ],
          },
        }),
      ],
      { enabledPluginIds: [provider] },
    )

    await expect(
      Effect.runPromise(
        prepareLaunch({
          spec,
          launchPrepare: { [provider]: {} },
          registry,
          options: { mode: "commit" },
        }),
      ),
    ).resolves.toEqual({
      _tag: "LaunchPrepared",
      spec: { command: "prepared", args: [] },
    })
  })

  it("returns diagnostics for missing, disabled, and failing providers", async () => {
    const registry = createPluginRegistry(
      [
        plugin({ namespace: "@fixture", name: "prepare" }),
        plugin({
          namespace: "@fixture",
          name: "broken",
          contributes: {
            handlers: [
              {
                id: "broken.launch-prepare",
                operation: "launch.prepare",
                capabilities: ["launch.prepare"],
                run: () => {
                  throw new Error("boom")
                },
              },
            ],
          },
        }),
      ],
      { enabledPluginIds: ["@fixture:broken"] },
    )

    const result = await Effect.runPromise(
      prepareLaunch({
        spec,
        launchPrepare: {
          "@fixture:missing": {},
          [provider]: {},
          "@fixture:broken": {},
        },
        registry,
        options: { mode: "commit" },
      }),
    )

    expect(result).toMatchObject({
      _tag: "LaunchPrepareDiagnostics",
      diagnostics: [
        { _tag: "PluginMissing", provider: "@fixture:missing" },
        { _tag: "PluginDisabled", provider },
        { _tag: "OperationFailed", provider: "@fixture:broken" },
      ],
    })
  })
})
