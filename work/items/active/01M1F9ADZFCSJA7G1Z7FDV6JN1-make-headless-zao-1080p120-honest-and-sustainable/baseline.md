# Automated baseline, 2026-09-02

## Zao

- Current and default generation: `/nix/store/d62kzbx1g685f0fq6jm8qsqg4ghkblxw-nixos-system-zao-26.05.20260313.c06b4ae`
- Active bundle: `/nix/store/92zlzz0q6gkh68j8hs8ivv46hs4785ig-korri-bundle-0.0.0`
- Boot ID: `9134baf1-3811-4646-8987-5734aa92a0bd`
- Sway output: `HEADLESS-1`, 1920x1080, 60,000 mHz
- Compositor backend: `WLR_BACKENDS=headless`
- Compositor renderer: `WLR_RENDERER=gles2`
- Sunshine capture: Wayland screencopy
- Sunshine encoder: strict NVENC
- Active game units: zero
- Device-gate marker: absent
- Device-gate lease: inactive

The live DRM scan found eight DisplayPort connector records. Every record reported `disconnected`. It found no connected HDMI or DisplayPort connector and no EDID. The accepted compositor therefore does not consume a live dummy-plug connector.

A guarded live probe changed `HEADLESS-1` from 60 Hz to 120 Hz. Sway reported `120000` mHz. The cleanup trap restored 60 Hz and Sway reported `60000` mHz. This proves that the existing headless backend can supply the required mode without a DRM-backend change.

## Bandai

- Display mode: 1920x1080 landscape on a 120 Hz-capable panel
- Current minimum refresh setting: 60 Hz
- Current peak refresh setting: 60 Hz
- Korri stream baseline: 1280x720 at 60 FPS, codec `auto`, unlocked FPS disabled, performance overlay disabled

No physical action or visual confirmation was used to capture this baseline.

## Candidate iteration 1

Candidate `/nix/store/a7575ikx8nmf25d2jq3a7nsqzwvgbnm1-nixos-system-zao-26.05.20260313.c06b4ae` activated with `HEADLESS-1` at 120 Hz. The automated compositor gate still required 60 Hz, so it rejected the candidate before streaming. The guarded cleanup restored the exact baseline generation and bundle. The attempt marker and lease were removed. This failure identified a gate defect, not a 120 Hz compositor failure.

## Candidate iteration 2

Candidate `/nix/store/42ws5zbngcm319g1gwyhqkfzsdn1n9ya-nixos-system-zao-26.05.20260313.c06b4ae` passed the dynamic compositor gate at 1920x1080@120. Bandai streamed the native 120 FPS validation source with H.264.

Five primary incoming-FPS samples were `115.81`, `117.50`, `114.26`, `111.33`, and `115.52`. Their mean was `114.884`. Eight final decoder work-rate samples averaged `114.168`. Network loss stayed at `0.00%`. NVIDIA encoder utilization stayed between `23%` and `32%`, so NVENC was not saturated.

A live diagnostic raised only the Sway output to 125 Hz while the stream remained 120 FPS. Incoming rates remained near the same range. The diagnostic restored 120 Hz. This result rejects exact output-phase alignment as the main limit.

The accepted threshold was not met. Bandai returned to its exact saved settings. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 3

A candidate tested patch `0018`, which changed missed-deadline recovery in Sunshine's Wayland RAM capture scheduler. The candidate regressed the stream. Five incoming-FPS samples were `105.42`, `109.28`, `118.03`, `108.07`, and `107.27`. Their mean was `109.614`. Eight final decoder work-rate samples averaged `107.963`.

The experiment failed and the patch was removed. Bandai returned to its saved settings. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 4

A candidate ran Sway and Sunshine at nice `-10`. Five incoming-FPS samples were `103.23`, `105.53`, `107.41`, `109.73`, and `103.29`. Their mean was `105.838`. Eight final decoder work-rate samples averaged `107.417`.

The priority change regressed the stream and was removed. Bandai returned to its saved settings. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 5

A client-only diagnostic enabled Bandai's low-latency frame-balance option. Five incoming-FPS samples were `102.32`, `103.74`, `108.67`, `111.11`, and `108.42`. Their mean was `106.852`. Eight final decoder work-rate samples averaged `106.994`.

The client setting improved rendered FPS relative to incoming FPS, but it reduced incoming throughput. Bandai returned to its saved settings. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 6

A client-only diagnostic reduced Bandai's requested bitrate from the automatic value to 10,000 Kbps. Bandwidth fell from about `3.3 MB/s` to `1.08 MB/s`, but the first steady incoming rate was `104.63 FPS`. Network loss remained `0.00%`.

The lower bitrate did not remove the frame-rate limit, so the test stopped before a full soak. Bandai returned to its saved settings. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 7

A native 120 FPS H.264 validation video replaced the runtime-generated source. MPV CPU use fell from about `58%` to `42%`, but Bandai received about `103 FPS`. A two-minute soak without intermediate screenshots averaged `106.117 FPS` in the decoder work-rate samples.

Live output probes at 144 Hz and Odin performance mode `2` did not reach the target. The validation source remained 120 FPS throughout those probes.

## Candidate iteration 8

A debug client build stopped overriding the selected `latency` frame-pacing mode with `balanced`. The first connected sample was `103.57 FPS`. The change did not remove the limit and was rejected.

Bandai returned to its saved settings and APK. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 9

A Sunshine candidate requested high-rate Wayland RAM frames five percent early. A 10-second host packet capture measured `107.444` video datagrams per second. The prior unmodified capture measured `107.910` video datagrams per second under the same filter.

The headroom did not change the rate and was replaced. The packet cadence showed that the host path, not Bandai's network receive path, produced the limit.

## Candidate iteration 10

A candidate removed Sunshine's second high-rate timer and let blocking screencopy events clock the capture loop. A 10-second host packet capture measured `105.899` video datagrams per second. This was lower than the unmodified `107.910` result.

The compositor-clock experiment did not remove the limit. It showed that high-rate capture remains processing-bound after each screencopy frame.
