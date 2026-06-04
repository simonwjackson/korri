import type { AcquisitionLogger } from "./logger"
import { silentAcquisitionLogger } from "./logger"

export interface AcquisitionClock {
  readonly nowIso: () => string
}

export interface AcquisitionPluginContext {
  readonly clock: AcquisitionClock
  readonly logger: AcquisitionLogger
}

export interface AcquisitionRuntimeOptions {
  readonly clock?: AcquisitionClock
  readonly logger?: AcquisitionLogger
}

export function createAcquisitionPluginContext(
  options: AcquisitionRuntimeOptions = {},
): AcquisitionPluginContext {
  return {
    clock: options.clock ?? { nowIso: () => new Date().toISOString() },
    logger: options.logger ?? silentAcquisitionLogger,
  }
}
