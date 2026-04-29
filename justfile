set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
  @just --list

# Start API and web dev servers.
dev:
  @just dev-api & \
    api_pid=$$!; \
    just dev-web & \
    web_pid=$$!; \
    trap 'kill $$api_pid $$web_pid >/dev/null 2>&1 || true' EXIT INT TERM; \
    wait -n $$api_pid $$web_pid

# Start the Vite dev server.
dev-web:
  bun run vite --mode development --port 3000 --clearScreen false

# Start the local API server.
dev-api:
  NODE_ENV=development bun x tsx --tsconfig tsconfig.server.json tools/http/server.ts

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

# Run unit tests.
test-unit:
  bun test

# Alias for test-unit.
test: test-unit

# Generate BDD Playwright wrappers from .feature files.
generate-bdd *args:
  bun run tools/scripts/generate-bdd-playwright-tests.ts {{args}}

# Run browser E2E tests.
test-e2e *args: generate-bdd
  playwright test --config tools/playwright/playwright.e2e.config.ts {{args}}

# Run browser E2E tests in Playwright UI mode.
test-e2e-ui *args: generate-bdd
  playwright test --ui --config tools/playwright/playwright.e2e.config.ts {{args}}

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
check: validate-router lint typecheck test-unit

# Run validation plus a production build.
check-full: check build

# Validate TanStack Router generator config.
validate-router:
  bun run tools/scripts/validate-router-config.ts

# Regenerate the feature gate registry.
generate-gates:
  bun run tools/generators/gates/generate-gate-registry.ts

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
