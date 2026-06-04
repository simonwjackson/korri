export interface AcquisitionClock {
  readonly nowIso: () => string
}

export const systemAcquisitionClock: AcquisitionClock = {
  nowIso: () => new Date().toISOString(),
}
