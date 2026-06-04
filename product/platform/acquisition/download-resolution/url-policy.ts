import { AcquisitionError } from "../errors"

const PRIVATE_HOSTS = new Set(["localhost", "localhost."])

const PRIVATE_IPV4_PREFIXES = new Map<number, ReadonlySet<number> | "any">([
  [0, "any"],
  [10, "any"],
  [127, "any"],
  [100, new Set(Array.from({ length: 64 }, (_, index) => index + 64))],
  [169, new Set([254])],
  [172, new Set(Array.from({ length: 16 }, (_, index) => index + 16))],
  [192, new Set([168])],
])

export function validateOutboundHttpUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw unsafeUrl()
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw unsafeUrl()
  if (url.username || url.password) throw unsafeUrl()
  if (isPrivateHost(url.hostname)) throw unsafeUrl()
  return url
}

export function validateRedirectUrl(from: string, to: string): URL {
  const fromUrl = validateOutboundHttpUrl(from)
  const toUrl = validateOutboundHttpUrl(to)
  if (fromUrl.protocol === "https:" && toUrl.protocol !== "https:") {
    throw unsafeUrl()
  }
  return toUrl
}

function unsafeUrl(): AcquisitionError {
  return new AcquisitionError({
    reason: "unsafe-url",
    message: "Acquisition URL is not allowed.",
  })
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return PRIVATE_HOSTS.has(host) || isPrivateIpv6(host) || isPrivateIpv4(host)
}

function isPrivateIpv6(host: string): boolean {
  const raw = stripIpv6Brackets(host)
  return (
    raw === "::1" ||
    isIpv6LinkLocal(raw) ||
    raw.startsWith("fc") ||
    raw.startsWith("fd") ||
    raw.startsWith("64:ff9b:") ||
    raw.startsWith("::ffff:")
  )
}

function isIpv6LinkLocal(raw: string): boolean {
  const prefix = Number.parseInt(raw.slice(0, 4), 16)
  return Number.isInteger(prefix) && (prefix & 0xffc0) === 0xfe80
}

function stripIpv6Brackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  const [a, b] = parts
  return isPrivateIpv4Prefix(a, b)
}

function isPrivateIpv4Prefix(a: number, b: number): boolean {
  const allowedSeconds = PRIVATE_IPV4_PREFIXES.get(a)
  return allowedSeconds === "any" || allowedSeconds?.has(b) === true
}
