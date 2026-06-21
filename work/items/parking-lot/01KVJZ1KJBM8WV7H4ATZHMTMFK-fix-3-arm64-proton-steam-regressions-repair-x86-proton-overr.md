---
id: 01KVJZ1KJBM8WV7H4ATZHMTMFK
slug: fix-3-arm64-proton-steam-regressions-repair-x86-proton-overr
title: Fix 3 ARM64-Proton Steam regressions + repair x86 Proton override path on Bandai
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - proton
  - dxvk
  - bandai
  - arm64
created: 2026-06-20
source: se-debug
---

# Fix 3 ARM64-Proton Steam regressions + repair x86 Proton override path on Bandai

## Why it matters

After making ARM64 proton-cachyos the default Steam compat tool, 16/19 installed games render. Three regress: 30XX (D3D9 d3dcompiler 'fx_2_0' / E5033), Vector (runs but black, likely intro-video decode), Axiom Verge 2 (Unity early exit ~13s). The intended x86 Proton-Experimental per-game override is configured but currently fails device-wide with AppError_51 (x86 sniper/SteamLinuxRuntime pressure-vessel nesting inside Korri's Steam FHS), so the fallback is non-functional.

## Acceptance Criteria

- [ ] 30XX renders: install legacy d3dcompiler_43/d3dx9 into the ARM64 prefix (or supply a fx_2_0-capable d3dcompiler), OR confirm it works once x86 override path is repaired
- [ ] Vector renders past intro: diagnose/fix intro-video decode under proton-cachyos
- [ ] Axiom Verge 2 reaches its menu: capture Unity Player.log and resolve the early exit
- [ ] x86 Proton-Experimental launches under Steam-in-Gamescope (no AppError_51) so it can serve as a real per-game override
- [ ] Document the final per-game compat mapping for the 3 games

## Related

- `docs/solutions/runtime-errors/steam-arm64-proton-cachyos-default-matrix-2026-06-20.md`
- `01KVJSZTH66G6R06AC46TR53Y3`
