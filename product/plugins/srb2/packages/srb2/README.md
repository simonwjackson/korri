# SRB2 package surface

This plugin intentionally re-exports nixpkgs' `srb2` package instead of
vendoring a duplicate derivation. nixpkgs builds the native engine and wraps it
with `SRB2WADDIR` pointing at the packaged upstream SRB2 data files.
