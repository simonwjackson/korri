# pico theme — home-screen prototype

**THROWAWAY.** Sub-shape B UI prototype (se-prototype). Delete this whole
directory and the `/pico-prototype` route once a direction wins.

## Question being answered

> What should the home screen of a new 8-bit / pixel-art "pico" theme look
> like on the Anbernic RG353M (640×480, 4:3)?

Decisions already locked with the user:

- **Pixel-perfect**, locked to 640×480 (not the repo's fluid clamp() tokens).
- Theme id: **pico** (PICO-8 palette, fittingly).

## How to view

```bash
just dev-web   # then open /pico-prototype
```

Switch directions with the floating bottom bar, the `←/→` arrow keys, or
`?variant=A|B|C`. The screen renders at native 640×480 inside a device
bezel (scaled ×1.6 for desk comfort; density is still 1:1 with the panel).

Fonts (Press Start 2P / VT323) load from a CDN for the prototype only and
degrade to monospace offline. Box art is procedurally generated per game
id since the fixtures ship none — on-brand for 8-bit cartridge labels.

## The three directions (radically different structure)

- **A — Cartridge Shelf**: one hero cartridge, neighbours peeking, big
  title + stats underneath. One game at a time, horizontal coverflow.
  Strong art focus; weak for scanning a big library fast.
- **B — Menu List + Preview**: scrollable bordered JRPG-style list on the
  left, selected game's cartridge + metadata on the right. Dense,
  text-forward, fast to scan; less art-forward.
- **C — Icon Grid**: a console "home OS" desktop of cartridge icons with a
  selection box and a bottom tray for the focused game. Familiar; balances
  art and density.

## Verdict (fill in after review)

- Winner: _TBD_
- Why: _TBD_
- Steal-from-others: _e.g. "C grid, but B's metadata statline in the tray"_

Once decided: fold the winner into a real `product/themes/pico/` theme
(register in `product/apps/portal/themes/theme-registry.ts`), then delete
this prototype directory + route + the `__virtual.ts` entry.
