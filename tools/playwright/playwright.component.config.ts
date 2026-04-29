import { defineConfig, devices } from "@playwright/test"
import {
  reportArtifactPaths,
  testResultArtifactPaths,
} from "../artifacts/paths"
import { PROJECT_ROOT, portalPort } from "./e2e-env"

export default defineConfig({
  testDir: "../..",
  testMatch: "**/*.component.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  outputDir: `${PROJECT_ROOT}/${testResultArtifactPaths.component}`,
  reporter: [
    [
      "html",
      {
        outputFolder: `${PROJECT_ROOT}/${reportArtifactPaths.playwright}/component`,
      },
    ],
  ],
  use: {
    baseURL: `http://localhost:${portalPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `bun run vite --mode development --port ${portalPort} --clearScreen false`,
    port: portalPort,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
