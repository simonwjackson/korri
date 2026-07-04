---
title: "feat: Accept-and-adapt runtime stream settings (Layer 2)"
type: feat
status: active
date: 2026-07-03
verify_command: "nix build .#checks.x86_64-linux.korri-moonlight-control-protocol-patch"
---

# feat: Accept-and-adapt runtime stream settings (Layer 2)

## Summary

Make the live stream-settings mechanism accept any requested bitrate, FPS, or
resolution and coerce it to the nearest value the hardware can actually deliver —
clamping bitrate/FPS to the encoder-safe min/max at the mechanism (mirroring the
resolution clamp already shipped in moonlight patch `0008`), and relaxing the
Sunshine host's exact-aspect resolution gate to tolerate the sub-pixel deltas that
come from rounding same-ratio resolutions to even integers. Off-ratio requests stay
rejected (scale-only, never reshape). CI invariants lock the accept-and-adapt
contract so a future patch refresh can't silently reintroduce hard rejects, and the
CLI names any coercion so it's never a silent surprise.

---

## Problem Frame

The runtime control mechanism today hard-rejects values outside the native
encoder bounds: `korri stream bitrate 5` (below the 500 kbps floor) and
`korri stream fps 10` (below the 15 fps floor) return an error and change nothing,
and the Sunshine host returns `runtime.setResolution -> invalid` for legitimate
same-ratio scale-downs like `854x480` on a 16:9 stream because it demands an
*exact* aspect match (true 16:9 at 480px is 853.33, which can't be an even
integer). This is fine for a human typing round numbers, but it is fatal for the
adaptive controller this project is building toward: that controller computes
arbitrary values from live network measurements and must have them *land*, coerced
to the nearest achievable, not bounced. Accept-and-adapt is the load-bearing
foundation under every higher layer (safety net, senses, brain, slider). See the
governing contract at `docs/acceptance/runtime-settings-protocol-contract.md`.

---

## Requirements

- R1. A bitrate request below/above the encoder-safe min/max is coerced to the bound and applied (not rejected); the applied-truth readback reports the coerced value.
- R2. An FPS request below/above the encoder-safe min/max is coerced to the bound and applied (not rejected); the applied-truth readback reports the coerced value.
- R3. A same-ratio resolution request that differs from the stream aspect only by even-integer rounding (e.g. `854x480`, `960x540` on a 16:9 stream) is accepted by the host and applied.
- R4. A genuinely different aspect-ratio request (e.g. `640x480` 4:3 on a 16:9 stream) is still cleanly rejected — never stretched or reshaped.
- R5. The accept-and-adapt behavior is locked by CI invariants so a patch refresh against upstream cannot silently reintroduce a hard reject.
- R6. When an applied value differs from the requested value, the CLI names the coercion so it is visible, not silent.

**Origin items:** `01KWN2KEGT3NGTJZ6SHDRJ3YEG` (bitrate/FPS clamp), `01KWN5M3AQR7TVMDDB0FHQ29GA` (host same-ratio tolerance).

---

## Scope Boundaries

- Not the adaptive controller, the network measurement layer, the frozen/black watchdog, the global cross-family latch, or any GUI/slider — those are Layers 3–6.
- No aspect-ratio reshaping or letterbox feature. Off-ratio requests stay rejected; the stream aspect ratio is never changed.
- No change to the H.264-only codec gate (tracked separately in `01KWMZZCC2MN2WCZ948GRMSXDK`).
- No change to the authority model, per-session control socket, or input routing.

### Deferred to Follow-Up Work

- Richer surfacing of the advertised min/max bounds (capability introspection in `korri stream show`): future iteration — the CLI already shows requested-vs-applied, which covers R6.
- Capability-aware pre-send coercion in the controller (so it never even asks for out-of-bounds values): belongs to Layer 5, not this slice. The mechanism-level clamp here is the safety net beneath it.

---

## Context & Research

### Relevant Code and Patterns

- `product/vendor/moonlight-embedded-korri/patches/0006-add-local-control-observability-ipc.patch` — native bounds: `MOONLIGHT_CONTROL_MIN_BITRATE_KBPS 500` / `MAX 150000`, `MIN_FPS 15` / `MAX 240`, width `320..7680`, height `240..4320`.
- `product/vendor/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch` — the runtime command handler; the `value < min || value > max` reject for `SET_BITRATE` and `SET_FPS` (emits `"bitrate out of bounds"` / `"fps out of bounds"`, reason `"invalid"`) is the code to convert to a clamp.
- `product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch` — **the pattern to mirror**: resolution already clamps (`if (value < MIN_WIDTH) value = MIN_WIDTH; ...`) and writes the coerced value into `control.width/height`. `0008`'s context overlaps `0007`'s reject block, which is why `0007` cannot be hand-edited.
- `product/vendor/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch` — status/reason enums: `RUNTIME_SETTINGS_STATUS_INVALID = 2`, `RUNTIME_SETTINGS_REASON_INVALID_BOUNDS = 2`, `INVALID_PAYLOAD = 3`.
- `product/vendor/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch` and `0004-add-proof-gated-runtime-resolution-apply-path.patch` — the resolution dispatch/apply path; the gate that returns `INVALID` for off-exact-aspect resolutions lives in this stack (exact site is execution-time discovery).
- `product/platform/stream/moonlight-control-protocol.ts` — protocol envelope limits are intentionally loose (`bitrateKbps.min 1`, `max MAX_SAFE_INTEGER`); the real bounds are the native ones surfaced via the capability limits. This layering is deliberate — the mechanism owns the hardware clamp.
- `product/surfaces/terminal/korri-cli/stream-quality.ts` — `formatSetOutcome` renders `requested` vs `now applied`; `describeControlError` (shipped this session) renders reject reasons readably.
- `tools/testing/nix/korri-moonlight-control-protocol-patch-check.nix` — grep-based invariant markers + compiles moonlight from source; the fast eval path throws before build on a broken invariant.

### Institutional Learnings

- Only self-contained patch blocks are safe to hand-edit; anything whose context lines are referenced by a later patch (as `0007`'s reject block is by `0008`) must be regenerated through the fork's dev-checkout/export workflow. The Nix invariant already caught one desynced hand-edit this session.
- Two truth layers: Sunshine ack = transport truth; the local-control result = caller truth. Product consumes caller truth only; `accepted` ≠ `applied` (applied requires an observable readback match). Coercion must therefore land in the value that the readback reports.

### External References

- None. Internal fork work following an existing in-repo pattern; no external best-practice research warranted.

---

## Key Technical Decisions

- **Clamp at the mechanism (native C), not in the TypeScript caller.** Mirrors the resolution clamp in `0008`, so every caller — the CLI today and the adaptive controller tomorrow — gets uniform coercion for free, and the coerced value flows through the existing applied-truth readback. Rationale: the fork exposes a bounded hardware mechanism; the hardware min/max clamp belongs at that boundary, while adaptation *policy* stays in Korri.
- **Regenerate the moonlight patch stack via dev-checkout/export, never hand-edit `0007`.** `0008`'s context depends on `0007`'s current lines; a hand-edit desyncs the stack. Rationale: proven failure mode this session.
- **Host tolerance is derived strictly from even-integer rounding, not an arbitrary margin.** Accept a request whose aspect differs from the stream ratio by no more than the delta introduced when both dimensions are rounded to even integers; reject anything beyond that. Rationale: honors never-stretch — a real off-ratio request (4:3 on 16:9) is still refused.
- **Lock the contract in CI.** Add grep invariants asserting the clamp/tolerance markers are present and the hard-reject markers are absent. Rationale: these patches are periodically refreshed against upstream; without a marker the reject can silently return.

---

## Open Questions

### Resolved During Planning

- Where should bitrate/FPS coercion live — CLI, protocol, or native? → Native (mechanism), matching resolution, so all callers inherit it.
- Do the loose TS protocol limits (`min 1`) need tightening? → No. They are the outer envelope; the native capability limits are the real bounds. Leaving them loose is correct.

### Deferred to Implementation

- The exact Sunshine source site that emits `INVALID` for off-exact-aspect resolutions (candidate: the `0002` dispatch validation or the `0004` apply precondition) and the precise current form of its aspect/dimension check — locate against the applied patch tree during execution.
- Whether the Sunshine repo already has a Nix patch-check analogous to the moonlight one, or whether U2 must author a minimal one.

---

## Implementation Units

### U1. Native bitrate/FPS clamp instead of reject (moonlight-embedded-korri)

**Goal:** Out-of-bounds bitrate and FPS requests are coerced to the encoder-safe min/max and applied, with the coerced value reported through applied truth.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Modify (via export): `product/vendor/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch` (reject → clamp for `SET_BITRATE`/`SET_FPS`)
- Re-export (context churn only): `product/vendor/moonlight-embedded-korri/patches/0008-*.patch` and any later patches in the stack whose context shifts
- Modify: `product/vendor/moonlight-embedded-korri/README.md` (note the accept-and-adapt invariant for bitrate/FPS)
- Modify: `tools/testing/nix/korri-moonlight-control-protocol-patch-check.nix` (invariant markers)

**Approach:**
- Use the moonlight fork dev-checkout: apply the full patch stack to a source tree, make the edit in source, then re-export the whole stack so downstream patch context stays consistent.
- In the runtime command handler, replace the `value < min || value > max` early-return-error for bitrate and FPS with a clamp into `[min, max]`, mirroring the resolution clamp in `0008`.
- Write the clamped value into `control.bitrate_kbps` / `control.fps` (as `0008` does for `control.width/height`) so the `runtime.commandResult` applied fields and the state snapshot readback report the coerced truth, not the original request.
- Leave capability/limits reporting unchanged (advertised min/max still 500/150000 and 15/240).

**Execution note:** Must go through the patch dev-checkout/export workflow — do not hand-edit `0007` in place.

**Patterns to follow:**
- The resolution clamp + `control.width/height` writeback in `0008`.
- Existing invariant-marker style in `korri-moonlight-control-protocol-patch-check.nix`.

**Test scenarios:**
- Happy path: `nix build .#checks.x86_64-linux.korri-moonlight-control-protocol-patch` compiles the regenerated stack (proves the export is consistent and the C builds).
- Invariant: the Nix check asserts a clamp marker exists for bitrate and FPS and that the `"bitrate out of bounds"` / `"fps out of bounds"` reject markers are gone; a simulated reintroduced reject makes `nix eval` throw before build.
- Integration (device, Gate): `korri stream bitrate 5` → applied `500`; `korri stream fps 10` → applied `15`; an above-max request clamps to max; each returns an applied outcome with no error.

**Verification:**
- The Nix patch check builds green; capability limits are unchanged; on device, below-floor bitrate/FPS land at the floor and the CLI shows the coerced applied value.

---

### U2. Host same-ratio rounding tolerance for resolution (sunshine-korri)

**Goal:** The Sunshine host accepts same-ratio resolutions that differ from the stream aspect only by even-integer rounding, while still rejecting genuinely different aspect ratios.

**Requirements:** R3, R4, R5

**Dependencies:** None (parallel to U1)

**Files:**
- Modify (via export): the sunshine patch in `product/vendor/sunshine-korri/patches/` that emits `RUNTIME_SETTINGS_STATUS_INVALID` for off-exact-aspect resolution requests (locate in the `0002`/`0004` stack during execution)
- Modify: `product/vendor/sunshine-korri/README.md` (note the tolerance semantics: scale-only, same-ratio-within-rounding accepted, off-ratio rejected)
- Modify or create: sunshine Nix patch-check invariant (analogous to the moonlight check) if one exists or is cheap to add

**Approach:**
- Locate the resolution validation gate returning `INVALID` / `REASON_INVALID_BOUNDS`. Replace the exact-aspect equality with a tolerance test: accept when the requested width:height ratio is within the delta that even-integer rounding of the stream ratio can produce; coerce the requested dimensions to the nearest even values that best preserve the stream ratio before handing to the apply path.
- Preserve the existing apply path (`make_encode_session` replacement) unchanged; only the acceptance predicate and the coerced dimensions feeding it change.
- Keep the hard reject for genuinely different ratios so off-ratio requests are refused rather than stretched.
- Re-export through the sunshine fork's patch workflow.

**Execution note:** Patch export workflow; identify the exact validation site against the applied tree first.

**Patterns to follow:**
- The moonlight resolution clamp semantics (even alignment, both dimensions moved together) for the coercion half.
- Existing sunshine ack/status plumbing in `0002`/`0004` for the accept/reject verdict.

**Test scenarios:**
- Happy path: sunshine build/patch check passes on the regenerated stack.
- Behavioral (device, Gate): on a 16:9 stream, `854x480` and `960x540` apply (status applied, correctly proportioned image); `640x480` (4:3) returns invalid and the picture is unchanged, never stretched.
- Edge case: a request already exactly on-ratio (e.g. `1280x720`) still applies unchanged.

**Verification:**
- Sunshine builds; on device a same-ratio scale-down applies while a real off-ratio request is cleanly rejected with no distortion.

---

### U3. Name coercion at the CLI when applied differs from requested

**Goal:** When the mechanism coerces a value (e.g. bitrate 5 → 500, `1281x721` → `1280x720`), the CLI states the coercion explicitly so accept-and-adapt is visible rather than a silent surprise.

**Requirements:** R6

**Dependencies:** None (reads applied truth; its device-visible payoff follows U1/U2)

**Files:**
- Modify: `product/surfaces/terminal/korri-cli/stream-quality.ts` (`formatSetOutcome`)
- Test: `product/surfaces/terminal/korri-cli/stream-quality.test.ts`

**Approach:**
- In `formatSetOutcome`, compare the requested value against the applied readback for bitrate/FPS/resolution; when they differ, add a short, plain-language coercion note (e.g. `coerced to 500 kbps (hardware minimum)`), while keeping the existing requested/now-applied lines.
- Keep it a note, not an error — coercion is success, not failure. Genuine rejections continue to surface via `describeControlError`.

**Patterns to follow:**
- The existing requested-vs-applied rendering and the `describeControlError` helper already in `stream-quality.ts`.
- The existing `bun test` harness and fake-client pattern in `stream-quality.test.ts`.

**Test scenarios:**
- Happy path: applied equals requested → no coercion note (output unchanged).
- Coercion: requested bitrate 5, applied 500 → output contains a coercion note naming 500; requested `1281x721`, applied `1280x720` → note names the applied size.
- Error path: a genuine rejection still renders the readable reason (no `[object Object]`, no coercion note).

**Verification:**
- `bun test product/surfaces/terminal/korri-cli/stream-quality.test.ts` passes with the new coercion-note assertions.

---

## System-Wide Impact

- **Interaction graph:** Touches two vendored forks (moonlight-embedded-korri, sunshine-korri), the CLI surface, and the Nix CI checks. The runtime command handler and the Sunshine resolution apply path are the live-stream hot paths.
- **Error propagation:** Coercion converts former hard-rejects into successful applies; the coerced value must travel through `runtime.commandResult` and the state snapshot so caller truth stays accurate. Genuine impossibilities still fail loudly (readable reason).
- **State lifecycle risks:** The clamped/coerced value must be the one written to `control.*` state; a mismatch between the applied encoder value and the reported readback would break the `accepted` ≠ `applied` contract.
- **API surface parity:** Bitrate and FPS should behave like resolution already does (clamp + report). U3 keeps the three families consistent at the surface.
- **Unchanged invariants:** Codec gate (H.264-only), controller authority model, per-session control socket, input routing, advertised capability limits, and the resolution *client* coercion (already shipped) are all unchanged. Off-ratio resolution remains rejected — this slice does not add reshaping.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Patch re-export drags unrelated hunks or reorders the stack | Export-only workflow; diff-review every regenerated patch; the Nix check compiles the whole stack and fails on inconsistency |
| Native clamp masks a genuinely impossible request | Clamp only within advertised encoder min/max; requests the encoder still can't honor fail via the encode-session path; applied-truth readback always shows the coerced value |
| Host tolerance set too loose → a real off-ratio request slips through and stretches | Tolerance derived strictly from even-integer rounding of the stream ratio; off-ratio kept as a hard reject; device visual check at Gate |
| Touching the Sunshine encode-session apply path regresses live streaming | Change only the acceptance predicate + coerced dims, not the apply path; sunshine build check; device soak at Gate |
| A future upstream patch refresh silently drops the clamp/tolerance | CI invariant markers (U1/U2) throw on regression before build |

---

## Phased Delivery

### Phase 1 — Prerequisite (already shipped this session; deploy + verify)
- Deploy the Gate-A build to bandai and confirm the shipped resolution client-coercion (`1281x721` → `1280x720`) and the readable CLI errors. This is the operational gate that de-risks U1/U2 landing on a known-good base.

### Phase 2 — Mechanism coercion
- U1 (moonlight bitrate/FPS clamp) and U2 (sunshine host tolerance) in parallel — independent forks, independent patch checks.

### Phase 3 — Surface + lock
- U3 (CLI coercion note) and the CI invariants finalized; device verification of the full accept-and-adapt matrix (below-floor bitrate/FPS land at floor; same-ratio scale-downs apply; off-ratio rejected).

---

## Documentation / Operational Notes

- Update each fork README with the accept-and-adapt invariant (done partially for moonlight resolution; extend for bitrate/FPS and sunshine tolerance).
- Governing contract `docs/acceptance/runtime-settings-protocol-contract.md` already states scale-only / never-stretch and accept-and-adapt; no further contract change expected, but re-read at Gate to confirm the device behavior matches.
- Device verification is a human/device gate (screen-visible); fold results into the existing Gate-A acceptance doc `docs/acceptance/runtime-settings-gate-a-accept-and-adapt-2026-07-03.md`.

---

## Sources & References

- Origin items: `work/items/parking-lot/01KWN2KEGT3NGTJZ6SHDRJ3YEG-*.md` (bitrate/FPS clamp), `work/items/parking-lot/01KWN5M3AQR7TVMDDB0FHQ29GA-*.md` (host same-ratio tolerance)
- Governing contract: `docs/acceptance/runtime-settings-protocol-contract.md`
- Gate acceptance: `docs/acceptance/runtime-settings-gate-a-accept-and-adapt-2026-07-03.md`
- Runbook: `docs/korri-stream-live-quality-runbook.md`
- Shipped this session: resolution client coercion (moonlight `0008`), CLI `describeControlError` (`product/surfaces/terminal/korri-cli/stream-quality.ts`)
