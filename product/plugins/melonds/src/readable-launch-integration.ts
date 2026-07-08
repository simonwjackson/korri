import { appRecordKind } from "@platform/library/config/records/app"
import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import { KORRI_MELONDS_PLUGIN_ID } from "./ids"
import { materializeReadableMelonDsLaunch } from "./materializer"
import { decodeMelonDsPolicy } from "./policy"

export { materializeReadableMelonDsLaunch } from "./materializer"

export const melonDsReadableLaunchIntegration: ReadableLaunchIntegration = {
  providerId: KORRI_MELONDS_PLUGIN_ID,
  kind: KORRI_MELONDS_PLUGIN_ID,
  integration: "melonds",
  canResolve: context =>
    appRecordKind(context.app) === KORRI_MELONDS_PLUGIN_ID &&
    context.content?.path !== undefined &&
    canDecodePolicy(context.plugin?.[KORRI_MELONDS_PLUGIN_ID]),
  materialize: context => materializeReadableMelonDsLaunch({ context }),
}

function canDecodePolicy(input: unknown): boolean {
  try {
    decodeMelonDsPolicy(input)
    return true
  } catch {
    return false
  }
}
