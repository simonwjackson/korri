import { redactCredentialText } from "@platform/acquisition/security"
import { DataError, ValidationError } from "@platform/api/rpc/errors"
import type { AcquisitionError } from "@platform/protocol/acquisition/errors"

/**
 * Acquisition RPCs are registered only on the headless/server RPC group in
 * this slice. They inherit Korri's current local-deployment RPC middleware
 * posture; broader network exposure must add an explicit authorization review
 * before these source-acquisition operations are advertised externally.
 */
export function toAcquisitionRpcError(error: AcquisitionError) {
  if (error.reason === "caller" || error.reason === "unsafe-url") {
    return new ValidationError({ message: safeMessage(error.message) })
  }
  return new DataError({
    reason: error.reason === "infrastructure" ? "ReadFailed" : "Unavailable",
    message: safeMessage(error.message),
  })
}

function safeMessage(message: string): string {
  const redacted = redactCredentialText(message)
  const lineBreakIndex = firstIndexOfAny(redacted, [
    "\r",
    "\n",
    String.fromCharCode(27),
  ])
  return lineBreakIndex === -1 ? redacted : redacted.slice(0, lineBreakIndex)
}

function firstIndexOfAny(input: string, needles: readonly string[]): number {
  const indexes = needles
    .map(needle => input.indexOf(needle))
    .filter(index => index !== -1)
  return indexes.length === 0 ? -1 : Math.min(...indexes)
}
