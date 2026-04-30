import { useCallback, useState } from "react"
import { ApiError, regenerate } from "../api/client"
import type { FeatureMap } from "../types"

/*
 * Wraps POST /api/regenerate so the AppShell can trigger the generator
 * and replace the in-memory map atomically (no separate re-fetch).
 *
 * State machine:
 *   idle    — never run, or success cleared
 *   running — request in flight
 *   success — last run exited 0
 *   error   — last run exited non-zero, or the request itself failed
 *
 * lastResult carries stdout / stderr / exitCode / completedAt so the
 * UI can surface the failure detail. It is preserved across status
 * transitions until the next run starts.
 *
 * onMap is invoked exactly once per successful run with the new map
 * payload; the hook does not own map state itself.
 */

export type RegenerateStatus = "idle" | "running" | "success" | "error"

export type RegenerateResult = {
  exitCode: number
  stdout: string
  stderr: string
  completedAt: string
}

export type UseRegenerate = {
  status: RegenerateStatus
  lastResult: RegenerateResult | null
  errorMessage: string | null
  run: () => Promise<void>
  clearError: () => void
}

export function useRegenerate(
  onMap: (next: FeatureMap) => void,
): UseRegenerate {
  const [status, setStatus] = useState<RegenerateStatus>("idle")
  const [lastResult, setLastResult] = useState<RegenerateResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const run = useCallback(async () => {
    setStatus("running")
    setErrorMessage(null)
    try {
      const res = await regenerate()
      const completedAt = new Date().toISOString()
      const result: RegenerateResult = {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        completedAt,
      }
      setLastResult(result)
      if (res.map) onMap(res.map)
      setStatus("success")
    } catch (err) {
      const completedAt = new Date().toISOString()
      if (err instanceof ApiError) {
        const payload = err.payload as {
          exitCode?: number
          stdout?: string
          stderr?: string
          map?: FeatureMap | null
        } | null
        setLastResult({
          exitCode: payload?.exitCode ?? -1,
          stdout: payload?.stdout ?? "",
          stderr: payload?.stderr ?? err.message,
          completedAt,
        })
        // Generator can still produce a partial map alongside non-zero
        // exit (e.g., warnings). Surface it so the rest of the UI keeps
        // working while the user reads the failure.
        if (payload?.map) onMap(payload.map)
        setErrorMessage(err.message)
      } else {
        const message = err instanceof Error ? err.message : String(err)
        setLastResult({
          exitCode: -1,
          stdout: "",
          stderr: message,
          completedAt,
        })
        setErrorMessage(message)
      }
      setStatus("error")
    }
  }, [onMap])

  const clearError = useCallback(() => {
    if (status === "error") setStatus("idle")
    setErrorMessage(null)
  }, [status])

  return { status, lastResult, errorMessage, run, clearError }
}
