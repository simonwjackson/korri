import { AcquisitionError } from "./errors"

const SOURCE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function canonicalizeSourceName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
}

export function validateSourceName(input: string): string {
  const canonical = canonicalizeSourceName(input)
  if (!SOURCE_NAME_PATTERN.test(canonical)) {
    throw new AcquisitionError({
      reason: "caller",
      message: "Unknown or invalid acquisition source name.",
      sourceName: canonical || undefined,
    })
  }
  return canonical
}

export function validateKnownSourceName(
  input: string,
  registry: ReadonlySet<string>,
): string {
  const canonical = validateSourceName(input)
  if (!registry.has(canonical)) {
    throw new AcquisitionError({
      reason: "caller",
      message: "Unknown or invalid acquisition source name.",
      sourceName: canonical,
    })
  }
  return canonical
}
