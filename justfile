set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-load := true
set dotenv-filename := "local.env"

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
  PORT={{port}} NODE_ENV=development bun product/services/server/http/server.ts

# Deprecated: dev-lab is the canonical design tool. Kept as a compatibility alias.
dev-theme-workshop port="3130":
  @echo "dev-theme-workshop is deprecated; starting dev-lab instead"
  bun run vite --config tools/theme-workshop/lab/vite.config.mjs --host 0.0.0.0 --port {{port}} --clearScreen false

# Dev-only first-class design lab: real app surfaces, parts, sources/states, and multi-device routing.
dev-lab port="3130":
  bun run vite --config tools/theme-workshop/lab/vite.config.mjs --host 0.0.0.0 --port {{port}} --clearScreen false

# Design lab for on-device viewing (phone/tablet). Keeps HMR, but swaps Vite's
# reconnect-driven full-page reload for a silent in-place reconnect, so
# backgrounding the browser and returning resumes HMR instead of reloading.
# Serves an installable fullscreen PWA; serves HTTPS automatically when a
# locally-trusted cert exists at tools/theme-workshop/lab/pwa/.certs
# (mint one with tools/theme-workshop/lab/pwa/make-cert.sh).
dev-lab-device port="3130":
  LAB_DEVICE=1 bun run vite --config tools/theme-workshop/lab/vite.config.mjs --host 0.0.0.0 --port {{port}} --clearScreen false

# Dev-only seed proof: render the REAL Shift home from an in-memory seed (no API/device).
dev-seed-proof port="3120":
  bun run vite --config tools/seed-proof/vite.config.mjs --host 0.0.0.0 --port {{port}} --clearScreen false

# Start Playwright UI over ephemeral HTTPS against an existing dev stack.
dev-playwright port="${PW_PORT:-9876}" portal_port="${PORTAL_PORT:-3000}" api_port="${API_PORT:-3001}" host="${APP_HOST:-localhost}":
  PW_PORT={{port}} PORTAL_PORT={{portal_port}} API_PORT={{api_port}} APP_HOST={{host}} PLAYWRIGHT_TEST_BASE_URL=http://{{host}}:{{portal_port}} tools/scripts/serve-playwright-ui.sh

# Start Storybook.
dev-storybook port="${STORYBOOK_PORT:-6006}":
  bun x storybook dev -c product/apps/storybook -p {{port}} --host 0.0.0.0 --no-open

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

# Run the selected Korri flake app locally, or on DEVICE_HOST when set.
device-run *args:
  bun run tools/device/flake-command.ts {{args}}

# Print the selected Device flake run command without executing it.
device-print-run-command:
  bun run tools/device/flake-command.ts --print

# Run TypeScript unit tests.
test-unit:
  bun test

# Run TypeScript unit tests with coverage reported to text+lcov.
# Uses bunfig.coverage.toml because bun 1.3.3 silently ignores the
# CLI --coverage flag when `coverage = false` is set in bunfig.toml.
# Defaults to the full suite; pass arguments for a specific slice,
# e.g. `just test-coverage product/services/device/sessiond-state.test.ts`.
test-coverage *args:
  mkdir -p out/coverage
  bun --config=bunfig.coverage.toml test {{args}}

# Coverage for the sessiond-relevant test slice (task-009 baseline).
# Targets the public-contract tests for sessiond daemon, role,
# launcher seam, foreground-session owner, launch RPC, and
# app.server.status. The file list mirrors task-009's Related
# section; update it whenever the sessiond surface grows.
test-coverage-sessiond:
  mkdir -p out/coverage
  bun --config=bunfig.coverage.toml test \
    product/services/device/sessiond.test.ts \
    product/services/device/sessiond-state.test.ts \
    product/services/device/sessiond-role.test.ts \
    product/services/device/sessiond-source-machine.test.ts \
    product/services/device/sessiond-gamescope-reaper.test.ts \
    product/services/device/sessiond-launcher-client.test.ts \
    product/services/device/sessiond-renderer.test.ts \
    product/services/device/sessiond-status-sidecar.test.ts \
    product/services/device/sessiond-sway.test.ts \
    product/services/device/sessiond-smoke.test.ts \
    product/platform/library/session-launcher.test.ts \
    product/platform/library/sessiond-managed-launch-protocol.test.ts \
    product/platform/library/launcher.test.ts \
    product/platform/library/launcher-layer-memory.test.ts \
    product/platform/stream/foreground-session-owner.test.ts \
    product/platform/stream/foreground-session-lifecycle.test.ts \
    product/platform/stream/foreground-session-gate-state.test.ts \
    product/platform/stream/foreground-session-status.test.ts \
    product/apps/portal/api/library/launch.rpc-handler.test.ts \
    product/apps/portal/api/library/local-foreground-launch-adapter.test.ts \
    product/apps/portal/api/server/status.rpc-handler.test.ts \
    product/apps/portal/features/home/foreground-session-status-layer-live.test.ts \
    product/apps/portal/features/home/foreground-session-status-layer-live.integration.test.ts

# Run native Nix checks. Bun must not own Nix module/config/build assertions.
test-nix:
  nix build \
    .#checks.x86_64-linux.korri-standard-native \
    --no-link
  nix build \
    .#packages.x86_64-linux.korri-cli \
    --no-link
  nix build \
    .#packages.x86_64-linux.korri-kiosk-live-iso \
    .#packages.x86_64-linux.korri-kiosk-live-developer-iso \
    --dry-run \
    --no-link

# Fast SM8550 iteration gate: validate Thor/Odin system closures without
# packaging the rootfs tarball payload. Use product payload builds only for
# promotion/distribution artifacts.
sm8550-kiosk-toplevel-check:
  nix build \
    .#checks.x86_64-linux.korri-sm8550-kiosk-config \
    .#nixosConfigurations.korri-odin2portal-kiosk.config.system.build.toplevel \
    .#nixosConfigurations.korri-thor-kiosk.config.system.build.toplevel \
    --dry-run \
    --no-link

# Dry-build, config-check, and document-smoke the x86 live USB kiosk artifact.
live-usb-smoke:
  nix build \
    .#checks.x86_64-linux.korri-live-usb-config \
    .#checks.x86_64-linux.korri-live-usb-developer-config \
    .#checks.x86_64-linux.korri-live-usb-invalid-artifact \
    .#checks.x86_64-linux.korri-live-usb-persistence-resolver \
    --no-link
  nix build \
    .#packages.x86_64-linux.korri-kiosk-live-iso \
    .#packages.x86_64-linux.korri-kiosk-live-developer-iso \
    --dry-run \
    --no-link
  bun test tools/testing/standards/korri-live-usb-docs.test.ts

# Run the bounded NixOS VM smoke for the x86 live USB runtime composition.
live-usb-vm-smoke:
  nix build .#checks.x86_64-linux.korri-live-usb-vm-smoke --no-link

# Boot the x86 live USB ISO in QEMU/OVMF for manual validation.
live-usb-qemu *args:
  nix run .#korri-live-usb-qemu -- {{args}}

# Boot the x86 live USB ISO in QEMU with the persistence experiment attached.
live-usb-qemu-persistence *args:
  nix run .#korri-live-usb-qemu-persistence -- {{args}}

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

# Run lint checks.
lint: lint-biome fallow-audit

# Run Biome checks.
lint-biome:
  biome check product tools

# Run Fallow codebase intelligence. Pass subcommands or flags after the recipe name.
fallow *args:
  tools/scripts/fallow.sh {{args}}

# Audit changed files for dead code, complexity, duplication, and boundary drift.
fallow-audit *args:
  tools/scripts/fallow.sh audit {{args}}

# Regenerate tools/nix/generated/bun.nix and the production Bun package subset from bun.lock
# (run after any bun.lock or production package.json dependency change).
refresh-bun-deps:
  bun2nix -o tools/nix/generated/bun.nix
  bun tools/nix/bun-production-deps.ts > tools/nix/generated/bun-production-package-names.nix

# Verify tools/nix/generated/bun.nix and the production subset are in sync with bun.lock. Fails
# if `just refresh-bun-deps` would produce different files. Wired into `check`
# so PRs touching bun.lock without regenerating Nix inputs fail at lint time.
check-bun-deps:
  #!/usr/bin/env bash
  set -euo pipefail
  candidate=$(mktemp)
  production_candidate=$(mktemp)
  trap 'rm -f "$candidate" "$production_candidate"' EXIT
  bun2nix -o "$candidate"
  bun tools/nix/bun-production-deps.ts > "$production_candidate"
  if ! diff -q "$candidate" tools/nix/generated/bun.nix >/dev/null; then
    echo 'tools/nix/generated/bun.nix is out of sync with bun.lock; run `just refresh-bun-deps` and commit the result.' >&2
    diff -u tools/nix/generated/bun.nix "$candidate" | head -40 >&2
    exit 1
  fi
  if ! diff -q "$production_candidate" tools/nix/generated/bun-production-package-names.nix >/dev/null; then
    echo 'tools/nix/generated/bun-production-package-names.nix is out of sync; run `just refresh-bun-deps` and commit the result.' >&2
    diff -u tools/nix/generated/bun-production-package-names.nix "$production_candidate" | head -80 >&2
    exit 1
  fi

# Summarize a captured Nix payload build log for build-waste triage.
bun-build-log-summary log:
  bun tools/nix/summarize-build-log.ts {{log}}

# Format source files.
format:
  biome format --write product tools

# Run the standard validation suite.
check: validate-router lint typecheck test-unit test-nix check-bdd check-bun-deps

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
