# Feasibility review — default Gamescope foreground launch plan

## P1 findings

### P1 — ROCKNIX library mode will still drop Gamescope policy

**Confidence:** 100

**Finding:** The plan normalizes default-on Gamescope through the ProseQL config cascade, but it does not include the ROCKNIX library source path. In live mode, `LibrarySourceLayerLive` routes `resolveLaunchForGame` to `createRocknixSource` when `KORRI_LIBRARY_SOURCE=rocknix`, and `rocknix-source.ts` returns only `{ spec }` with no `gamescope` policy. That means Sobo/ROCKNIX foreground launches can still produce an intent or direct launch with no resolved Gamescope policy, defeating R1/R4 for the target device.

**Evidence:**
- Plan U1 files cover only cascade/repository paths: `korri/shared/library/config/cascade-resolver.ts`, `.../resolved-launch-context.ts`, and `korri/shared/library/proseql/library-repository.ts`; U1 does not include `korri/shared/library/rocknix/rocknix-source.ts` or `korri/shared/library/library-source-layer-live.ts`.
- `korri/shared/library/library-source-layer-live.ts` dispatches ROCKNIX mode directly: `selectedLibrarySourceMode() === "rocknix" ? withRocknixSource(source => source.resolveLaunchForGame(id, inputs), "resolveLaunchForGame") : ...`.
- `korri/shared/library/rocknix/rocknix-source.ts` currently implements `resolveLaunchForGame` as: `const spec = specs.get(id) ... return { spec }`.

**Action:** Add a unit or extend U1/U2 to make ROCKNIX `resolveLaunchForGame` return normalized Gamescope policy too, or explicitly convert ROCKNIX mode to feed the same policy resolver before preparing/launching. Include `korri/shared/library/rocknix/rocknix-source.ts`, `korri/shared/library/library-source-layer-live.ts`, and `korri/shared/library/rocknix/rocknix-source.test.ts` in the plan/test scope.
