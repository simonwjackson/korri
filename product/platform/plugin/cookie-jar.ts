/**
 * Minimal session cookie jar for provider-scoped plugin HTTP.
 *
 * Scope: one jar per provider-scoped services instance, so a plugin's
 * multi-hop flow (page -> form POST -> file) shares its session while
 * providers can never read each other's cookies. Session-lifetime only:
 * Expires/Max-Age are honored just enough to drop deleted cookies.
 */

interface StoredCookie {
  readonly name: string
  readonly value: string
  readonly domain: string
  readonly hostOnly: boolean
  readonly path: string
  readonly secure: boolean
}

export interface CookieJar {
  readonly store: (url: string, setCookies: readonly string[]) => void
  readonly cookieHeader: (url: string) => string | undefined
}

export function createCookieJar(): CookieJar {
  const cookies = new Map<string, StoredCookie>()

  return {
    store: (url, setCookies) => {
      const target = tryParseUrl(url)
      if (target === undefined) return
      for (const raw of setCookies) {
        const parsed = parseSetCookie(raw, target)
        if (parsed === undefined) continue
        const key = `${parsed.domain}|${parsed.path}|${parsed.name}`
        if (parsed.deleted) {
          cookies.delete(key)
        } else {
          cookies.set(key, parsed.cookie)
        }
      }
    },
    cookieHeader: url => {
      const target = tryParseUrl(url)
      if (target === undefined) return undefined
      const matching = [...cookies.values()].filter(cookie =>
        cookieMatches(cookie, target),
      )
      if (matching.length === 0) return undefined
      return matching.map(cookie => `${cookie.name}=${cookie.value}`).join("; ")
    },
  }
}

function tryParseUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

function parseSetCookie(
  raw: string,
  target: URL,
):
  | {
      name: string
      domain: string
      path: string
      deleted: boolean
      cookie: StoredCookie
    }
  | undefined {
  const [pair, ...attributes] = raw.split(";")
  const separator = pair?.indexOf("=") ?? -1
  if (pair === undefined || separator <= 0) return undefined
  const name = pair.slice(0, separator).trim()
  const value = pair.slice(separator + 1).trim()
  if (name.length === 0) return undefined

  let domain = target.hostname.toLowerCase()
  let hostOnly = true
  let path = defaultPath(target.pathname)
  let secure = false
  let deleted = false
  for (const attribute of attributes) {
    const [attrName, ...attrRest] = attribute.split("=")
    const key = attrName?.trim().toLowerCase()
    const attrValue = attrRest.join("=").trim()
    if (key === "domain" && attrValue.length > 0) {
      const requested = attrValue.replace(/^\./, "").toLowerCase()
      // Only honor a Domain that domain-matches the origin host and is not a
      // bare public suffix; otherwise a response could plant a cookie for an
      // unrelated host (e.g. Domain=other.test or Domain=com). Reject by
      // leaving the cookie host-only on the origin.
      if (domainIsAcceptable(requested, target.hostname.toLowerCase())) {
        domain = requested
        hostOnly = false
      }
    } else if (key === "path" && attrValue.startsWith("/")) {
      path = attrValue
    } else if (key === "secure") {
      secure = true
    } else if (key === "max-age") {
      const seconds = Number(attrValue)
      if (Number.isFinite(seconds) && seconds <= 0) deleted = true
    } else if (key === "expires") {
      const expiry = Date.parse(attrValue)
      if (Number.isFinite(expiry) && expiry <= Date.now()) deleted = true
    }
  }

  return {
    name,
    domain,
    path,
    deleted,
    cookie: { name, value, domain, hostOnly, path, secure },
  }
}

function domainIsAcceptable(domain: string, host: string): boolean {
  // Must contain a dot (rejects single-label suffixes like "com") and the
  // origin host must be the domain or a subdomain of it.
  if (!domain.includes(".")) return false
  if (isIpv4(domain)) return false
  return host === domain || host.endsWith(`.${domain}`)
}

function isIpv4(host: string): boolean {
  const parts = host.split(".")
  return (
    parts.length === 4 &&
    parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

function defaultPath(pathname: string): string {
  const lastSlash = pathname.lastIndexOf("/")
  return lastSlash > 0 ? pathname.slice(0, lastSlash) : "/"
}

function cookieMatches(cookie: StoredCookie, target: URL): boolean {
  const host = target.hostname.toLowerCase()
  const domainOk = cookie.hostOnly
    ? host === cookie.domain
    : host === cookie.domain || host.endsWith(`.${cookie.domain}`)
  if (!domainOk) return false
  if (cookie.secure && target.protocol !== "https:") return false
  const path = target.pathname.length === 0 ? "/" : target.pathname
  return (
    path === cookie.path ||
    (path.startsWith(cookie.path) &&
      (cookie.path.endsWith("/") || path[cookie.path.length] === "/"))
  )
}
