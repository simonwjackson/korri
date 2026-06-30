---
id: 01KWDB0C63HBXNTSA3K9P141TW
slug: shift-home-gpu-present-path-blocked-by-electrobun-x11-only-l
title: Shift home GPU-present path blocked by Electrobun X11-only Linux wrapper
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-06-30
source: se-debug
---

# Shift home GPU-present path blocked by Electrobun X11-only Linux wrapper

## Why it matters

On Bandai (SM8550/Adreno A740), Shift home navigation is CPU-bound (~3.2 cores across WebKitWebProcess ~150%, Electrobun main ~95%, Xwayland ~75%) while the GPU sits at 21% busy at its 220MHz minimum (max 680MHz). WebKit's content process DOES GPU-composite its layers, but the final present goes through GLX-on-Xwayland (X11 Error: GLXBadWindow) and a CPU blit, because Electrobun's libNativeWrapper.so is hardcoded to the X11 GDK backend (XOpenDisplay, gdk_x11_get_default_xdisplay, gdk_x11_window_get_xid; 1743 'x11' strings, zero wayland/EGL). GDK_BACKEND=wayland is ignored. To use the GPU for presentation (not just layer raster), the window must be a real Wayland surface so WebKitGTK presents via EGL/DMABUF — which requires patching Electrobun to GdkWayland or moving to a Wayland-native web runtime (WPE/Cog).

## Acceptance Criteria

- [ ] The Shift home renderer window is a Wayland surface (sway shell != xwayland)
- [ ] During continuous rail navigation, Xwayland is no longer in the paint path and combined CPU drops materially
- [ ] WebKit presents via EGL/DMABUF on the GPU; GPU clock ramps above the 220MHz floor under load OR CPU present cost is eliminated
- [ ] No fidelity/animation reduction

## Related

- `product/apps/desktop/nix/wrap.nix`
- `product/systems/nixos/images/kiosk.nix`
- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`

## Notes

Options: (A) patch/fork Electrobun native wrapper to support GdkWayland / drop XID dependency; (B) adopt WPE/Cog Wayland-native web runtime for the kiosk; (C) fix GLX-on-Xwayland present (won't remove Xwayland/main CPU, weakest). Evidence captured via /proc/<webkit>/fdinfo drm-engine-gpu and ldd/grep of libNativeWrapper.so.
