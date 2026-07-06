import {
  DataError,
  NotFoundError,
  ValidationError,
} from "@platform/api/rpc/errors"
import { installMetadataAllowed } from "@platform/library/config/app-install-metadata"
import { parsePluginInstallState } from "@platform/library/install-state"
import { LibrarySource } from "@platform/library/library-services"
import type { PluginHandler, ProviderId } from "@platform/plugin"
import { runPluginHandler } from "@platform/plugin"
import { createFirstPartyPluginState } from "@product/plugin-host/state"
import { Effect } from "effect"
import { requireInstallControl } from "./install-control-authorization"
import {
  type RequestPluginInstallPayload,
  RequestPluginInstallResponse,
} from "./request.rpc"

const INSTALL_REQUEST_OPERATION = "install.request" as const
const INSTALL_REQUEST_CAPABILITY = "install.request" as const

export const handleRequestPluginInstall = (
  payload: typeof RequestPluginInstallPayload.Type,
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

    const registry = createFirstPartyPluginState().registry
    const plugin = registry.get(payload.providerId)
    if (!plugin || !registry.enabledPluginIds.has(payload.providerId)) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} is not enabled or does not exist`,
        }),
      )
    }
    const handler = plugin.handlers.find(isInstallRequestHandler) as
      | PluginHandler<typeof INSTALL_REQUEST_OPERATION, unknown, unknown>
      | undefined
    if (!handler) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} does not expose install requests`,
        }),
      )
    }

    const result = yield* runPluginHandler(handler, {
      operation: INSTALL_REQUEST_OPERATION,
      provider: payload.providerId,
      input: {
        appId: payload.appId,
        ...(payload.playableId ? { playableId: payload.playableId } : {}),
        ...(payload.mode ? { mode: payload.mode } : {}),
        authorized: true,
      },
    }).pipe(
      Effect.mapError(
        error =>
          new DataError({
            reason: "Unavailable",
            message: `Plugin provider ${payload.providerId} install request failed: ${sanitize(String(error))}`,
          }),
      ),
    )

    const record = asRecord(result)
    return new RequestPluginInstallResponse({
      providerId: payload.providerId,
      appId: payload.appId,
      requestId:
        stringField(record, "requestId") ??
        `${payload.providerId}:${payload.appId}`,
      outcome: outcomeField(record.outcome),
      state: parsePluginInstallState(record.state),
      ...(typeof record.message === "string"
        ? { message: sanitize(record.message) }
        : {}),
      ...(typeof record.observedAt === "string"
        ? { observedAt: record.observedAt }
        : {}),
      ...(isRecord(record.providerEvidence)
        ? { providerEvidence: record.providerEvidence }
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
    const entries = yield* source.listPlayableEntries().pipe(
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
        message: `Install is not allowed for ${providerId} app ${appId}`,
      }),
    )
  })
}

function isProviderId(value: string): value is ProviderId {
  return value.startsWith("@") && value.includes(":")
}
function isInstallRequestHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === INSTALL_REQUEST_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(INSTALL_REQUEST_CAPABILITY))
  )
}
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined
}
function outcomeField(value: unknown): RequestPluginInstallResponse["outcome"] {
  return value === "accepted" ||
    value === "already-installed" ||
    value === "already-in-progress" ||
    value === "rejected"
    ? value
    : "accepted"
}
function sanitize(value: string): string {
  return value.replace(/\/(?:[^\s/]+\/)+[^\s]+/g, "<path>").slice(0, 240)
}
