# Sunshine live-settings extension spikes

## Short version

Changing Moonlight/Sunshine stream quality while a session is already running is not a hidden feature we can simply turn on. Today, Moonlight sends stream settings at session start, Sunshine builds the encoder around those settings, and the active stream does not expose a public “set bitrate/resolution/FPS now” command.

That does **not** make the idea impossible. It means the safest path is to prove it in two small spikes:

1. **Control-plane spike:** prove Moonlight can send an acknowledged live-settings command to Sunshine during an active stream without restarting anything.
2. **Bitrate-only spike:** once the command path works, try changing only the active encoder bitrate and force a fresh keyframe.

Resolution, FPS, HDR, codec, and preset changes should wait until after those two spikes. They touch more of the capture, encoder, decoder, and display pipeline.

---

## Why this is a spike, not a normal feature

Moonlight currently treats stream settings as **start-of-session configuration**.

At launch, `moonlight-embedded` builds a `STREAM_CONFIGURATION` with width, height, FPS, bitrate, packet size, codec, audio settings, and related options. That configuration is passed into `LiStartConnection()`. After that point, there is no obvious public API like:

- `LiSetBitrate()`
- `LiSetResolution()`
- `LiSetFps()`
- `LiUpdateStreamConfiguration()`

Sunshine receives the quality settings during RTSP setup, especially the `ANNOUNCE` phase, then uses them to initialize the stream and encoder.

So the existing architecture says:

> “Pick stream settings, start the stream, keep those settings for the session.”

The spike asks whether we can safely add:

> “Start the stream, then send a negotiated live control message to change part of the stream while it is running.”

---

## What we know from source research

### Moonlight latches stream quality at session start

`moonlight-common-c` generates SDP with the selected stream settings. It also explicitly disables dynamic resolution switching in normal cases:

```text
x-nv-vqos[0].drc.enable = 0
```

It also latches bitrate by sending initial/min/max bitrate values that all point at the requested bitrate.

For Sunshine hosts, Moonlight additionally sends:

```text
x-ml-video.configuredBitrateKbps
```

That helps Sunshine know the requested bitrate, but it is still part of session setup, not a live mutation command.

### Sunshine parses quality settings during RTSP setup

Sunshine’s RTSP path handles setup methods such as:

- `OPTIONS`
- `DESCRIBE`
- `SETUP`
- `ANNOUNCE`
- `PLAY`

The stream quality values are parsed before the stream is running. I did not find an existing RTSP method or HTTP endpoint intended for live stream-quality reconfiguration.

### Sunshine already has a better extension seam

Sunshine has an active control stream for in-session messages. It already handles things like:

- IDR/keyframe request
- loss/stat messages
- input/control messages
- HDR-related messages
- Sunshine-specific controller extensions in the `0x55xx` range

That makes the active control stream a much better place to spike live settings than RTSP.

---

# Spike 1: acknowledged live-settings control message

## Goal

Prove that Moonlight can send a Sunshine-specific live-settings command during an active stream and receive a structured response, without changing the media stream yet.

This spike is intentionally boring at the media layer. It should not change bitrate, resolution, FPS, codec, or anything visible. The only thing it proves is:

> We have a safe, negotiated, active-session command path.

## Why start here

If the control path is unreliable, the full feature is dead on arrival. A no-op command lets us test the protocol shape without risking encoder instability, decoder resets, frame loss, or host app restarts.

This is the smallest proof that Option C is real enough to continue.

## Proposed behavior

Moonlight sends a request like:

```text
RuntimeSettingsRequest {
  request_id: 1,
  operation: noop,
  fields: none
}
```

Sunshine replies with something like:

```text
RuntimeSettingsResponse {
  request_id: 1,
  status: ok,
  message: "runtime settings control is available"
}
```

Unsupported hosts should not silently ignore the command. They should either not advertise the feature or return a clear error.

## Negotiation requirement

Before Moonlight sends the command, Sunshine should advertise support for the extension.

Possible shape:

```text
Sunshine feature flag: runtime settings control supported
Moonlight feature flag: runtime settings control client supported
```

This matters because we do not want a client guessing that a host supports experimental packets.

## Success criteria

A successful Spike 1 proves:

- Moonlight detects Sunshine support for runtime settings control.
- Moonlight sends an active-stream no-op command.
- Sunshine validates the request against the active session.
- Sunshine returns an explicit ack or structured error.
- Moonlight logs the response.
- The stream continues running.
- The host app is not restarted.
- Moonlight is not restarted.

## Suggested proof commands / observations

During a running stream:

```text
Moonlight log: sent runtime-settings noop request_id=1
Sunshine log: received runtime-settings noop request_id=1
Sunshine log: replied runtime-settings ok request_id=1
Moonlight log: runtime-settings ack request_id=1 status=ok
```

Manual proof:

- video remains visible
- input remains responsive
- stream does not reconnect
- Sunshine session remains the same session
- host application remains open

## What this spike should not do

Do not change media settings yet.

Avoid:

- bitrate mutation
- resolution mutation
- FPS mutation
- encoder restart
- stream restart
- app relaunch
- Moonlight reconnect

The point is to prove the wire/control contract first.

---

# Spike 2: bitrate-only live mutation

## Goal

Use the Spike 1 control path to request a bitrate change during an active stream.

The first real setting should be **bitrate only**.

Not resolution. Not FPS. Not codec. Not HDR. Just bitrate.

## Why bitrate first

Bitrate is the least invasive quality setting because it can often be changed inside the encoder without changing the frame dimensions, codec, decoder setup, display surface, or client input mapping.

Resolution and FPS are more architectural. Bitrate is the best chance of proving a true live setting without dragging the entire stream lifecycle into the first experiment.

## Proposed behavior

Moonlight sends:

```text
RuntimeSettingsRequest {
  request_id: 2,
  operation: set_bitrate,
  bitrate_kbps: 15000
}
```

Sunshine validates:

- active stream exists
- client negotiated support
- requested bitrate is within allowed bounds
- active encoder backend can attempt bitrate reconfiguration

Sunshine then attempts the change and replies:

```text
RuntimeSettingsResponse {
  request_id: 2,
  status: ok,
  applied_bitrate_kbps: 15000
}
```

Or:

```text
RuntimeSettingsResponse {
  request_id: 2,
  status: error,
  error_code: encoder_not_reconfigurable,
  message: "active encoder backend does not support runtime bitrate updates"
}
```

After a successful bitrate change, Sunshine should request or force an IDR/keyframe so the client gets a clean refresh point.

## Encoder reality check

Sunshine currently applies bitrate during encoder setup. For example, the FFmpeg path sets values like max rate, bit rate, min rate, and buffer size before the encoder is opened. The NVENC path initializes rate-control fields before encoding starts.

I did not find an existing generic Sunshine “reconfigure active encoder bitrate” function.

That means Spike 2 has two layers:

1. Protocol/control support: the live request reaches Sunshine and gets a response.
2. Encoder support: Sunshine actually applies the new bitrate to the active encoder, if that backend supports it.

The spike is still useful even if one encoder backend returns a clear “not supported yet” error. The important thing is that the failure is explicit, negotiated, and safe.

## Success criteria

A successful Spike 2 proves:

- Moonlight can request a bitrate change during an active stream.
- Sunshine validates the requested bitrate.
- Sunshine either applies the bitrate or returns a structured unsupported error.
- If applied, Sunshine logs the old bitrate and new bitrate.
- If applied, Sunshine requests/forces an IDR frame.
- The active stream survives the request.
- The host app is not restarted.
- Moonlight is not restarted.

Optional stronger proof:

- Sunshine encoder stats reflect the new target bitrate.
- Network throughput trends toward the new bitrate.
- Visual quality changes as expected after a few seconds.

## What this spike should not do

Avoid mixing bitrate with other live changes.

Do not include:

- resolution changes
- FPS changes
- codec changes
- HDR changes
- preset changes
- capture source changes
- decoder reinitialization

If bitrate-only is not clean, the larger changes will not be clean either.

---

# Why not live resolution/FPS first?

Resolution and FPS are tempting because they are visible and product-friendly, but they are much riskier.

## Resolution touches both sides of the stream

On the client side, Moonlight’s decoder renderer setup receives width and height at stream start. Many embedded renderers allocate buffers, textures, display planes, or decoder resources around those dimensions.

Changing resolution live may require:

- server capture resize
- encoder reconfiguration or restart
- SPS/PPS or codec parameter refresh
- decoder acceptance of new coded dimensions
- renderer/display resize
- UI/input coordinate handling updates
- recovery if any backend cannot resize safely

Some decoders can survive resolution changes. That does not mean the whole Moonlight/Sunshine pipeline promises to.

## FPS changes are also broader than they look

FPS affects:

- capture pacing
- encoder timing
- rate-control behavior
- frame pacing
- latency calculations
- client rendering assumptions

It is probably possible eventually, but it should not be first.

---

# Suggested implementation order

## Step 1: name the experimental extension

Pick a clear experimental name, for example:

```text
Sunshine Runtime Settings Control
```

Keep it explicitly experimental until the control contract and at least one setting prove stable.

## Step 2: add feature negotiation

Sunshine advertises support. Moonlight only sends requests when support is advertised.

## Step 3: add request/response packet shape

Keep the packet structure small:

- request id
- operation
- setting fields
- status
- error code
- message or applied value

## Step 4: implement no-op request

This is Spike 1.

Do not touch encoder code yet.

## Step 5: implement bitrate request validation

Validate before touching the encoder:

- minimum bitrate
- maximum bitrate
- active stream state
- supported encoder backend
- sane units, probably kbps externally

## Step 6: attempt backend-specific bitrate reconfigure

Start with one backend if necessary. It is fine for other backends to return a structured unsupported error.

## Step 7: force/request IDR

After applying a live bitrate change, request a keyframe so the client has a clean refresh point.

## Step 8: document what happened

The spike should end with a short outcome doc:

- what worked
- what failed
- which encoder backend was tested
- whether bitrate really changed
- whether the stream stayed alive
- whether the next setting should be FPS, resolution, or more encoder backends

---

# Proposed user-facing story if both spikes work

If both spikes succeed, the eventual product feature could read simply:

> While streaming from Sunshine, Moonlight can adjust bitrate without restarting the stream or closing the game.

The UI does not need to expose every protocol detail. It could be as simple as:

```text
Streaming Quality
Bitrate: 15 Mbps
[ Apply without restarting stream ]
```

Under the hood, the client would:

1. Check if the host supports live settings.
2. Send a runtime bitrate request.
3. Show success or a helpful unsupported message.
4. Fall back to “restart stream to apply” if unsupported.

---

# Moonlight-only validation preflight

Before touching Sunshine, this repo now has a Moonlight-only validation plan and implementation path for the boundary we can prove client-side:

- `docs/plans/2026-05-25-002-feat-moonlight-live-settings-validation-spike-plan.md`
- `docs/acceptance/moonlight-live-settings-validation-sobo-2026-05-25.md`

This preflight is deliberately narrower than Spike 1 above. It uses the existing `LiRequestIdrFrame()` API as an active-session control proxy and logs runtime bitrate mutation as explicitly unsupported. It does not add a Sunshine packet, Sunshine feature flag, ack/error response, or real encoder reconfiguration.

The result should be read as:

- **Moonlight invocation proven** when the validation hook logs an active-session IDR request without reconnecting.
- **Host reaction stronger proof** only if a post-request IDR frame marker appears in the same run.
- **Live bitrate still unsupported** until a separate Sunshine-side protocol/encoder spike exists.

---

# Recommendation

Proceed with the two-spike path, using the Moonlight-only validation as preflight evidence before Sunshine changes.

Do **not** attempt full live quality settings in one jump. The cleanest proof is:

1. **Can Moonlight safely invoke existing active-session control during a running stream?**
2. **Can Moonlight and Sunshine safely exchange a new acknowledged runtime-settings control message?**
3. **Can Sunshine safely change bitrate through that path?**

If those are true, then Option C becomes a real architecture direction instead of a guess.
