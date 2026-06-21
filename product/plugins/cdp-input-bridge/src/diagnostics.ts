import { CDP_INPUT_BRIDGE_PLUGIN_ID, decodeCdpInputBridgePolicy } from "./policy"

export interface CdpInputBridgeDiagnosticsInput {
  readonly command?: string
  readonly annotation?: unknown
}

export interface CdpInputBridgeDiagnostics {
  readonly provider: typeof CDP_INPUT_BRIDGE_PLUGIN_ID
  readonly command: {
    readonly path: string
    readonly configured: boolean
  }
  readonly policy:
    | { readonly status: "disabled" }
    | {
        readonly status: "enabled"
        readonly cdpHost: string
        readonly cdpPort: number
        readonly mapping: string
        readonly target?: unknown
      }
    | { readonly status: "invalid"; readonly error: string }
  readonly source?: {
    readonly preferredNames?: readonly string[]
    readonly preferredEventNodes?: readonly string[]
  }
}

export function collectCdpInputBridgeDiagnostics(
  input: CdpInputBridgeDiagnosticsInput = {},
): CdpInputBridgeDiagnostics {
  const command = input.command ?? "korri-cdp-input-bridge"
  try {
    const policy = decodeCdpInputBridgePolicy(input.annotation)
    if (!policy.enabled) {
      return {
        provider: CDP_INPUT_BRIDGE_PLUGIN_ID,
        command: { path: command, configured: input.command !== undefined },
        policy: { status: "disabled" },
      }
    }
    return {
      provider: CDP_INPUT_BRIDGE_PLUGIN_ID,
      command: { path: command, configured: input.command !== undefined },
      policy: {
        status: "enabled",
        cdpHost: policy.cdpHost,
        cdpPort: policy.cdpPort,
        mapping: policy.mappingName,
        ...(policy.target ? { target: policy.target } : {}),
      },
      ...(policy.sourcePreference
        ? { source: policy.sourcePreference }
        : {}),
    }
  } catch (error) {
    return {
      provider: CDP_INPUT_BRIDGE_PLUGIN_ID,
      command: { path: command, configured: input.command !== undefined },
      policy: {
        status: "invalid",
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
