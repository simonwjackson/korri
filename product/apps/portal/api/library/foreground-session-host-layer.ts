import {
  type PlayLogStore,
  sharedPlayLogStore,
} from "@platform/library/play-log-store"
import { Context, Layer } from "effect"
import {
  createLocalForegroundLaunchOwner,
  type LocalForegroundLaunchOwner,
} from "./local-foreground-launch-adapter"
import {
  createPlayRecordingCoordinator,
  type PlayRecordingCoordinator,
} from "./play-recording-coordinator"

export interface ForegroundSessionHostService {
  readonly owner: LocalForegroundLaunchOwner
  /**
   * Present when a play-log store is wired. The launch handler seeds a
   * launch's recording context here (`beginLaunch`); the owner completes it
   * when it observes the session terminal (`session.exited`), which covers
   * both direct and sessiond-managed launches. Shared instance so seed and
   * completion agree.
   */
  readonly playRecordingCoordinator?: PlayRecordingCoordinator
}

export interface CreateForegroundSessionHostOptions {
  readonly playLogStore?: PlayLogStore
}

export class ForegroundSessionHost extends Context.Service<
  ForegroundSessionHost,
  ForegroundSessionHostService
>()("ForegroundSessionHost") {}

export function createForegroundSessionHost(
  options: CreateForegroundSessionHostOptions = {},
): ForegroundSessionHostService {
  const coordinator = options.playLogStore
    ? createPlayRecordingCoordinator({ store: options.playLogStore })
    : undefined
  return {
    owner: createLocalForegroundLaunchOwner(
      coordinator ? { playRecordingCoordinator: coordinator } : {},
    ),
    ...(coordinator ? { playRecordingCoordinator: coordinator } : {}),
  }
}

export const ForegroundSessionHostLive = Layer.sync(ForegroundSessionHost)(() =>
  createForegroundSessionHost({ playLogStore: sharedPlayLogStore() }),
)
