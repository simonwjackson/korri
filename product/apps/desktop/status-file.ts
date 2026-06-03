import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export interface DesktopStatusFileInput {
  readonly path: string
  readonly url: string
  readonly pid: number
  readonly profile: string
  readonly timestamp?: Date
}

export interface DesktopStatusFileContent {
  readonly url: string
  readonly pid: number
  readonly profile: string
  readonly timestamp: string
}

export function buildDesktopStatusFileContent(
  input: Omit<DesktopStatusFileInput, "path">,
): DesktopStatusFileContent {
  return {
    url: input.url,
    pid: input.pid,
    profile: input.profile,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  }
}

export async function writeDesktopStatusFile(
  input: DesktopStatusFileInput,
): Promise<void> {
  await mkdir(dirname(input.path), { recursive: true })
  await writeFile(
    input.path,
    `${JSON.stringify(buildDesktopStatusFileContent(input), null, 2)}\n`,
  )
}
