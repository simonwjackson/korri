#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL="$HERE/install-device.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
touch "$TMP/fork.apk"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/verify"
cat > "$TMP/aapt" <<'AAPT'
#!/usr/bin/env bash
printf "package: name='com.korri.retroarch' versionCode='42' versionName='1.22.2_GIT'\n"
AAPT
chmod +x "$TMP/verify" "$TMP/aapt"

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
  *" dumpsys package com.korri.retroarch "*)
    printf '    versionCode=%s minSdk=21 targetSdk=28\n' "${ADB_VERSION_CODE:-42}"
    printf '    versionName=1.22.2_GIT\n'
    printf '      android.permission.READ_EXTERNAL_STORAGE: granted=true\n'
    printf '      android.permission.WRITE_EXTERNAL_STORAGE: granted=true\n'
    ;;
  *" install "*)
    if [[ -n "${ADB_INSTALL_SLEEP:-}" ]]; then sleep "$ADB_INSTALL_SLEEP"; fi
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
export RETROARCH_AAPT="$TMP/aapt"

"$INSTALL" serial-1

grep -q -- '-s serial-1 get-state' "$ADB_LOG"
grep -q -- '-s serial-1 install -r ' "$ADB_LOG"
grep -q -- 'settings put global verifier_verify_adb_installs 0' "$ADB_LOG"
grep -q -- 'settings put global verifier_verify_adb_installs 1' "$ADB_LOG"
[[ "$(grep -c 'pm path com.retroarch.aarch64' "$ADB_LOG")" == 2 ]]
grep -q 'pm path com.korri.retroarch' "$ADB_LOG"
grep -q 'dumpsys package com.korri.retroarch' "$ADB_LOG"
grep -q 'pm grant com.korri.retroarch android.permission.READ_EXTERNAL_STORAGE' "$ADB_LOG"
grep -q 'pm grant com.korri.retroarch android.permission.WRITE_EXTERNAL_STORAGE' "$ADB_LOG"
if grep -q 'uninstall' "$ADB_LOG"; then
  echo 'deployment must not uninstall RetroArch' >&2
  exit 1
fi

: > "$ADB_LOG"
if ADB_VERSION_CODE=41 "$INSTALL" serial-1 >/dev/null 2>&1; then
  echo 'expected installed version mismatch to fail deployment' >&2
  exit 1
fi
grep -q -- 'settings put global verifier_verify_adb_installs 1' "$ADB_LOG"

: > "$ADB_LOG"
if ADB_INSTALL_FAIL=1 "$INSTALL" serial-1 >/dev/null 2>&1; then
  echo 'expected failed adb install to fail deployment' >&2
  exit 1
fi
grep -q -- 'settings put global verifier_verify_adb_installs 1' "$ADB_LOG"
if grep -q 'uninstall' "$ADB_LOG"; then
  echo 'failed deployment must not uninstall RetroArch' >&2
  exit 1
fi

: > "$ADB_LOG"
if ADB_INSTALL_SLEEP=2 RETROARCH_INSTALL_TIMEOUT_SECONDS=1 \
    "$INSTALL" serial-1 >/dev/null 2>&1; then
  echo 'expected timed-out adb install to fail deployment' >&2
  exit 1
fi
grep -q -- 'settings put global verifier_verify_adb_installs 1' "$ADB_LOG"

printf 'RetroArch device install flow tests passed\n'
