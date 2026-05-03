set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
  @just --list

# Start web, API, Playwright UI, and Storybook.
dev portal_port="${PORTAL_PORT:-3000}" api_port="${API_PORT:-3001}" pw_port="${PW_PORT:-9876}" storybook_port="${STORYBOOK_PORT:-6006}" host="${APP_HOST:-localhost}":
  PORTAL_PORT={{portal_port}} API_PORT={{api_port}} PW_PORT={{pw_port}} STORYBOOK_PORT={{storybook_port}} APP_HOST={{host}} tools/scripts/serve-dev-stack.sh

# Start the Vite dev server.
dev-web port="${PORTAL_PORT:-3000}" api_port="${API_PORT:-3001}":
  KORRI_API_PROXY_TARGET=http://localhost:{{api_port}} bun run vite --mode development --host 0.0.0.0 --port {{port}} --clearScreen false

# Start the local API server.
dev-api port="${API_PORT:-3001}":
  PORT={{port}} NODE_ENV=development bun x tsx --tsconfig tsconfig.server.json tools/http/server.ts

# Start Playwright UI over ephemeral HTTPS against an existing dev stack.
dev-playwright port="${PW_PORT:-9876}" portal_port="${PORTAL_PORT:-3000}" api_port="${API_PORT:-3001}" host="${APP_HOST:-localhost}":
  PW_PORT={{port}} PORTAL_PORT={{portal_port}} API_PORT={{api_port}} APP_HOST={{host}} PLAYWRIGHT_TEST_BASE_URL=http://{{host}}:{{portal_port}} tools/scripts/serve-playwright-ui.sh

# Start Storybook.
dev-storybook port="${STORYBOOK_PORT:-6006}":
  bun x storybook dev -c korri/deploy/storybook -p {{port}} --host 0.0.0.0 --no-open

# Build web and API outputs.
build: build-web build-api

# Build the web app.
build-web:
  bun run vite build --mode production

# Build the API server.
build-api:
  rm -rf out/build/api
  tsc --project tsconfig.api.json
  bun x tsc-alias -p tsconfig.api.json --resolve-full-paths --resolve-full-extension .js

# Check whether Electrobun's native runtime can run on this machine.
desktop-runtime-check:
  bun run tools/desktop/electrobun-runtime-check.ts

# Smoke-test the desktop HTTP composition against the built portal output.
desktop-smoke: build-web
  bun run tools/desktop/desktop-smoke.ts

# Start the Electrobun desktop app after building portal assets.
desktop-dev: build-web desktop-runtime-check
  bun x electrobun dev
  bun run tools/desktop/electrobun-post-build-patch.ts

# Package the Electrobun desktop app after building portal assets.
desktop-build: build-web desktop-runtime-check
  bun x electrobun build
  bun run tools/desktop/electrobun-post-build-patch.ts

# Run unit tests.
test-unit:
  bun test

# Alias for test-unit.
test: test-unit

# Generate BDD Playwright wrappers from .feature files.
generate-bdd *args:
  bun run tools/scripts/generate-bdd-playwright-tests.ts {{args}}

# Validate that generated BDD wrappers are current without rewriting them.
check-bdd:
  bun run tools/scripts/generate-bdd-playwright-tests.ts --check

# Record an Argo demo video against the local stack (full render, opt-in).
demo-video demo="":
  bun run tools/demo-video/smoke.ts {{demo}}

# Plan an Argo demo video without recording (no ffmpeg required).
demo-video-dry-run demo="":
  bun run tools/demo-video/smoke.ts --dry-run {{demo}}

# Verify ffmpeg/ffprobe and demo-video tooling are ready.
demo-video-check:
  bun run tools/demo-video/smoke.ts --check-only

# Run browser E2E tests.
test-e2e *args: generate-bdd
  playwright test --config tools/playwright/playwright.e2e.config.ts {{args}}

# Run Playwright UI over ephemeral HTTPS against an existing dev stack.
test-e2e-ui *args:
  tools/scripts/serve-playwright-ui.sh {{args}}

# Run Playwright component specs.
test-component *args:
  playwright test --config tools/playwright/playwright.component.config.ts {{args}}

# Run TypeScript checks.
typecheck:
  tsc --noEmit

# Run Biome checks.
lint:
  biome check tools korri

# Format source files.
format:
  biome format --write tools korri

# Run the standard validation suite.
check: validate-router lint typecheck test-unit check-bdd

# Run validation plus a production build.
check-full: check build

# Validate TanStack Router generator config.
validate-router:
  bun run tools/scripts/validate-router-config.ts

# List all Jobs to be Done declared under docs/jobs/.
list-jobs *args:
  bun run tools/scripts/list-jobs.ts {{args}}

# Regenerate the feature gate registry.
generate-gates:
  bun run tools/generators/gates/generate-gate-registry.ts

# Generate the product feature map for dev tooling.
generate-feature-map:
  bun run tools/generators/feature-map/generate-feature-map.ts

# Validate that the generated product feature map is current and internally linked.
check-feature-map:
  bun run tools/generators/feature-map/generate-feature-map.ts --check

# Start the Feature Map Explorer dev tool (Vite SPA + Hono dev API).
dev-feature-map port="${FEATURE_MAP_PORT:-4317}" api_port="${FEATURE_MAP_API_PORT:-4318}":
  FEATURE_MAP_PORT={{port}} FEATURE_MAP_API_PORT={{api_port}} tools/feature-map-explorer/dev.sh

# Preview the built web app.
preview:
  bun run vite preview --port 4173

# Install local git hooks.
setup-hooks:
  git config --local core.hookspath .lefthook
  mkdir -p .lefthook
  lefthook install --force

# Remove generated artifacts.
clean:
  rm -rf out dist coverage test-results .tmp
  bun run tools/scripts/generate-bdd-playwright-tests.ts --clean
