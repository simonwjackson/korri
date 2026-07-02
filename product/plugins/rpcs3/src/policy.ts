import { AppMaterializationFailed } from "@platform/library/config/errors"
import { KORRI_RPCS3_PLUGIN_ID } from "./ids"

export interface Rpcs3Policy {
  readonly command?: string
  readonly state?: {
    readonly root: string
  }
  readonly firmware?: {
    readonly sentinel?: string
  }
  readonly env?: Readonly<Record<string, string>>
  readonly extra?: {
    readonly args?: readonly string[]
  }
}

export const DEFAULT_RPCS3_FIRMWARE_SENTINEL =
  "dev_flash/sys/external/liblv2.sprx" as const

export function decodeRpcs3Policy(input: unknown): Rpcs3Policy {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    throw policyError("policy must be an object")
  }

  const policy: Rpcs3Policy = {}
  const command = input.command
  if (command !== undefined) {
    if (typeof command !== "string") throw policyError("policy command must be a string")
    Object.assign(policy, { command })
  }

  const state = input.state
  if (state !== undefined) {
    if (!isRecord(state) || typeof state.root !== "string") {
      throw policyError("policy state.root must be a string")
    }
    Object.assign(policy, { state: { root: state.root } })
  }

  const firmware = input.firmware
  if (firmware !== undefined) {
    if (!isRecord(firmware)) {
      throw policyError("policy firmware must be an object")
    }
    const sentinel = firmware.sentinel
    if (sentinel !== undefined && typeof sentinel !== "string") {
      throw policyError("policy firmware.sentinel must be a string")
    }
    Object.assign(policy, {
      firmware: sentinel !== undefined ? { sentinel } : {},
    })
  }

  const env = input.env
  if (env !== undefined) {
    if (!isStringRecord(env)) throw policyError("policy env must be a string map")
    Object.assign(policy, { env })
  }

  const extra = input.extra
  if (extra !== undefined) {
    if (!isRecord(extra)) throw policyError("policy extra must be an object")
    const args = extra.args
    if (
      args !== undefined &&
      (!Array.isArray(args) || args.some(arg => typeof arg !== "string"))
    ) {
      throw policyError("policy extra.args must be a string array")
    }
    Object.assign(policy, { extra: args !== undefined ? { args } : {} })
  }

  return policy
}

function policyError(reason: string): AppMaterializationFailed {
  return new AppMaterializationFailed({
    appId: KORRI_RPCS3_PLUGIN_ID,
    reason: `${KORRI_RPCS3_PLUGIN_ID} ${reason}`,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  if (!isRecord(value)) return false
  return Object.values(value).every(item => typeof item === "string")
}
