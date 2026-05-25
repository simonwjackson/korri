# Follow-up Coherence Review: Live USB Persistence Plan

## Findings

### COH-FU-001 — U3 requires a session-visible Developer/Product marker, but its file list only covers Nix/output plumbing

- **Severity:** Major P2
- **Confidence:** 75
- **Category:** file-list / implementation-unit consistency

**Evidence**

- U3's approach requires “a minimal running-session indicator for Developer vs. Product state” and explicitly says “docs and marker files are not sufficient by themselves for AE2” (lines 271-272).
- U3's test scenarios require “a Developer session exposes a visible running-session marker” (line 285).
- U3's `Files:` list only includes Nix composition/output/config-check files: `nix/images/common.nix`, `nix/images/live-usb.nix`, `flake.nix`, image-output eval tests, and config checks (lines 258-265). It does not include the runtime-config/session/app files that would make the marker visible in the running kiosk session.
- The system-wide impact section acknowledges that the marker may touch “runtime config or React” (line 423), but no implementation unit lists those files or a test surface for that UI-visible path.

**Why it matters**

The plan now states the correct acceptance contract, but U3's implementation boundary still points implementers at package/static Nix surfaces. Following the unit literally can satisfy artifact naming and metadata while leaving AE2's running-session visibility unimplemented.

**Recommended fix**

Add the concrete runtime-config/session/UI files and tests needed for the visible marker to U3, or split the marker into its own unit with those files. At minimum, include the desktop runtime-config shape/env reader, the portal/runtime-config reader or React marker surface, and a test that proves the marker is visible from the running-session config rather than only present in docs or marker files.
