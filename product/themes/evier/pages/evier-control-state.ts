import { StreamControlSurface } from "@platform/stream-control/control-surface"
import {
  type GamescopeScalingFilter,
  readGamescopeScalingFilter,
} from "@platform/stream-control/state-normalizer"
import type {
  StreamControlAction,
  StreamControlClient,
} from "@platform/stream-control/stream-control-client"
import { errorMessage } from "@platform/stream-control/utils"
import { useCallback, useEffect, useRef, useState } from "react"

const EVIER_CONTROL_DEBOUNCE_MS = 500

export type ScheduledAction = StreamControlAction

export function useEvierControlState(controller: StreamControlClient) {
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
        try {
          const readback = await controller.getState()
          if (mounted.current && serial === statusSerial.current) {
            setLastState(readback)
          }
          publishStatus(serial, { command: response, readback })
        } catch (readbackError) {
          publishStatus(serial, {
            command: response,
            readbackError: errorMessage(readbackError),
          })
        }
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
    surface: StreamControlSurface.fromState(lastState),
    refresh,
    recover,
    schedule,
  }
}

type ScheduledActionRunner = (
  controller: StreamControlClient,
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
  controller: StreamControlClient,
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
  return readGamescopeScalingFilter(value) ?? "linear"
}
