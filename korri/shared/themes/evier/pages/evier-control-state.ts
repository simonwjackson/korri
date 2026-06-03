import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"
import { useCallback, useEffect, useRef, useState } from "react"
import { EvierControlSurface } from "./evier-control-surface"

const EVIER_CONTROL_DEBOUNCE_MS = 500

export interface EvierStreamControlController {
  readonly getState: () => Promise<unknown>
  readonly setBrightness: (payload: {
    readonly percent: number
    readonly device?: string
  }) => Promise<unknown>
  readonly setMoonlightBitrate: (payload: {
    readonly bitrateKbps: number
  }) => Promise<unknown>
  readonly setMoonlightFps: (payload: {
    readonly fps: number
  }) => Promise<unknown>
  readonly setMoonlightResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setLinkedFps: (payload: { readonly fps: number }) => Promise<unknown>
  readonly setLinkedResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setGamescopeMode: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setGamescopeFps: (payload: {
    readonly fps: number
  }) => Promise<unknown>
  readonly setGamescopeFilter: (payload: {
    readonly filter: GamescopeScalingFilter
  }) => Promise<unknown>
  readonly setGamescopeSharpness: (payload: {
    readonly sharpness: number
  }) => Promise<unknown>
}

export type ControlAction = Exclude<
  keyof EvierStreamControlController,
  "getState"
>
export type LinkedAction = "setLinkedResolution" | "setLinkedFps"
export type ScheduledAction = ControlAction | LinkedAction

export function useEvierControlState(controller: EvierStreamControlController) {
  const [status, setStatus] = useState("loading…")
  const [isRecovering, setIsRecovering] = useState(false)
  const [lastState, setLastState] = useState<unknown>(undefined)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const mounted = useRef(false)
  const recovering = useRef(false)
  const statusSerial = useRef(0)

  const publishStatus = useCallback((serial: number, value: unknown) => {
    if (mounted.current && serial === statusSerial.current) {
      setStatus(JSON.stringify(value, null, 2))
    }
  }, [])

  const run = useCallback(
    async (action: ScheduledAction, body: Record<string, unknown>) => {
      const serial = ++statusSerial.current
      try {
        const response = await runScheduledAction(controller, action, body)
        const readback = await controller.getState()
        if (mounted.current && serial === statusSerial.current) {
          setLastState(readback)
        }
        publishStatus(serial, { command: response, readback })
      } catch (error) {
        publishStatus(serial, { error: errorMessage(error) })
      }
    },
    [controller, publishStatus],
  )

  const refresh = useCallback(async () => {
    const serial = ++statusSerial.current
    try {
      const state = await controller.getState()
      if (mounted.current && serial === statusSerial.current) {
        setLastState(state)
      }
      publishStatus(serial, state)
    } catch (error) {
      publishStatus(serial, { error: errorMessage(error) })
    }
  }, [controller, publishStatus])

  const schedule = useCallback(
    (id: string, action: ScheduledAction, body: Record<string, unknown>) => {
      clearTimeout(timers.current.get(id))
      timers.current.set(
        id,
        setTimeout(() => {
          void run(action, body)
        }, EVIER_CONTROL_DEBOUNCE_MS),
      )
    },
    [run],
  )

  const recover = useCallback(async () => {
    if (recovering.current) return
    recovering.current = true
    setIsRecovering(true)
    try {
      await run("setMoonlightBitrate", { bitrateKbps: 12_000 })
      await sleepWhileMounted(700, mounted)
      await run("setMoonlightFps", { fps: 60 })
      await sleepWhileMounted(700, mounted)
      await run("setMoonlightResolution", { width: 1920, height: 1080 })
    } finally {
      recovering.current = false
      if (mounted.current) setIsRecovering(false)
    }
  }, [run])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const interval = setInterval(() => void refresh(), 3000)
    return () => {
      mounted.current = false
      clearInterval(interval)
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [refresh])

  return {
    status,
    isRecovering,
    surface: EvierControlSurface.fromState(lastState),
    refresh,
    recover,
    schedule,
  }
}

type ScheduledActionRunner = (
  controller: EvierStreamControlController,
  body: Record<string, unknown>,
) => Promise<unknown>

const scheduledActionRunners: Record<ScheduledAction, ScheduledActionRunner> = {
  setLinkedResolution: (controller, body) =>
    controller.setLinkedResolution({
      width: Number(body.width),
      height: Number(body.height),
    }),
  setLinkedFps: (controller, body) =>
    controller.setLinkedFps({ fps: Number(body.fps) }),
  setBrightness: (controller, body) =>
    controller.setBrightness({
      percent: Number(body.percent),
      ...(typeof body.device === "string" ? { device: body.device } : {}),
    }),
  setMoonlightBitrate: (controller, body) =>
    controller.setMoonlightBitrate({ bitrateKbps: Number(body.bitrateKbps) }),
  setMoonlightFps: (controller, body) =>
    controller.setMoonlightFps({ fps: Number(body.fps) }),
  setMoonlightResolution: (controller, body) =>
    controller.setMoonlightResolution({
      width: Number(body.width),
      height: Number(body.height),
    }),
  setGamescopeMode: (controller, body) =>
    controller.setGamescopeMode({
      width: Number(body.width),
      height: Number(body.height),
    }),
  setGamescopeFps: (controller, body) =>
    controller.setGamescopeFps({ fps: Number(body.fps) }),
  setGamescopeFilter: (controller, body) =>
    controller.setGamescopeFilter({
      filter: gamescopeScalingFilterFrom(body.filter),
    }),
  setGamescopeSharpness: (controller, body) =>
    controller.setGamescopeSharpness({ sharpness: Number(body.sharpness) }),
}

async function runScheduledAction(
  controller: EvierStreamControlController,
  action: ScheduledAction,
  body: Record<string, unknown>,
): Promise<unknown> {
  return scheduledActionRunners[action](controller, body)
}

async function sleepWhileMounted(
  ms: number,
  mounted: { readonly current: boolean },
) {
  await new Promise(resolve => setTimeout(resolve, ms))
  if (!mounted.current) throw new Error("Evier stream control unmounted")
}

function gamescopeScalingFilterFrom(value: unknown): GamescopeScalingFilter {
  if (
    value === "linear" ||
    value === "nearest" ||
    value === "integer" ||
    value === "fsr" ||
    value === "nis"
  ) {
    return value
  }
  return "linear"
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message
    if (typeof message === "string") return message
  }
  return String(error)
}
