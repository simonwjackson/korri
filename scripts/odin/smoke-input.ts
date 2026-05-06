import { decodeNativeInputEvent } from "@shared/input/native/wire-schema"
import { logger } from "@shared/logger"

const url = process.env.ODIN_INPUT_BRIDGE_URL
if (!url) {
  logger.error(
    "ODIN_INPUT_BRIDGE_URL env var is required (e.g. ws://sm8550:3002)",
  )
  process.exit(2)
}

const timeoutMs = Number.parseInt(
  process.env.ODIN_INPUT_BRIDGE_TIMEOUT_MS ?? "2000",
  10,
)
const inactiveWindowMs = Number.parseInt(
  process.env.KORRI_SMOKE_INACTIVE_WINDOW_MS ?? "250",
  10,
)
const expectSystemInput = process.env.KORRI_SMOKE_EXPECT_SYSTEM_INPUT !== "0"
const checkFocusGate = process.env.KORRI_SMOKE_CHECK_FOCUS_GATE !== "0"

const devices = await expectInputDevices()
if (checkFocusGate) await expectInactiveSubscriptionQuiet()

logger.info({ devices }, "  korri input daemon ok")

async function expectInputDevices(): Promise<
  Readonly<Record<string, { readonly deviceId: string; readonly name: string }>>
> {
  return new Promise((resolve, reject) => {
    const seen = new Map<
      string,
      { readonly deviceId: string; readonly name: string }
    >()
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `timed out waiting for input devices from ${url}; saw ${[
            ...seen.keys(),
          ].join(", ")}`,
        ),
      )
    }, timeoutMs)

    const ws = new WebSocket(url)

    const done = () => {
      if (!seen.has("gamepad")) return false
      if (expectSystemInput && !seen.has("system")) return false
      return true
    }

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          classes: ["gamepad", "system"],
          standardInputActive: true,
        }),
      )
    })

    ws.addEventListener("message", event => {
      try {
        const decoded = decodeNativeInputEvent(JSON.parse(String(event.data)))
        if (decoded.kind !== "device-added") return
        if (
          decoded.device.class !== "gamepad" &&
          decoded.device.class !== "system"
        ) {
          return
        }

        seen.set(decoded.device.class, {
          deviceId: decoded.device.deviceId,
          name: decoded.device.name,
        })
        if (!done()) return

        clearTimeout(timeout)
        ws.close()
        resolve(Object.fromEntries(seen))
      } catch (error) {
        clearTimeout(timeout)
        ws.close()
        reject(error)
      }
    })

    ws.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error(`failed to connect to Korri input daemon at ${url}`))
    })
  })
}

async function expectInactiveSubscriptionQuiet(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let sawDevice = false
    const timeout = setTimeout(
      () => {
        if (settled) return
        settled = true
        ws.close()
        if (!sawDevice) {
          reject(
            new Error(
              `timed out waiting for inactive subscription device frame from ${url}`,
            ),
          )
          return
        }
        resolve()
      },
      Math.max(timeoutMs, inactiveWindowMs),
    )

    const quietTimer = setTimeout(() => {
      if (settled || !sawDevice) return
      settled = true
      clearTimeout(timeout)
      ws.close()
      resolve()
    }, inactiveWindowMs)

    const ws = new WebSocket(url)

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          classes: ["gamepad"],
          standardInputActive: false,
        }),
      )
    })

    ws.addEventListener("message", event => {
      try {
        const decoded = decodeNativeInputEvent(JSON.parse(String(event.data)))
        if (decoded.kind === "device-added") {
          sawDevice = true
          return
        }
        if (decoded.kind !== "input") return

        settled = true
        clearTimeout(timeout)
        clearTimeout(quietTimer)
        ws.close()
        reject(
          new Error(
            "inactive native input subscription received a standard input frame",
          ),
        )
      } catch (error) {
        settled = true
        clearTimeout(timeout)
        clearTimeout(quietTimer)
        ws.close()
        reject(error)
      }
    })

    ws.addEventListener("error", () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(quietTimer)
      reject(new Error(`failed to connect to Korri input daemon at ${url}`))
    })
  })
}
