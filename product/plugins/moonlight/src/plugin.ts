import type { MoonlightPolicy } from "@platform/library/config/inheritable-fields"
import type { LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import {
  composeMoonlightStreamLaunchSpec,
  type ComposeMoonlightStreamLaunchSpecOptions,
  type MoonlightLaunchFacts,
} from "./moonlight-launch-spec"

export const KORRI_MOONLIGHT_PLUGIN_ID = "@korri:moonlight" as const

/**
 * Moonlight is Korri's first-party streaming backend. It contributes the
 * streamer capability behind generic dispatch operations (`stream.launch`,
 * `stream.discover`, `stream-control.*`); payloads remain Moonlight-shaped until
 * a second streaming backend justifies a neutral abstraction.
 */
export const moonlightPlugin = plugin({
  namespace: "@korri",
  name: "moonlight",
  title: "Moonlight",
  description:
    "Contributes Korri's first-party Moonlight game-streaming backend: launch-spec composition, LAN discovery, local-control protocol, and stream-control.",
  contributes: {
    config: {
      modules: {
        "stream-launch": {
          id: "stream-launch",
          kind: "streamer",
          capabilities: ["stream.launch"],
        },
      },
    },
    handlers: [
      {
        id: "moonlight.stream-launch",
        operation: "stream.launch",
        capabilities: ["stream.launch"],
        run: context =>
          composeMoonlightStreamLaunchSpec(
            decodeStreamLaunchInput(context.input),
          ),
      },
      {
        id: "moonlight.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["stream.launch"],
        run: () => ({ provider: KORRI_MOONLIGHT_PLUGIN_ID, status: "ok" }),
      },
    ],
  },
})

function decodeStreamLaunchInput(
  input: unknown,
): ComposeMoonlightStreamLaunchSpecOptions {
  if (!isRecord(input)) {
    throw new Error("Moonlight stream.launch input must be an object")
  }
  return {
    facts: decodeLaunchFacts(input.facts),
    ...(input.policy === undefined
      ? {}
      : { policy: input.policy as MoonlightPolicy }),
  }
}

function decodeLaunchFacts(value: unknown): MoonlightLaunchFacts {
  if (!isRecord(value) || typeof value.host !== "string") {
    throw new Error(
      "Moonlight stream.launch input.facts requires a string host",
    )
  }
  return value as unknown as MoonlightLaunchFacts
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export type { LaunchSpec }
