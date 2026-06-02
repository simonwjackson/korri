# Sunshine h264_vaapi seamless bitrate-change inspection

## Objective

Find the smallest next code change to try true active-stream bitrate changes for `h264_vaapi` without encoder restart, Moonlight reconnect, or decoder reset.

## Relevant current patch state

Current downstream Sunshine patches live under:

- `packages/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch`
- `packages/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch`
- `packages/sunshine-korri/patches/0003-apply-runtime-bitrate-and-fps-changes.patch`
- `packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch`

Upstream Sunshine source inspected from:

- `/nix/store/gybylg65i7xxapkabpwy1jgscbb44b0l-source/src/video.cpp`
- `/nix/store/gybylg65i7xxapkabpwy1jgscbb44b0l-source/src/platform/linux/vaapi.cpp`

FFmpeg VAAPI internals inspected from:

- `/nix/store/sbyac78hbnsgvmb13ky1k9663v4w7p62-ffmpeg/libavcodec/vaapi_encode.c`
- `/nix/store/sbyac78hbnsgvmb13ky1k9663v4w7p62-ffmpeg/libavcodec/vaapi_encode.h`

## Key upstream mechanics

Sunshine's AVCodec session type is local to `src/video.cpp`:

- class: `avcodec_encode_session_t`
- members:
  - `avcodec_ctx_t avcodec_ctx`
  - `std::unique_ptr<platf::avcodec_encode_device_t> device`
- `request_idr_frame()` marks the next frame as key/IDR by setting:
  - `frame->pict_type = AV_PICTURE_TYPE_I`
  - `frame->flags |= AV_FRAME_FLAG_KEY`

Encoding happens in:

- `encode_avcodec(...)`
  - calls `avcodec_send_frame(ctx.get(), frame)`
  - then drains packets with `avcodec_receive_packet(...)`

Initial bitrate setup happens in `make_avcodec_encode_session(...)`:

```cpp
auto bitrate = ((config::video.max_bitrate > 0) ? std::min(config.bitrate, config::video.max_bitrate) : config.bitrate) * 1000;
ctx->rc_max_rate = bitrate;
ctx->bit_rate = bitrate;
if (encoder.flags & CBR_WITH_VBR) {
  ctx->bit_rate--;
} else {
  ctx->rc_min_rate = bitrate;
}
```

For VAAPI, Sunshine's `platform/linux/vaapi.cpp` sets codec options / rc mode during codec open only. There is no public Sunshine-level runtime update hook today.

FFmpeg VAAPI initializes runtime-relevant state in `vaapi_encode_init_rate_control(...)`:

- `ctx->va_bit_rate = rc_bits_per_second`
- `ctx->rc_params = (VAEncMiscParameterRateControl) { ... }`
- `vaapi_encode_add_global_param(..., VAEncMiscParameterTypeRateControl, &ctx->rc_params, sizeof(ctx->rc_params))`

In `vaapi_encode_issue(...)`, FFmpeg uploads `ctx->global_params` only when:

```c
if (base_pic->type == FF_HW_PICTURE_TYPE_IDR) {
    for (i = 0; i < ctx->nb_global_params; i++) {
        vaapi_encode_make_misc_param_buffer(... ctx->global_params[i] ...);
    }
}
```

Important implication: `ctx->global_params[]` stores a pointer to `ctx->rc_params`, not a copy. If Sunshine mutates the private `VAAPIEncodeContext::rc_params` before forcing an IDR, the next IDR should upload the new `VAEncMiscParameterRateControl` through normal FFmpeg VAAPI code, without rebuilding the encoder.

## Minimal code change to try

Smallest practical experiment is Sunshine-only, in `packages/sunshine-korri/patches/0003-apply-runtime-bitrate-and-fps-changes.patch`, replacing the current unsupported bitrate branches with a private VAAPI-state mutation + forced IDR.

### Patch location 1: add helper near `avcodec_encode_session_t` / runtime helpers in `src/video.cpp`

Add a helper in `video.cpp`, because `avcodec_encode_session_t` is file-local and has direct access to `AVCodecContext`.

Pseudo-shape:

```cpp
#ifdef __linux__
#include <va/va.h>
#endif

struct korri_vaapi_runtime_tail_t {
  // Mirror enough of FFmpeg's VAAPIEncodeContext layout to reach fields after
  // AVCodecContext::priv_data. This is private ABI and must be guarded.
};

static bool runtime_update_h264_vaapi_bitrate(encode_session_t *session, std::uint32_t bitrate_kbps, std::uint32_t fps) {
  auto av = dynamic_cast<avcodec_encode_session_t *>(session);
  if (!av || !av->avcodec_ctx) return false;
  AVCodecContext *ctx = av->avcodec_ctx.get();
  if (ctx->codec_id != AV_CODEC_ID_H264 || ctx->pix_fmt != AV_PIX_FMT_VAAPI) return false;

  const int64_t bps = (int64_t) bitrate_kbps * 1000;
  ctx->bit_rate = bps;
  ctx->rc_max_rate = bps;
  ctx->rc_min_rate = bps;
  if (fps > 0) ctx->rc_buffer_size = bps / fps;

  auto *va = reinterpret_cast<korri_vaapi_runtime_tail_t *>(ctx->priv_data);
  // mutate:
  // - va->va_bit_rate
  // - va->rc_params.bits_per_second
  // - va->rc_params.target_percentage
  // - va->rc_params.window_size
  // - maybe HRD buffer fields if present/active

  av->request_idr_frame();
  return true;
}
```

The exact private mirror must match the FFmpeg currently in the Nix closure. From inspected `vaapi_encode.h`, the relevant fields are in `VAAPIEncodeContext` after many preceding members. Build risk is high if manually mirroring the full prefix. A safer variant is to vendor a tiny FFmpeg patch that exports a helper (see below), but Sunshine-only is the smallest source edit.

### Patch location 2: sync capture bitrate branch

Current branch in `0003` under `encode_run(...)` / sync path says:

```cpp
if (request->operation == RUNTIME_SETTINGS_OPERATION_SET_BITRATE_KBPS) {
  std::uint32_t applied_bitrate_kbps = config.bitrate;
  std::uint16_t status = RUNTIME_SETTINGS_STATUS_FAILED;
  std::uint16_t reason = RUNTIME_SETTINGS_REASON_UNSUPPORTED_OPERATION;
  ... unsupported log ...
  runtime_bitrate_ack_events->raise(...);
}
```

Change to:

- call `runtime_update_h264_vaapi_bitrate(session.get(), request->value, config.framerate)`
- if true:
  - `config.bitrate = request->value`
  - `applied_bitrate_kbps = request->value`
  - `status = RUNTIME_SETTINGS_STATUS_APPLIED`
  - `reason = RUNTIME_SETTINGS_REASON_NONE`
  - force IDR via helper
- if false:
  - fail as unsupported encoder/apply failed
- ack with applied value

### Patch location 3: async capture bitrate branch

Current async branch in `0003` under `capture_async(...)` says the same unsupported message. Change it similarly, but target the active session:

```cpp
runtime_update_h264_vaapi_bitrate(pos->session.get(), request->value, ctx->config.framerate)
```

On success:

- `ctx->config.bitrate = request->value`
- ack applied
- no replacement encoder/session
- no reinit/reconnect

### Patch location 4: capability advertisement in `0002`

Current `send_runtime_settings_capability_ack(...)` advertises only FPS:

```cpp
supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_FPS;
```

For the experiment, advertise bitrate too only when the same runtime support predicate is true:

```cpp
supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_BITRATE_KBPS;
plaintext.min_bitrate_kbps = 500;       // or match Moonlight limit
plaintext.max_bitrate_kbps = 150000;    // or a conservative product cap
```

Do not advertise if the private VAAPI mutation helper is not compiled/enabled.

## More robust but slightly larger alternative

The cleaner version is to patch FFmpeg used by Sunshine, not to mirror private structs in Sunshine.

Add a small exported/internal function in FFmpeg VAAPI code, e.g.:

```c
int avcodec_vaapi_runtime_set_bitrate(AVCodecContext *avctx, int64_t bps, int fps);
```

Implementation in `libavcodec/vaapi_encode.c` can safely access `VAAPIEncodeContext` directly and update:

- `avctx->bit_rate`
- `avctx->rc_max_rate`
- `avctx->rc_min_rate`
- `avctx->rc_buffer_size`
- `ctx->va_bit_rate`
- `ctx->rc_params.bits_per_second`
- `ctx->rc_params.target_percentage`
- `ctx->rc_params.window_size`
- maybe `ctx->hrd_params.buffer_size` / `initial_buffer_fullness` when HRD is active

Then Sunshine calls that function and requests IDR. This avoids private-layout guessing in Sunshine, but requires wiring a patched FFmpeg into `sunshine-korri`, so it is a larger Nix/package change.

Given the previous failed `vaapi_runtime_tail_t` attempt, this FFmpeg-side helper is probably the better serious attempt even if the first compile/test spike is slightly more work.

## Tests/checks that must change

Primary invariant check:

- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`

Current checks intentionally enforce the safe unsupported contract. These must be changed/removed:

- check named roughly: `Sunshine runtime bitrate patch refuses non-seamless encoder restart`
  - currently expects:
    - `runtime bitrate unsupported without seamless encoder reconfiguration`
    - `RUNTIME_SETTINGS_REASON_UNSUPPORTED_OPERATION`
    - absence of `encoder restarted for runtime bitrate`
    - absence of `updated_config.bitrate = request->value`
- README check currently expects:
  - `Active-stream bitrate changes are not advertised until they can be applied seamlessly`
- capability checks currently expect bitrate not advertised / min/max zero.

New invariants should assert:

- no encoder restart string remains for bitrate
- no `make_encode_session(...)` or replacement session in bitrate path
- no reconnect fallback
- bitrate operation is advertised only for `h264_vaapi`
- bitrate request path mutates runtime VAAPI RC state and calls `request_idr_frame()`
- ack reports `RUNTIME_SETTINGS_STATUS_APPLIED` only after the mutation helper returns true
- unsupported encoders still return current applied bitrate and do not advertise bitrate

Docs to update:

- `packages/sunshine-korri/README.md`
  - replace “bitrate unsupported” contract with “experimental h264_vaapi seamless bitrate path” wording
  - keep explicit warning that proof requires moving video + bandwidth evidence

Moonlight-side tests may need adjustment only if capability expectations assert `runtime.setBitrate` is absent. Search hits to review:

- `tools/cli/moonlight-runtime-watch.test.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`
- `packages/moonlight-embedded-korri/README.md`

## Build risks

1. **Private FFmpeg ABI/layout risk**
   - Sunshine-only mirror of `VAAPIEncodeContext` is fragile. Any FFmpeg update can silently move fields.
   - Compile may pass while runtime writes the wrong offsets.
   - If using this route, add loud compile/runtime guards and restrict to the exact FFmpeg major/version if available.

2. **Header visibility risk**
   - `VAAPIEncodeContext` is not public. Including FFmpeg private headers from Sunshine is not normally possible from installed FFmpeg outputs.
   - A local struct mirror compiles but is unsafe.
   - FFmpeg-side helper avoids this.

3. **Driver behavior risk**
   - FFmpeg uploads global params only on IDR. The driver may or may not accept changed `VAEncMiscParameterRateControl` on a later IDR for an existing VA context.
   - If it ignores the changed RC buffer, ack would lie unless verified by bandwidth.

4. **HRD/VBV mismatch risk**
   - Updating only `bits_per_second` may not be enough. If HRD params were active, `hrd_params.buffer_size` / `initial_buffer_fullness` may also need update.
   - Sunshine currently sets `NO_RC_BUF_LIMIT` for VAAPI, but `platform/linux/vaapi.cpp` can set `ctx->rc_buffer_size` for strict/Intel/AV1 paths. On `h264_vaapi` this may still vary by driver/settings.

5. **Threading/timing risk**
   - Mutation must happen on the encode thread between frames, not from the control thread. Current runtime request queue already delivers to capture/encode loops, so patch the existing bitrate branch there.

6. **False-positive ack risk**
   - JSON-RPC/ack success is not proof. The validation gate must require:
     - visible moving video on `bandai`
     - actual network bitrate shift
     - no Moonlight reconnect
     - no frozen SM8550 `v4l2m2m` video

## Recommended first spike

Do not reintroduce encoder restart. First spike should be either:

### Option A: fastest compile spike, Sunshine-only

- Add private VAAPI mutation helper in `video.cpp`.
- Patch only the existing unsupported bitrate branches in `0003`.
- Advertise bitrate in `0002` only for `h264_vaapi`.
- Build `sunshine-korri` and deploy to `aka` for hardware proof.

This is minimal but likely brittle because it depends on FFmpeg private layout.

### Option B: best chance of correctness, still narrow

- Add `packages/ffmpeg-korri` or an override patch to Sunshine’s FFmpeg input exposing one tiny VAAPI runtime bitrate helper.
- Patch Sunshine `video.cpp` to call that helper from the existing runtime bitrate branches and request IDR.
- Update invariants/docs.

This is the preferred serious attempt because it avoids guessing `VAAPIEncodeContext` layout in Sunshine. It is also the most likely path to a maintainable seamless bitrate implementation.

## Exact validation target after build

On `aka` with patched Sunshine and on `bandai` Moonlight `-platform v4l2m2m`:

1. Start 1080p120 H.264 stream.
2. Confirm local-control advertises `runtime.setBitrate` and `runtime.setFps`.
3. Send `runtime.setBitrate(6000)`.
4. Require all of:
   - command ack/result applied
   - state applied bitrate changes
   - measured network bandwidth changes downward
   - video remains visibly moving on `bandai`
   - no Moonlight process restart/reconnect
5. Send bitrate back up, e.g. `12000` or `25000`, and repeat evidence.

