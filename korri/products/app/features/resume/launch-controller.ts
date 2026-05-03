/**
 * `useGameLaunch` — the resume feature's launch controller.
 *
 * State machine:
 *
 *   idle ──[confirm with focusedId]──▶ launching
 *   launching ──[result: launched]──▶ idle
 *   launching ──[result: failed]──▶ failed (stores { exitCode, stderrTail, id })
 *   failed   ──[retry()]──▶ launching   (re-fires the *originally failed id*)
 *   any      ──[focusedId change]──▶ no transition (HOME-R3 / SGR-R2)
 *
 * Confirm is suppressed while `status === "launching"` so a fast double-press
 * spawns exactly once. Retry uses the failed id captured at the moment of
 * the failed call, not the current focusedId — SGR-R7 requires that retry
 * targets the same game even if the player has since moved focus.
 *
 * The hook composes the production `runRpc` directly. Tests exercise the
 * full HTTP roundtrip through a real Hono harness; there is no mocking of
 * `runRpc` or the RPC client.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 9).
 */

import { runRpc } from "@shared/api/rpc/runRpc"
import { logger } from "@shared/logger/logger"
import { useInputAction } from "@shared/navigation/use-input-action"
import { useCallback, useRef, useState } from "react"

export type LaunchStatus = "idle" | "launching" | "failed"

export type LaunchError = {
  readonly exitCode: number
  readonly stderrTail?: string
}

export interface UseGameLaunchResult {
  readonly status: LaunchStatus
  readonly lastError?: LaunchError
  /**
   * The id whose launch most recently failed (and which `retry()` will
   * re-fire). `undefined` while idle / launching, or after a successful
   * launch resets the state. Composition sites use this to resolve a
   * display title for the failure banner without leaking ids into the
   * banner's contract.
   */
  readonly failedId?: string
  retry: () => void
}

export function useGameLaunch(
  focusedId: string | undefined,
): UseGameLaunchResult {
  const [status, setStatus] = useState<LaunchStatus>("idle")
  const [lastError, setLastError] = useState<LaunchError | undefined>(undefined)
  const [failedId, setFailedId] = useState<string | undefined>(undefined)

  // Ref-tracked status mirror so the input handler reads the latest value
  // without the cost of a fresh subscription every state change.
  const statusRef = useRef<LaunchStatus>("idle")
  statusRef.current = status

  // The id that was launched on the call now in flight (or last failed).
  // Captured at the moment of the call so retry() targets the same id even
  // if `focusedId` has since changed.
  const inFlightIdRef = useRef<string | undefined>(undefined)
  // Track the last id whose launch failed so `retry()` always knows what to
  // re-fire even after the in-flight id has been cleared by a state reset.
  const failedIdRef = useRef<string | undefined>(undefined)

  const performLaunch = useCallback(async (id: string) => {
    if (statusRef.current === "launching") {
      // Defensive: caller already gated this, but never spawn twice.
      return
    }
    inFlightIdRef.current = id
    statusRef.current = "launching"
    setStatus("launching")
    setLastError(undefined)

    try {
      const result = await runRpc(c => c.app["library.launch"]({ id }))
      if (result.status === "launched") {
        failedIdRef.current = undefined
        setFailedId(undefined)
        statusRef.current = "idle"
        setStatus("idle")
        return
      }
      // result.status === "failed"
      failedIdRef.current = id
      setFailedId(id)
      statusRef.current = "failed"
      setStatus("failed")
      setLastError(
        result.stderrTail !== undefined
          ? { exitCode: result.exitCode, stderrTail: result.stderrTail }
          : { exitCode: result.exitCode },
      )
    } catch (error) {
      // RPC-level failures (NotFoundError, transport, etc.) collapse into
      // the same `failed` state. Synthetic exit code so the banner has
      // something to show.
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(
        { id, error: message },
        "useGameLaunch: launch RPC threw",
      )
      failedIdRef.current = id
      setFailedId(id)
      statusRef.current = "failed"
      setStatus("failed")
      setLastError({ exitCode: -1, stderrTail: message })
    } finally {
      inFlightIdRef.current = undefined
    }
  }, [])

  // Confirm: launch the focused game if we're idle.
  useInputAction(
    "confirm",
    useCallback(() => {
      if (statusRef.current === "launching") return
      const id = focusedId
      if (!id) return
      // Fire and forget; we manage state via setState calls inside.
      void performLaunch(id)
    }, [focusedId, performLaunch]),
  )

  const retry = useCallback(() => {
    if (statusRef.current === "launching") return
    const id = failedIdRef.current
    if (!id) return
    void performLaunch(id)
  }, [performLaunch])

  return {
    status,
    lastError,
    failedId,
    retry,
  }
}
