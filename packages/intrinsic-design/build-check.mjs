/**
 * Verifies the intrinsic core compiles through Tailwind v4 and emits the live,
 * container-adaptive token scale (the recipe passes through @theme intact).
 * Mirrors the de-risking done in tools/theme-workshop/device-lab/spike.
 *
 *   node build-check.mjs
 */
import { readFileSync } from "node:fs"
import tailwind from "@tailwindcss/postcss"
import postcss from "postcss"

const core = readFileSync(new URL("./intrinsic.css", import.meta.url), "utf8")

// A consumer: import Tailwind, then the core, then use a couple of utilities +
// raw tokens so we exercise both surfaces.
const input = `@import "tailwindcss";
${core}
@layer probe {
  .probe {
    font-size: var(--intrinsic-text-up3);
    padding: var(--intrinsic-space-2);
  }
}`

const { css } = await postcss([tailwind()]).process(input, { from: "intrinsic.css" })

// The recipe must survive intact: clamp + cqi anchor + round snap, the derived
// base, and the type/space scale, all as live custom properties.
const must = [
  "--intrinsic-base",
  "clamp(",
  "1cqi",
  "round(",
  "--intrinsic-text-up3",
  "--intrinsic-text-0",
  "--intrinsic-space-2",
]
const missing = must.filter(token => !css.includes(token))

if (missing.length) {
  console.error("FAIL — missing from compiled output:", missing)
  process.exit(1)
}
console.log(
  "OK — @korri/intrinsic-design compiles through Tailwind v4; the generator " +
    "(base · clamp · cqi · round + type + space scale) is emitted live.",
)
