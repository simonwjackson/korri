import type { AcquisitionPluginContext } from "@platform/acquisition/plugin-runtime"
import { plugin } from "@platform/plugin"
import { Effect } from "effect"
import { createItchioPluginDefinition } from "./src/definition"

export const KORRI_ITCHIO_PLUGIN_ID = "@korri:itchio" as const

const definition = createItchioPluginDefinition()
const noopLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

/**
 * Bridges the unified run(context) services into the definition's context.
 * The handler harness provides provider-scoped services (capable http with
 * the provider cookie session); the definition sources all network access
 * from them — there is no global-fetch fallback.
 */
function acquisitionContext(
  services: AcquisitionPluginContext["services"],
): AcquisitionPluginContext {
  return {
    clock: { nowIso: () => new Date().toISOString() },
    logger: noopLogger,
    env: process.env,
    ...(services ? { services } : {}),
  }
}

export const itchioPlugin = plugin({
  namespace: "@korri",
  name: "itchio",
  title: "itch.io",
  contributes: {
    config: {
      providers: {
        "@korri:itchio": {
          module: "product/plugins/itchio",
          legalRisk: "medium",
          credentialRequired: false,
          enabledByDefault: true,
        },
      },
    },
    handlers: [
      {
        id: "itchio-claims-search",
        operation: "claims.search",
        run: ({ input, services }) =>
          definition.search?.(
            acquisitionContext(services),
            input as {
              readonly query: string
              readonly platforms?: readonly string[]
            },
          ) ?? Effect.succeed([]),
      },
      {
        id: "itchio-claims-parse-url",
        operation: "claims.parse-url",
        run: ({ input }) => {
          const url = (input as { readonly url?: unknown }).url
          return typeof url === "string"
            ? (definition.parseCandidateUrl?.(url) ?? null)
            : null
        },
      },
      {
        id: "itchio-claims-details",
        operation: "claims.details",
        run: ({ input, services }) =>
          definition.details?.(acquisitionContext(services), input as never) ??
          Effect.die("missing itch.io details handler"),
      },
      {
        id: "itchio-provider-validate",
        operation: "provider.validate",
        run: ({ input, services }) => {
          const checkedAt =
            (input as { readonly checkedAt?: unknown }).checkedAt ??
            new Date().toISOString()
          return (
            definition.validateProvider?.({
              ...acquisitionContext(services),
              checkedAt: String(checkedAt),
            }) ?? Effect.die("missing itch.io validate handler")
          )
        },
      },
      {
        id: "itchio-artifact-resolve-download",
        operation: "artifact.resolve-download",
        run: ({ input, services }) =>
          definition.resolveDownload?.(
            acquisitionContext(services),
            input as never,
          ) ?? Effect.die("missing itch.io resolve-download handler"),
      },
      {
        id: "itchio-artifact-acquire",
        operation: "artifact.acquire",
        run: ({ input, services }) =>
          definition.acquireArtifact?.(
            acquisitionContext(services),
            input as never,
          ) ?? Effect.die("missing itch.io acquire handler"),
      },
    ],
  },
})
