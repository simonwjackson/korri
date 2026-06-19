import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import type { LaunchPrepareMode } from "@platform/plugin/launch-prepare"
import { writeThreeDSenRomRegistry, type ThreeDSenProfileMapping } from "./rom-registry"

export interface ThreeDSenLaunchPreparePolicy {
  readonly registryPath: string
  readonly selectedProfileId: string
  readonly profiles: readonly ThreeDSenProfileMapping[]
}

export interface ThreeDSenLaunchPrepareInput {
  readonly spec: LaunchSpec
  readonly policy: ThreeDSenLaunchPreparePolicy
  readonly mode: LaunchPrepareMode
}

export async function prepareThreeDSenLaunch(
  input: ThreeDSenLaunchPrepareInput,
): Promise<{ readonly spec: LaunchSpec }> {
  const spec = decodeLaunchSpec(input.spec)
  const policy = decodeThreeDSenLaunchPreparePolicy(input.policy)
  const selected = policy.profiles.find(
    profile => profile.id === policy.selectedProfileId,
  )
  if (!selected) {
    throw new Error(
      `3dSen profile ${policy.selectedProfileId} is not configured`,
    )
  }
  for (const profile of policy.profiles) {
    await assertReadableFile(profile.romPath, `3dSen ROM ${profile.id}`)
  }
  if (input.mode === "commit") {
    await writeThreeDSenRomRegistry({
      path: policy.registryPath,
      profiles: policy.profiles,
    })
  }
  return { spec }
}

export function decodeThreeDSenLaunchPreparePolicy(
  input: unknown,
): ThreeDSenLaunchPreparePolicy {
  if (!isRecord(input)) {
    throw new Error("3dSen launch.prepare policy must be an object")
  }
  const registryPath = requiredString(input.registryPath, "registryPath")
  const selectedProfileId = requiredString(
    input.selectedProfileId,
    "selectedProfileId",
  )
  if (!Array.isArray(input.profiles) || input.profiles.length === 0) {
    throw new Error("3dSen launch.prepare policy.profiles must be a non-empty array")
  }
  return {
    registryPath,
    selectedProfileId,
    profiles: input.profiles.map((profile, index) =>
      decodeProfile(profile, `profiles[${index}]`),
    ),
  }
}

function decodeProfile(input: unknown, label: string): ThreeDSenProfileMapping {
  if (!isRecord(input)) {
    throw new Error(`3dSen ${label} must be an object`)
  }
  return {
    id: requiredString(input.id, `${label}.id`),
    title: requiredString(input.title, `${label}.title`),
    romPath: requiredString(input.romPath, `${label}.romPath`),
    ...(input.lastTime !== undefined
      ? { lastTime: requiredNumber(input.lastTime, `${label}.lastTime`) }
      : {}),
  }
}

async function assertReadableFile(path: string, label: string): Promise<void> {
  try {
    await access(path, constants.R_OK)
  } catch {
    throw new Error(`${label} is not readable at ${path}`)
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`3dSen ${field} must be a non-empty string`)
  }
  return value
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`3dSen ${field} must be a finite number`)
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
