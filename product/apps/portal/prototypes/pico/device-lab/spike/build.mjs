import { readFileSync, writeFileSync } from "node:fs"
import tailwind from "@tailwindcss/postcss"
import postcss from "postcss"

const css = readFileSync("input.css", "utf8")
const res = await postcss([tailwind()]).process(css, { from: "input.css" })
writeFileSync("output.css", res.css)
console.log("built output.css")
