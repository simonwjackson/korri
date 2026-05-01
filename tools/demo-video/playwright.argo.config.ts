import { defineConfig, devices } from "@playwright/test"
import {
  generatedArtifactPaths,
  testResultArtifactPaths,
} from "../artifacts/paths"

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const viewport = {
  width: Number(process.env.ARGO_SCREENCAST_WIDTH ?? "1920"),
  height: Number(process.env.ARGO_SCREENCAST_HEIGHT ?? "1080"),
}
const baseURL =
  process.env.ARGO_BASE_URL ??
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  "http://localhost:3000"
const demoTimeoutMs = Number(process.env.ARGO_PLAYWRIGHT_TIMEOUT_MS ?? "900000")

export default defineConfig({
  testDir: `../../${generatedArtifactPaths.bddArgo}`,
  testMatch: "**/*.demo.ts",
  fullyParallel: false,
  workers: 1,
  timeout: demoTimeoutMs,
  outputDir: `../../${testResultArtifactPaths.e2e}/demo-video`,
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    ...(chromiumExecutablePath
      ? { launchOptions: { executablePath: chromiumExecutablePath } }
      : {}),
  },
  projects: [
    {
      name: "argo-demo",
      use: { ...devices["Desktop Chrome"], viewport },
    },
  ],
})
