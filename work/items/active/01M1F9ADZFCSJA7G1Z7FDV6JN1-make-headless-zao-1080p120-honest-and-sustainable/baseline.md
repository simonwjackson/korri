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
