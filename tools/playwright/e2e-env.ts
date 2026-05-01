import { execSync } from "node:child_process"
import { resolve } from "node:path"

export const PROJECT_ROOT = resolve(__dirname, "../..")

export const useExistingStack =
  process.env.PLAYWRIGHT_USE_EXISTING_STACK === "true"

function findFreePort(): number {
  const result = execSync(
    `node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"`,
    { encoding: "utf-8" },
  )
  return Number.parseInt(result.trim(), 10)
}

function resolvePort(...envKeys: string[]): number {
  for (const key of envKeys) {
    const value = process.env[key]
    if (value && !Number.isNaN(Number(value))) {
      return Number(value)
    }
  }

  return findFreePort()
}

export const portalPort = resolvePort("KORRI_PORT_PORTAL")
export const apiPort = resolvePort("KORRI_PORT_API")
export const storybookPort = resolvePort("KORRI_PORT_STORYBOOK")
export const portalBaseUrl = `http://localhost:${portalPort}`
export const apiBaseUrl = `http://localhost:${apiPort}`
export const storybookBaseUrl = `http://localhost:${storybookPort}`
