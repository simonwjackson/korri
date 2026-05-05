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

await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error(`timed out waiting for gamepad device-added from ${url}`))
  }, timeoutMs)

  const ws = new WebSocket(url)

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ classes: ["gamepad"] }))
  })

  ws.addEventListener("message", event => {
    try {
      const decoded = decodeNativeInputEvent(JSON.parse(String(event.data)))
      if (decoded.kind !== "device-added") return
      if (decoded.device.class !== "gamepad") return

      logger.info(
        { deviceId: decoded.device.deviceId, name: decoded.device.name },
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
