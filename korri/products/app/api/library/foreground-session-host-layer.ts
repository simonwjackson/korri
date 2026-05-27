import { Context, Layer } from "effect"
import {
  createLocalForegroundLaunchOwner,
  type LocalForegroundLaunchOwner,
} from "./local-foreground-launch-adapter"

export interface ForegroundSessionHostService {
  readonly owner: LocalForegroundLaunchOwner
}

export class ForegroundSessionHost extends Context.Service<
  ForegroundSessionHost,
  ForegroundSessionHostService
>()("ForegroundSessionHost") {}

export function createForegroundSessionHost(): ForegroundSessionHostService {
  return { owner: createLocalForegroundLaunchOwner() }
}

export const ForegroundSessionHostLive = Layer.sync(ForegroundSessionHost)(() =>
  createForegroundSessionHost(),
)
