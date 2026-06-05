import { chromium } from "playwright"

const base = process.env.PICO_BASE
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ["--no-sandbox"],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
const errs = []
page.on("pageerror", e => errs.push(e.message.slice(0, 160)))
page.on("console", m => {
  if (m.type() === "error") errs.push(`CONSOLE ${m.text().slice(0, 160)}`)
})
await page.goto(base, { waitUntil: "load" })
await page.waitForFunction(
  () => document.querySelector("#root")?.children.length > 0,
  { timeout: 20000 },
)
await page.waitForTimeout(1500)
await page.screenshot({ path: "/tmp/pico-standalone-A.png" })
// Click the next arrow twice -> variant C, prove interactivity.
await page.click('button[aria-label="next variant"]')
await page.click('button[aria-label="next variant"]')
await page.waitForTimeout(800)
const label = await page.textContent(".pico-switcher-label")
await page.screenshot({ path: "/tmp/pico-standalone-C.png" })
console.log("LABEL", label?.trim())
console.log("ERRS", errs.slice(0, 6).join(" || ") || "none")
await browser.close()
