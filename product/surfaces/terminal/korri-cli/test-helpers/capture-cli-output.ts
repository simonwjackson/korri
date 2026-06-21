export interface CapturedCliOutput {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export async function captureCliOutput(
  run: () => Promise<unknown>,
): Promise<CapturedCliOutput> {
  const previousLog = console.log
  const previousError = console.error
  const previousExitCode = process.exitCode
  const stdout: string[] = []
  const stderr: string[] = []
  process.exitCode = undefined
  console.log = (line?: unknown) => stdout.push(String(line))
  console.error = (line?: unknown) => stderr.push(String(line))
  try {
    await run()
    return {
      stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
      stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
      exitCode: Number(process.exitCode ?? 0),
    }
  } finally {
    console.log = previousLog
    console.error = previousError
    process.exitCode = previousExitCode ?? 0
  }
}
