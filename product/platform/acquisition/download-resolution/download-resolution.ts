import type {
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"
import { acquisitionTry } from "../effect"
import type { AcquisitionError } from "../errors"
import { validatePluginDownloadResolutionOutput } from "../plugin-contract-codecs"
import { runPluginOperation } from "../plugin-operation-harness"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import type { AcquisitionPluginRegistry } from "../plugins/registry"
import { validateOutboundHttpUrl } from "./url-policy"

export interface ResolveAcquisitionDownloadOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: ResolveDownloadRequest
}

export function resolveAcquisitionDownload({
  registry,
  context,
  request,
}: ResolveAcquisitionDownloadOptions): Effect.Effect<
  DownloadResolution,
  AcquisitionError
> {
  return Effect.gen(function* () {
    yield* acquisitionTry(() => validateOutboundHttpUrl(request.candidateUrl))
    const plugin = yield* acquisitionTry(() => registry.get(request.providerId))
    const resolveDownload = plugin.resolveDownload
    if (!resolveDownload) {
      return {
        _tag: "NonFinalDownload" as const,
        providerId: plugin.metadata.providerId,
        reason: "unsupported" as const,
        url: request.candidateUrl,
      }
    }
    return yield* runPluginOperation({
      providerId: plugin.metadata.providerId,
      operation: "resolveDownload",
      context,
      run: () => resolveDownload(context, request),
      validate: validatePluginDownloadResolutionOutput,
    })
  })
}
