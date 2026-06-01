# inputplumber-korri

Korri-owned InputPlumber runtime package.

This package owns the InputPlumber binary/version that official Korri images use
for the normalized-input runtime contract. It intentionally does **not** bundle
SM8550 handheld controller maps such as AYN or AYANEO MCU maps.

SM8550 controller maps remain substrate-owned hardware data and are composed by
the SM8550 platform adapter from nix-on-rocks' `inputplumber-sm8550-maps` output.
