import { ValidationError } from "@platform/api/rpc/errors"
import { Context, Effect, Layer } from "effect"
import { RpcMiddleware } from "effect/unstable/rpc"

export const INSTALL_CONTROL_COOKIE = "korri_install_control"
export const INSTALL_CONTROL_HEADER = "x-korri-install-control"
export const INSTALL_CONTROL_AUTH_HEADER = "authorization"

export interface InstallControlInfo {
  readonly authorized: boolean
}

export class CurrentInstallControl extends Context.Service<
  CurrentInstallControl,
  InstallControlInfo
>()("CurrentInstallControl") {}

export class InstallControlMiddleware extends RpcMiddleware.Service<
  InstallControlMiddleware,
  { provides: CurrentInstallControl }
>()("InstallControlMiddleware") {}

export const InstallControlMiddlewareLive = Layer.succeed(
  InstallControlMiddleware,
)(
  (effect, { headers }) =>
    Effect.flatMap(
      Effect.promise(() => installControlAuthorized(headers, process.env)),
      authorized =>
        Effect.provideService(effect, CurrentInstallControl, { authorized }),
    ),
)

export const requireInstallControl = Effect.gen(function* () {
  const control = yield* CurrentInstallControl
  if (!control.authorized) {
    return yield* Effect.fail(
      new ValidationError({ message: "Install control authorization required" }),
    )
  }
})

export async function installControlAuthorized(
  headers: Readonly<Record<string, unknown>>,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const expected = installControlSecret(env)
  if (!expected) return false
  const direct = headerValue(headers, INSTALL_CONTROL_HEADER)
  if (constantTimeEqual(direct, expected)) return true
  const auth = headerValue(headers, INSTALL_CONTROL_AUTH_HEADER)
  if (auth?.startsWith("Bearer ") && constantTimeEqual(auth.slice(7), expected)) {
    return true
  }
  return constantTimeEqual(
    cookieValue(headerValue(headers, "cookie"), INSTALL_CONTROL_COOKIE),
    await installControlSessionToken(expected),
  )
}

export function installControlSecret(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.KORRI_INSTALL_CONTROL_SECRET ?? env.KORRI_INSTALL_CONTROL_PIN
  return value !== undefined && isStrongInstallControlSecret(value)
    ? value
    : undefined
}

function isStrongInstallControlSecret(value: string): boolean {
  if (value.length < 16) return false
  if (/^(.)\1+$/.test(value)) return false
  if (/^[0-9]+$/.test(value)) return false
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(pattern =>
    pattern.test(value),
  ).length
  return classes >= 2
}

export async function installControlCookie(secret: string): Promise<string> {
  return `${INSTALL_CONTROL_COOKIE}=${encodeURIComponent(await installControlSessionToken(secret))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
}

export async function installControlSessionToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode("korri-install-control-session"),
    ),
  )
  return `v1.${bytesToHex(signature)}`
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
}

function headerValue(
  headers: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const direct = headers[name]
  if (typeof direct === "string") return direct
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && typeof value === "string") return value
  }
  return undefined
}

function cookieValue(cookie: string | undefined, name: string): string | undefined {
  if (!cookie) return undefined
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=")
    if (rawKey === name) {
      try {
        return decodeURIComponent(rawValue.join("="))
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

function constantTimeEqual(a: string | undefined, b: string): boolean {
  if (a === undefined || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}
