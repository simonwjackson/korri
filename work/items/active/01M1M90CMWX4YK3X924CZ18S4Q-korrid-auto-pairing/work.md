# Work Log

Implementation started from local main at `6c6001ab`.

## 2026-09-03

- Added Sunshine host UUID attestation and private certificate provision/revoke control.
- Added native korrid routing through configured native peers only.
- Added first-use Android certificate provisioning, app refresh, and start-time repair.
- Removed the Korri pairing entry, settings action, JavaScript bridge method, PIN/OTP actions, unpair action, and click-to-pair behavior.
- Kept `PairState` only as protocol attestation after korrid provisioned the certificates.
- Added a source-contract test that rejects pairing ceremony calls from the product path.
- Bumped the native bridge contract to version 17 because the pairing method was removed.

## Verification

- `nix run .#portal-check`: 219 tests passed and TypeScript passed.
- `nix run .#shift-check`: 55 tests passed and TypeScript passed.
- `nix run .#android-jvm-check`: 429 tests passed from a clean test-result directory.
- `nix run .#korrid-test`: 219 library tests plus all integration suites passed.
- `git diff --check`: passed.
- Source scan found no `openPairing`, `doPair`, `doOTPPair`, or `doUnpair` call in the Korri product path.

The earlier aggregate `nix run .#korrid-check` reached all Rust and portal tests, then failed because concurrent Gradle work could not write several XML result files. The isolated Android JVM gate passed after the test-result directory was cleaned.
