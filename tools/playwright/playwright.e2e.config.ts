import { defineConfig, devices } from "@playwright/test"
import {
  reportArtifactPaths,
  testResultArtifactPaths,
} from "../artifacts/paths"
import {
  apiBaseUrl,
  apiPort,
  PROJECT_ROOT,
  portalBaseUrl,
  portalPort,
  useExistingStack,
} from "./e2e-env"

process.env.KORRI_PORT_PORTAL = String(portalPort)
process.env.KORRI_PORT_API = String(apiPort)
process.env.PLAYWRIGHT_TEST_BASE_URL = portalBaseUrl

export default defineConfig({
  testDir: "../../korri/products",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  outputDir: `${PROJECT_ROOT}/${testResultArtifactPaths.e2e}`,
  reporter: [
    [
      "html",
      { outputFolder: `${PROJECT_ROOT}/${reportArtifactPaths.playwright}/e2e` },
    ],
  ],
  timeout: 75_000,
  globalTimeout: 10 * 60_000,
  use: {
    baseURL: portalBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExistingStack
    ? undefined
    : [
        {
          command: [
            `KORRI_API_PROXY_TARGET=${apiBaseUrl}`,
            `bun run vite --mode development --port ${portalPort} --clearScreen false`,
          ].join(" "),
          port: portalPort,
          cwd: PROJECT_ROOT,
          timeout: 120_000,
          reuseExistingServer: false,
          stdout: "ignore",
          stderr: "ignore",
        },
        {
          command: [
            `PORT=${apiPort}`,
            "NODE_ENV=development",
            `bun x tsx --tsconfig ${PROJECT_ROOT}/tsconfig.server.json ${PROJECT_ROOT}/tools/http/server.ts`,
          ].join(" "),
          port: apiPort,
          cwd: PROJECT_ROOT,
          timeout: 120_000,
          reuseExistingServer: false,
          stdout: "ignore",
          stderr: "ignore",
        },
      ],
})
