import { join } from "node:path"
import { errorMessage, isRecord } from "@platform/stream-control/utils"

export { errorMessage, isRecord } from "@platform/stream-control/utils"

export interface StreamControlEventRecorderOptions {
  readonly artifactDir?: string
  readonly mkdir: (
    path: string,
    options?: { readonly recursive?: boolean },
  ) => Promise<unknown>
  readonly appendFile: (path: string, content: string) => Promise<void>
  readonly now: () => Date
}

export function createStreamControlEventRecorder({
  artifactDir,
  mkdir,
  appendFile,
  now,
}: StreamControlEventRecorderOptions): (event: unknown) => Promise<void> {
  let artifactDirReady: Promise<unknown> | undefined

  return async event => {
    if (!artifactDir) return
    artifactDirReady ??= mkdir(artifactDir, { recursive: true }).catch(
      error => {
        artifactDirReady = undefined
        throw error
      },
    )
    await artifactDirReady
    await appendFile(
      join(artifactDir, "events.jsonl"),
      `${JSON.stringify({ ts: now().toISOString(), ...asRecord(event) })}\n`,
    )
  }
}

export async function recordStateSnapshot(
  record: (event: unknown) => Promise<void>,
  result: Record<string, unknown>,
): Promise<void> {
  try {
    await record({ action: "state.snapshot", ...result })
  } catch {
    return
  }
}

export async function readControlState<TClient, TReadback>(
  socketPath: string | undefined,
  connect: (socketPath: string) => Promise<TClient>,
  snapshot: (client: TClient) => Promise<unknown>,
  normalize: (snapshot: unknown) => TReadback,
) {
  if (!socketPath) return { status: "disabled" as const }
  let client: TClient | undefined
  try {
    client = await connect(socketPath)
    return {
      status: "ok" as const,
      readback: normalize(await snapshot(client)),
    }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  } finally {
    closeClient(client)
  }
}

export function closeClient(client: unknown): void {
  if (isRecord(client) && typeof client.close === "function") client.close()
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { value }
}
