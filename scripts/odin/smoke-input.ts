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
const expectSystemInput = process.env.KORRI_SMOKE_EXPECT_SYSTEM_INPUT !== "0"

await new Promise<void>((resolve, reject) => {
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
    ws.send(JSON.stringify({ classes: ["gamepad", "system"] }))
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

      logger.info(
        { devices: Object.fromEntries(seen) },
        "  korri input daemon ok",
      )
      clearTimeout(timeout)
      ws.close()
      resolve()
    } catch (error) {
      reject(error)
    }
  })

  ws.addEventListener("error", () => {
    reject(new Error(`failed to connect to Korri input daemon at ${url}`))
  })
})
