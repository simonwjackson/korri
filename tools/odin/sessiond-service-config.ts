export type KorriSessionRendererMode = "chromium" | "electrobun"

export interface KorriSessiondServiceConfigInput {
  readonly project: string
  readonly port: string
  readonly log: string
  readonly tokenFile: string
  readonly korriUrl: string
  readonly renderer?: string
  readonly chromiumPath: string
  readonly chromiumProfileDir: string
  readonly electrobunApp?: string
  readonly electrobunStateRoot?: string
  readonly electrobunStatusFile?: string
}

export interface KorriSessiondServiceConfig {
  readonly renderer: KorriSessionRendererMode
  readonly environment: Readonly<Record<string, string>>
}

export function parseKorriSessionRenderer(
  value: string | undefined,
): KorriSessionRendererMode {
  if (!value || value === "electrobun") return "electrobun"
  if (value === "chromium") return "chromium"
  throw new Error(`Unsupported Korri session renderer: ${value}`)
}

export function buildKorriSessiondServiceConfig(
  input: KorriSessiondServiceConfigInput,
): KorriSessiondServiceConfig {
  const renderer = parseKorriSessionRenderer(input.renderer)
  const environment: Record<string, string> = {
    ODIN_PROJECT: input.project,
    KORRI_SESSIOND_PORT: input.port,
    KORRI_SESSIOND_LOG: input.log,
    KORRI_SESSIOND_TOKEN_FILE: input.tokenFile,
    KORRI_SESSIOND_URL: `http://127.0.0.1:${input.port}`,
    KORRI_URL: input.korriUrl,
    KORRI_SESSION_RENDERER: renderer,
    KORRI_CHROMIUM_PATH: input.chromiumPath,
    KORRI_CHROMIUM_PROFILE_DIR: input.chromiumProfileDir,
  }

  if (renderer === "electrobun") {
    if (!input.electrobunApp) {
      throw new Error(
        "KORRI_ELECTROBUN_APP is required for electrobun renderer",
      )
    }
    environment.KORRI_ELECTROBUN_APP = input.electrobunApp
    if (input.electrobunStateRoot) {
      environment.KORRI_ELECTROBUN_STATE_ROOT = input.electrobunStateRoot
    }
    if (input.electrobunStatusFile) {
      environment.KORRI_ELECTROBUN_STATUS_FILE = input.electrobunStatusFile
    }
  }

  return { renderer, environment }
}
