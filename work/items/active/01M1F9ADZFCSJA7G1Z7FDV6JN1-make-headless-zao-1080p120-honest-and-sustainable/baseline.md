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

## Candidate iteration 11

Sunshine replaced the scalar BGR888-to-BGRA loop with FFmpeg swscale. The first Bandai sample improved to `112.16 FPS`. A 10-second host packet capture improved from `107.910` to `109.522` video datagrams per second.

The conversion change helped, but it did not meet the target. The remaining long frame gaps still centered near `11.25 ms`, which points to the serial screencopy and conversion path rather than NVENC or network loss.

## Candidate iteration 12

A Pixman compositor candidate started and passed the dynamic renderer gate. Neverball reached `115.10 FPS`, but the native 120 FPS validation workload rendered black. The moving-content requirement therefore failed.

Pixman cannot use the existing MPV GPU validation command. Zao returned to the exact 1080p60 generation and bundle with no game, marker, or lease.

## Candidate iteration 13

The Pixman candidate used MPV's X11 software output. The native 120 FPS validation video became visible and moved correctly. A 10-second host packet capture measured `112.881` video datagrams per second. Eight final decoder samples averaged `110.318 FPS`.

Pixman removed most BGR conversion cost but the serial timer and screencopy cadence still missed the target.

## Candidate iteration 14

A format-aware candidate removed the timer only after a high-rate 32-bit SHM frame. Its host packet rate was `112.365` video datagrams per second, compared with `112.881` for the timed Pixman path.

The timer removal did not help. The next experiment targeted per-frame SHM allocation and mapping, which remained inside the serial capture loop.

## Candidate iteration 15

A double-buffered candidate kept validated Wayland SHM buffers mapped between screencopy frames. Its host packet rate fell to `107.189` video datagrams per second.

Persistent SHM reuse was regressive. Zao returned to the exact 1080p60 generation and bundle. The experiment is not retained in the candidate patch set.

## Host CPU profile

A 15-second `perf` profile of the timed Pixman and swscale candidate found:

- `42.42%` of sampled Sunshine cycles in `__memmove_evex_unaligned_erms` under `wl::wlr_ram_t::capture`.
- `33.88%` of sampled Sunshine cycles in the CUDA driver under `cudaMemcpy2DToArray` and `cuda::sws_t::load_ram`.
- Zero lost samples across about 5,000 cycle samples.

The measured hot path is the CPU BGR888-to-BGRA expansion followed by the pageable host-to-CUDA copy. The next candidate used pinned host images for the existing CUDA upload. It did not change stream timing or encoder selection.

## Candidate iteration 16

Pinned capture images improved the 10-second host packet rate to `114.400` video datagrams per second. The final no-intermediate-screenshot overlay sample reported `122.76 FPS` and `0.00%` network loss, but eight decoder work-rate samples averaged `111.317 FPS`.

Pinned memory improved the measured host path but did not prove the required sustained rate. The next candidate also submitted the pinned host-to-CUDA copy asynchronously on Sunshine's existing conversion stream.

## Candidate iteration 17

The asynchronous upload candidate measured `114.317` host video datagrams per second. The pinned synchronous candidate measured `114.400`.

Asynchronous submission did not improve host cadence. It is not retained. The next candidate targeted the remaining dominant CPU cost with a dedicated SSSE3 BGR888-to-BGRA row conversion while retaining pinned upload memory.

## Candidate iteration 18

The SSSE3 candidate initially measured `114.678` host video datagrams per second, then measured `112.023`, `111.224`, and `111.619` in three consecutive captures. A temporary `performance` ACPI platform profile stopped active package thermal throttling and raised sampled CPU frequency from `951415` kHz to `3499936` kHz, but a standalone packet capture still measured `114.191` datagrams per second.

A second 15-second `perf` profile found `63.50%` of sampled Sunshine cycles in `__memmove_evex_unaligned_erms` under `wl::wlr_ram_t::capture`. CUDA upload no longer dominated the CPU profile. This proves the live Pixman path is using the 32-bit row-copy branch, not the BGR888 conversion branch.

The SSSE3 conversion and performance profile did not meet the target. The platform profile returned to `balanced`. The next candidate transferred eligible 32-bit non-inverted Wayland SHM mappings to the bounded image pool instead of copying every row into a second host image.

## Candidate iteration 19

Direct SHM ownership transfer removed the capture-thread row copy. Host packet rate measured `112.908` datagrams per second. A 15-second `perf` profile then found `55.43%` of sampled Sunshine cycles in the CUDA driver under the pageable `cudaMemcpy2DToArray` upload.

Removing the first copy exposed a slower pageable CUDA transfer and regressed cadence. The next candidate registered each transferred mapping as CUDA host memory while its pooled image owned the mapping. Registration failure fell back to the existing pinned-copy path.

## Candidate iteration 20

Per-frame CUDA host registration measured `111.988` host video datagrams per second, with 70 gaps over 12 ms and two gaps over 16 ms in the 10-second sample.

Registration cost exceeded the removed copy cost. The transfer experiment is not retained. The next candidate returned to the pinned destination buffer and split eligible contiguous 32-bit frame copies across the capture thread and one persistent worker.

## Candidate iteration 21

The persistent copy-worker candidate measured `113.115` host video datagrams per second. Worker synchronization cost more than it saved.

Parallel host copying is not retained. The next candidate bound each free pooled image to its own reusable Wayland SHM buffer, registered that mapping once, captured directly into it, and uploaded it without an intermediate host copy. Buffer reuse remained gated by the existing free-image callback.

## Candidate iteration 22

Image-owned registered SHM removed both dominant CPU costs. A 15-second `perf` profile contained neither capture-thread `memmove` nor CUDA host-staging work among the leading samples. Host packet rate nevertheless measured `108.055` datagrams per second.

The copy path was no longer the measured limiter inside Sunshine, but image-owned registered SHM reduced host cadence to `108.055` datagrams per second. Letting blocking screencopy completion clock the same path measured `107.856`.

## Candidate iteration 23

Direct capture into CUDA-registered SHM is slower than Sway capture into normal SHM followed by one copy into pooled pinned memory. The likely cost is Pixman's writes into page-locked destination memory. The direct path is not retained.

The next candidate returned to the best pinned-copy path and replaced 1,080 per-row `memcpy` calls with one contiguous frame copy when stride and orientation already matched.

## Candidate iteration 24

The contiguous copy candidate measured `114.198` host video datagrams per second. Five moving-content overlay samples averaged `111.212 FPS`. A second five-sample run under the temporary `performance` ACPI profile averaged `108.124 FPS`, so that profile returned to `balanced`.

One cached frame copy did not sustain the target. The next candidate kept the contiguous pinned-copy shape but used bounded AVX2 non-temporal stores and an explicit store fence, avoiding cache allocation for memory that CUDA consumed immediately.

## Candidate iteration 25

The non-temporal copy candidate measured `113.891` host video datagrams per second. It did not improve the cached pinned-copy result and is not retained.

The remaining acceptance workload decodes and presents a full 1920x1080 software video frame 120 times per second under Pixman. The next candidate retains the best pinned Sunshine path but replaces that stress workload with a Korri-owned X11 validation program. The program advances moving geometry on an absolute 120 Hz clock and derives all positions from its actual window dimensions.
