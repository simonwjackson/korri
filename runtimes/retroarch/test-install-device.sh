#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL="$HERE/install-device.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
touch "$TMP/fork.apk"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/verify"
chmod +x "$TMP/verify"

cat > "$TMP/bin/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "$ADB_LOG"
printf '\n' >> "$ADB_LOG"
args=" $* "
case "$args" in
  *" get-state "*) printf 'device\n' ;;
  *" settings get global verifier_verify_adb_installs "*) printf '1\n' ;;
  *" pm path com.retroarch.aarch64 "*) printf 'package:/data/app/stock/base.apk\n' ;;
  *" pm path com.korri.retroarch "*) printf 'package:/data/app/fork/base.apk\n' ;;
  *" install "*)
    if [[ "${ADB_INSTALL_FAIL:-0}" == 1 ]]; then
      printf 'Failure [INSTALL_FAILED_TEST]\n' >&2
      exit 1
    fi
    printf 'Success\n'
    ;;
esac
ADB
chmod +x "$TMP/bin/adb"

export PATH="$TMP/bin:$PATH"
export ADB_LOG="$TMP/adb.log"
export RETROARCH_APK="$TMP/fork.apk"
export RETROARCH_APK_VERIFY="$TMP/verify"

"$INSTALL" serial-1

grep -q -- '-s serial-1 get-state' "$ADB_LOG"
grep -q -- '-s serial-1 install -r ' "$ADB_LOG"
grep -q -- 'settings put global verifier_verify_adb_installs 0' "$ADB_LOG"
grep -q -- 'settings put global verifier_verify_adb_installs 1' "$ADB_LOG"
[[ "$(grep -c 'pm path com.retroarch.aarch64' "$ADB_LOG")" == 2 ]]
grep -q 'pm path com.korri.retroarch' "$ADB_LOG"
! grep -q 'uninstall' "$ADB_LOG"

: > "$ADB_LOG"
if ADB_INSTALL_FAIL=1 "$INSTALL" serial-1 >/dev/null 2>&1; then
  echo 'expected failed adb install to fail deployment' >&2
  exit 1
fi
grep -q -- 'settings put global verifier_verify_adb_installs 1' "$ADB_LOG"
! grep -q 'uninstall' "$ADB_LOG"

printf 'RetroArch device install flow tests passed\n'
