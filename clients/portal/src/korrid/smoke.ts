/** CLI smoke entry for `nix run .#korrid-check`; never imported by the app. */
import { smokeKorrid } from "./client"

const result = await smokeKorrid(
  process.env.KORRID_SPIKE_URL ?? "http://127.0.0.1:43117",
  process.env.KORRID_RPC_CAPABILITY ?? "development-capability",
)
console.log(JSON.stringify(result))
