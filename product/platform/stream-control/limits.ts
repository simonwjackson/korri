/**
 * Generic stream-control value limits owned by the platform. These bound the
 * control UI and RPC payload validation; the streamer plugin performs its own
 * strict validation at the control boundary. Kept platform-side so the
 * stream-control service and RPC schemas do not import any streamer module
 * (keeps the streamer plugin removable).
 */
export const STREAM_CONTROL_LIMITS = {
  bitrateKbps: { min: 1, max: Number.MAX_SAFE_INTEGER },
  fps: { min: 1, max: Number.MAX_SAFE_INTEGER },
  resolution: {
    width: { min: 1, max: Number.MAX_SAFE_INTEGER },
    height: { min: 1, max: Number.MAX_SAFE_INTEGER },
  },
  touchBounds: {
    x: { min: 0, max: 65_535 },
    y: { min: 0, max: 65_535 },
    w: { min: 1, max: 65_536 },
    h: { min: 1, max: 65_536 },
  },
} as const
