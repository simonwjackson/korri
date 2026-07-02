import { RegistryProvider, useAtomInitialValues } from "@effect/atom-react"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { PicoRegistryBridge } from "./mount-pico"

type AtomInitialValues = Parameters<typeof useAtomInitialValues>[0]

/**
 * Registry root for mounting ONE Pico part outside the routed app: the same
 * real provider stack `mountPico` gives the full surface — a fresh atom
 * registry, mount-time initial values, and the `onRegistry` report seam —
 * minus the router. A design tool hosts a single part's real component here so
 * the part reads the production atoms, and receives the registry through
 * `onRegistry` so the tool can drive those atoms live (the part-scoped
 * counterpart of a mounted device surface). Production renders the routed app
 * via `mountPico`; nothing in production renders this root.
 */
export function PicoPartSurface({
  initialValues,
  onRegistry,
  children,
}: {
  readonly initialValues: AtomInitialValues
  readonly onRegistry?: (registry: AtomRegistry.AtomRegistry) => void
  readonly children?: ReactNode
}) {
  return (
    <RegistryProvider>
      <PicoPartApp initialValues={initialValues} onRegistry={onRegistry}>
        {children}
      </PicoPartApp>
    </RegistryProvider>
  )
}

function PicoPartApp({
  initialValues,
  onRegistry,
  children,
}: {
  readonly initialValues: AtomInitialValues
  readonly onRegistry?: (registry: AtomRegistry.AtomRegistry) => void
  readonly children?: ReactNode
}) {
  useAtomInitialValues(initialValues)
  return (
    <>
      {onRegistry ? <PicoRegistryBridge onRegistry={onRegistry} /> : null}
      {children}
    </>
  )
}
