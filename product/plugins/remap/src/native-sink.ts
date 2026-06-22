export const KORRI_REMAP_RUNNER_USER = "korri-remap-runner" as const
export const KORRI_REMAP_RUNNER_GROUP = "korri-remap-runner" as const

export interface NativeRemapIsolationProbe {
  readonly targetUser: string
  readonly targetUserReceived: boolean
  readonly korriUserReceived: boolean
  readonly normalUserReceived: boolean
  readonly swaySawDevices: boolean
  /**
   * Root/privileged observation is recorded for diagnostics, but is outside
   * the product isolation guarantee. The guarantee is practical isolation from
   * Korri UI, Sway, and normal unprivileged processes.
   */
  readonly rootDiagnosticReadersReceived: boolean
  readonly cleanupVerified: boolean
}

export function assertNativeIsolationProbe(
  probe: NativeRemapIsolationProbe,
): void {
  if (probe.targetUser !== KORRI_REMAP_RUNNER_USER) {
    throw new Error(
      `Remap native sink must launch as ${KORRI_REMAP_RUNNER_USER}, got ${probe.targetUser}`,
    )
  }
  if (!probe.targetUserReceived) {
    throw new Error("Remap native sink target user did not receive remapped output")
  }
  if (probe.korriUserReceived) {
    throw new Error("Remap native sink leaked output to Korri UI identity")
  }
  if (probe.normalUserReceived) {
    throw new Error("Remap native sink leaked output to a normal user identity")
  }
  if (probe.swaySawDevices) {
    throw new Error("Remap native sink leaked synthetic devices to Sway")
  }
  if (!probe.cleanupVerified) {
    throw new Error("Remap native sink cleanup was not verified")
  }
}
