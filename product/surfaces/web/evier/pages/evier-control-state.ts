import type { StreamControlCapability } from "@platform/stream-control/control-contract"
import { StreamControlSurface } from "@platform/stream-control/control-surface"
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
  const [controls, setControls] = useState<readonly StreamControlCapability[]>(
    [],
  )
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
      const [state, controlPayload] = await Promise.all([
        controller.getState(),
        controller.getControls?.() ?? Promise.resolve({ controls: [] }),
      ])
      if (mounted.current && serial === statusSerial.current) {
        setLastState(state)
        setControls(readControls(controlPayload))
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
      await run("app.stream-control.moonlight-bitrate.set", {
        bitrateKbps: 12_000,
      })
      await sleepWhileMounted(700, mounted)
      await run("app.stream-control.moonlight-fps.set", { fps: 60 })
      await sleepWhileMounted(700, mounted)
      await run("app.stream-control.moonlight-resolution.set", {
        width: 1920,
        height: 1080,
      })
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
    controls,
    refresh,
    recover,
    schedule,
  }
}

async function runScheduledAction(
  controller: StreamControlClient,
  action: ScheduledAction,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (action === "app.stream-control.brightness.set") {
    return controller.setBrightness({
      percent: Number(body.percent),
      ...(typeof body.device === "string" ? { device: body.device } : {}),
    })
  }
  if (action === "app.stream-control.moonlight-bitrate.set") {
    return controller.setMoonlightBitrate({
      bitrateKbps: Number(body.bitrateKbps),
    })
  }
  if (action === "app.stream-control.moonlight-fps.set") {
    return controller.setMoonlightFps({ fps: Number(body.fps) })
  }
  if (action === "app.stream-control.moonlight-resolution.set") {
    return controller.setMoonlightResolution({
      width: Number(body.width),
      height: Number(body.height),
    })
  }
  return controller.applyAction({ action, payload: body })
}

async function sleepWhileMounted(
  ms: number,
  mounted: { readonly current: boolean },
) {
  await new Promise(resolve => setTimeout(resolve, ms))
  if (!mounted.current) throw new Error("Evier stream control unmounted")
}

function readControls(value: unknown): readonly StreamControlCapability[] {
  if (!isRecord(value) || !Array.isArray(value.controls)) return []
  return value.controls.filter(isStreamControlCapability)
}

function isStreamControlCapability(
  value: unknown,
): value is StreamControlCapability {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.subsystem === "string" &&
    (typeof value.action === "string" || value.action === null) &&
    typeof value.readback === "string" &&
    isRecord(value.value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
