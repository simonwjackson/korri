import { KorriControl } from "@platform/control/korri-control"
import { Effect } from "effect"
import type { DryRunLaunchPayload, DryRunLaunchResponse } from "./dry-run.rpc"

export const handleDryRunLaunch = (
  payload: typeof DryRunLaunchPayload.Type,
): Effect.Effect<DryRunLaunchResponse, never, KorriControl> =>
  Effect.gen(function* () {
    const control = yield* KorriControl
    return yield* control.dryRunLaunch(payload)
  })
