import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { readFileSync, writeFileSync } from "node:fs"
const css = readFileSync("input.css", "utf8")
const res = await postcss([tailwind()]).process(css, { from: "input.css" })
writeFileSync("output.css", res.css)
console.log("built output.css")
