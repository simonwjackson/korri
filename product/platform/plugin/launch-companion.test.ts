import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import { Effect } from "effect"
import { plugin } from "./index"
import { composeLaunchCompanions } from "./launch-companion"
import { createPluginRegistry } from "./registry"

const baseSpec: LaunchSpec = { command: "/bin/game", args: ["--run"] }

const wrapperPlugin = plugin({
  namespace: "@test",
  name: "wrapper",
  contributes: {
    handlers: [
      {
        id: "test.wrapper.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose"],
        run: context => {
          const input = context.input as {
            readonly spec: LaunchSpec
            readonly policy: { readonly flag?: string }
          }
          return {
            command: "/bin/wrapper",
            args: [input.policy.flag ?? "--default", "--", input.spec.command],
          }
        },
      },
    ],
  },
})

const metadataPlugin = plugin({
  namespace: "@test",
  name: "metadata",
  contributes: {
    handlers: [
      {
        id: "test.metadata.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose"],
        run: context => {
          const input = context.input as {
            readonly spec: LaunchSpec
            readonly options?: {
              readonly launchMetadata?: { readonly appProviderId?: string }
            }
          }
          return {
            ...input.spec,
            args: [
              ...input.spec.args,
              input.options?.launchMetadata?.appProviderId ?? "missing",
            ],
          }
        },
      },
    ],
  },
})

const envPlugin = plugin({
  namespace: "@test",
  name: "env",
  contributes: {
    handlers: [
      {
        id: "test.env.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose"],
        run: context => {
          const input = context.input as {
            readonly spec: LaunchSpec
            readonly policy: { readonly name: string; readonly value: string }
          }
          return {
            ...input.spec,
            env: {
              ...(input.spec.env ?? {}),
              [input.policy.name]: input.policy.value,
            },
          }
        },
      },
    ],
  },
})

describe("composeLaunchCompanions", () => {
  it("dispatches launch.compose handlers in provider-map order", async () => {
    const registry = createPluginRegistry([wrapperPlugin, envPlugin], {
      enabledPluginIds: [wrapperPlugin.id, envPlugin.id],
    })

    const result = await Effect.runPromise(
      composeLaunchCompanions({
        spec: baseSpec,
        registry,
        launchCompanions: {
          [wrapperPlugin.id]: { flag: "--wrap" },
          [envPlugin.id]: { name: "WRAPPED", value: "1" },
        },
      }),
    )

    expect(result).toEqual({
      _tag: "LaunchCompanionsComposed",
      spec: {
        command: "/bin/wrapper",
        args: ["--wrap", "--", "/bin/game"],
        env: { WRAPPED: "1" },
      },
    })
  })

  it("passes provider-qualified launch metadata to launch companions", async () => {
    const registry = createPluginRegistry([metadataPlugin], {
      enabledPluginIds: [metadataPlugin.id],
    })

    const result = await Effect.runPromise(
      composeLaunchCompanions({
        spec: baseSpec,
        registry,
        launchCompanions: { [metadataPlugin.id]: {} },
        options: { launchMetadata: { appProviderId: "@korri:steam" } },
      }),
    )

    expect(result).toEqual({
      _tag: "LaunchCompanionsComposed",
      spec: { command: "/bin/game", args: ["--run", "@korri:steam"] },
    })
  })

  it("skips explicitly disabled launch companion policies", async () => {
    const registry = createPluginRegistry([wrapperPlugin])

    const result = await Effect.runPromise(
      composeLaunchCompanions({
        spec: baseSpec,
        registry,
        launchCompanions: {
          [wrapperPlugin.id]: { enable: false },
          "@test:missing": { enable: false },
        },
      }),
    )

    expect(result).toEqual({
      _tag: "LaunchCompanionsComposed",
      spec: baseSpec,
    })
  })

  it("returns structured diagnostics for missing and disabled providers", async () => {
    const registry = createPluginRegistry([wrapperPlugin])

    const result = await Effect.runPromise(
      composeLaunchCompanions({
        spec: baseSpec,
        registry,
        launchCompanions: {
          [wrapperPlugin.id]: {},
          "@test:missing": {},
        },
      }),
    )

    expect(result._tag).toBe("LaunchCompanionDiagnostics")
    if (result._tag !== "LaunchCompanionDiagnostics") return
    expect(result.diagnostics.map(diagnostic => diagnostic._tag)).toEqual([
      "PluginDisabled",
      "PluginMissing",
    ])
    expect(result.diagnostics[0]).toMatchObject({
      provider: wrapperPlugin.id,
      operation: "launch.compose",
      capability: "launch.compose",
      phase: "preflight",
      recoverable: true,
    })
  })
})
