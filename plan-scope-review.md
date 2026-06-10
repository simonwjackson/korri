# Scope Review — `feat: Move Korri runtime to a ProseQL config graph`

**Plan:** `work/items/active/01KTSH1K3DTG1B6CN4T1CNKHCJ-feat-korri-config-graph/plan.md`  
**Confirmed scope:** core config graph via ProseQL `documentGraph`; no removable-media design; no authoring/write-target semantics; full break of old public library-root contracts.  
**Reviewer lens:** scope–goal alignment and abstraction economy only.

---

## F1 — `hono-app.ts` assigned to two implementation units without scope split · P2 · 75

**Where:** U2 file list and U3 file list both include `Modify: product/apps/portal/api/hono-app.ts`.

**Evidence:**
- U2 lists `product/apps/portal/api/hono-app.ts` as a modification target with no description of what it adds.
- U3 lists the same file and explicitly owns the route rename from `/api/library/events` to `/api/config/events`.
- Current `hono-app.ts` has exactly one library-events touch point: `app.get("/api/library/events", c => handleLibraryEvents(c))` — that is clearly U3's territory.

**Why it matters:** Without a stated split, the implementer landing U2 either (a) touches the file for an undeclared reason, leaving the intent ambiguous in code review, or (b) silently folds U3's route change into U2, breaking the dependency ordering the plan relies on. Both outcomes make the atomic-commit story for each unit unclear.

**Suggested fix:** Either remove `hono-app.ts` from U2's file list if U2's config-graph service is wired through the layer/context seam without touching the router (the preferred pattern), or add a single sentence to U2's file entry naming what it adds to the file (e.g., "inject config-graph service into Hono context via middleware").

---

## F2 — U5 test scenario lists `.prose` extension, which is absent from `AllTextFormatsLayer` · P2 · 75

**Where:** U5, test scenarios section.

**Evidence:**
- U5 test scenario: *"extension discovery recognizes `json`, `ndjson`, `jsonl`, `yaml`, `yml`, `json5`, `jsonc`, `toml`, `toon`, `hjson`, and `prose` when ProseQL supports them."*
- `node_modules/@proseql/core/dist/serializers/presets.d.ts` lists exactly 8 formats in `AllTextFormatsLayer`: json, jsonl/ndjson, yaml/yml, json5, jsonc, toml, toon, hjson. The `.prose` codec exists separately at `node_modules/@proseql/core/dist/serializers/codecs/prose.d.ts` and requires explicit plugin wiring — it is not part of the standard preset.
- R2 says "all ProseQL-supported document extensions." The plan's own "Approach" for U1 says to derive discovery patterns from ProseQL codec extensions, but never acknowledges that prose is a plugin, not a preset.

**Why it matters:** Including `.prose` in the discovery coverage test silently adds undeclared implementation work: the implementer must wire the prose plugin codec into the persistence layer's codec registry. This work is not listed anywhere in U1 or U5. If it's omitted, the test scenario fails; if it's added, it is undeclared scope.

**Suggested fix:** Either drop `prose` from the U5 extension list and add a note that prose-format config fragments are out of scope for this pass (matching the plain text-format goal), or add an explicit acceptance criterion to U1 that covers wiring the prose plugin codec and confirms operator intent.

---

## F3 — Conditional file in U6's file list embeds editorial intent in spec · P3 · 100

**Where:** U6 file list.

**Evidence:**
- U6 lists: `Modify: docs/handoffs/live-runtime-resolution-journey.md *(only if updating existing handoff context is explicitly useful during implementation)*`

**Why it matters:** Implementation unit file lists are used as the staged-paths input to atomic commits and code review scope gates. A conditional — "only if ... useful" — is not a spec statement; it is an authoring note that belongs in the Approach section. Its presence in the file list means any automated or manual tooling that reads the file list for commit scope will sometimes include this path and sometimes not, with no deterministic rule.

**Suggested fix:** Move the decision out of the file list. Either include the handoff doc unconditionally (with an explicit update task in the Approach) or remove it from the file list entirely and note in Approach that implementation may optionally update it as operational documentation, outside the unit's commit scope.

---

## F4 — `config-graph-service.ts` placed in `product/platform/config/` alongside env/path utilities · advisory · 50

**Where:** U2, Files section.

**Evidence:**
- Proposed new file: `product/platform/config/config-graph-service.ts`
- Current contents of `product/platform/config/`: `environment.ts`, `environment.server.ts`, `xdg-paths.ts` — all environment variable and XDG path resolution utilities, no Effect services.
- The analogous layer for the existing library read path is `product/platform/library/library-services.ts` + `library-source-layer-live.ts`.

**Why it matters:** Placing a daemon-scoped Effect service alongside path utilities creates a mixed-responsibility module. A future implementer navigating to the config-graph service would expect to find it in `product/platform/library/` (the layer that owns the read-path services it replaces), not in the env/path helpers module. This is not a blocking problem but it increases navigation cost and makes the module boundary between "platform config utilities" and "platform library services" less clear.

**Suggested fix (advisory):** Consider placing `config-graph-service.ts` in `product/platform/library/` alongside `library-services.ts`. If the intent is to create a new `platform/config` layer that grows beyond env utilities (e.g., eventually hosts config schema, config cascade, config service together), document that intent explicitly so the module boundary earns its name from day one.
