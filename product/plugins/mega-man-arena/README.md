# Mega Man Arena

First-party Korri plugin for Mega Man Arena.

The plugin contributes a catalog item and fulfilled executable resource for the packaged Windows release. Launch resolution uses the already-fulfilled `mega-man-arena` resource; it must not call `nix run` or mutate user Nix profiles at launch time.

The package remains exposed as `.#mega-man-arena` and checked by `.#checks.*.mega-man-arena-check` so Bandai can still launch the same FEX/Proton wrapper while catalog/resource wiring is added.
