import { plugin } from "@platform/plugin"
import { Effect } from "effect"
import type { AcquisitionPluginContext } from "../platform/acquisition/plugin-runtime"
import { createItchioPluginDefinition } from "../platform/acquisition/plugins/itchio"

export const KORRI_ITCHIO_PLUGIN_ID = "@korri:itchio" as const

const definition = createItchioPluginDefinition()
const noopLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

function acquisitionContext(): AcquisitionPluginContext {
  return {
    clock: { nowIso: () => new Date().toISOString() },
    logger: noopLogger,
    env: process.env,
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
        run: ({ input }) =>
          definition.search?.(
            acquisitionContext(),
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
        run: ({ input }) =>
          definition.details?.(acquisitionContext(), input as never) ??
          Effect.die("missing itch.io details handler"),
      },
      {
        id: "itchio-provider-validate",
        operation: "provider.validate",
        run: ({ input }) => {
          const checkedAt =
            (input as { readonly checkedAt?: unknown }).checkedAt ??
            new Date().toISOString()
          return (
            definition.validateProvider?.({
              ...acquisitionContext(),
              checkedAt: String(checkedAt),
            }) ?? Effect.die("missing itch.io validate handler")
          )
        },
      },
      {
        id: "itchio-artifact-resolve-download",
        operation: "artifact.resolve-download",
        run: ({ input }) =>
          definition.resolveDownload?.(acquisitionContext(), input as never) ??
          Effect.die("missing itch.io resolve-download handler"),
      },
      {
        id: "itchio-artifact-acquire",
        operation: "artifact.acquire",
        run: ({ input }) =>
          definition.acquireArtifact?.(acquisitionContext(), input as never) ??
          Effect.die("missing itch.io acquire handler"),
      },
    ],
  },
})
