import { isProviderId } from "./ids"
import type { ProviderId } from "./index"

export interface LaunchMetadata {
  readonly appProviderId?: ProviderId
  readonly annotations?: Readonly<Record<ProviderId, unknown>>
}

export function hasLaunchMetadata(
  launchMetadata: LaunchMetadata | undefined,
): launchMetadata is LaunchMetadata {
  return (
    launchMetadata !== undefined &&
    (launchMetadata.appProviderId !== undefined ||
      hasAnnotationEntries(launchMetadata.annotations))
  )
}

export function decodeLaunchMetadata(
  value: unknown,
  subject = "launch metadata",
): LaunchMetadata {
  const record = decodeRecord(value, `${subject} must be an object`)
  const appProviderId = decodeOptionalProviderId(
    record.appProviderId,
    `${subject} appProviderId must be a provider id`,
  )
  const annotations = decodeOptionalAnnotations(
    record.annotations,
    `${subject} annotations must be an object`,
    `${subject} annotation provider must be a provider id`,
  )

  return {
    ...(appProviderId ? { appProviderId } : {}),
    ...(hasAnnotationEntries(annotations) ? { annotations } : {}),
  }
}

function decodeOptionalProviderId(
  value: unknown,
  message: string,
): ProviderId | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string" && isProviderId(value)) return value
  throw new Error(message)
}

function decodeOptionalAnnotations(
  value: unknown,
  recordMessage: string,
  providerMessage: string,
): Readonly<Record<ProviderId, unknown>> | undefined {
  if (value === undefined) return undefined
  const record = decodeRecord(value, recordMessage)
  const decoded: Record<ProviderId, unknown> = {}
  for (const [provider, annotation] of Object.entries(record)) {
    if (!isProviderId(provider)) {
      throw new Error(`${providerMessage}: ${provider}`)
    }
    decoded[provider] = annotation
  }
  return decoded
}

function hasAnnotationEntries(
  annotations: Readonly<Record<ProviderId, unknown>> | undefined,
): annotations is Readonly<Record<ProviderId, unknown>> {
  return annotations !== undefined && Object.keys(annotations).length > 0
}

function decodeRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error(message)
}
