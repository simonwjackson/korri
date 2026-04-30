import { useCallback, useEffect, useState } from "react"
import { ApiError, fetchFeatureMap } from "../api/client"
import type { FeatureMap } from "../types"

/*
 * Data hook that owns the GET /api/feature-map round-trip.
 *
 * Four exposed states match the dev-API surface:
 *   loading — initial fetch in flight
 *   ready   — map present
 *   missing — server returned 404 (feature-map.json not generated yet)
 *   error   — any other failure
 */

export type FeatureMapState =
  | { status: "loading"; map: null; error: null }
  | { status: "ready"; map: FeatureMap; error: null }
  | { status: "missing"; map: null; error: null }
  | { status: "error"; map: null; error: string }

export type UseFeatureMap = FeatureMapState & {
  reload: () => Promise<void>
  setMap: (next: FeatureMap) => void
}

export function useFeatureMap(): UseFeatureMap {
  const [state, setState] = useState<FeatureMapState>({
    status: "loading",
    map: null,
    error: null,
  })

  const reload = useCallback(async () => {
    setState({ status: "loading", map: null, error: null })
    try {
      const map = await fetchFeatureMap()
      setState({ status: "ready", map, error: null })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: "missing", map: null, error: null })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setState({ status: "error", map: null, error: message })
    }
  }, [])

  const setMap = useCallback((next: FeatureMap) => {
    setState({ status: "ready", map: next, error: null })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload, setMap }
}
