import { type Environment, getEnvironment } from "@shared/config/environment"
import { GATE_NAMES, type GateName, isKnownGate } from "@shared/gates/registry"
import { logger } from "@shared/logger"
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { isToggleableEnvironment } from "./resolver"
import {
  buildGateStorageKey,
  computeEffectiveGates,
  readGateStorage,
  writeGateStorage,
} from "./storage"
import type { ResolvedGate, ResolvedGates } from "./types"

interface FeatureGatesContextValue {
  readonly resolved: ResolvedGates<GateName>
  readonly requestedGates: ReadonlySet<string>
  readonly toggleGate: (name: GateName) => void
  readonly environment: Environment
  readonly canToggle: boolean
}

const FeatureGatesContext = createContext<FeatureGatesContextValue | null>(null)

interface FeatureGatesProviderProps extends PropsWithChildren {
  readonly userId?: string
}

export function FeatureGatesProvider({
  userId = "local",
  children,
}: FeatureGatesProviderProps) {
  const environment = useMemo(() => getEnvironment(), [])
  const storageKey = useMemo(
    () => buildGateStorageKey(environment, userId),
    [environment, userId],
  )
  const [requestedGateIds, setRequestedGateIds] = useState<readonly string[]>(
    () => readGateStorage(storageKey),
  )

  useEffect(() => {
    setRequestedGateIds(readGateStorage(storageKey))
  }, [storageKey])

  useEffect(() => {
    writeGateStorage(storageKey, requestedGateIds)
  }, [requestedGateIds, storageKey])

  const requestedOn = useMemo(
    () => new Set(requestedGateIds),
    [requestedGateIds],
  )
  const resolved = useMemo(
    () => computeEffectiveGates(requestedOn, environment),
    [environment, requestedOn],
  )
  const canToggle = isToggleableEnvironment(environment)

  const toggleGate = useMemo(
    () => (name: GateName) => {
      if (!canToggle) {
        logger.warn({ gate: name }, "Cannot toggle feature gates here")
        return
      }

      setRequestedGateIds(current => {
        const next = new Set(current)
        if (next.has(name)) {
          next.delete(name)
        } else {
          next.add(name)
        }
        return [...next]
      })
    },
    [canToggle],
  )

  const value = useMemo<FeatureGatesContextValue>(
    () => ({
      resolved,
      requestedGates: requestedOn,
      toggleGate,
      environment,
      canToggle,
    }),
    [canToggle, environment, requestedOn, resolved, toggleGate],
  )

  return (
    <FeatureGatesContext.Provider value={value}>
      {children}
    </FeatureGatesContext.Provider>
  )
}

function useFeatureGatesContext(): FeatureGatesContextValue {
  const ctx = useContext(FeatureGatesContext)
  if (!ctx) {
    throw new Error("useFeatureGates must be used within FeatureGatesProvider")
  }
  return ctx
}

export function useFeatureGate(name: string): ResolvedGate {
  const ctx = useContext(FeatureGatesContext)

  if (!ctx) {
    return {
      enabled: false,
      requested: false,
      reason: "production",
    }
  }

  if (!isKnownGate(name)) {
    logger.warn(
      { gate: name },
      "useFeatureGate called with an unknown gate name",
    )
    return {
      enabled: false,
      requested: false,
      reason: "not-requested",
    }
  }

  return ctx.resolved[name]
}

export function useFeatureGates() {
  const ctx = useFeatureGatesContext()
  return {
    resolved: ctx.resolved,
    requestedGates: ctx.requestedGates,
    toggleGate: ctx.toggleGate,
    environment: ctx.environment,
    canToggle: ctx.canToggle,
    gateNames: GATE_NAMES,
  }
}
