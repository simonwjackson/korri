# Android automated testing foundation — findings, 2026-08-05

Question: should Korri maintain a headless emulator test tier, or are the
existing surface, portal, and JVM tests enough?

## Verdict

Yes, but only as a narrow real-WebView wiring/drift smoke. The emulator tier is
worth keeping because it proves the hand-mirrored Android shell bridge is injected into
the shipped WebView and still agrees with the canonical treaty, while validated
warm local runs took 72-102s and the cheaper levels remain independently runnable.
It is not a general UI test tier, full bridge conformance, portal-code-path
coverage, lifecycle coverage, or physical-device confidence.

The source download/cache cost is real but opt-in: first emulator SDK
realization fetched 1.8 GiB, unpacked 2.0 GiB, took 210s, and the realized
emulator SDK closure measured 9.4 GiB. The kill criteria did not trigger: Nix
emulator integration did not consume more than half a day, `bridgeVersion` was
reachable without production refactors, and lower layers did not make the
Android shell bridge check redundant.

## Runnable levels

| Level | Task | What it proves | Result |
|---|---|---|---|
| 1.1 Shift surface-local | `nix run .#shift-check` | Shift renders and reacts through `SurfaceModel`/`SurfaceHost` only. | Already existed and passed; no new lower-level tests were needed. |
| 1.2 Portal-local | `nix run .#portal-check` | Portal bridge adapters, input, korrid client, and host-to-surface composition work against in-memory implementations. | Already existed and passed; no new lower-level tests were needed. |
| 2 Android JVM/Robolectric | `nix run .#android-jvm-check` | All existing debug JVM/Robolectric tests under `clients/android/app/src/test/`. | New task; passed. The same Gradle suite now runs in `korrid-check` before APK assembly, and the full check passed. |
| 3 Emulator/instrumented | `nix run .#android-bridge-contract-check` | The real minified debug `KorriShellActivity` injects its private Android shell `@JavascriptInterface` into a real WebView and `bridgeVersion()` matches the treaty. | New task; passed. |

`android-jvm-check` produced 28 JVM XML suites, 190 tests, 0 failures, 0
errors, and 0 skips. The instrumented XML has one suite,
`com.limelight.KorriNativeBridgeContractTest`, with one testcase,
`bridgeVersionMatchesTheCanonicalTreaty`: 1 test, 0 failures, 0 errors, 0
skips; suite time 5.258s and testcase time 4.125s.

## Emulator task shape and timing

`android-bridge-contract-check` uses an opt-in Android SDK profile with an API
34 `google_apis` x86_64 system image. It builds the x86_64 embedded korrid
library, bundles the portal assets, projects `BRIDGE_VERSION` from
`contracts/bridge/korri-native-bridge.ts` through
`clients/android/test/bridge-contract-version.ts`, boots an owned headless AVD,
runs only `KorriNativeBridgeContractTest`, and tears down the owned process and
AVD state.

Operational details verified in the task/script:

- real minified debug app path, not a test-only Activity;
- real `KorriShellActivity`, WebView, and private Android shell JavascriptInterface;
- x86_64 embedded `libkorrid.so` packaged before install;
- owned emulator serial (`emulator-5554` by default) for ADB and Gradle;
- fixed-port lock to reject unsafe concurrent runs;
- bounded boot wait; and
- cleanup that preserves the primary failure while still failing on cleanup-only
  failures.

Measured local runtimes after implementation:

| Run | Wall time |
|---|---:|
| First successful run after SDK realization | 162s |
| Warm rerun | 77s |
| Final pre-simplification cleanup run | 72s |
| Final post-simplification run | 102s |

On the NixOS validation host, `/dev/kvm` was present and world-readable
(`crw-rw-rw-`, mode 666), so hardware acceleration was available to the
emulator. A software-only fallback run was not measured.

Known non-fatal Gradle/tooling warnings remain: the Nix Android 36/36.1
platform path/version mismatch that `nix/android-sdk-env.sh` already works
around, and Gradle's configuration-cache warning for instrumentation-runner
arguments. Neither blocked the measured runs.

## Bridge coverage

Covered by instrumentation:

- `KorriNativeBridgeSurface.bridgeVersion()`

Explicitly not covered by instrumentation:

- `KorriNativeBridgeSurface.launchLocal(specJson)`
- `KorriNativeBridgeSurface.queryStreamHosts()`
- `KorriNativeBridgeSurface.queryStreamApps(hostUuid)`
- `KorriNativeBridgeSurface.startStream(hostUuid, appId)`
- `KorriNativeBridgeSurface.korridPort()`
- `KorriNativeBridgeSurface.korridCapability()`
- `KorriNativeBridgeSurface.storageAccess()`
- `KorriNativeBridgeSurface.openStorageAccessSettings()`
- `KorriNativeBridgeSurface.openPairing()`
- `KorriNativeBridgeSurface.backgroundNotice()`
- `KorriNativeBridgeSurface.requestBackgroundNotice()`
- `KorriNativeBridgeSurface.openNotificationSettings()`
- `KorriNativeBridgeSurface.systemInfo()`
- `KorriSessionBridgeSurface.lifecycleSnapshot()`
- `KorriSessionBridgeSurface.exitToPortal()`

No production visibility change or test-only runtime branch was needed for the
covered method. Expanding beyond it should be a separate decision, because many
of the remaining methods require paired-host state, Android settings screens,
local launch effects, stream lifecycle, or additional deterministic fixtures.

## What this still misses

The emulator does not establish physical Android confidence. Documented misses:

- vendor GPU and driver behavior;
- real streaming, hardware decode, and real network behavior;
- controllers;
- thermals;
- latency;
- battery; and
- DeX/vendor lifecycle behavior.

Those stay in manual/device-focused validation unless a later slice defines a
separate real-device tier.

## CI viability

The repository visibility check against the GitHub API reports
`simonwjackson/korri` as public. Existing workflows use `ubuntu-24.04`. GitHub's
official 2024-04-02 announcement says 2-vCPU GitHub-hosted Linux runners can use
KVM for Android testing after enabling KVM group permissions, so a future public
Ubuntu runner job is viable in principle.

No GitHub Actions run was performed for this spike, and workflow wiring remains
deferred. The opt-in emulator SDK's first-realization cost and 72-102s observed
warm local runtime are the numbers to use when deciding whether to add that CI gate.
