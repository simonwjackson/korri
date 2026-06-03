import { advertiseStreamHost } from "./lan-stream-advertise"

const portValue =
  process.env.KORRI_STREAM_ADVERTISE_PORT ?? process.env.PORT ?? "3001"
const port = Number.parseInt(portValue, 10)
const capabilities = (
  process.env.KORRI_STREAM_ADVERTISE_CAPABILITIES ?? "stream,source"
)
  .split(",")
  .map(capability => capability.trim())
  .filter(Boolean)

const advertisement = advertiseStreamHost({
  name: process.env.KORRI_STREAM_ADVERTISE_NAME,
  hostId: process.env.KORRI_STREAM_ADVERTISE_HOST_ID,
  port,
  capabilities,
})

console.log(`Advertising Korri stream source on port ${port}`)

const stop = async () => {
  await advertisement.stop()
  process.exit(0)
}

process.on("SIGINT", () => void stop())
process.on("SIGTERM", () => void stop())
await new Promise(() => undefined)
