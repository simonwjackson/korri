import { describe, expect, it } from "bun:test"
import type { ExecutablePluginResource } from "@platform/plugin"
import {
  PluginResourceFulfillmentFailed,
  PluginResourceMissing,
  type PluginExecutableResourceFulfiller,
  type PluginExecutableResourceResolver,
  type ResolvedExecutableResource,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import { resolveOrFulfillGmloaderRuntime } from "./runtime"

const resource: ExecutablePluginResource = {
  id: "gmloader-next",
  kind: "executable",
  fulfill: {
    provider: "nix",
    installable: ".#gmloader-next",
    binary: "gmloader-next",
  },
}

const resolved: ResolvedExecutableResource = {
  pluginId: "@korri:gmloader",
  resourceId: "gmloader-next",
  command: "/store/gmloader/bin/gmloader-next",
}

describe("GMLoader runtime resolver", () => {
  it("resolves an already fulfilled runtime without invoking fulfillment", async () => {
    let fulfillCalls = 0
    const result = await Effect.runPromise(
      resolveOrFulfillGmloaderRuntime({
        resource,
        resolver: resolverSucceeding(resolved),
        fulfiller: {
          fulfillExecutable: () => {
            fulfillCalls += 1
            return Effect.succeed(resolved)
          },
        },
        allowFulfill: true,
      }),
    )

    expect(result.status).toBe("cache-hit")
    expect(result.runtime.command).toBe(resolved.command)
    expect(fulfillCalls).toBe(0)
  })

  it("fulfills and resolves a missing runtime when mutation is allowed", async () => {
    let fulfillCalls = 0
    const result = await Effect.runPromise(
      resolveOrFulfillGmloaderRuntime({
        resource,
        resolver: resolverMissing(),
        fulfiller: {
          fulfillExecutable: () => {
            fulfillCalls += 1
            return Effect.succeed(resolved)
          },
        },
        allowFulfill: true,
      }),
    )

    expect(result.status).toBe("fulfilled")
    expect(result.runtime).toEqual(resolved)
    expect(fulfillCalls).toBe(1)
  })

  it("fails closed when the runtime is missing and fulfillment is not allowed", async () => {
    const exit = await Effect.runPromiseExit(
      resolveOrFulfillGmloaderRuntime({
        resource,
        resolver: resolverMissing(),
        allowFulfill: false,
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("GMLoader runtime is not available")
    }
  })

  it("does not attempt fulfillment without a configured fulfiller", async () => {
    const exit = await Effect.runPromiseExit(
      resolveOrFulfillGmloaderRuntime({
        resource,
        resolver: resolverMissing(),
        allowFulfill: true,
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("runtime fulfillment is not configured")
    }
  })

  it("maps fulfillment failures to runtime unavailable errors", async () => {
    const exit = await Effect.runPromiseExit(
      resolveOrFulfillGmloaderRuntime({
        resource,
        resolver: resolverMissing(),
        fulfiller: {
          fulfillExecutable: () =>
            Effect.fail(
              new PluginResourceFulfillmentFailed({
                pluginId: "@korri:gmloader",
                resourceId: "gmloader-next",
                message: "nix failed",
              }),
            ),
        },
        allowFulfill: true,
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("nix failed")
    }
  })
})

function resolverSucceeding(
  runtime: ResolvedExecutableResource,
): PluginExecutableResourceResolver {
  return { resolveExecutable: () => Effect.succeed(runtime) }
}

function resolverMissing(): PluginExecutableResourceResolver {
  return {
    resolveExecutable: () =>
      Effect.fail(
        new PluginResourceMissing({
          pluginId: "@korri:gmloader",
          resourceId: "gmloader-next",
          path: "/missing/gmloader-next",
        }),
      ),
  }
}
