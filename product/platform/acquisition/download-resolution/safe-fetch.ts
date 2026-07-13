import { AcquisitionError } from "../errors"
import { validateOutboundHttpUrl, validateRedirectUrl } from "./url-policy"

export type SafeFetchLike = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>

const MAX_REDIRECT_HOPS = 5

/**
 * Fetch that validates every hop against the outbound URL policy BEFORE the
 * request is made. Automatic redirect following would let a safe public URL
 * bounce to a private host (or forward Cookie/Referer to it) before we could
 * inspect it, so redirects are followed manually with validateRedirectUrl
 * gating each Location. Returns the final non-redirect response.
 */
export async function fetchWithValidatedRedirects(
  fetchImpl: SafeFetchLike,
  url: string | URL,
  init: RequestInit,
  maxHops = MAX_REDIRECT_HOPS,
): Promise<Response> {
  let current = String(url)
  validateOutboundHttpUrl(current)
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const response = await fetchImpl(current, { ...init, redirect: "manual" })
    const location = redirectLocation(response)
    if (location === undefined) return response
    const next = new URL(location, current).toString()
    validateRedirectUrl(current, next)
    current = next
  }
  throw new AcquisitionError({
    reason: "infrastructure",
    message: `too many redirects (>${maxHops})`,
  })
}

function redirectLocation(response: Response): string | undefined {
  if (response.status < 300 || response.status >= 400) return undefined
  const location = response.headers.get("location")
  return location && location.length > 0 ? location : undefined
}
