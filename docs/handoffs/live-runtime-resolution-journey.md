# Live Runtime Resolution Switching Journey

Living document for the multi-session effort to make Moonlight/Sunshine switch stream resolution live, without disconnecting, reconnecting, restarting the stream, or losing interactive gameplay on bandai.

## Goal and acceptance bar

- Enable true live runtime resolution switching for Moonlight/Sunshine.
- Match the already-proven seamless bitrate/FPS behavior.
- Treat resolution switching as all-or-nothing:
  - no disconnect/reconnect;
  - no full stream restart;
  - no Batman/game restart;
  - restart only Moonlight/gamescope or Sunshine when needed for clean test setup.
- Do not accept logs, socket liveness, hashes, screenshots alone, or “session is still alive” as proof.
- Required proof is an autonomous, physical-device-visible gate:
  - bandai starts Moonlight/gamescope streaming from aka;
  - runtime resolution switches live, usually `1920x1080 -> 1280x720`;
  - input is sent through bandai after the switch;
  - aka host capture and bandai physical/client capture are compared;
  - bandai must show the same live game state as aka after bandai-originated input.
- User explicitly corrected the process:
  - do not wait for user validation unless vital;
  - keep giving micro-updates while working;
  - kill Moonlight/gamescope before clean test runs;
  - never claim success without physical/autonomous validation.

## Lab setup and durable harness

- Host machine: `aka`.
- Client/device machine: `bandai` via `ssh -p 2222 root@bandai`.
- Preserved probe harness on bandai:
  - `/tmp/probe-a-resolution`.
  - `env.sh`.
  - `probe.ts`.
  - `run-v3.sh`.
  - `start-1080.sh`.
  - `start-candidate.sh`.
- Important bandai local-control socket:
  - `/tmp/probe-a-resolution/run/control.sock`.
- Important ydotool path/input:
  - `YDOTOOL_SOCKET=/run/user/0/.ydotool_socket`.
  - `/nix/store/7dmpnkxnagd290qpgslkxahkvw57a6wm-ydotool-1.0.4/bin/ydotool`.
- Aka host capture method:
  - `DISPLAY=:0`.
  - `XAUTHORITY=/run/pressure-vessel/Xauthority`.
  - `xwd -id 0x4a00001 -silent | xwdtopnm | pnmtopng > ...`.
  - On aka, current tool paths used successfully:
    - `/nix/store/66y6yh3pq6jiqaaxyap62lj8ahl7bgsz-xwd-1.0.9/bin/xwd`.
    - `/nix/store/91sd1hi8z4rjy2ql5svbwmpb65xwim00-netpbm-11.13.1-bin/bin/xwdtopnm`.
    - `/nix/store/91sd1hi8z4rjy2ql5svbwmpb65xwim00-netpbm-11.13.1-bin/bin/pnmtopng`.

## Early Moonlight local-control and decoder work

- Preserved the local-control runtime resolution patch:
  - `packages/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`.
  - Command: `runtime.setResolution`.
  - Runtime operation: `3`.
  - Requires `MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED=1`.
- Preserved the decoder reopen base patch:
  - `packages/moonlight-embedded-korri/patches/0009-reopen-v4l2m2m-decoder-on-output-size-change.patch`.
- Renamed the failed old Moonlight `0010` experiment:
  - old: `0010-add-resolution-recovery-runtime-kick.patch`.
  - new: `packages/moonlight-embedded-korri/patches/0010-reopen-v4l2m2m-context-on-output-size-change.patch`.
  - Updated `packages/moonlight-embedded-korri/package.nix` accordingly.
- Tested a no-follow-up-IDR Moonlight build:
  - `/nix/store/3mlsiibq8xwl76pzbbr1i1x48n0fbmga-moonlight-embedded-korri-2.7.1-korri`.
  - Reduced IDR spam, but bandai still became stale.
- Added instrumentation for post-transition queue/draw counters:
  - build `/nix/store/l06hn9j14cp4y2gmdw8nh67m75px4i44-moonlight-embedded-korri-2.7.1-korri`.
  - Found 720p transition drew continuously, while a 1080p transition drew one frame then stopped.
- Logged `avcodec_send_packet()` failures:
  - build `/nix/store/mm0qvmrk2vnh80i4n7f7bhx6szwmva8b-moonlight-embedded-korri-2.7.1-korri`.
  - Exact failure: `avcodec_send_packet failed ret=-11`.
  - Interpreted as FFmpeg `EAGAIN`.
- Tested bounded EAGAIN drain/retry:
  - build `/nix/store/fhkg2f9bw1q94v1mingng3aqdbk63l9w-moonlight-embedded-korri-2.7.1-korri`.
  - Did not fix the issue; `EAGAIN` persisted.
- Tested NV12 copied-frame path:
  - build `/nix/store/hyk1nrl3gpi1fz6r0i2k18jf1yg38izy-moonlight-embedded-korri-2.7.1-korri`.
  - Did not fix the issue.

## Decoder reopen discovery and false positives

- Discovered that `0009` defined `reopen_v4l2m2m_decoder_context()` but the output-size-change path was not actually calling it.
- Built an actual reopen-on-output-size-change candidate:
  - `/nix/store/szbxabdwk3ll8h1ragarkxai2cy21jrd-moonlight-embedded-korri-2.7.1-korri`.
  - Reopened epochs correctly:
    - `1280x736 visible=1280x720`.
    - `1920x1088 visible=1920x1080`.
  - Initially looked good via screenshots/logs, but later physical/user validation disproved it.
- Final renamed rebuild:
  - `/nix/store/qr4gy8i8dkfi8z916d2xy3mahpab90dj-moonlight-embedded-korri-2.7.1-korri`.
  - Later confirmed not valid: physical bandai froze/staled after the switch.
- Confirmed live demo failure:
  - user saw frozen video after live switch;
  - bandai capture was stale while aka host capture moved;
  - restarted only Moonlight/gamescope to recover.
- Recorded repro with `se_capture_repro`:
  - symptom: physical bandai freezes after `1920x1080 -> 1280x720`;
  - logs show decoder reopen and first 720p frame.

## Manual run script and subsequent Moonlight experiments

- Fixed manual restart script quoting issue:
  - bad error: `bash: line 1: exec: -f: invalid option`.
  - created `bandai:/tmp/probe-a-resolution/start-1080.sh`.
- Tested skip-transition-frame Moonlight candidate:
  - `/nix/store/bfy0cmn01n8ix9ji2k2j5xdbx6gyxiff-moonlight-embedded-korri-2.7.1-korri`.
  - Skipped coded `1280x736` transition frame.
  - Drew continuous `1280x720` frames.
  - Still failed the autonomous gate: aka changed/pause state while bandai was stale.
- Tested skip-transition + copy-NV12 candidate:
  - `/nix/store/p08x1ydp28pj4i4g1nqcc9bs3pidlq16-moonlight-embedded-korri-2.7.1-korri`.
  - Still failed the gate: bandai stayed stale while aka showed pause/menu after bandai Escape.
- This shifted the investigation away from only Moonlight renderer/decoder and toward Sunshine capture/encoder state.
- Key observation:
  - Moonlight can continuously draw `1280x720` frames;
  - bandai can still show stale/divergent content;
  - therefore draw counters are not proof of a valid live stream.

## Sunshine-side queue-drain experiment

- Patched Sunshine runtime resolution path to drain the capture queue after encoder swap:
  - file: `packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch`.
  - added `drained_runtime_resolution_frames`.
  - added log field `drained_capture_queue=`.
  - fixed patch hunk header from `@@ -2035,6 +2037,55 @@` to `@@ -2035,6 +2037,61 @@`.
- Built Sunshine queue-drain candidate:
  - `/nix/store/lnsn368h7jcnlf7x6rz0jlmijjp4qdfj-sunshine-korri-2025.924.154138-korri`.
- Deployed queue-drain Sunshine to aka override:
  - `/run/systemd/system/korri-sunshine.service.d/runtime-resolution-test.conf`.
  - `ExecStart=/nix/store/lnsn368h7jcnlf7x6rz0jlmijjp4qdfj-sunshine-korri-2025.924.154138-korri/bin/sunshine /nix/store/qjjj3jpvf8rjc8hdd2qrjszhbyllx4gf-sunshine.conf`.
- Hit a new blocker:
  - Sunshine saw Moonlight’s capability query.
  - Moonlight did not receive/parse the capability ack.
  - local-control advertised `commands: []`.
  - `runtime.setResolution` reported unsupported.

## Capability ack diagnostic work

- Added Sunshine diagnostic logging inside `send_runtime_settings_ack_payload()`:
  - file: `packages/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch`.
  - logs ack payload size and send status.
- Fixed patch hunk count and rebuilt Sunshine:
  - `/nix/store/ydlajyrk1i47gmfys02hfq1ddwhvjgj3-sunshine-korri-2025.924.154138-korri`.
- Deployed that build to aka and restarted `korri-sunshine.service`.
- Initially hit Moonlight/gamescope startup flake:
  - repeated `connect ENOENT /tmp/probe-a-resolution/run/control.sock`.
  - Moonlight logs showed gamescope `IWaitable hung up`.
- Reset bandai display side:
  - killed Moonlight/gamescope;
  - restarted `korri-compositor.service` and `korri-inputd.service`.
- After reset, Moonlight started cleanly.
- Diagnostic signal:
  - Sunshine logged: `live-settings-mvp: sending runtime settings ack payload bytes=92 failed=0`.
  - Moonlight still did not log capability ack.
  - `runtime.setResolution` remained unavailable.

## Invalid Sunshine rebuild due to VAAPI mismatch

- Discovered the diagnostic Sunshine rebuild was not equivalent to known-good Sunshine:
  - it failed VAAPI initialization;
  - fell back to `libx264` software encoding;
  - therefore it was invalid for runtime-resolution testing.
- Known-good Sunshine override:
  - `/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri/bin/sunshine`.
- Known-good Sunshine references:
  - `libva-2.23.0`.
- Locally rebuilt Sunshine referenced:
  - `libva-2.22.0`.
- Restored known-good Sunshine service to keep the lab usable.
- Found a practical workaround for experimental Sunshine builds:
  - launch with `LD_LIBRARY_PATH=/nix/store/jfrdaij9vcz79qyrn54bk2l1ic2kamg6-libva-2.23.0/lib`.
  - This restored VAAPI for the diagnostic/queue-drain Sunshine builds.

## Moonlight ack parser confusion and correction

- Initially grepped only the Moonlight front binary and thought the active p08 build lacked the ack parser.
- Rebuilt current Moonlight for x86_64:
  - `/nix/store/qx2l1xk14fpbqnhgi3xfv5n4lgxc7cr5-moonlight-embedded-korri-2.7.1-korri`.
  - Accidentally pointed bandai at it.
  - bandai correctly failed with `cannot execute binary file`.
- Restored bandai harness to the aarch64 p08 Moonlight.
- Corrected the parser check:
  - the strings are in `lib/libmoonlight-common.so.2.7.1`, not the front binary.
  - active p08 aarch64 build does include `runtime settings capability ack` parser strings.
- Therefore the issue is not “missing parser binary”; it is actual control receive/routing/transport.

## Moonlight control receive diagnostics

- Added temporary Moonlight receive-path diagnostic to `0005b`:
  - logs any decrypted control packet with type in `0x55xx`.
  - first hunk count was wrong and caused malformed patch.
  - fixed hunk count from `+123` to `+128`.
  - first compile failed because `ctlHdr->payloadLength` did not exist on that header variant.
  - adjusted diagnostic to log only `type` and `packetLength`.
- Built diagnostic aarch64 Moonlight locally on bandai from a minimal synced repo:
  - `/nix/store/ivi8lk5wmi2was7c7j4mv5q8ia0ag1i7-moonlight-embedded-korri-2.7.1-korri`.
- Ran diagnostic Moonlight against known-good Sunshine:
  - Moonlight sent capability query.
  - Sunshine saw capability query.
  - Moonlight logged no `0x55xx` receive packet.
- Ran diagnostic Moonlight against diagnostic queue-drain Sunshine with VAAPI restored:
  - Sunshine logged ack send with `failed=0`.
  - Moonlight still logged no `0x55xx` receive packet.
- Tried deferring Sunshine capability ack send by 100ms using a detached thread:
  - built `/nix/store/w3rfvi820ypk3ysmk5wv4kywsgl2v8ir-sunshine-korri-2025.924.154138-korri`.
  - deployed with VAAPI `LD_LIBRARY_PATH` workaround.
  - Sunshine sent ack after delay.
  - Moonlight still logged no `0x55xx` receive packet.
- Current ack finding:
  - Sunshine receives Moonlight runtime-settings query.
  - Sunshine says it sends encrypted ack successfully.
  - Moonlight’s decrypted control receive loop never sees that ack.
  - Capability discovery remains broken.

## Functional bypass of capability gate

- To test the Sunshine queue-drain behavior without waiting on local-control capability discovery, used Moonlight’s env-driven runtime settings hook.
- Created `bandai:/tmp/probe-a-resolution/start-env-resolution.sh`.
- It starts fresh 1080p stream and sets:
  - `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION=1280x720`.
  - `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S=6`.
- Ran it against the deferred-ack/queue-drain Sunshine build with VAAPI restored.
- Moonlight logs showed the live request was sent:
  - `live-settings-mvp: sending runtime settings request request_id=1 operation=3 width=1280 height=720`.
- Moonlight logs showed output-size transition and continuous 720p frames:
  - `decoder output size changed 1920x1080 -> 1280x736 visible=1280x720`.
  - reopened decoder after output size change.
  - continuous `draw_frame` entries at `1280x720` through thousands of frames.

## Final strict gate attempt before this document

- After env-driven switch to `1280x720`, sent input through bandai:
  - Escape.
  - W.
  - then later Enter and W again.
- Captured bandai and aka.
- Bandai capture after resolution switch/input:
  - `/tmp/env-resolution-queue-drain/bandai-after-input.png`.
  - showed `CONTROLLER DISCONNECTED` overlay.
- Aka host capture after the same input:
  - `/tmp/env-resolution-queue-drain/aka-after-input.png`.
  - showed normal live gameplay.
- Second confirmation capture:
  - bandai: `/tmp/env-resolution-queue-drain/bandai-after-enter-w.png`.
  - aka: `/tmp/env-resolution-queue-drain/aka-after-enter-w.png`.
- Result:
  - bandai remained stuck/divergent on the controller-disconnected overlay;
  - aka remained live gameplay;
  - Moonlight continued drawing `1280x720` frames;
  - strict gate failed.
- Conclusion at this point:
  - queue-drain alone does not solve live runtime resolution switching;
  - draw-frame continuity is still not proof;
  - the stream can decode/draw continuously while bandai-visible content is wrong or stale.

## Current lab state after cleanup

- Killed Moonlight/gamescope on bandai.
- Restored bandai probe harness `env.sh` to p08 aarch64 Moonlight:
  - `/nix/store/p08x1ydp28pj4i4g1nqcc9bs3pidlq16-moonlight-embedded-korri-2.7.1-korri/bin/moonlight`.
- Restored aka Sunshine service to known-good build:
  - `/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri/bin/sunshine`.
- aka `korri-sunshine.service` is active.
- Temporary test scripts/artifacts still exist under:
  - `bandai:/tmp/probe-a-resolution`.
  - local `/tmp/env-resolution-queue-drain`.

## Current repo/worktree caution

- The local worktree contains experimental/temporary changes and diagnostics.
- Important temporary diagnostics added during this latest segment:
  - `packages/moonlight-embedded-korri/patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch`
    - added `live-settings-mvp: control recv type=0x%04x packet_length=%d` diagnostic.
  - `packages/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch`
    - added ack payload send logging;
    - added experimental 100ms deferred capability ack thread.
- These diagnostics are not a finished product fix.
- Before committing/shipping, either remove them or turn them into intentional debug logging with an explicit reason.

## Current blockers

- Runtime resolution now has a first autonomous functional pass with the fresh-frame IDR Sunshine candidate, but the repo is not yet in shippable form.
- Current control-plane blocker:
  - Sunshine runtime-settings capability ack is sent according to Sunshine, but not received by Moonlight’s decrypted control loop.
  - local-control remains unable to advertise `runtime.setResolution` in normal command discovery.
  - env-driven `SET_RESOLUTION` remains the functional test bypass.
- Current cleanup/productization blocker:
  - the passing candidate is mixed with temporary diagnostics in Sunshine patch `0004`;
  - Moonlight/Sunshine control-plane diagnostics in `0005b`/`0002` still need to be removed, formalized, or split before shipping.
- Known invalid direction:
  - suppressing decoder errors or forcing `DR_OK`; this previously caused green-frame corruption.

## Working hypotheses and rejected hypotheses

- Rejected or insufficient:
  - “Decoder reopened and logs look healthy” is not enough.
  - “Moonlight draws continuous 720p frames” is not enough.
  - “Socket/session is alive” is not enough.
  - “Queue-drain Sunshine sends frames” is not enough.
  - “Capability ack send returns failed=0” is not enough.
- Still plausible areas:
  - Sunshine capture/encoder reinit leaves stream content semantically stale/divergent even after queue drain.
  - Server→client encrypted control delivery for custom `0x5505` ack is wrong or sent on the wrong control path/peer/sequence context.
  - Moonlight/gamescope/display presentation may hold or composite stale content despite decoder draw activity.
  - Game/input focus/controller state may be altered by stream/device transitions and must be distinguished from video staleness.

## Next likely steps

- Productize the fresh-frame IDR runtime-resolution fix:
  - separate intentional behavior from temporary diagnostics;
  - keep the important semantic change: post-resolution keyframes must be encoded from fresh captured images, not the previous frame;
  - rerun the autonomous gate after cleanup.
- Fix or deeply instrument Sunshine→Moonlight ack transport:
  - compare custom ack send path to known working host-originated control packets such as HDR mode or termination;
  - verify peer, channel, encryption sequence, packet type, and packet length;
  - consider packet capture if tools are available;
  - confirm Moonlight sees a decrypted `0x5505` packet before relying on local-control commands.
- Continue functional validation independently of capability ack:
  - env-driven resolution request can still trigger live switch for experiments;
  - always run physical/autonomous bandai-vs-aka gate afterward.
- Keep Batman/game running where possible.
- Kill Moonlight/gamescope before clean test runs.
- Do not write acceptance docs until the cleaned candidate passes the strict gate.

## Append-only continuation log

- 2026-06-01 — Created this living journey document after the queue-drain + env-driven bypass test failed the strict bandai-vs-aka gate.
- 2026-06-01 — Added `tools/scripts/live-runtime-resolution-gate.sh` as the one-command autonomous harness. It cleans Moonlight/gamescope, starts the stream, optionally schedules an env-driven `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION`, sends bandai-originated input, captures bandai + aka, pulls Moonlight/Sunshine logs, and writes a run summary under `/tmp/live-runtime-resolution-gate/<label>/`.
- 2026-06-01 — Validated fuji as a usable aarch64 builder when addressed as the non-root SSH user: `nix build .#packages.aarch64-linux.moonlight-embedded-korri --builders 'ssh://simonwjackson@fuji aarch64-linux'`.
- 2026-06-01 — Validated the harness baseline path with no resolution switch: bandai and aka captures matched after bandai-originated `w` input.
- 2026-06-01 — Reproduced the live `1920x1080 -> 1280x720` strict-gate failure through the harness against known-good Sunshine: Moonlight logged continuous `1280x720` draws after the env-driven request, aka showed a post-input `X DETECT` prompt, but bandai did not show that prompt. This is still a fail because host and client post-input views diverged.
- 2026-06-01 — bandai rebooted during a queue-drain harness run. Treat client `/tmp` as disposable from now on. Moved durable probe harness to `/storage/probe-a-resolution` and updated `tools/scripts/live-runtime-resolution-gate.sh` default `--probe-dir` accordingly. Left `/tmp/probe-a-resolution` only as a convenience symlink when present.
- 2026-06-01 — Added harness auto-start for `ydotoold` because reboot removes `/run/user/0/.ydotool_socket`. The harness now starts `/nix/store/7dmpnkxnagd290qpgslkxahkvw57a6wm-ydotool-1.0.4/bin/ydotoold -p /run/user/0/.ydotool_socket -P 0600` before sending input if the socket is missing.

## 2026-06-01 durable probe, ack transport, and capture freshness results

- Moved the bandai probe harness from volatile `/tmp/probe-a-resolution` to durable `/storage/probe-a-resolution` because bandai may reboot at any time.
  - Left `/tmp/probe-a-resolution` only as a convenience symlink.
  - Updated `tools/scripts/live-runtime-resolution-gate.sh` default `--probe-dir` to `/storage/probe-a-resolution`.
- Added harness reboot hardening for input:
  - after bandai reboot, `/run/user/0/.ydotool_socket` was gone;
  - harness now starts `ydotoold` before sending input if the socket is missing.
- Verified post-reboot baseline health:
  - clean no-resolution gate passed input sanity; bandai-originated input moved the aka game and bandai capture matched.
- Ack transport diagnosis:
  - packet capture on bandai (`wlan0`, aka `192.168.1.117`, bandai `192.168.1.237`) showed server→client UDP/47999 length `102` immediately after the capability query, matching the expected encrypted ack size.
  - Moonlight diagnostics were expanded from `0x55xx` decrypted logs to lower threshold and raw ENet receive logs.
  - Even with “log every app-level ENet receive” diagnostics, Moonlight logged no app-level receive event for the ack while tcpdump showed UDP delivery.
  - Explicitly flushing Sunshine `control_server.send()` after enqueueing the ack did not make p08 Moonlight surface capabilities.
  - Current conclusion: capability ack is delivered at UDP/ENet-protocol level but is not reaching Moonlight’s app-level control receive path; normal local-control `runtime.setResolution` remains blocked, so env-driven request remains the functional test bypass.
- Queue-drain + explicit-flush Sunshine strict gate:
  - build: `/nix/store/z3kh28sk3vgkv41s58k87sq84r3v8sxy-sunshine-korri-2025.924.154138-korri`.
  - run: `/tmp/live-runtime-resolution-gate/resolution-flush-queue-120051`.
  - result: **FAIL**.
  - Sunshine applied `1280x720` with `drained_capture_queue=0`; Moonlight reopened and continuously drew `1280x720`; after bandai `esc,w`, aka showed pause/menu but bandai remained on stale gameplay.
- Sunshine capture freshness diagnostic:
  - build: `/nix/store/rcg3nw6bnc4lh9xwc8xfkwi0rx7112cg-sunshine-korri-2025.924.154138-korri`.
  - run: `/tmp/live-runtime-resolution-gate/resolution-capture-diag-121256`.
  - result: **FAIL**.
  - Diagnostic showed Sunshine continued popping images after the encoder swap, but they were `width=1920 height=1080` while encoder config was `1280x720`; images had `has_timestamp=0`.
  - This proves the capture queue is not simply empty, but does not prove the captured content is fresh after post-switch host input.
- Capture-reinit experiment:
  - build: `/nix/store/5sk6mkyafmszb03z6v9w5grfndz8hjlw-sunshine-korri-2025.924.154138-korri`.
  - run: `/tmp/live-runtime-resolution-gate/resolution-capture-reinit-122145`.
  - result: **INVALID/FAIL**.
  - It raised Sunshine capture reinit after applying runtime resolution (`capture_reinit=1`) while carrying the updated config by reference, but Moonlight never observed the 720p output-size transition; the stream stayed at 1920x1080 and host did not reach the pause-menu state in that run.
  - Do not treat this as a solution.
- Lab restored after experiments:
  - aka `korri-sunshine.service` active on known-good `/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri/bin/sunshine`.
  - bandai durable `env.sh` restored to p08 Moonlight `/nix/store/p08x1ydp28pj4i4g1nqcc9bs3pidlq16-moonlight-embedded-korri-2.7.1-korri/bin/moonlight`.
- Next useful probes:
  - add a content/hash diagnostic on Sunshine popped frames or encoded frames that can distinguish game vs pause overlay after bandai input;
  - investigate why the UDP/ENet ack packet is not emitted as a Moonlight app-level receive event;
  - avoid the naive capture-reinit path unless it can be made to preserve 720p bitstream delivery.

## 2026-06-01 fresh-frame IDR breakthrough

- Added a Sunshine experiment to `packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch` after sequence diagnostics showed capture buffers continued advancing after the encoder swap.
- First attempted a runtime-resolution IDR burst by forcing `requested_idr_frame` for 120 frames after applying `1280x720`.
  - build: `/nix/store/v5dwar9yp7nxvicphnvcc684921d6swz-sunshine-korri-2025.924.154138-korri`.
  - run: `/tmp/live-runtime-resolution-gate/resolution-idr-burst-130127`.
  - result: **not accepted**.
  - Logs showed many `runtime resolution diag no fresh image before IDR` entries; Sunshine was keyframing the previous frame repeatedly when no new captured image was immediately queued.
- Changed the experiment so runtime-resolution IDR frames require a fresh captured image:
  - when `runtime_resolution_idr_frames > 0`, set `requested_idr_frame = true`;
  - if no fresh image arrives during that forced-fresh IDR loop, `continue` rather than encoding the previous frame;
  - this preserves the important behavior: post-resolution keyframes are generated from fresh captures, not stale pre-switch frame state.
- Fresh-frame IDR build:
  - `/nix/store/9zxpihd90pr3ai4xbdf7bpgswr7hqikw-sunshine-korri-2025.924.154138-korri`.
- Initial live-held run:
  - `/tmp/live-runtime-resolution-gate/resolution-fresh-idr-131501`.
  - `1920x1080 -> 1280x720`, bandai-originated `esc,w`.
  - bandai and aka stayed on matching gameplay; no stale freeze reproduced.
- Clean compare gate:
  - `/tmp/live-runtime-resolution-gate/resolution-fresh-idr-compare-131727`.
  - command used the repo harness with the fresh-frame IDR Sunshine, VAAPI lib path, `--resolution 1280x720`, `--keys esc,w`, and visual comparison enabled.
  - result: **first autonomous functional PASS**.
  - Host and client both showed the same `CONTROLLER DISCONNECTED` overlay after the live 720p switch and bandai-originated input.
  - Visual RMSE on top 1920x1080 client viewport vs host capture: `1181.95 (0.0180354)`.
  - Moonlight log showed output-size transition and continuous 720p draw frames:
    - `decoder output size changed 1920x1080 -> 1280x736 visible=1280x720`;
    - `reopened decoder after output size change 1280x720 epoch=1`;
    - draw frames at `1280x720` through at least `#1560`.
  - Sunshine logs showed fresh captured images during the post-switch IDR window with advancing DMABUF sequence:
    - `sequence=367, 397, 427, ... 577`;
    - images remained `width=1920 height=1080` while config was `1280x720`, so the fix is not a capture-size reinit; it is fresh-frame keyframe pacing.
- Lab was restored by the harness after the compare run:
  - aka `korri-sunshine.service` restored to known-good `/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri/bin/sunshine`.
- Cleaned/productized the Sunshine patch after the diagnostic pass:
  - removed the Linux graphics include and sequence/popped-image diagnostic logging from `0004`;
  - kept the fresh-frame IDR behavior and added an explanatory comment;
  - clean build: `/nix/store/1gfk1ppa6jcg9424in29rpdhaycwkljx-sunshine-korri-2025.924.154138-korri`;
  - comment-only rebuild after adding the explanatory note: `/nix/store/9c1xwl35cps2pmp7l5jgkww7pc799wsl-sunshine-korri-2025.924.154138-korri`.
- Clean-build validation results:
  - `/tmp/live-runtime-resolution-gate/resolution-clean-fresh-idr-132531`: no stale/frozen video; host and client stayed on the same live gameplay scene after `esc,w`, with higher RMSE because only the host had a transient `Controller Connected` toast.
  - `/tmp/live-runtime-resolution-gate/resolution-clean-fresh-idr-settled-132703`: not accepted; host/client ended in different menu/overlay states (`CONTROLLER DISCONNECTED` vs pause menu), likely input/menu-state nondeterminism rather than the old stale-video freeze.
  - `/tmp/live-runtime-resolution-gate/resolution-clean-fresh-idr-enter-w-132851`: not accepted; host/client both reached pause UI but differed in highlighted menu state/timing.
- Current interpretation:
  - the stale-frame/freeze failure appears fixed by fresh-frame IDR pacing;
  - the strict autonomous gate still needs a deterministic post-switch input/capture sequence before declaring product acceptance for the cleaned patch.
- Do not ship yet:
  - capability ack/local-control discovery remains a separate blocker;
  - `0002`/`0005b` still contain control-plane diagnostics/experiments that need cleanup or formalization.

## 2026-06-01 later correction: stricter live gameplay gates still fail

- The earlier “functional PASS” language above is now too optimistic for the final acceptance bar.
- Subsequent stricter tests with real Batman gameplay showed the old stale/divergent behavior can still reproduce after `1920x1080 -> 1280x720` when bandai-originated input continues to change aka.
- Verified failures and invalid candidates from the later pass:
  - `delayed60-clean-compositor-162138`: clean pre-switch liveness, then post-switch host changed after input while bandai stayed stale (`client RMSE 18.7891`, `host RMSE 11092.5`).
  - `sunshine-capture-reinit-163747`: attempted to raise Sunshine `mail::switch_display` after runtime resolution; **invalid**, Sunshine segfaulted (`status=11/SEGV`), bandai went black.
  - `sunshine-vaapi-seq-164704`: temporary VAAPI convert sequence diagnostic; **invalid visually** because client disconnected/black, but it proved Wayland/VAAPI input sequences kept advancing after the switch (`2760`, `2880`, `3000`), so capture itself was not simply stopped.
  - `sunshine-packet-drain-165523`: drained queued encoded video packets before replacing the AVCodec session to avoid dangling `packet->replacements` pointers across the session swap. This was safer and improved behavior (bandai could show the first post-switch pause-menu state), but still **failed**: aka later resumed/moved while bandai stayed on the pause menu.
  - `moonlight-receive64-esc-171858`: raised Moonlight v4l2m2m receive drain cap from 8 to 64; **invalid**, Moonlight disconnected after the runtime-resolution ack and bandai went black.
- Current active lab state after cleanup:
  - aka Sunshine active on packet-drain candidate `/nix/store/1n6pk1cq4skjy3jw27i1sgys9ww9siy1-sunshine-korri-2025.924.154138-korri/bin/sunshine`.
  - bandai durable `MOON` restored to known-running `/nix/store/zbcpcvf0qrmj76pflffnnb8lrnp6d31h-moonlight-embedded-korri-2.7.1-korri/bin/moonlight`.
  - bandai compositor/input restarted and active.
- Important implementation note:
  - packet-drain should likely be kept or formalized because `packet_raw_avcodec` stores `packet->replacements = &session.replacements`; replacing/destroying the old AVCodec session while old packets remain queued risks dangling replacement pointers and stale/corrupt transition packets.
  - packet-drain alone is not sufficient for acceptance.
## 2026-06-01 refresh-reset candidate status

- Built and deployed aarch64 Moonlight refresh-reset candidate:
  - `/nix/store/hm9djkxlz4byhrkxld289g8s427hqmrl-moonlight-embedded-korri-2.7.1-korri`.
- Patch change:
  - `packages/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch` now preserves the SDL window/renderer, destroys only the NV12 texture, reasserts window size/show/raise, pumps events, and calls `SDL_RenderFlush()` during the post-resolution presenter reset.
- Successful clean movement-only gate:
  - `refresh-reset-w-only-190653`.
  - `1920x1080 -> 1280x720` via env runtime settings.
  - bandai-originated `w` after the switch.
  - host/client RMSE: `3344.23 (0.0510297)`.
  - artifacts: `/tmp/live-runtime-resolution-gate/refresh-reset-w-only-190653/`.
- Successful sustained same-stream validation:
  - sent another bandai-originated `w` after the gate completed.
  - host/client RMSE: `3488.82 (0.053236)`.
  - artifacts: `/tmp/live-runtime-resolution-gate/refresh-reset-w-only-190653/extra-continued-w/`.
- A strict `esc,w` run also passed once:
  - `refresh-reset-strict-190042`, RMSE `3600.73 (0.0549437)`.
  - sustained `esc,w` on the same stream also matched, RMSE `3744.6 (0.057139)`.
- Caveat:
  - `esc,w` is not deterministic for repeated gates because `esc` can toggle host/client pause state differently depending on the existing game state and capture timing.
  - A follow-up clean `esc,w` repro (`refresh-reset-repro-190407`) ended with host paused and client gameplay, RMSE `11031.4 (0.168328)`. This should be treated as input-state nondeterminism, not necessarily a decoder/presenter regression, but it means the menu-toggle portion still needs a deterministic scripted sequence.
- Current confidence estimate:
  - about `92%` to a one-off working gameplay demo;
  - about `65%` to a reliable demo.
- Follow-up thorough validation (`thorough-esc-esc-run3-193151`):
  - fresh stream, live `1920x1080 -> 1280x720`, then bandai-originated `esc`, `esc`, `w`, `w`, `w` with host/client captures after every step.
  - RMSE sequence: baseline `0.0474746`, after resolution `0.0642956`, after first `esc` `0.168573`, after second `esc` `0.0647348`, after `w1` `0.0647349`, after `w2` `0.0537744`, after `w3` `0.0510822`.
  - interpretation: first `esc` still diverged (aka paused/menu, bandai remained gameplay), but the second `esc` re-aligned gameplay and all three subsequent movement inputs matched host/client captures.
  - artifacts: `/tmp/live-runtime-resolution-gate/thorough-esc-esc-run3-193151/`.
- Do not claim fully solved until another fresh autonomous gate proves deterministic menu-open as well as menu-exit plus movement without relying on current host pause state.

## 2026-06-01 moving-testsrc correction: freeze is Sunshine encode/output-side, not SDL presentation

- User observed the moving `ffplay testsrc2` pattern freeze immediately after the live runtime-resolution swap, so the previous refresh-reset confidence was too high.
- Current confidence estimate after this correction:
  - about `35%` for a one-off demo;
  - about `15%` for a reliable demo.
- Test pattern setup on aka:
  - `ffplay -window_title korri-testsrc -fs -an -f lavfi -i testsrc2=size=1920x1080:rate=60`.
  - Current ffplay pid path: `/tmp/korri-testsrc/ffplay.pid`.
  - Full ffplay binary used on aka: `/nix/store/hqdqynn0caylvl4rr86mvyqjky1pf1xa-ffmpeg-8.0.1-bin/bin/ffplay`.
- Important capture correction for bandai:
  - plain `grim` can hang with the current dual-output state;
  - use the active sway socket and explicit output instead:
    - `SWAYSOCK=$(ls -t /run/user/0/sway-ipc.*.sock | head -1)`;
    - `XDG_RUNTIME_DIR=/run/user/0 WAYLAND_DISPLAY=wayland-1 SWAYSOCK=$SWAYSOCK timeout 8 grim -o DSI-2 <file>.png`.
- Sunshine-side evidence from `testsrc-reimport-213605`:
  - Sunshine accepted/applied `1024x576` and capture sequence continued advancing after the switch:
    - `vaapi convert sequence=710`, `830`, `950`, `1070`, ...;
    - `force_reimport=1` in the diagnostic candidate.
  - Moonlight continued decoding/drawing `1024x576`, but content hash froze:
    - changed at `#720` and `#840`, then repeated through long spans;
    - later frozen hash `d62262e1febd41e4` repeated from `#1200` through at least `#4080`.
  - bandai-visible DSI-2 frames were identical across time:
    - `dsi2-1.png` vs `dsi2-2.png`: `0 (0)`;
    - `dsi2-2.png` vs `dsi2-3.png`: `0 (0)`.
- Rejected candidate: VAAPI VRAM source reimport each frame.
  - Patch: `packages/sunshine-korri/patches/0006-diagnose-vaapi-convert-sequence.patch`.
  - Build: `/nix/store/ish8q8fpr8nggl2r2dwj9wfsqqzs8cgv-sunshine-korri-2025.924.154138-korri`.
  - Result: **FAIL**. It proved fresh capture descriptors keep arriving and are reimported, but the encoded/decoded content still freezes after runtime resolution.
- Rejected candidate: force `gl::ctx.Finish()` after GL conversion into the exported VAAPI target surface.
  - Patch: `packages/sunshine-korri/patches/0007-finish-vaapi-gl-convert-before-encode.patch`.
  - Build: `/nix/store/1bas7llgf0q6rw1q19jryd3ckg1sfn54-sunshine-korri-2025.924.154138-korri`.
  - Run: `testsrc-glfinish-214045`.
  - Result: **FAIL**. Moonlight froze at `1024x576` hash `639f54a76c37ec99` from `#840` through at least `#1920`; DSI-2 frame comparison showed visible freeze (`dsi2-2` vs `dsi2-3`: `0 (0)`).
- Current narrowed hypothesis:
  - capture is still producing new frames after runtime resolution;
  - GL source reimport and GL completion are not sufficient;
  - the failure is likely in the replacement VAAPI/AVCodec encoder session repeatedly encoding a stale converted frame/surface after resolution restart, or in packet/frame delivery after `avcodec_send_frame()` despite fresh input conversion.
- Current active lab state at this note:
  - aka `korri-sunshine.service` runtime override points to `/nix/store/1bas7llgf0q6rw1q19jryd3ckg1sfn54-sunshine-korri-2025.924.154138-korri/bin/sunshine` with `LD_LIBRARY_PATH=/nix/store/jfrdaij9vcz79qyrn54bk2l1ic2kamg6-libva-2.23.0/lib`.
  - bandai stream from `testsrc-glfinish-214045` may still be running; kill Moonlight/gamescope before the next clean run.
  - `ffplay` testsrc remains useful for fast freeze checks, but Batman/game remains required for final input acceptance.
- Next useful probes:
  - instrument `encode_avcodec()` packet payload/output hashes or sizes after `avcodec_receive_packet()` to prove whether Sunshine emits identical encoded packets after the restart;
  - try allocating/rotating a fresh VAAPI target `AVFrame` per frame or periodically after runtime-resolution restart instead of reusing the same exported VA surface;
  - compare sync path to Sunshine's normal startup encoder session to identify what state is missing in the in-place replacement session;
  - avoid spending more time on Moonlight SDL presentation until Sunshine encoded payload freshness is disproven.

## 2026-06-01 surface-rotation candidate invalidated

- Tried a stronger diagnostic to rotate the VAAPI target `AVFrame`/surface for 1800 frames after runtime resolution instead of reusing the same exported VA surface.
  - Patch: `packages/sunshine-korri/patches/0008-rotate-vaapi-target-surface-after-runtime-resolution.patch`.
  - Build: `/nix/store/jmaksjpjczakl8s982ikajl909vhjfm1-sunshine-korri-2025.924.154138-korri`.
  - Run: `testsrc-surface-rotate-214615`.
- Result: **INVALID/CRASH**.
  - Sunshine accepted the runtime resolution request and created the replacement encoder.
  - On the first post-switch fresh image, Sunshine aborted:
    - `terminate called after throwing an instance of 'std::length_error'`;
    - `what(): basic_string::_M_replace_aux`;
    - systemd status: `code=dumped, status=6/ABRT`.
  - Moonlight disconnected immediately after the request and DSI-2 captures were tiny/invalid.
- Useful side observation from the same run:
  - Moonlight did receive and parse the `0x5505` capability ack in this diagnostic stack:
    - `raw enet control recv channel=0 data_length=92`;
    - `control recv decrypted type=0x5505 packet_length=66`;
    - `runtime settings capability ack ... supported_operations=6 proof_gated_operations=8 ...`.
  - That means the earlier ack-transport failure is not universal; current parser/transport can work under at least some build/service/runtime conditions.
  - The resolution command still timed out because Sunshine crashed before sending the resolution ack.
- Lab restored after the invalid run:
  - aka `korri-sunshine.service` restored to known-good `/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri/bin/sunshine`.
  - bandai Moonlight/gamescope killed.
- Current repo caution:
  - `packages/sunshine-korri/package.nix` currently includes experimental `0006`, `0007`, and `0008` diagnostics.
  - `0008` is crashy and must not be shipped.
  - Treat the worktree as diagnostic-only until these are either reverted or isolated behind a deliberate experiment flag.
