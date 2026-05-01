import { defineConfig, devices } from "@playwright/test"
import {
  reportArtifactPaths,
  testResultArtifactPaths,
} from "../artifacts/paths"
import {
  PROJECT_ROOT,
  storybookBaseUrl,
  storybookPort,
  useExistingStack,
} from "./e2e-env"

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

process.env.KORRI_PORT_STORYBOOK = String(storybookPort)
process.env.PLAYWRIGHT_TEST_BASE_URL = storybookBaseUrl

export default defineConfig({
  testDir: "../..",
  // Storybook story-driven Playwright specs colocated with components.
  // The `.story.e2e.ts` suffix avoids collision with Bun's hardcoded test
  // discovery (which matches *.test.ts and *.spec.ts) while reusing the
  // project's existing `.e2e.ts` convention for browser-driven tests.
  testMatch: "korri/**/*.story.e2e.ts",
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
    baseURL: storybookBaseUrl,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    ...(chromiumExecutablePath
      ? { launchOptions: { executablePath: chromiumExecutablePath } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExistingStack
    ? undefined
    : {
        command: `bun x storybook dev -c korri/deploy/storybook -p ${storybookPort} --host 127.0.0.1 --no-open --ci`,
        port: storybookPort,
        cwd: PROJECT_ROOT,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        stdout: "ignore",
        stderr: "ignore",
      },
})
