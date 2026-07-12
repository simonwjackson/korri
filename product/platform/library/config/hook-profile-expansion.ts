/**
 * Hook-profile expansion pre-pass.
 *
 * Runs on each layer's decoded `hooks` value before the cascade fold:
 * profiles referenced via `use` expand in reference order, and every
 * referenced profile's lists precede the layer's own inline entries — one
 * deterministic rule, no positional interleaving. Profiles cannot carry
 * `use` themselves (schema-rejected), so expansion is a single flat pass
 * with only unknown-id validation.
 */

import { Data, Result } from "effect"

import type {
  HookAfterStep,
  HookBeforeStep,
  HooksPolicy,
} from "./inheritable-fields"
import type { HookProfilePayload } from "./records/hook-profile"

export class UnknownHookProfile extends Data.TaggedError("UnknownHookProfile")<{
  readonly profileId: string
  readonly layer: string
}> {
  override get message(): string {
    return `unknown hook profile '${this.profileId}' referenced from ${this.layer}`
  }
}

export interface ExpandedHooks {
  readonly before: readonly HookBeforeStep[]
  readonly after: readonly HookAfterStep[]
}

export interface HookExpansionContext {
  /** Human-facing layer label for error reporting, e.g. `release 'switch'`. */
  readonly layer: string
}

export const expandHookProfiles = (
  hooks: HooksPolicy | undefined,
  profiles: ReadonlyMap<string, HookProfilePayload>,
  context: HookExpansionContext,
): Result.Result<ExpandedHooks, UnknownHookProfile> => {
  const before: HookBeforeStep[] = []
  const after: HookAfterStep[] = []

  for (const profileId of hooks?.use ?? []) {
    const profile = profiles.get(profileId)
    if (profile === undefined) {
      return Result.fail(
        new UnknownHookProfile({ profileId, layer: context.layer }),
      )
    }
    before.push(...(profile.before ?? []))
    after.push(...(profile.after ?? []))
  }

  before.push(...(hooks?.before ?? []))
  after.push(...(hooks?.after ?? []))

  return Result.succeed({ before, after })
}
