import { useEffect } from "react"
import type { FeatureMap, NodeKind, SelectedNode } from "../types"

/*
 * Global keyboard navigation for the feature-map graph:
 *
 *   ArrowLeft  — jump to the first node whose edge points INTO the
 *                current selection (parent in the LR layout)
 *   ArrowRight — jump to the first node the current selection points
 *                OUT to (child in the LR layout)
 *   ArrowUp    — previous node of the same kind in document order
 *   ArrowDown  — next node of the same kind in document order
 *   Enter      — no-op here; Editor opens via Inspector toggle
 *
 * Listener is attached to the document but bails out when focus is in
 * an editable target (inputs, textareas, contenteditable, CodeMirror)
 * so palette/editor typing isn't intercepted. A modifier key (cmd, ctrl,
 * alt, meta) also bails so OS / browser shortcuts pass through.
 */

type EdgeRef = { kind: NodeKind; id: string }

export function useGraphKeyboardNav(
  map: FeatureMap | null,
  selected: SelectedNode | null,
  setSelected: (next: SelectedNode | null) => void,
): void {
  useEffect(() => {
    if (!map) return
    // Capture the narrowed map in a const so TS keeps the narrowing
    // through the nested onKeyDown closure.
    const liveMap: FeatureMap = map

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return
      }

      const current = selected ?? defaultSelection(liveMap)
      if (!current) return

      let next: SelectedNode | null = null
      switch (event.key) {
        case "ArrowLeft":
          next = firstParent(liveMap, current)
          break
        case "ArrowRight":
          next = firstChild(liveMap, current)
          break
        case "ArrowUp":
          next = sibling(liveMap, current, -1)
          break
        case "ArrowDown":
          next = sibling(liveMap, current, 1)
          break
      }
      if (next) {
        event.preventDefault()
        setSelected(next)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [map, selected, setSelected])
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  // CodeMirror 6 marks its editable region with this attribute.
  if (target.closest('[contenteditable="true"]')) return true
  if (target.closest(".cm-editor")) return true
  return false
}

function defaultSelection(map: FeatureMap): SelectedNode | null {
  const job = map.jobs[0]
  if (job) return { kind: "job", id: job.id }
  const brief = map.briefs[0]
  if (brief) return { kind: "brief", id: brief.id }
  const feature = map.features[0]
  if (feature) return { kind: "feature", id: feature.id }
  const bdd = map.bdd[0]
  if (bdd) return { kind: "bdd", id: bdd.id }
  return null
}

function firstParent(map: FeatureMap, ref: SelectedNode): SelectedNode | null {
  const target = encode(ref)
  for (const edge of map.edges) {
    if (edge.to === target) {
      const parent = decode(edge.from)
      if (parent) return parent
    }
  }
  return null
}

function firstChild(map: FeatureMap, ref: SelectedNode): SelectedNode | null {
  const source = encode(ref)
  for (const edge of map.edges) {
    if (edge.from === source) {
      const child = decode(edge.to)
      if (child) return child
    }
  }
  return null
}

function sibling(
  map: FeatureMap,
  ref: SelectedNode,
  delta: number,
): SelectedNode | null {
  const ids = idsOfKind(map, ref.kind)
  const idx = ids.indexOf(ref.id)
  if (idx === -1) {
    const fallback = ids[0]
    return fallback ? { kind: ref.kind, id: fallback } : null
  }
  const nextId = ids[idx + delta]
  return nextId ? { kind: ref.kind, id: nextId } : null
}

function idsOfKind(map: FeatureMap, kind: NodeKind): string[] {
  switch (kind) {
    case "job":
      return map.jobs.map(n => n.id)
    case "brief":
      return map.briefs.map(n => n.id)
    case "feature":
      return map.features.map(n => n.id)
    case "bdd":
      return map.bdd.map(n => n.id)
  }
}

function encode(ref: EdgeRef): string {
  return `${ref.kind}:${ref.id}`
}

function decode(s: string): SelectedNode | null {
  const idx = s.indexOf(":")
  if (idx === -1) return null
  const kind = s.slice(0, idx) as NodeKind
  const id = s.slice(idx + 1)
  if (
    kind !== "job" &&
    kind !== "brief" &&
    kind !== "feature" &&
    kind !== "bdd"
  ) {
    return null
  }
  return { kind, id }
}
