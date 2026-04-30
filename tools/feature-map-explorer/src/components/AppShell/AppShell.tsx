import * as Dialog from "@radix-ui/react-dialog"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { useFeatureMap } from "../../hooks/useFeatureMap"
import type { FeatureMap, SelectedNode } from "../../types"
import { AppShellProvider } from "./AppShell.context"

/*
 * Root for the AppShell widget.
 *
 * Owns:
 * - the GET /api/feature-map round-trip (via useFeatureMap)
 * - the currently-selected node reference
 * - the dirty bit lifted from the Editor and the discard dialog that
 *   gates selection changes when there are unsaved edits
 *
 * Renders the Provider plus the three-column grid frame and a single
 * AlertDialog at the root that intercepts navigation away from a dirty
 * editor.
 */
const LEFT_RAIL_KEY = "feature-map-explorer:leftRailOpen"
const INSPECTOR_KEY = "feature-map-explorer:inspectorOpen"
const LEFT_RAIL_WIDTH = "280px"
const INSPECTOR_WIDTH = "360px"

export function AppShell({ children }: { children: ReactNode }) {
  const featureMap = useFeatureMap()
  const [selected, setSelectedRaw] = useState<SelectedNode | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [leftRailOpen, setLeftRailOpen] = useState(() =>
    readBoolean(LEFT_RAIL_KEY, true),
  )
  const [inspectorOpen, setInspectorOpen] = useState(() =>
    readBoolean(INSPECTOR_KEY, true),
  )
  const [pending, setPending] = useState<{
    next: SelectedNode | null
  } | null>(null)
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    writeBoolean(LEFT_RAIL_KEY, leftRailOpen)
  }, [leftRailOpen])

  useEffect(() => {
    writeBoolean(INSPECTOR_KEY, inspectorOpen)
  }, [inspectorOpen])

  const toggleLeftRail = useCallback(() => {
    setLeftRailOpen(prev => !prev)
  }, [])
  const toggleInspector = useCallback(() => {
    setInspectorOpen(prev => !prev)
  }, [])

  useEffect(() => {
    if (!selected || !featureMap.map) return
    if (!nodeExists(featureMap.map, selected)) {
      setSelectedRaw(null)
      setIsDirty(false)
    }
  }, [featureMap.map, selected])

  const setSelected = useCallback(
    (next: SelectedNode | null) => {
      if (isDirtyRef.current && !sameRef(next, selected)) {
        setPending({ next })
        return
      }
      setSelectedRaw(next)
    },
    [selected],
  )

  const confirmDiscard = useCallback(() => {
    if (!pending) return
    setIsDirty(false)
    setSelectedRaw(pending.next)
    setPending(null)
  }, [pending])

  const cancelDiscard = useCallback(() => setPending(null), [])

  return (
    <AppShellProvider
      value={{
        status: featureMap.status,
        map: featureMap.map,
        error: featureMap.error,
        selected,
        setSelected,
        reload: featureMap.reload,
        isDirty,
        setIsDirty,
        leftRailOpen,
        inspectorOpen,
        toggleLeftRail,
        toggleInspector,
      }}
    >
      <div
        className="grid h-dvh w-dvw bg-bg text-text"
        style={{
          gridTemplateColumns: `${
            leftRailOpen ? LEFT_RAIL_WIDTH : "0px"
          } minmax(0, 1fr) ${inspectorOpen ? INSPECTOR_WIDTH : "0px"}`,
          gridTemplateRows: "48px minmax(0, 1fr)",
        }}
      >
        {children}
      </div>

      <DiscardDialog
        open={pending !== null}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </AppShellProvider>
  )
}

function DiscardDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={next => {
        if (!next) onCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-bg/70 backdrop-blur-sm" />
        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 flex w-[360px] flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <Dialog.Title className="font-semibold text-base text-text">
            Discard unsaved changes?
          </Dialog.Title>
          <Dialog.Description className="text-text-muted text-sm">
            Switching nodes will lose your unsaved edits. Save first or confirm
            to discard.
          </Dialog.Description>
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 rounded-md border border-border bg-bg px-3 text-sm text-text hover:bg-surface-elevated"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="h-8 rounded-md border border-status-error bg-status-error px-3 text-bg text-sm"
            >
              Discard
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback
  const raw = window.localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === "true"
}

function writeBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, value ? "true" : "false")
}

function nodeExists(map: FeatureMap, ref: SelectedNode): boolean {
  switch (ref.kind) {
    case "job":
      return map.jobs.some(n => n.id === ref.id)
    case "brief":
      return map.briefs.some(n => n.id === ref.id)
    case "feature":
      return map.features.some(n => n.id === ref.id)
    case "bdd":
      return map.bdd.some(n => n.id === ref.id)
  }
}

function sameRef(a: SelectedNode | null, b: SelectedNode | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.kind === b.kind && a.id === b.id
}
