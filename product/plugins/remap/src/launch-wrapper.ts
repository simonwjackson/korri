import type { LaunchSpec } from "@platform/library/launcher"
import { KORRI_REMAP_RUNNER_USER } from "./native-sink"
import type { NormalizedRemapPolicy } from "./policy"

export { KORRI_REMAP_RUNNER_USER } from "./native-sink"

export interface RemapWrapperLaunchSpecInput {
  readonly child: LaunchSpec
  readonly policy: NormalizedRemapPolicy
  readonly wrapperCommand: string
  readonly launchId: string
}

export function buildRemapWrapperLaunchSpec(
  input: RemapWrapperLaunchSpecInput,
): LaunchSpec {
  return {
    command: input.wrapperCommand,
    args: [
      "--launch-id",
      input.launchId,
      "--policy-json",
      JSON.stringify(input.policy),
      "--runner-user",
      KORRI_REMAP_RUNNER_USER,
      "--",
      input.child.command,
      ...input.child.args,
    ],
    ...(input.child.cwd ? { cwd: input.child.cwd } : {}),
    env: remapWrapperEnv({ child: input.child }),
    ...(input.child.envUnset ? { envUnset: [...input.child.envUnset] } : {}),
  }
}

export function remapWrapperEnv(input: {
  readonly child: LaunchSpec
}): Record<string, string> {
  return stripRemapReservedEnv(input.child.env ?? {})
}

function stripRemapReservedEnv(
  env: Readonly<Record<string, string>>,
): Record<string, string> {
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("KORRI_REMAP_")) continue
    safe[key] = value
  }
  return safe
}
