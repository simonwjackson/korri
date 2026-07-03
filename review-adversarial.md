# Adversarial review — RPCS3 unified settings surface plan

Review mode: technical plan with an origin document, so this review focuses on technical assumptions, load-bearing decisions, and architectural alternatives rather than re-litigating product framing.

## Strongest objections

### P1 — The partial `--config` assumption is too load-bearing to defer

**Evidence:** The plan decides: "Partial config file for slice 1. RPCS3 fills unspecified keys with built-in defaults, so emit only the routed settings" and defers: "Does RPCS3 v0.0.41 honor a partial `--config` ...? Verify in U4; if it wipes, switch to a committed baseline overlay."

This is not a late U4 detail. It determines whether the entire mapping/rendering strategy is valid. If `--config <path>` is treated as the complete active config, a Phase 1 file containing only `Video.Resolution` / `Audio.Master Volume` can silently discard operator-tuned renderer, audio backend, locale, VFS, and accuracy settings for every Korri launch. Worse: the fallback is not necessarily a small "baseline overlay" swap. You may need a different materialization model: read/merge the canonical RPCS3 config, maintain a full version-pinned baseline, or generate per-game custom config in the format RPCS3 expects.

The plan should require a pre-implementation spike before U2/U3/U4 fan out:

- run RPCS3 v0.0.41 with a deliberately minimal `--config` and a canonical config containing a distinctive opposite value;
- prove which source wins for unspecified keys;
- prove whether RPCS3 writes back to the `--config` file on exit;
- capture that behavior as a testable fixture/contract or explicitly version-pin it.

Until that evidence exists, the plan is building typed policy on an unverified emulator contract.

### P1 — `<stateRoot>/korri/config.yml` avoids clobbering the operator file, but it is not per-launch isolation

**Evidence:** The plan says the per-launch config is written to `<stateRoot>/korri/config.yml` and that this means "the operator's canonical `config.yml` is not clobbered."

That only avoids one file. It still creates a single mutable Korri config file shared by all RPCS3 launches using the same `state.root`. Failure modes:

- Launch A writes game-specific tuning, Launch B writes different tuning before A has finished initializing, and A reads or later persists the wrong config.
- RPCS3 normalizes/saves settings back to the provided `--config` path on exit, turning the Korri file into durable global state for later launches.
- A crash leaves stale config that a later no-config-entry launch can accidentally inherit if U4 chooses "empty-but-valid file" behavior.

If the intended contract is truly per launch, the path should include an identity boundary (`releaseId`, `profileId`, app id, or a content hash) or be a session-scoped artifact with cleanup/locking. If provider integrations cannot receive an artifact root, the plan should explicitly choose deterministic per-release files plus atomic replacement and concurrency expectations. "Dedicated `korri/` subdir" is not enough.

### P1 — Hiding delivery is sound only if one semantic setting can materialize to multiple mechanisms

**Evidence:** The plan maps `display.fullscreen` to only `--fullscreen`, while the origin identifies both a CLI flag (`--fullscreen`, only honored with `--no-gui`) and a config key (`Miscellaneous.Start games in fullscreen mode`).

This is the counterexample to "delivery is an implementation detail." The author should not have to choose `flag` versus `config`, but the implementation may need to set both to satisfy the semantic contract. A boolean flag can express "turn on" but often cannot express "turn off." If the canonical state-root config already has "Start games in fullscreen mode: true", then `display.fullscreen: false` emitting no flag may not disable fullscreen. Conversely, if RPCS3 only honors `--fullscreen` in `--no-gui`, then a config-only strategy may fail for headless boot.

The plan needs a rule stronger than "mapping table routes each leaf to one bucket":

- each semantic setting declares its effective precedence contract;
- mapping rows may have multiple outputs;
- false values must be materialized when absence is not an override;
- tests must start from a canonical config containing the opposite value, not from an empty/default world.

Without that, the unified tree will look ergonomic while leaking hidden precedence bugs to authors.

### P1 — `overrides` last-write-wins contradicts the semantics authors will infer from `prepend`/`append`

**Evidence:** The plan chooses "last-write-wins per sub-field" for `args.prepend`, `args.append`, `config.prepend`, and `config.append`. The existing cascade model documents arrays as concatenating in inheritance order (`argsAppend` already does this), and the field names `prepend` / `append` describe accumulation, not replacement.

A likely author expectation:

- host/app layer appends an operationally required flag or config fragment;
- release/profile layer appends a game-specific fragment;
- both survive in cascade order.

Under the plan, the more-specific `config.append` silently discards the less-specific one. That turns a cascade into a shadowing mechanism and makes `append` misleading. It is especially risky because `overrides.config` is the escape hatch for settings intentionally not modeled; losing a base fragment could change emulator behavior with no schema error.

A more defensible semantic is:

- `args.prepend` and `args.append`: concatenate arrays in layer order;
- `config.prepend` and `config.append`: concatenate text fragments in layer order with delimiter/newline normalization;
- `replace`: highest-specific wins and explicitly suppresses generated/default fragments according to documented scope.

If the team really wants last-write-wins, rename or document these as overrides in the authoring contract before implementation; do not rely on "predictable" when it is predictably surprising.

### P2 — Raw YAML text append may not be a reliable escape hatch for nested RPCS3 config

**Evidence:** U4 applies `overrides.config` by verbatim string concatenation: generated YAML first, then appended text. The origin relies on `config.append` as the escape hatch for anything unmodeled.

For YAML, appending another top-level `Video:` block is not the same thing as deep-merging into the generated `Video:` mapping. Depending on yaml-cpp duplicate-key behavior, the result may be first-wins, last-wins, parser-dependent, or whole-section replacement. That means the break-glass hatch can either fail to override a generated key or accidentally drop sibling generated keys.

This matters because the plan uses the escape hatch to justify both the maximal typed rollout and forward compatibility. The hatch should be proven against RPCS3/yaml-cpp, not just a TypeScript YAML parser. At minimum, the README must explain safe fragment shapes; ideally, RPCS3-specific `config.append` should parse and deep-merge YAML fragments before rendering, while preserving raw `replace` for truly arbitrary files.

### P1 — U1's shared cascade change has a larger blast radius than "optional/additive" implies

**Evidence:** `LaunchOverrides` is currently defined on `ReleaseLaunch`, but `ReadableResolvedLaunchContext` has no `overrides` field and `ReadableOverride` currently exposes only `launch`, `moonlight`, `plugin`, `env`, `cwd`, `argsAppend`, and `patches`. The plan says U1 will fold overrides through shared `mergeReadableLayers` and that "ReleaseLaunch.overrides and the ephemeral override layer author overrides today."

That is not just plumbing. It creates a new raw argv/config surface on the generic resolved launch context. Questions the plan has not settled:

- Is `overrides` release-only, or can host/user/app/runtime/profile/ephemeral layers participate later?
- If ephemeral overrides get `overrides`, does that violate the current narrow runtime-override posture that avoids exposing raw process surfaces?
- If generic composer consumption is deferred, what prevents different plugins from interpreting the same context field differently?
- What happens to legacy `argsAppend` ordering relative to `overrides.args.append`?

The safest narrow implementation is to keep `ReleaseLaunch.overrides` release-scoped and thread it deliberately to the RPCS3 materializer, or to define a full generic override contract now. The current middle ground gets the blast radius of a shared contract without the contract clarity.

### P2 — Modeling the full config surface now may create false stability instead of leverage

**Evidence:** R2 and the scope boundaries put "all four phases" and the "full curated `config.yml` surface" in this single plan, while the risk table acknowledges drift across RPCS3 versions.

The plan already has a raw escape hatch. That weakens the case for typing the long tail immediately. The failure mode is not just maintenance cost; it is false authority. A stale typed enum can reject a valid newer RPCS3 value, or a stale value map can render a syntactically valid but semantically wrong config key. Users then trust the typed surface more than the emulator actually warrants.

A thinner architecture would likely survive contact better:

- ship boot essentials plus high-frequency Phase 1 settings;
- add per-game accuracy knobs only where there is known demand;
- leave deep defaults / debug / version-volatile surfaces to `overrides.config` until usage proves they deserve stable Korri names;
- optionally generate candidate mappings from captured config versions instead of hand-curating all long-tail keys.

If the full surface remains in scope, require an explicit versioning/drift policy: what RPCS3 version the schema targets, what happens when values disappear/change, and how authors escape a stale enum without waiting for a Korri release.
