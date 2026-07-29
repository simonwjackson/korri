# Rust korrid stack spike — verdict

> THROWAWAY PROTOTYPE. Delete or absorb after the stack decision.

## Question

Can one Rust core provide a single typed RPC endpoint on Linux and Android
without losing TypeScript contract sharing?

## Result

**Yes.** Verified on the SM-X930 Android target, not just at compile time.

- Rust `serde` + `typeshare` generated request/response discriminated unions.
- Matching operation `_tag`s let TypeScript correlate request and response with
  `Extract<RpcResponse, { _tag: Request["_tag"] }>`; no handwritten operation map.
- Axum served two operations through one `POST /rpc` endpoint.
- The portal-side TypeScript client typechecked and called the Linux server.
- `cargo-ndk` built the same Rust core for `aarch64-linux-android`.
- Three raw JNI functions let Java start, stop, and identify the server.
- Java started a Tokio runtime and the exact same Axum router in the APK.
- An ADB-forwarded request to the tablet returned the Rust fixture catalog.

Observed Android response:

```json
{"_tag":"app.catalog.snapshot","outcome":{"_tag":"Ok","payload":{"games":[{"id":"spike.desktop","title":"Desktop from Rust"}]}}}
```

## Measured cost

Measured from clean baseline and spike builds with the same bundled portal:

- Rust cdylib before APK stripping: about 2.2 MiB.
- Rust library inside APK after stripping: 1,380,680 bytes.
- Baseline arm64 debug APK: 7,968,142 bytes.
- Spike arm64 debug APK: 8,729,627 bytes.
- Compressed APK increase: **761,485 bytes**.

## Android edge comparison

UniFFI was tried first and worked after integration fixes, but raw JNI is the
better fit for this existing Java shell when the boundary is only
`start`/`stop`/`version`:

| | UniFFI Kotlin | Raw JNI |
|---|---|---|
| New Android language/runtime | Kotlin + JNA | None |
| Generated Android source | ~1,200 lines | None |
| Handwritten edge | Small Kotlin wrapper | ~50 lines Java + Rust |
| R8 handling | JNA/generated keep rules | Native-method name rule |
| Result on tablet | Passed | Passed |

UniFFI remains a valid option if the in-process API grows into many records,
enums, callbacks, or async methods. A local HTTP server deliberately keeps that
FFI boundary tiny, so raw JNI wins today.

## Traps discovered

1. UniFFI Kotlin uses JNA, not direct generated JNI glue.
2. This app minifies debug builds; R8 stripped JNA methods resolved from native
   code and caused `UnsatisfiedLinkError`. JNA and generated bindings require
   explicit keep rules.
3. Keeping JNA exposes desktop-only `java.awt` references to R8, requiring a
   targeted `-dontwarn java.awt.**` rule on Android.
4. A UniFFI error payload field named `message` collides with
   `Throwable.message` in generated Kotlin.
5. Adding Kotlin requires matching its JVM target to this app's Java 11 target.
6. A composed Nix devshell must explicitly carry the Android shell's `JAVA_HOME`
   and `GRADLE_OPTS`; `inputsFrom` does not propagate those environment values.
7. Typeshare provides compile-time types, not runtime response validation. The
   spike's client trusts JSON after HTTP success; add schema validation only if
   mixed-version or untrusted peers make it necessary.
8. The Android proof binds localhost and lives with the app process. LAN serving
   and foreground-service lifecycle were intentionally not tested.
9. An RPC-only device check produced a false green while the installed APK was
   missing its portal assets. The final gate now bundles the portal, asserts
   `assets/portal/index.html` exists in the APK, waits for page title `Korri`,
   rejects asset-loader/console errors, and queries Rust in the same install.

## Stack signal

The minimal stack is viable:

- Tokio
- Axum with one tagged `/rpc` endpoint
- Serde/serde_json
- Typeshare for TypeScript treaty generation
- cargo-ndk
- Raw JNI for the intentionally tiny Android lifecycle boundary

No evidence from this spike justifies jsonrpsee, rspc, a database, a plugin
runtime, UniFFI, or Effect RPC compatibility in the first Rust product slice.
Those can be earned by a concrete need.

## Command

```sh
just korrid-rust-spike          # host + TS + Android compile
just korrid-rust-spike-device   # same, then install and call RPC on tablet
```
