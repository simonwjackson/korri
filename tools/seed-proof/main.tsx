/**
 * Seed proof — a click-through Shift slice driven entirely by an in-memory
 * ProseQL seed.
 *
 * Proves the data + navigation seam with no API/device: production-shaped atom
 * seeding swaps the live RPC layers for an in-memory ProseQL source, and the
 * shared Shift route tree navigates home -> /game/$id. Run with
 * `just dev-seed-proof`.
 */
import "@fontsource-variable/geist"
import "@fontsource-variable/nunito"
import "@platform/react/primitives/theme/styles.css"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import "@product/surfaces/web/shift/shift.css"
import { makeSeedInitialValues } from "./seed"

async function boot() {
  const host = document.getElementById("root")
  if (!host) return

  const initialValues = await makeSeedInitialValues()
  mountShift(host, {
    data: { initialValues },
  })
}

void boot()
