import { isKnownGate } from "@shared/gates/registry"

export const GATES_HEADER = "x-feature-gates"

export function serializeGatesHeader(requestedOn: ReadonlySet<string>): string {
  return [...requestedOn].filter(isKnownGate).join(",")
}

export function parseGatesHeader(headerValue: string | undefined): Set<string> {
  if (!headerValue || headerValue.trim() === "") {
    return new Set()
  }

  return new Set(
    headerValue
      .split(",")
      .map(value => value.trim())
      .filter(isKnownGate),
  )
}
