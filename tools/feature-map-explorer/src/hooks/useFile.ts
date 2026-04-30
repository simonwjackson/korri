import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError, fetchFile, saveFile } from "../api/client"

/*
 * Editor data hook.
 *
 *   path === null  → idle (no file open)
 *   path changes   → load → ready (or error)
 *   user edits     → updates `draft`; isDirty derived from comparison
 *   save()         → saving → ready (with refreshed canonical content)
 *
 * Save errors do not clobber the draft — the user keeps their unsaved
 * changes and can retry. Network identity ("did the file change on disk
 * since we loaded?") is intentionally out of scope here; mtime checks
 * are deferred per the plan.
 */

export type FileDraft = {
  frontmatter: Record<string, unknown>
  body: string
}

export type UseFileState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | {
      status: "ready"
      path: string
      loaded: FileDraft
      draft: FileDraft
      isDirty: boolean
      saveError: string | null
    }
  | {
      status: "saving"
      path: string
      loaded: FileDraft
      draft: FileDraft
      isDirty: boolean
      saveError: string | null
    }
  | { status: "error"; path: string; error: string }

export type UseFile = UseFileState & {
  setBody: (body: string) => void
  setFrontmatter: (
    next:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void
  revert: () => void
  save: () => Promise<void>
  reload: () => Promise<void>
}

export function useFile(path: string | null): UseFile {
  const [state, setState] = useState<UseFileState>({ status: "idle" })
  const pathRef = useRef(path)
  pathRef.current = path

  const load = useCallback(async (target: string) => {
    setState({ status: "loading", path: target })
    try {
      const file = await fetchFile(target)
      if (pathRef.current !== target) return
      const baseline: FileDraft = {
        frontmatter: file.frontmatter,
        body: file.body,
      }
      setState({
        status: "ready",
        path: target,
        loaded: baseline,
        draft: baseline,
        isDirty: false,
        saveError: null,
      })
    } catch (err) {
      if (pathRef.current !== target) return
      setState({
        status: "error",
        path: target,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [])

  useEffect(() => {
    if (!path) {
      setState({ status: "idle" })
      return
    }
    void load(path)
  }, [path, load])

  const setBody = useCallback((body: string) => {
    setState(prev => {
      if (prev.status !== "ready" && prev.status !== "saving") return prev
      const draft = { ...prev.draft, body }
      return {
        ...prev,
        draft,
        isDirty: !sameDraft(prev.loaded, draft),
      }
    })
  }, [])

  const setFrontmatter = useCallback<UseFile["setFrontmatter"]>(next => {
    setState(prev => {
      if (prev.status !== "ready" && prev.status !== "saving") return prev
      const computed =
        typeof next === "function" ? next(prev.draft.frontmatter) : next
      const draft = { ...prev.draft, frontmatter: computed }
      return {
        ...prev,
        draft,
        isDirty: !sameDraft(prev.loaded, draft),
      }
    })
  }, [])

  const revert = useCallback(() => {
    setState(prev => {
      if (prev.status !== "ready" && prev.status !== "saving") return prev
      return {
        ...prev,
        draft: prev.loaded,
        isDirty: false,
        saveError: null,
      }
    })
  }, [])

  const save = useCallback(async () => {
    const snapshot = await new Promise<UseFileState>(resolve => {
      setState(prev => {
        resolve(prev)
        if (prev.status !== "ready") return prev
        return { ...prev, status: "saving", saveError: null }
      })
    })
    if (snapshot.status !== "ready") return

    try {
      await saveFile({
        path: snapshot.path,
        frontmatter: snapshot.draft.frontmatter,
        body: snapshot.draft.body,
      })
      const fresh = await fetchFile(snapshot.path)
      if (pathRef.current !== snapshot.path) return
      const baseline: FileDraft = {
        frontmatter: fresh.frontmatter,
        body: fresh.body,
      }
      setState({
        status: "ready",
        path: snapshot.path,
        loaded: baseline,
        draft: baseline,
        isDirty: false,
        saveError: null,
      })
    } catch (err) {
      if (pathRef.current !== snapshot.path) return
      const message =
        err instanceof ApiError
          ? `${err.message} (${err.status})`
          : err instanceof Error
            ? err.message
            : String(err)
      setState(prev => {
        if (prev.status !== "saving") return prev
        return { ...prev, status: "ready", saveError: message }
      })
    }
  }, [])

  const reload = useCallback(async () => {
    if (!pathRef.current) return
    await load(pathRef.current)
  }, [load])

  return {
    ...state,
    setBody,
    setFrontmatter,
    revert,
    save,
    reload,
  }
}

function sameDraft(a: FileDraft, b: FileDraft): boolean {
  if (a.body !== b.body) return false
  return shallowEqualObjects(a.frontmatter, b.frontmatter)
}

function shallowEqualObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) {
      return JSON.stringify(a[key]) === JSON.stringify(b[key])
    }
  }
  return true
}
