#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/retroarch-distribution.yml"
STAGE="$ROOT/plugins/retroarch/android/stage-distribution.sh"

for path in "$WORKFLOW" "$STAGE"; do
  [[ -f "$path" ]] || { echo "RetroArch distribution file is missing: $path" >&2; exit 1; }
done
[[ -x "$STAGE" ]] || { echo 'RetroArch candidate staging script must be executable' >&2; exit 1; }

grep -F '  pull_request:' "$WORKFLOW" >/dev/null
grep -F '      - "retroarch-v*"' "$WORKFLOW" >/dev/null
grep -F '  cancel-in-progress: true' "$WORKFLOW" >/dev/null
for path_filter in \
  '.github/workflows/retroarch-distribution.yml' \
  'flake.nix' \
  'flake.lock' \
  'nix/android-sdk-env.sh' \
  'nix/tasks.nix' \
  'plugins/mgba/android/**' \
  'plugins/retroarch/android/**'; do
  [[ "$(grep -Fc "      - \"$path_filter\"" "$WORKFLOW")" == 2 ]] || {
    echo "RetroArch distribution workflow must filter pull requests and main pushes on $path_filter" >&2
    exit 1
  }
done

grep -F 'environment: retroarch-release' "$WORKFLOW" >/dev/null
grep -F "if: github.event_name != 'pull_request' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/retroarch-v'))" "$WORKFLOW" >/dev/null
grep -F "needs.sign.result == 'success'" "$WORKFLOW" >/dev/null
grep -F "startsWith(github.ref_name, 'retroarch-v')" "$WORKFLOW" >/dev/null
grep -F 'persist-credentials: false' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F 'run: nix run .#ra-dist -- "$RUNNER_TEMP/retroarch-candidate"' "$WORKFLOW" >/dev/null
grep -F '(cd candidate && sha256sum -c korri-retroarch-arm64-candidate.apk.sha256)' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F 'dump badging "$candidate"' "$WORKFLOW" >/dev/null
grep -F "package: name='com.korri.retroarch'" "$WORKFLOW" >/dev/null
grep -F '^assets/cores/mgba_libretro_android.so$' "$WORKFLOW" >/dev/null
grep -F 'com.korri.retroarch.permission.LAUNCH' "$WORKFLOW" >/dev/null
grep -F 'android:launchMode.*0x0' "$WORKFLOW" >/dev/null
grep -F "core_sideload_activity=\"\$(grep -A2 'CoreSideloadActivity'" "$WORKFLOW" >/dev/null
grep -F 'android:exported.*0x0' "$WORKFLOW" >/dev/null
grep -F 'RETROARCH_RELEASE_KEYSTORE_BASE64' "$WORKFLOW" >/dev/null
grep -F "\"\$APKSIGNER\" sign \\" "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F '"$APKSIGNER" verify --verbose --print-certs "$temporary"' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F '[[ "$signer_count" == 1 ]]' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F '[[ -n "$actual_cert" && "$actual_cert" == "$expected_cert" ]]' "$WORKFLOW" >/dev/null
grep -F "s/^V[0-9.]* Signer: certificate SHA-256 digest: //p" "$WORKFLOW" >/dev/null
grep -F 'uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4' "$WORKFLOW" >/dev/null
grep -F '(cd dist && sha256sum -c korri-retroarch-arm64.apk.sha256)' "$WORKFLOW" >/dev/null
grep -F "versionName='\\([^']*\\)'" "$WORKFLOW" >/dev/null
grep -F "printf 'retroarch-v%s-korri\\n'" "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F '[[ "$rolling_tag" =~ ^retroarch-v[0-9]+\.[0-9]+\.[0-9]+-korri$ ]]' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F 'git/refs/tags/$release_tag' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F 'gh release edit "$release_tag" --title "$title" --prerelease' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal workflow contract; variables expand in Actions.
grep -F 'gh release upload "$release_tag" "$artifact" "$checksum" --clobber' "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016 # Literal staging-script contract.
grep -F 'sha256sum "$CANDIDATE_NAME" > "$CANDIDATE_NAME.sha256"' "$STAGE" >/dev/null

if grep -Eq 'gradlew|cmake --build|ndk-build|curl|wget' "$WORKFLOW"; then
  echo 'distribution workflow must delegate compilation to the Nix task' >&2
  exit 1
fi
if grep -Eq 'actions/(checkout|upload-artifact|download-artifact)@v|cachix/install-nix-action@v' "$WORKFLOW"; then
  echo 'distribution workflow actions must be pinned to immutable revisions' >&2
  exit 1
fi

sign_job_line="$(grep -n '^  sign:$' "$WORKFLOW" | cut -d: -f1)"
release_job_line="$(grep -n '^  release:$' "$WORKFLOW" | cut -d: -f1)"
materialize_line="$(grep -nF 'name: Materialize release keystore' "$WORKFLOW" | cut -d: -f1)"
cleanup_line="$(grep -nF 'name: Remove release keystore and temporary output' "$WORKFLOW" | cut -d: -f1)"
signed_upload_line="$(grep -nF 'name: Upload signed workflow artifact' "$WORKFLOW" | cut -d: -f1)"
if [[ -z "$sign_job_line" || -z "$release_job_line" || -z "$materialize_line" || -z "$cleanup_line" || -z "$signed_upload_line" ]]; then
  echo 'distribution workflow is missing its isolated signing sequence' >&2
  exit 1
fi
if [[ "$materialize_line" -ge "$cleanup_line" || "$cleanup_line" -ge "$signed_upload_line" ]]; then
  echo 'release keystore must be removed before signed artifact actions run' >&2
  exit 1
fi
if sed -n "${sign_job_line},${release_job_line}p" "$WORKFLOW" | grep -F 'actions/checkout@' >/dev/null; then
  echo 'isolated signing job must not check out or execute repository code' >&2
  exit 1
fi
if sed -n "${materialize_line},${cleanup_line}p" "$WORKFLOW" | grep -F 'uses:' >/dev/null; then
  echo 'third-party actions must not run while the release keystore exists' >&2
  exit 1
fi

printf 'RetroArch distribution workflow contract passed\n'
