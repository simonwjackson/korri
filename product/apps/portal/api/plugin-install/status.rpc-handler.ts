import {
  DataError,
  NotFoundError,
  ValidationError,
} from "@platform/api/rpc/errors"
import { installMetadataAllowed } from "@platform/library/config/app-install-metadata"
import {
  parsePluginInstallNextActionHint,
  parsePluginInstallState,
} from "@platform/library/install-state"
import { LibrarySource } from "@platform/library/library-services"
import type { PluginHandler, ProviderId } from "@platform/plugin"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { createFirstPartyPluginRegistryFromEnv } from "../../../../plugins"
import { requireInstallControl } from "./install-control-authorization"
import {
  type PluginInstallStatusPayload,
  PluginInstallStatusResponse,
} from "./status.rpc"

const INSTALL_STATUS_OPERATION = "install.status" as const
const INSTALL_STATUS_CAPABILITY = "install.status" as const

export const handlePluginInstallStatus = (
  payload: typeof PluginInstallStatusPayload.Type,
) =>
  Effect.gen(function* () {
    yield* requireInstallControl
    if (!isProviderId(payload.providerId)) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Invalid provider id: ${payload.providerId}`,
        }),
      )
    }
    if (payload.appId.length === 0) {
      return yield* Effect.fail(
        new ValidationError({ message: "Invalid app id" }),
      )
    }
    yield* requireInstallMetadata(payload.providerId, payload.appId)

    const registry = createFirstPartyPluginRegistryFromEnv(process.env)
    const plugin = registry.get(payload.providerId)
    if (!plugin || !registry.enabledPluginIds.has(payload.providerId)) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} is not enabled or does not exist`,
        }),
      )
    }
    const handler = plugin.handlers.find(isInstallStatusHandler) as
      | PluginHandler<typeof INSTALL_STATUS_OPERATION, unknown, unknown>
      | undefined
    if (!handler) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} does not expose install status`,
        }),
      )
    }

    const result = yield* runPluginHandler(handler, {
      operation: INSTALL_STATUS_OPERATION,
      provider: payload.providerId,
      input: {
        appId: payload.appId,
        ...(payload.requestId ? { requestId: payload.requestId } : {}),
        authorized: true,
      },
    }).pipe(
      Effect.mapError(
        error =>
          new DataError({
            reason: "Unavailable",
            message: `Plugin provider ${payload.providerId} install status failed: ${sanitize(String(error))}`,
          }),
      ),
    )
    const record = isRecord(result) ? result : {}
    return new PluginInstallStatusResponse({
      providerId: payload.providerId,
      appId: payload.appId,
      ...(typeof record.requestId === "string"
        ? { requestId: record.requestId }
        : payload.requestId
          ? { requestId: payload.requestId }
          : {}),
      state: parsePluginInstallState(record.state),
      ...(typeof record.bytesDownloaded === "number"
        ? { bytesDownloaded: record.bytesDownloaded }
        : {}),
      ...(typeof record.bytesToDownload === "number"
        ? { bytesToDownload: record.bytesToDownload }
        : {}),
      ...(typeof record.percent === "number"
        ? { percent: record.percent }
        : {}),
      ...(isRecord(record.providerEvidence)
        ? { providerEvidence: record.providerEvidence }
        : {}),
      ...(typeof record.lastEvidenceAt === "string"
        ? { lastEvidenceAt: record.lastEvidenceAt }
        : {}),
      nextActionHint: parsePluginInstallNextActionHint(record.nextActionHint),
      ...(typeof record.message === "string"
        ? { message: sanitize(record.message) }
        : {}),
    })
  })

function requireInstallMetadata(providerId: string, appId: string) {
  return Effect.gen(function* () {
    const source = yield* LibrarySource
    if (!source.listPlayableEntries) {
      return yield* Effect.fail(
        new DataError({
          reason: "Unavailable",
          message: "Install authorization requires playable library entries",
        }),
      )
    }
    const entries = yield* source
      .listPlayableEntries()
      .pipe(
        Effect.mapError(
          error =>
            new DataError({
              reason: "Unavailable",
              message: sanitize(String(error)),
            }),
        ),
      )
    if (installMetadataAllowed(entries, providerId, appId)) return
    return yield* Effect.fail(
      new NotFoundError({
        message: `Install status is not allowed for ${providerId} app ${appId}`,
      }),
    )
  })
}
function isProviderId(value: string): value is ProviderId {
  return value.startsWith("@") && value.includes(":")
}
function isInstallStatusHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === INSTALL_STATUS_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(INSTALL_STATUS_CAPABILITY))
  )
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function sanitize(value: string): string {
  return value.replace(/\/(?:[^\s/]+\/)+[^\s]+/g, "<path>").slice(0, 240)
}
