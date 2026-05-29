{
  pkgs,
  moonlightPackage,
  # Regex patterns matched against each line of the runtime closure
  # store-paths file. Each line is a full `/nix/store/<hash>-<name>` path
  # (one path per line), so patterns are anchored with `$` to forbid
  # only build-tool outputs while permitting their runtime-library
  # siblings (for example, `-gcc-14.3.0$` rejects the bare toolchain but
  # leaves `-gcc-14.3.0-lib` and `-gcc-14.3.0-libgcc` — the legitimate
  # libstdc++ / libgcc_s runtime carriers — alone).
  forbiddenPatterns ? [
    # Build toolchain leaking into runtime almost always means an absolute
    # store path got captured in a build artifact (most commonly
    # `CMakeCache.txt`) and the reference scanner pulled the whole
    # toolchain into the closure.
    "-gcc-[0-9][0-9.]*$"
    "-gcc-wrapper-[0-9][0-9.]*$"
    "-cmake-[0-9][0-9.]*$"
    "-binutils-[0-9][0-9.]*$"
    "-binutils-wrapper-[0-9][0-9.]*$"

    # Maximalist-ffmpeg fingerprint: the non-headless `ffmpeg-X.Y-lib`
    # ships flite/freepats/gtk/x265-encoder/icu wrapping on top of the
    # libavcodec/libavformat/libavutil/libswscale moonlight actually
    # links. Forbid the non-headless variant so an accidental switch back
    # to plain `ffmpeg` in `buildInputs` is caught by the check; the
    # `ffmpeg-headless-X.Y-lib` sibling is permitted (the `-headless`
    # infix lands before the version, so this pattern does not match it).
    "-ffmpeg-[0-9][0-9.]*-lib$"

    # sdl2-compat's transitive chain (gst-plugins-bad, libdecor,
    # libcamera, pipewire, ...) must stay out of the moonlight runtime
    # closure now that moonlight is linked against SDL2-korri.
    "-flite-[0-9]"
    "-freepats-[0-9]"
    "-gtk\\+3-[0-9]"
    "-gtk4-[0-9]"
    "-libadwaita-[0-9]"
    "-libcamera-[0-9]"
    "-libdecor-[0-9]"
    "-libpipewire-[0-9]"
    "-zenity-[0-9]"
    "-gstreamer-[0-9]"
    "-gst-plugins-(base|bad|good)-[0-9]"
    "-python3-[0-9][0-9.]*$"
  ],
}:

let
  lib = pkgs.lib;
  closure = pkgs.closureInfo { rootPaths = [ moonlightPackage ]; };
  forbiddenArg = lib.concatStringsSep "\n" forbiddenPatterns;
in
pkgs.runCommand "korri-moonlight-closure-hygiene-check"
  {
    inherit closure;
    forbiddenPatterns = forbiddenArg;
  }
  ''
    set -eu

    paths_file="$closure/store-paths"
    if [ ! -f "$paths_file" ]; then
      echo "error: closure store-paths file missing at $paths_file" >&2
      exit 1
    fi

    patterns_file="$TMPDIR/forbidden-patterns.txt"
    printf '%s\n' "$forbiddenPatterns" > "$patterns_file"

    failures=()
    while IFS= read -r pattern; do
      [ -z "$pattern" ] && continue
      matches=$(grep -E -- "$pattern" "$paths_file" || true)
      if [ -n "$matches" ]; then
        failures+=("$pattern")
        echo "forbidden runtime dependency matching '$pattern':" >&2
        echo "$matches" | sed 's/^/  /' >&2
      fi
    done < "$patterns_file"

    if [ "''${#failures[@]}" -gt 0 ]; then
      echo "" >&2
      echo "Korri moonlight closure hygiene check failed." >&2
      echo "Forbidden patterns matched in runtime closure:" >&2
      printf '  %s\n' "''${failures[@]}" >&2
      exit 1
    fi

    mkdir -p "$out"
    cp "$paths_file" "$out/closure-store-paths.txt"
    cat > "$out/summary.txt" <<EOF
    Korri moonlight closure hygiene invariants passed for ${moonlightPackage}.
    No forbidden runtime dependencies detected.
    EOF
  ''
