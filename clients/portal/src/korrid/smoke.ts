/** CLI smoke entry for `just korrid-check`; never imported by the app. */
import { smokeKorrid } from "./client"

const result = await smokeKorrid(
  process.env.KORRID_SPIKE_URL ?? "http://127.0.0.1:43117",
)
console.log(JSON.stringify(result))
