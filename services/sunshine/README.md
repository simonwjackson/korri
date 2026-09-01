# sunshine-korri

`sunshine-korri` is Korri's downstream Sunshine package for carried patches that are useful to Korri before they are upstreamed, redesigned, or retired.

The package is intentionally an umbrella, not a single-feature fork. Patches may be unrelated. Each patch should explain:

- what behavior it changes,
- whether it is experimental or intended for upstreaming,
- what evidence exists,
- when it can be removed.

## Current patches

### Runtime settings patch series

Experimental live runtime-settings MVP split by review concern:

- `0001-add-runtime-settings-protocol-surface.patch` adds packet IDs `0x5504`/`0x5505`, runtime-settings operations, statuses, reasons, request/ack structs, and mail names.
- `0002-wire-runtime-settings-control-plane.patch` adds the Sunshine control-plane parser, `SUNSHINE_LIVE_SETTINGS_MVP=1` gate, capability acks, mutation acks, launch/current-applied baselines, and request queueing.
- `0003-apply-runtime-bitrate-and-fps-changes.patch` introduced safe rejection for active-stream operation `1` and supports operation `2`: set effective stream FPS at or below launch FPS using runtime frame pacing.
- `0004-add-proof-gated-runtime-resolution-apply-path.patch` applies operation `3` with same-or-smaller even dimensions whose aspect ratio matches the stream within the sub-pixel tolerance of even-integer rounding (same-ratio scaling, e.g. 854x480 on a 16:9 stream); genuinely different aspect ratios are still rejected so the game is never stretched. Refreshes touch mapping after apply, and is treated as supported for the validated Korri runtime profile. The same-ratio tolerance replaces the former exact same-aspect equality in `0002-wire-runtime-settings-control-plane.patch`.
- `0005-add-seamless-vaapi-runtime-bitrate-path.patch` enables operation `1` for the supported `h264_vaapi` path by mutating FFmpeg VAAPI rate-control private state, forcing an IDR, and avoiding encoder teardown/reconnect. With the explicit live-settings gate, H.264 queries the normal and low-power VAAPI entrypoints for actual CBR/VBR/AVBR support, preferring the normal entrypoint when both qualify and otherwise preserving Sunshine's upstream order. This avoids Intel's low-power path when it exposes only CQP. Capability publication separately inspects the active encoder session and omits operation `1` and its bitrate bounds when the selected VAAPI rate-control state is not actually mutable.
- `0016-add-seamless-nvenc-runtime-path.patch` extends operations `1`, `2`, and `3` to active Linux `h264_nvenc` sessions. Bitrate changes call the NVIDIA driver's synchronous reconfiguration function on Sunshine's existing encode thread, preserve the established VBV duration, force one IDR through NVENC, and acknowledge success only after the driver returns `NV_ENC_SUCCESS`. FPS continues to use the existing backend-neutral frame pacing. Resolution continues to use the existing fresh-frame replacement and capture-reinitialization path; the VAAPI destructor-flush exception remains VAAPI-only.
- Active-stream bitrate changes are advertised only for a live `h264_vaapi` or `h264_nvenc` session whose backend-specific mutable-rate-control guard succeeds; no reconnect or encoder-restart fallback is considered shippable.
- Runtime FPS and resolution are limited to active H.264 VAAPI or NVENC sessions.
- The series does not use the failed public AVCodec field/AVOption mutation fallback.

Runtime settings mechanism contract:

- Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy.
- Runtime settings decisions distinguish local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof as separate facts.
- Existing packet IDs remain stable: request `0x5504` and ack `0x5505`.
- Operation `0` is a non-mutating capability query for the active Sunshine session.
- Operation `0` returns a `0x5505` capability ack with gate status, reason, active-session supported operations, conservative bounds, launch baseline values, and current applied bitrate/FPS/resolution facts.
- Capability queries are coalesced to one pending record on the serialized control thread. The first query starts one 100 ms encoder-capability settling window, later queries replace only the pending request identity, and session removal drops the record. No detached thread, asynchronous timer, or cross-thread control-server send is used.
- Launch baseline bitrate, FPS, and resolution are tracked separately from current applied values for the lifetime of the stream.
- Restore is explicit: callers send normal set commands back to the launch baseline values; Sunshine does not auto-restore from network or command outcomes.
- Operations `1`, `2`, and `3` remain bitrate, FPS, and resolution mutation requests.
- Mutation acks carry the broad numeric status plus an additive reason field; current no-reason consumers must be updated before relying on reason-bearing payloads.
- Runtime resolution is a normal runtime-settings operation for the validated Korri profile; operation `0` advertises operation `3` only when the active session supports it.
- Capability support is conservative: active-stream FPS and resolution are advertised only for the explicit live-settings gate on an active H.264 VAAPI or NVENC session. Bitrate additionally requires the active backend's mutable-rate-control guard. Unsupported sessions return a reason without setting support bits.
- Operation `1` support requires same-session moving-video and bandwidth proof on the target client before it is treated as product-ready for that client/decoder combination.
- Operation `3` outcomes distinguish raw Sunshine ack state from caller-visible applied truth: Sunshine may report `server_applied=1`, while local-control must still expose applied width/height state for callers to verify.

VAAPI and NVENC runtime-bitrate maintenance policy:

- A stable FFmpeg helper/API is the preferred replacement for Sunshine-side private-struct mirroring, but Korri is not carrying that downstream FFmpeg API yet. The current path stays inside `sunshine-korri` because it has SM8550 evidence and avoids forking FFmpeg's encoder internals before an upstreamable helper shape is clear.
- The private mirrors are allowed only for the exact pinned FFmpeg/libavcodec version encoded in the patches. FFmpeg upgrades, including same-major minor/micro updates, must fail at compile/source-check time until the mirrored VAAPI and NVENC layouts are reviewed. The NVENC prefix is additionally compiled against exact FFmpeg commit `61c50407fd429a5e2ec616e2e846c3fe3743879a` and Sunshine's bundled NVENC API 12.0 headers, with offset checks for every accessed private field.
- The Linux-host module exposes `/run/opengl-driver/lib` only for the explicit `encoder = "nvenc"` policy and uses a systemd condition to require readable `libcuda.so.1` plus `libnvidia-encode.so.1` without a restart loop. It also enables strict encoder selection, so later CUDA, permission, API, or driver failures reject the stream instead of silently falling back to VAAPI.
- NVENC reconfiguration copies the active driver configuration before mutation, calls `NvEncReconfigureEncoder` synchronously, and commits FFmpeg/Sunshine applied state only after driver success. It adds no polling thread, detached work, lookahead, multipass, or automatic adaptation policy. Release-capable client range gestures dispatch only the newest value at the release edge, with one bounded fallback if release is lost. The server rate-limits every NVENC attempt from driver-call completion and rejects attempts inside a 500 ms per-session interval as conflicts so alternate clients cannot produce an IDR/reset storm. One failed call or one call exceeding 100 ms disables bitrate mutation for that encoder session while leaving FPS, resolution, and the stream available; a successful encoder replacement may republish support.
- Rollback remains the Nix-owned live-settings gate: disable `services.korriLinuxHost.sunshine.runtimeSettings.enable` to keep `sunshine-korri` deployed and omit `SUNSHINE_LIVE_SETTINGS_MVP=1`.

Runtime-resolution VAAPI destructor teardown policy:

- Runtime-resolution replacement crosses an encoder generation boundary: the replacement session is primed with the first post-switch frame and then becomes the active session.
- Destructor drain/flush is skipped only for the AVCodec session pair that participates in that runtime VAAPI replacement path: the outgoing generation and the primed replacement generation. Normal encoder sessions still drain on destruction.
- The evaluated alternatives are pre-drain, async teardown, skip-drain, and packet-drop alternatives. Pre-drain can re-enter the crashing FFmpeg hardware teardown after a generation break; async teardown moves the same lifetime hazard to another thread; packet drop risks hiding required end-of-stream data. Narrow skip-drain is the carried option until physical soak evidence proves a safer upstreamable teardown.
- Long-cycle no-crash and leak evidence belongs with the runtime-resolution hardware soak follow-up; source checks only prove the skip remains narrow and documented.

Runtime settings status contract:

- `0` — applied
- `1` — failed or unsupported
- `2` — invalid
- `3` — disabled

Reason codes:

- `none`
- `gate-disabled`
- `invalid-bounds`
- `invalid-payload`
- `unsupported-encoder`
- `unsupported-backend`
- `unsupported-operation`
- `apply-failed`
- `control-not-ready`
- `no-ack`
- `conflict`
- `stale-ack`
- `stream-ended`

Current automated gates:

- `nix build --no-link .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).sunshine-korri-runtime-settings` checks the approved patch hashes, protocol constants, runtime safety rules, provenance, and the patched Sunshine build.
- `nix build --no-link .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).sunshine-korri-input-seat-patch` checks the input-seat source boundary, the approved patch hash, the patched Sunshine build, and a nonblocking transport model/source-invariant check under receiver backpressure. The model does not execute compiled Sunshine behavior.
- `nix build --no-link .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).sunshine-korri-android-client-protocol` checks the Sunshine and Android Moonlight protocol values together and runs host-native golden tests.

### Android Moonlight protocol mechanism

The Android Moonlight native layer implements the matching `0x5504` request and `0x5505` acknowledgement treaty. It exposes capability query, bitrate, FPS, and resolution commands plus one immutable non-secret version-2 snapshot through JNI. The snapshot has one monotonic session epoch and change generation, separate query and mutation terminal results, exact capability status and reason facts, a stale-ack counter, and a reconciliation-required fact. Terminal state remains visible until the next control-stream epoch starts.

One process-lifetime lifecycle lock serializes readiness, request acceptance, ENet enqueue, send-failure publication, and stop. The feature becomes active only for Sunshine on an encrypted ENet control stream with a connected peer. TCP, unencrypted, non-Sunshine, disconnected, and inactive calls do not submit a runtime-settings packet. Every terminal connection callback first marks the runtime-settings session inactive. The native state machine validates exact payload sizes, host-only status and reason combinations, capability masks, launch and current bounds, remaining timeout deadlines, clock regression, stale acknowledgements, and query-versus-mutation ordering. Unavailable capability acknowledgements keep zero operation masks and bitrate bounds but carry the nonzero launch FPS in `maxFps`, as the pinned host sends. Rejected mutation acknowledgements update the host-authoritative current value only when it remains inside the negotiated bounds. A pure 31-field serializer is shared by JNI and host-native index tests. The client does not select values or adapt the stream. Korri product policy remains outside the Moonlight transport layer.

The historical physical records from the legacy branch are not present in this branch. Import them only with a clear legacy provenance label. Current Intel VAAPI physical bitrate, FPS, resolution, lifecycle, touch, and soak evidence is recorded in [`docs/acceptance/sunshine-korri-physical-runtime-settings-2026-09-01.md`](../../docs/acceptance/sunshine-korri-physical-runtime-settings-2026-09-01.md). Current NVIDIA NVENC runtime, lifecycle, contention, and soak evidence is recorded in [`docs/acceptance/sunshine-korri-nvenc-physical-2026-09-01.md`](../../docs/acceptance/sunshine-korri-nvenc-physical-2026-09-01.md). Input-seat physical evidence remains a separate gate.

The ten-patch automated restoration record is preserved as historical evidence in [`docs/acceptance/sunshine-korri-automated-restoration-2026-08-31.md`](../../docs/acceptance/sunshine-korri-automated-restoration-2026-08-31.md). Current eleven-patch NVENC package, protocol, provenance, and client evidence is recorded in [`docs/acceptance/sunshine-korri-nvenc-automated-2026-09-01.md`](../../docs/acceptance/sunshine-korri-nvenc-automated-2026-09-01.md). Automated evidence does not replace physical acceptance.

### Input-seat event mirror patch

`0015-add-korri-input-seat-event-mirror.patch` adds a native Sunshine event-source seam for Korri input seats. Sunshine remains an event source. It mirrors sanitized controller packets to a local Korri socket. A protected receiver must own emulator-visible virtual seats.

This patch is hardened from the legacy patch. It keeps the legacy wire schema. It does not keep the legacy blocking socket or loose sidecar parser.

The mirror needs these stable service values:

- `KORRI_INPUT_SEAT_MIRROR_SOCKET`: an absolute Unix socket path that the protected receiver owns.
- `KORRI_INPUT_SEAT_RUNTIME_DIR`: an absolute runtime directory that contains `sunshine-active-launch.json`.
- `sunshine-active-launch.json`: a root-owned sidecar with exactly `launchId`, `generation`, and `mirrorToken`. Its group must equal Sunshine's dedicated effective group. Group read is required. Group write, group execute, and every permission for other users are rejected. Mode `0640` is the intended producer mode.

The host service must keep the runtime directory and receiver socket root-owned. Sunshine receives only dedicated-group access. Sunshine opens the fixed sidecar with `openat`, `O_CLOEXEC`, and `O_NOFOLLOW`. It accepts only a root-owned regular file whose group equals Sunshine's effective GID and whose size is 4096 bytes or less. `launchId` and `mirrorToken` must be bounded strings. `generation` must be a nonnegative integer. Extra JSON fields are rejected.

Frames use bounded token-envelope NDJSON. A frame is 2048 bytes or less. The envelope contains `mirrorToken` and one `SunshineInputSeatFrame`. The frame can report `source-connected`, `source-state`, or `source-disconnected`. It does not contain keyboard, mouse, text, touch, pen, motion, battery, or raw device-path data.

Controller submission uses nonblocking AF_UNIX `SOCK_SEQPACKET` with `SOCK_CLOEXEC`. Each connection submits one bounded token-envelope NDJSON message. An incomplete send is a failure. The receiver must discard any message that does not contain exact JSON followed by exactly one terminal newline. Receiver backpressure cannot wait in the controller packet path.

The automated backpressure fixture is a transport model/source-invariant check. It does not execute the compiled Sunshine helper. The full Sunshine package build proves that patch `0015` compiles. Runtime behavior remains a final manual device validation item.

The mirror remains inert when the protected receiver or either stable environment value is absent. A missing sidecar also disables the mirror. Socket connection and write failures do not stop Sunshine controller handling. The mirror token is private local authority. It must not appear in public status, network RPC, logs, or committed evidence.

## Package provenance

The installed package contains `share/korri/sunshine-korri/provenance`. This mode-`0444` file records:

- the provenance format,
- the package name,
- the base Sunshine version,
- the independently approved base Sunshine source hash,
- the exact observed base Sunshine source store path,
- the exact observed base Sunshine derivation path,
- the reviewed libavcodec version,
- the exact reviewed FFmpeg commit and source hash,
- the reviewed NVENC API major and minor version,
- the Sunshine executable path,
- each ordered Korri patch name and SHA-256 value,
- one SHA-256 value for the complete ordered patch set.

Nix also exposes the provenance path, approved base source hash, observed base source and derivation paths, ordered patch names, and patch-set digest through package passthru values. `approved-patches.nix` is the independent approval record. Package evaluation fails when the base version, base source hash, one patch hash, or the ordered patch-set digest changes. The host module also requires the exact approved final derivation and output, so an `overrideAttrs` derivative cannot preserve trusted metadata while replacing the executable or patches. Deployment checks must use these values to attest the exact package. The manifest contains no secret or device-specific value.

## Removal/upstream policy

Remove or replace a carried patch when one of these becomes true:

1. Sunshine upstream accepts an equivalent feature.
2. Korri no longer needs the behavior.
3. A cleaner patch supersedes the current one.
4. The evidence shows the approach is unsafe or too narrow for continued carrying.
