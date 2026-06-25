# Federated release folding smoke checklist

Manual two-device check for exact-identifier folding v1.

1. Put the same single-file ROM bytes on two Korri devices, under different local ids or storage names.
2. Start both daemons and open the fabric catalog on one device.
3. Confirm the ROM appears as one tile, not two.
4. Confirm launching prefers the local copy when the local copy is launchable.
5. Install/configure the same `provider-ref` store game (for example Steam app id) on two devices.
6. Confirm the store game appears as one tile, not two.
7. Stop or sleep the remote-only source device.
8. Confirm the remaining folded/remote-only entry reports an unavailable host by name rather than a generic launch error.

Out of scope for this smoke: zip-vs-raw ROM folding, multi-file games, manual merge/split, and source-picker UI.
