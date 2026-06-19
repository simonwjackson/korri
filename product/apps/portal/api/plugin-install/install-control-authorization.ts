import { createHmac } from "node:crypto"
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
    Effect.provideService(effect, CurrentInstallControl, {
      authorized: installControlAuthorized(headers, process.env),
    }),
)

export const requireInstallControl = Effect.gen(function* () {
  const control = yield* CurrentInstallControl
  if (!control.authorized) {
    return yield* Effect.fail(
      new ValidationError({ message: "Install control authorization required" }),
    )
  }
})

export function installControlAuthorized(
  headers: Readonly<Record<string, unknown>>,
  env: NodeJS.ProcessEnv,
): boolean {
  const expected = installControlSecret(env)
  if (!expected) return false
  const direct = headerValue(headers, INSTALL_CONTROL_HEADER)
  if (constantTimeEqual(direct, expected)) return true
  const auth = headerValue(headers, INSTALL_CONTROL_AUTH_HEADER)
  if (auth?.startsWith("Bearer ") && constantTimeEqual(auth.slice(7), expected)) {
    return true
  }
  return (
    cookieValue(headerValue(headers, "cookie"), INSTALL_CONTROL_COOKIE) ===
    installControlSessionToken(expected)
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

export function installControlCookie(secret: string): string {
  return `${INSTALL_CONTROL_COOKIE}=${encodeURIComponent(installControlSessionToken(secret))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
}

export function installControlSessionToken(secret: string): string {
  return `v1.${createHmac("sha256", secret)
    .update("korri-install-control-session")
    .digest("base64url")}`
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
