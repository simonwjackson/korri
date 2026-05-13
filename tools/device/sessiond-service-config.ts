export interface KorriSessiondServiceConfigInput {
  readonly project: string
  readonly port: string
  readonly log: string
  readonly tokenFile: string
  readonly electrobunApp?: string
  readonly electrobunStateRoot?: string
  readonly electrobunStatusFile?: string
}

export interface KorriSessiondServiceConfig {
  readonly environment: Readonly<Record<string, string>>
}

export function buildKorriSessiondServiceConfig(
  input: KorriSessiondServiceConfigInput,
): KorriSessiondServiceConfig {
  if (!input.electrobunApp) {
    throw new Error("KORRI_ELECTROBUN_APP is required")
  }

  const environment: Record<string, string> = {
    DEVICE_APP_ROOT: input.project,
    KORRI_SESSIOND_PORT: input.port,
    KORRI_SESSIOND_LOG: input.log,
    KORRI_SESSIOND_TOKEN_FILE: input.tokenFile,
    KORRI_SESSIOND_URL: `http://127.0.0.1:${input.port}`,
    KORRI_ELECTROBUN_APP: input.electrobunApp,
  }

  if (input.electrobunStateRoot) {
    environment.KORRI_ELECTROBUN_STATE_ROOT = input.electrobunStateRoot
  }
  if (input.electrobunStatusFile) {
    environment.KORRI_ELECTROBUN_STATUS_FILE = input.electrobunStatusFile
  }

  return { environment }
}
