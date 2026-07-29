# Korri dead-feature sweep (buckets A, B, C)

- **Id:** 20260729-korri-dead-feature-sweep
- **Status:** complete
- **Created:** 2026-07-29
- **Completed:** 2026-07-29
- **Plan:** [plan.md](plan.md)
- **Predecessor:** [20260728-korri-dead-code-demolition](../20260728-korri-dead-code-demolition/work.md)

Second demolition pass over the Korri Artemis fork, executing the candidate
buckets surfaced after the first demolition completed: confirmed zombies (A),
product-decision features the user chose to drop (B), and the unblocked slice
of the Phase-3-adjacent mass (C).

## Outcome

Delivered six implementation units plus focused Tier-2 review fixes:

- `22a6bef9` — remove zero-reference stream zombies
- `8468ae06` — remove the physical-keyboard accessibility service
- `e1e0f016` — remove the dormant performance logbook
- `5e489340` — remove embedded Help surfaces
- `5df2e338` — remove native profile editing UI while preserving the overlay engine
- `9d18b907` — remove the on-screen touch gamepad while preserving the virtual keyboard
- `faa1a30b` — hide the management action on browserless TV devices
- `5a208d39`, `b8811b3c`, `a810b188` — remove residual Help/profile resources
- `c80ee0cf` — cover base/profile keyboard-opacity migration behavior

Net result: 111 files changed, 172 insertions, and 6,821 deletions relative to
`ece4cf6a`.

## Verification

- Final APK assembly, all `*IntentTest` suites, `KorriSettingsBridgeTest`, the
  retained ProfilesManager/overlay tests, and
  `PreferenceConfigurationMigrationTest` pass.
- Full Robolectric suite: 192 tests, exactly 2 pre-existing failures
  (`SimpleStartupTest`, `StartupTest`), 0 errors, 0 skipped. The former
  `LayoutInflationTest` and both `ProfilesNavigationTest` failures retired with
  their deleted UI.
- CRLF-aware diff check and residual symbol/resource sweeps pass.
- Final arm64 APK installs on tablet and fold. `KorriShellActivity` cold-starts
  on both (paused behind the device lock), and the dummy `.art` file routes
  through `ShortcutTrampoline` successfully on both.
- Live stream → virtual keyboard → Guide/Xbox overlay smoke remains externally
  blocked by PIN/device pairing state; this is recorded as an accepted manual
  gate rather than an implementation failure.

## Follow-up Backlog

- [Preserve keyboard visibility across refresh](../../parking-lot/01KYQ79T3QQ2XKTDVDRWP425FM-preserve-virtual-keyboard-visibility-across-layout-refresh.md)
- [Honor active profiles for keyboard layout operations](../../parking-lot/01KYQ7V02EXPJ4NS14DCNV5WW8-honor-active-profiles-for-virtual-keyboard-layout-operations.md)
- [Narrow ProfilesManager after editor removal](../../parking-lot/01KYQ93DN0TA3FHNXF4J3TW4AV-narrow-profilesmanager-after-native-editor-removal.md)
