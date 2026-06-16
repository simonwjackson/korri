import { AcquisitionError } from "./errors"

const PROVIDER_ID_PATTERN = /^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/

export function validateProviderId(input: string): string {
  const providerId = input.trim()
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new AcquisitionError({
      reason: "caller",
      message: "Unknown or invalid provider id.",
      providerId: providerId || undefined,
    })
  }
  return providerId
}

export function validateKnownProviderId(
  input: string,
  registry: ReadonlySet<string>,
): string {
  const providerId = validateProviderId(input)
  if (!registry.has(providerId)) {
    throw new AcquisitionError({
      reason: "caller",
      message: "Unknown or invalid provider id.",
      providerId,
    })
  }
  return providerId
}
