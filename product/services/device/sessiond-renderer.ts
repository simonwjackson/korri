export interface KorriRendererCommand {
  readonly command: string
  readonly args: readonly string[]
}

export interface KorriRendererLaunch {
  readonly pid: number
  readonly command?: KorriRendererCommand
  readonly metadata?: Record<string, unknown>
}

export interface KorriRendererController {
  readonly kind: string
  launch: () => Promise<KorriRendererLaunch>
  stop: (pid: number | undefined) => Promise<void>
}

export interface KorriRendererStatus {
  readonly kind: string
  readonly pid?: number
}

export function rendererStatus(
  renderer: KorriRendererController,
  pid: number | undefined,
): KorriRendererStatus {
  return pid === undefined
    ? { kind: renderer.kind }
    : { kind: renderer.kind, pid }
}
