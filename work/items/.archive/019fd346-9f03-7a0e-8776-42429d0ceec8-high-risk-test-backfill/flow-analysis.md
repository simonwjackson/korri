# Korri test-backfill flow analysis

## Missing flows and edge cases

### Portal orchestration and route composition

Add focused characterization in `clients/portal/src/surface/use-launchables.test.tsx` and `SurfaceRoot.test.tsx`:

- Initial load: publish loading first, combine the completed sources, query app lists only for paired hosts, and pass the 3-second bound to session status without letting that status hold the rest of the load indefinitely.
- Refresh ownership: a shell-resumed event starts a full reread; when loads overlap, only the newest result publishes. An unmounted hook must ignore late completions.
- Launch paths, represented once each rather than as result matrices:
  - local selection asks korrid for the launch instruction before handing that exact instruction to the shell;
  - remote selection verifies an attachable target first, then prepares the selected copy and starts the exact host/app pair;
  - current-session selection attaches directly and does not prepare again;
  - a missing exact-host target must not prepare anything.
- Input locking: two confirmations in the same frame produce one launch. Likewise, two stop requests produce one stop operation.
- Stop flow: keep `Stopping` through acknowledgement and resolve only after status observes idle or a different launch. Cover one successful poll and one non-timeout status failure. Cover the deadline only with a runner-controlled clock.
- Settings flow: one save at a time; success updates facts and rereads launchables, while a conflict publishes the settings problem and rereads. Dismissal returns to idle.
- `SurfaceRoot` should have one integration case that chooses a non-default location through Shift and proves the current entry reaches the correct launch path. Also characterize stale/unknown game and location IDs as no-ops and verify host commands read the latest state after a refresh.

If Bun cannot reliably advance the hook’s real timers, the 8-second stop deadline is not testable under the no-refactor constraint. Do not add a production clock seam or make the suite sleep for the deadline.

### `SessionScreen`

Add `clients/portal/src/session/SessionScreen.test.tsx` for component behavior only:

- The adapter starts on mount and its returned cleanup runs on unmount or adapter replacement.
- One connecting state renders the ordered stage labels and current detail.
- Connected and ended states render their existing transient messages.
- A failed state renders reason, optional detail, and error code; the button invokes `onExit` once.
- Failure schedules automatic exit and changing away from failure or unmounting cancels it.

The state and lifecycle-adapter tests already own event parsing, replay, monotonicity, and terminal-state rules. Do not repeat those cases in the screen test. The automatic 8-second exit is explicitly untestable without either a runner-controlled clock or a production change; if the former is unavailable, retain only the manual-exit and cleanup characterization.

### Shift

Extend `surfaces/shift/test/shift-surface.test.tsx` narrowly:

- Exercise `shiftSurface.mount` itself: initial model appears, `update` replaces it while retaining the supplied host, and `unmount` empties the container. Wrap each operation in React `act`.
- While a setting is `Saving`, its editor control is disabled, duplicate selection emits no second host call, and the editor closes only after the observed transition back to `Idle`.
- A setting-scoped `Problem` displays its message and dismissal calls `dismissSettingsProblem`; avoid retesting generic launch-problem presentation.
- A disabled game action remains visible and disabled, cannot receive focus/click activation, and never calls `runGameAction`.

The current rerender test already covers a disappearing location chooser. The existing settings tests already cover read-only rows, text/choice/action routing, and preservation of unfinished text. Do not duplicate them in the mount lifecycle case.

### Android emulator bridge

Expand `KorriNativeBridgeContractTest.java` without invoking effectful members:

- Assert every required `window.KorriNative` member is exposed as a function; keep the member list in one helper and do not assert that spike-era extras are absent.
- Invoke only safe reads: bridge version, server port, server capability, system information, storage access, background-notice state, known hosts, and cached apps when a known host exists. Assert tags and field types, not emulator-dependent values. Never include the capability value in assertion messages or logs.
- Install a temporary JavaScript receiver, dispatch representative key-down events for direction, confirm, back, menu, and options, and assert only semantic payloads arrive. One key-up and one unrelated key should deliver nothing. This is representative coverage, not every Android key alias.

An emulator cannot characterize physical-controller mappings, manufacturer key quirks, real permission dialogs, external settings screens, or an actual stream launch. Those scenarios are out of reach under the no-physical-device and no-effectful-call constraints; do not simulate claims about them.

### korrid composition invariants

Backfill only these two invariants in `services/korrid/src/lib.rs` tests:

1. Extend the existing running-server test so an instruction verifies only during the server lifetime that signed it. After stop it must fail verification; after restart the prior instruction and prior capability must remain invalid while newly issued values work.
2. Through one long-lived brain router, read settings, disable a plugin using the returned revision, and prove the next local list/launch reflects that choice; re-enable using the new revision and prove availability returns.

Do not add more policy assertions to `plugin_policy.rs`: its current tests already cover bundled defaults, later-layer disablement, and unknown IDs. The new toggle test should prove composition and refresh, not repeat registry internals or settings-file unit behavior.

## Overlap to avoid

- `launchables/state.test.ts` owns pure state transitions and result mapping.
- `surface-model.test.ts` owns entry folding, location-ID resolution, and game-action derivation.
- `shift-surface.test.tsx` owns chooser and presentation behavior.
- New hook tests own effect order, cancellation, locking, and refresh; the new root test owns only host-to-current-state wiring.
- Session state/adapter tests own lifecycle folding and delivery; `SessionScreen.test.tsx` owns rendering, exit, timer, and cleanup.
- Android bridge-version projection already proves the canonical version. Do not duplicate it with another literal assertion.
- korrid policy and settings unit tests remain the owners of their internal rules; add only the two cross-module invariants above.

## Isolation hazards

- Use fresh in-memory bridge/client implementations per portal test. Test-local configurable implementations may record calls or expose deferred completion, but do not introduce mock/stub/fake classes.
- Always unmount portal and Shift roots. `SurfaceRoot` owns a clock interval, hooks own window listeners, and Shift owns semantic-input subscriptions.
- Restore runner clocks after every timer test and settle deferred promises inside `act`; otherwise late publications can contaminate later tests.
- Avoid React Strict Mode in call-count characterization unless assertions intentionally account for effect replay.
- Shift’s Home pick is randomized. Use Library or a controlled model for route assertions rather than depending on which Home tile appears.
- Android activity startup and page load are asynchronous, while the embedded service may outlive an `ActivityScenario`. Tests must be order-independent, wait for bridge readiness, replace/remove their JavaScript receiver, and never assume a fresh port or capability per test method.
- korrid’s local server occupies process-global state. Extend the existing lifecycle test instead of adding a second parallel server test, retain a drop cleanup guard, and use bounded readiness polling.
- The plugin-toggle test must use a temporary root and carry each returned revision into the next write; it must not depend on filesystem enumeration order.

## Dependency ordering

1. Establish the portal Happy DOM/render helper and controlled-clock support; decide immediately which deadline assertions are feasible without production changes.
2. Add `useLaunchables` characterization, then the single `SurfaceRoot` route-composition test on top of those known semantics.
3. Add `SessionScreen` tests; they depend only on the existing lifecycle adapter contract.
4. Extend Shift component tests, then add the mount/update/unmount adapter case.
5. Extend the existing Android instrumentation class and run it on the managed emulator only after the portal assets and embedded library are built.
6. Add the two independent korrid composition checks, keeping the server-lifetime work inside the existing globally serialized lifecycle test.
