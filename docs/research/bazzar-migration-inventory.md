# Bazzar migration inventory

Date: 2026-06-04

## Scope and source state

This inventory supports PR-1 of the Korri/Bazzar migration plan. It classifies Bazzar source areas before any broad import is accepted and records the private/local quarantine state for legally sensitive `.mjs` plugins.

- Korri plan: `docs/plans/2026-06-04-001-feat-korri-bazzar-migration-plan.md`
- Bazzar source checkout: `Bazzar:<local checkout>` at branch `main`, commit `f362933`
- Bazzar source checkout was dirty during inventory. Noted modified files: `shared/core/src/plugins/retrostic.mjs`, `shared/core/src/plugins/romhustler.mjs`, related mocks/tests, and Bazzar backlog files. The quarantine hashes record the copied bytes for preservation only; they are not legal-review canon. Any future legal review must compare against the intended committed Bazzar source state or explicitly review these dirty working-tree bytes.
- Private/local quarantine checkout: `Bazzar plugin quarantine:<local checkout>`

The migration remains copy-first. This inventory does not delete from the Bazzar source checkout and does not add `.mjs` plugins to Korri.

## Classification key

- **Import:** useful as-is or nearly as-is for Korri acquisition.
- **Adapt:** useful but requires Korri naming, upgraded Effect compatibility, runtime config, logger, static registry, or boundary changes.
- **Defer:** useful later but not required for this slice.
- **Delete:** standalone Bazzar identity, demo surfaces, duplicate tooling, or incompatible baggage.

## Top-level inventory

| Bazzar path / area | Classification | Rationale | Korri destination / action |
|---|---:|---|---|
| `apps/cli/src/bazzar.ts` | Adapt | Current root command definitions are the source of `korri bazzar` command compatibility, but standalone binary identity must not survive. | Port command group under `product/apps/cli/bazzar/*`; register as Korri subcommand only. |
| `apps/cli/src/cli-commands.ts` | Adapt | Implements `search`, `details`, and `plugins` behavior and output shapes. Needs Korri service layering and strict compatibility tests. | Port under `product/apps/cli/bazzar/*`. |
| `apps/cli/src/source-contract-commands.ts` | Adapt | Implements machine-readable `validate-sources` and `resolve-download` envelopes. Critical for stdout/stderr discipline. | Port under `product/apps/cli/bazzar/*`. |
| `apps/cli/src/source-contract-runner.ts` | Adapt | Contract runner preserves single-line JSON stdout semantics and exit categories. Needs Korri-safe logging. | Port under `product/apps/cli/bazzar/*`. |
| `apps/cli/src/source-contract-services.ts`, `plugin-environment.ts`, `cli-runtime-services.ts` | Adapt | Useful CLI composition but tied to Bazzar runtime config and dynamic plugin assumptions. | Rebuild as Korri CLI acquisition layers. |
| `apps/api/src/server.ts` | Delete | Bazzar demo API is Fastify/tRPC-oriented and explicitly excluded. | Do not import; replace with Korri headless/server Effect RPC in a later chunk. |
| `apps/ui/**/*` | Delete / absent | No `apps/ui` directory was present in the inspected checkout. Bazzar UI remains explicitly out of scope if found later. | Do not import. |
| `shared/core/src/cli/output-contract.ts` and tests/fixtures | Adapt | Contract envelope shape and golden behavior are core compatibility material. | Port to acquisition protocol/CLI tests; preserve parseability before renaming versions. |
| `shared/core/src/rpc/bazzar-rpc.ts` and test | Adapt | Captures an aligned operation seam but Bazzar RPC shape/name must map to Korri server RPC conventions. | Use as reference only for `product/apps/portal/api/server/*` acquisition RPCs. |
| `shared/core/src/plugin-runtime.ts`, `plugin-harness.ts`, `plugin-operation-harness.ts`, `plugin-contract-codecs.ts` | Adapt | Useful plugin execution and schema boundary logic, but must remove external `.mjs` loading and align to Korri trust policy. | Port into `product/platform/acquisition/*` with schema validation at harness boundary. |
| `shared/core/src/plugin-loader.ts` | Adapt / Defer external part | Useful for understanding current registry and plugin metadata, but filesystem/external loading is out of scope. | Keep only static TypeScript registry behavior; defer external loading. |
| `shared/core/src/plugin-cache.ts` | Defer | Cache semantics may be useful after live acquisition is stable, but not required for inventory/protocol work. | Reassess during core port if tests require it. |
| `shared/core/src/plugin-execution-policy.ts` | Adapt | Important trust boundary concept. Needs Korri policy names and tests. | Port into acquisition trust policy layer. |
| `shared/core/src/source-search.ts`, `source-details.ts`, `validation/source-validation.ts`, `download-resolution/*` | Adapt | Core operations for the five CLI/RPC surfaces. | Port behind `product/platform/acquisition/acquisition-service.ts`. |
| `shared/core/src/download-resolution/url-policy.ts` | Import / Adapt | Directly relevant to outbound URL safety; likely close to Korri requirement R19. | Port with tests into acquisition trust policy/download-resolution area. |
| `shared/core/src/security/credential-redaction.ts` | Import / Adapt | Directly supports credential redaction requirement. | Port with tests into acquisition security utilities. |
| `shared/core/src/source-policy.ts`, `source-validation-probes.ts`, `source-identity.ts`, `source-aliases.ts` | Adapt | Needed to validate/canonicalize source names and health behavior. | Port into platform acquisition registry/policy modules. |
| `shared/core/src/runtime-config.ts`, `logger.ts`, `clock.ts`, `errors.ts` | Adapt | Useful seams but Bazzar defaults/logging cannot leak stdout or standalone identity. | Rebuild as Korri-owned config/logger/clock/error modules. |
| `shared/core/src/platform-catalog.ts`, `platform-mapping.ts` | Adapt | May support source platform normalization. | Port only if referenced by approved TS plugins/core. |
| `shared/core/src/types/*`, `utils/*` | Adapt | Types/codecs and utility logic support acquisition contracts. | Split wire-safe schemas to `product/platform/protocol/acquisition/*`; helpers to `product/platform/acquisition/*`. |
| `shared/core/src/test-fixtures.ts`, `*.test.ts`, `*.fixtures.ts`, `*.mocks.ts` | Adapt | Valuable characterization and parity coverage. | Bring companion tests/fixtures with ported modules; avoid mock-only assertions where Korri public-contract tests are required. |
| `shared/core/src/plugins/*.ts` | Adapt | Approved TypeScript providers migrate into Korri and may be autoloaded/distributed. | Port to `product/platform/acquisition/plugins/*` as platform acquisition internals. |
| `shared/core/src/plugins/*.policy.ts`, `*.validation.ts` | Adapt | Per-source policy/validation data is useful for safety classification and health checks. | Port with approved TS plugins when applicable. |
| `shared/core/src/plugins/*.mjs` | Delete from Korri / quarantine | Legally sensitive provider implementations are excluded from Korri distribution and active provider inventory. | Copy to private/local quarantine only; do not load/package/advertise. |
| `shared/core/src/itchio/*` | Adapt | Itch.io is an approved TypeScript source family with auth/free-download/detail/resolver helpers. | Port to `product/platform/acquisition/itchio/*` and registry. |
| `specs/source-adapter-contract.md`, `specs/fixtures/*` | Adapt | Useful contract reference and fixtures for parity tests. | Copy/adapt into Korri docs/tests as needed by PR-4/PR-7. |
| `package.json` | Delete / reference only | Contains standalone package name, `bin.bazzar`, demo API deps, and old Effect pins. | Do not import package identity; mine dependency list selectively. |
| `Justfile`, `flake.nix`, `nix/bazzar-cli.nix` | Delete / reference only | Standalone development and packaging surfaces are excluded. | Do not add standalone Bazzar package/app output. Use only as historical reference if needed. |
| `backlog/*`, `work/*`, `.worktrees/*`, `.direnv/*`, `dist/*` | Delete | Local/project management, generated output, or unrelated implementation branches. | Do not import into Korri. |
| `CLAUDE.md` | Delete / reference only | Agent instructions for old repo; not runtime/product code. | Do not import. |

## Source/provider classification

| Source/provider | Origin files | Classification | Legal/TOS risk | Default enablement recommendation | Credential posture | Notes |
|---|---|---:|---|---|---|---|
| `chip8archive` | `chip8archive.ts`, policy, mocks/tests | Adapt | Low/medium; archive/source-specific terms need confirmation. | Built-in candidate after policy review. | No credential files observed. | TypeScript provider approved for Korri distribution if inventory assumptions hold. |
| `homebrewhub` | `homebrewhub.ts`, mocks/tests | Adapt | Low/medium; homebrew catalog posture appears aligned but terms still need confirmation. | Built-in candidate after policy review. | No credential files observed. | TypeScript provider approved for Korri distribution if tests remain green. |
| `itchio` and variants | `itchio.ts`, `itchio-*` tests/helpers, `itchio/*` | Adapt | Medium; platform terms and per-project license/download rules vary. | Built-in candidate with policy and credential-sensitive paths tested. | Optional authenticated API support; credentials must be redacted and absent from envelopes. | Needs strict auth failure classification. |
| `pico8bbs` | `pico8bbs.ts`, policy, tests | Adapt | Medium; forum/community content and platform rights vary. | Built-in candidate after policy review. | No credential files observed. | Keep policy tests. |
| `portmaster` | `portmaster.ts`, policy, tests | Adapt | Low/medium; open source distribution metadata likely safer but still source-dependent. | Built-in candidate after policy review. | No credential files observed. | Good TypeScript source candidate. |
| `puzzlescript` | `puzzlescript.ts`, policy, validation, tests | Adapt | Low/medium; user-generated games require license/source validation. | Built-in candidate after policy review. | No credential files observed. | Keep validation fixtures. |
| `retrobrews` | `retrobrews.ts`, policy, validation, tests | Adapt | Low/medium; catalog terms need confirmation. | Built-in candidate after policy review. | No credential files observed. | Keep validation fixtures. |
| `tic80gallery` | `tic80gallery.ts`, policy, validation, tests | Adapt | Low/medium; gallery/user-content terms need confirmation. | Built-in candidate after policy review. | No credential files observed. | Keep validation fixtures. |
| `wasm4gallery` | `wasm4gallery.ts`, policy, tests | Adapt | Low/medium; gallery/user-content terms need confirmation. | Built-in candidate after policy review. | No credential files observed. | Keep validation fixtures. |
| `coolrom` | `coolrom.mjs`, policy/mocks/tests | Quarantine | High legal/distribution concern. | Excluded from active Korri provider set. | No credential files observed. | `.mjs` implementation copied to quarantine only; TS policy/tests are reference material unless later legal review changes posture. |
| `retrostic` | `retrostic.mjs`, policy/mocks/tests | Quarantine | High legal/distribution concern. | Excluded from active Korri provider set. | No credential files observed. | Bazzar checkout had local modifications when copied; quarantine hash records copied content. |
| `romhustler` | `romhustler.mjs`, policy/mocks/tests | Quarantine | High legal/distribution concern. | Excluded from active Korri provider set. | No credential files observed. | Bazzar checkout had local modifications when copied; quarantine hash records copied content. |
| `steamgriddb` | `steamgriddb.mjs`, mocks/tests | Quarantine | Medium/high; asset API may require key and terms review. | Excluded from active Korri provider set for this slice. | Likely API-key capable; no credentials may appear in logs/envelopes. | `.mjs` implementation copied to quarantine only. |
| `wowroms` | `wowroms.mjs`, policy/mocks/tests | Quarantine | High legal/distribution concern. | Excluded from active Korri provider set. | No credential files observed. | `.mjs` implementation copied to quarantine only. |

## Quarantine manifest

Private/local quarantine files copied from `Bazzar:shared/core/src/plugins/*.mjs`:

| File | SHA-256 |
|---|---|
| `coolrom.mjs` | `f3582f1dc66008f69a3cec9722967c18f1a729c9500f3434fb719f5ef01b1edb` |
| `retrostic.mjs` | `cf8f4e6c23ee43bf08f94fb6bcb131ac21b5a4e7d320325196292adeafa8f174` |
| `romhustler.mjs` | `a53f5e8bd51d309e90f0ed3feed7d38b6ad24cb1a00333c44a389d9033b4f4df` |
| `steamgriddb.mjs` | `b41efe9b2ec1df33a6e056844c933ec30e1018214e2fdce3498be5815fb39618` |
| `wowroms.mjs` | `4723c59c86f0a9f9157e23e9517ca98554788e84e6788fd0d67bbd6a68b1da25` |

Quarantine notes created with the files:

- `README.md` explains that the directory is preservation/review-only.
- `SHA256SUMS` records copied content hashes.
- `retrostic.mjs` and `romhustler.mjs` were copied while the source checkout had local modifications. Treat their hashes as preservation provenance, not approval evidence.

## Verification notes

- Every inspected top-level Bazzar area is classified above: `apps/cli`, `apps/api`, `shared/core`, `specs`, root package/tooling, `nix`, `backlog`, `work`, generated/local directories, and absent `apps/ui`.
- The `.mjs` plugin files are copied to the private/local quarantine and are not added under Korri `product/`.
- Korri must not load, package, advertise, or depend on the quarantine in this migration slice.
