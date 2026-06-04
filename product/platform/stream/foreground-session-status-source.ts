import { Context, type Effect } from "effect"
import type { ForegroundSessionGateState } from "./foreground-session-gate-state"

export interface ForegroundSessionStatusSourceService {
  readonly get: () => Effect.Effect<ForegroundSessionGateState>
}

export class ForegroundSessionStatusSource extends Context.Service<
  ForegroundSessionStatusSource,
  ForegroundSessionStatusSourceService
>()("ForegroundSessionStatusSource") {}
