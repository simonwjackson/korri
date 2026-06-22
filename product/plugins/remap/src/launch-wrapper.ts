import type { LaunchSpec } from "@platform/library/launcher"
import type { NormalizedRemapPolicy } from "./policy"
import { KORRI_REMAP_RUNNER_USER } from "./native-sink"

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
    args: ["--launch-id", input.launchId, "--", input.child.command, ...input.child.args],
    ...(input.child.cwd ? { cwd: input.child.cwd } : {}),
    env: remapWrapperEnv({
      child: input.child,
      policy: input.policy,
      launchId: input.launchId,
    }),
  }
}

export function remapWrapperEnv(input: {
  readonly child: LaunchSpec
  readonly policy: NormalizedRemapPolicy
  readonly launchId: string
}): Record<string, string> {
  return {
    ...(input.child.env ?? {}),
    KORRI_REMAP_CHILD_COMMAND: input.child.command,
    KORRI_REMAP_LAUNCH_ID: input.launchId,
    KORRI_REMAP_POLICY_JSON: JSON.stringify(input.policy),
    KORRI_REMAP_RUNNER_USER,
  }
}
