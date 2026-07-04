import type { LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import type { MoonlightPolicy } from "./config/policy"
import {
  type ComposeMoonlightStreamLaunchSpecOptions,
  composeMoonlightStreamLaunchSpec,
  type MoonlightLaunchFacts,
} from "./moonlight-launch-spec"
import {
  applyMoonlightStreamControl,
  describeMoonlightStreamControl,
} from "./stream-control/handlers"
import { connectMoonlightStreamControlSession } from "./stream-control/session"

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
        "stream-control": {
          id: "stream-control",
          kind: "control-surface",
          capabilities: [
            "stream-control.apply",
            "stream-control.describe",
            "stream-control.connect",
          ],
        },
        "moonlight-embedded-korri-package": {
          id: "moonlight-embedded-korri-package",
          kind: "nix-package",
          package: "moonlight-embedded-korri",
          path: "product/plugins/moonlight/packages/moonlight-embedded-korri",
          capabilities: ["package.expose"],
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
        id: "moonlight.stream-control-describe",
        operation: "stream-control.describe",
        capabilities: ["stream-control.describe"],
        run: context =>
          describeMoonlightStreamControl({
            provider: context.provider,
            ...(isRecord(context.input) &&
            typeof context.input.socketPath === "string"
              ? { socketPath: context.input.socketPath }
              : {}),
          }),
      },
      {
        id: "moonlight.stream-control-apply",
        operation: "stream-control.apply",
        capabilities: ["stream-control.apply"],
        run: context => {
          const input = decodeApplyInput(context.input)
          return applyMoonlightStreamControl({
            provider: context.provider,
            action: input.action,
            payload: input.payload,
            ...(input.socketPath ? { socketPath: input.socketPath } : {}),
          })
        },
      },
      {
        id: "moonlight.stream-control-connect",
        operation: "stream-control.connect",
        capabilities: ["stream-control.connect"],
        run: context =>
          connectMoonlightStreamControlSession(
            decodeConnectInput(context.input),
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

function decodeApplyInput(input: unknown): {
  readonly action: string
  readonly payload: Record<string, unknown>
  readonly socketPath?: string
} {
  if (!isRecord(input) || typeof input.action !== "string") {
    throw new Error("Moonlight stream-control.apply input.action is required")
  }
  if (!isRecord(input.payload)) {
    throw new Error("Moonlight stream-control.apply input.payload is required")
  }
  return {
    action: input.action,
    payload: input.payload,
    ...(typeof input.socketPath === "string"
      ? { socketPath: input.socketPath }
      : {}),
  }
}

function decodeConnectInput(input: unknown): { readonly socketPath: string } {
  if (!isRecord(input) || typeof input.socketPath !== "string") {
    throw new Error(
      "Moonlight stream-control.connect input requires a string socketPath",
    )
  }
  return { socketPath: input.socketPath }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export type { LaunchSpec }
