# Tailwind v4 @theme runtime-knob spike

Proves the token-generator port to Tailwind v4. Rebuild + inspect:

    cd this-dir && bun build.mjs
    grep -nE -- "--text-|font-size" output.css

Result (Tailwind 4.2.4, verified):
- single-layer `@theme { --x: calc(... * var(--knob,1)) }` -> emitted live;
  `.text-knob` font-size 16px -> 32px when `--demo-scale` set to 2 at runtime.
- `round(clamp(8px,2.5cqi,22px),1px)` passes through `@theme` intact.
- `@theme inline { --x: calc(var(--knob)) }` also worked in 4.2.4 (no #16396 repro),
  but single-layer is preferred (simpler, overridable global var).

output.css is generated (large); not kept in tree.
