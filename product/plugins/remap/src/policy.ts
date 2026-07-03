import type { ProviderId } from "@platform/plugin"
import { decodeRemapBindings, type RemapBinding } from "./bindings"
import type { RemapPlayerSlot } from "./control-ref"

export const KORRI_REMAP_PLUGIN_ID =
  "@korri:remap" as const satisfies ProviderId

export type RemapSourceKind = "inputplumber-virtual-gamepad"

export interface RemapControllerPreference {
  readonly name?: string
}

export interface RemapControllerPolicy {
  readonly source: RemapSourceKind
  readonly prefer?: RemapControllerPreference
}

export interface RemapRawPolicy {
  readonly enable?: boolean
  readonly controllers?: Partial<Record<RemapPlayerSlot, RemapControllerPolicy>>
  readonly bindings?: Record<string, string | readonly string[]>
}

export type RemapPolicy =
  | { readonly enable: false }
  | {
      readonly enable: true
      readonly controllers?: Partial<
        Record<RemapPlayerSlot, RemapControllerPolicy>
      >
      readonly bindings: readonly RemapBinding[]
    }

export interface NormalizedRemapPolicy {
  readonly enable: true
  readonly controllers: Partial<Record<RemapPlayerSlot, RemapControllerPolicy>>
  readonly bindings: readonly RemapBinding[]
}

const POLICY_KEYS = new Set(["enable", "controllers", "bindings"])
const CONTROLLER_KEYS = new Set(["source", "prefer"])
const PREFERENCE_KEYS = new Set(["name"])
const PLAYER_SLOTS = new Set(["p1", "p2", "p3", "p4"])
const KEBAB_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DEFAULT_CONTROLLER: RemapControllerPolicy = {
  source: "inputplumber-virtual-gamepad",
}

export function decodeRemapPolicy(input: unknown): RemapPolicy {
  if (!isRecord(input)) {
    throw new Error("Remap policy must be an object")
  }
  assertNoExcessKeys("Remap policy", input, POLICY_KEYS)
  if (input.enable === false) return { enable: false }
  if (input.enable !== undefined && typeof input.enable !== "boolean") {
    throw new Error("Remap policy enable must be boolean")
  }
  const controllers = decodeControllers(input.controllers)
  if (input.bindings === undefined) {
    throw new Error("Remap policy requires bindings")
  }
  const bindings = decodeRemapBindings(input.bindings)
  assertBindingsUseDefinedControllers(bindings, controllers)
  return {
    enable: true,
    ...(controllers ? { controllers } : {}),
    bindings,
  }
}

export function normalizeRemapPolicy(
  policy: RemapPolicy,
): NormalizedRemapPolicy {
  if (policy.enable === false) {
    throw new Error("Disabled Remap policy cannot be normalized for launch")
  }
  return {
    enable: true,
    controllers: policy.controllers ?? { p1: DEFAULT_CONTROLLER },
    bindings: policy.bindings,
  }
}

export function remapPolicyFromLaunch(layer: {
  readonly launch?: {
    readonly with?: Partial<Record<string, RemapRawPolicy | undefined>>
  }
}): RemapRawPolicy | undefined {
  return layer.launch?.with?.[KORRI_REMAP_PLUGIN_ID]
}

function decodeControllers(
  value: unknown,
): Partial<Record<RemapPlayerSlot, RemapControllerPolicy>> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error("Remap controllers must be an object map")
  }
  const decoded: Partial<Record<RemapPlayerSlot, RemapControllerPolicy>> = {}
  for (const [slot, controller] of Object.entries(value)) {
    if (!PLAYER_SLOTS.has(slot)) {
      throw new Error(
        `Remap controller id must be a fixed player slot p1-p4: ${slot}`,
      )
    }
    decoded[slot as RemapPlayerSlot] = decodeControllerPolicy(slot, controller)
  }
  return decoded
}

function decodeControllerPolicy(
  slot: string,
  value: unknown,
): RemapControllerPolicy {
  if (!isRecord(value)) {
    throw new Error(`Remap controller ${slot} must be an object`)
  }
  assertNoExcessKeys(`Remap controller ${slot}`, value, CONTROLLER_KEYS)
  if (value.source !== "inputplumber-virtual-gamepad") {
    throw new Error(
      `Remap controller ${slot} source must be inputplumber-virtual-gamepad`,
    )
  }
  const prefer = decodePreference(slot, value.prefer)
  return {
    source: "inputplumber-virtual-gamepad",
    ...(prefer ? { prefer } : {}),
  }
}

function decodePreference(
  slot: string,
  value: unknown,
): RemapControllerPreference | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`Remap controller ${slot} prefer must be an object`)
  }
  assertNoExcessKeys(`Remap controller ${slot} prefer`, value, PREFERENCE_KEYS)
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new Error(`Remap controller ${slot} prefer.name must be non-empty`)
  }
  if (!KEBAB_NAME.test(value.name)) {
    throw new Error(`Remap controller ${slot} prefer.name must be kebab-case`)
  }
  return { name: value.name }
}

function assertBindingsUseDefinedControllers(
  bindings: readonly RemapBinding[],
  controllers:
    | Partial<Record<RemapPlayerSlot, RemapControllerPolicy>>
    | undefined,
): void {
  const defined = new Set<RemapPlayerSlot>(
    Object.keys(controllers ?? { p1: DEFAULT_CONTROLLER }) as RemapPlayerSlot[],
  )
  for (const binding of bindings) {
    if (!defined.has(binding.source.player)) {
      throw new Error(
        `Remap binding references undefined controller ${binding.source.player}`,
      )
    }
    for (const target of binding.targets) {
      if (target.kind === "controller" && !defined.has(target.player)) {
        throw new Error(
          `Remap binding references undefined controller ${target.player}`,
        )
      }
    }
  }
}

function assertNoExcessKeys(
  label: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      throw new Error(`${label} has unsupported field ${key}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
