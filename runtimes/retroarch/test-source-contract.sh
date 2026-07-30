#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$HERE/upstream"
CONFIG="$SOURCE/config.def.h"
CONFIGURATION="$SOURCE/configuration.c"
ACTIVITY="$SOURCE/pkg/android/phoenix/src/com/retroarch/browser/retroactivity/RetroActivityFuture.java"
ANDROID_MK="$SOURCE/pkg/android/phoenix-common/jni/Android.mk"
COMMAND="$SOURCE/command.c"

grep -q '#define DEFAULT_KIOSK_MODE_ENABLE true' "$CONFIG"
grep -q '#define DEFAULT_CONFIG_SAVE_ON_EXIT false' "$CONFIG"
grep -q '#define DEFAULT_QUIT_ON_CLOSE_CONTENT QUIT_ON_CLOSE_CONTENT_ENABLED' "$CONFIG"
grep -q '#define DEFAULT_SAVESTATE_AUTO_SAVE true' "$CONFIG"
grep -q '#define DEFAULT_SAVESTATE_AUTO_LOAD true' "$CONFIG"
grep -q '#define DEFAULT_OVERLAY_ENABLE_AUTOPREFERRED false' "$CONFIG"
grep -q 'Korri runtime must not select Vulkan on Mali/Immortalis' "$CONFIGURATION"
grep -q 'Korri runtime has no touch overlay' "$CONFIGURATION"
grep -q 'getAssets().open("cores/mgba_libretro_android.so")' "$ACTIVITY"
grep -q 'installBundledCore();' "$ACTIVITY"
grep -q -- '-DHAVE_COMMAND' "$ANDROID_MK"
grep -q '#define DEFAULT_NETWORK_CMD_ENABLE true' "$CONFIG"
grep -q 'Korri Android command channel is loopback-only' "$COMMAND"
grep -q 'strcmp(buf, "GET_STATUS")' "$COMMAND"
grep -q 'strcmp(buf, "QUIT")' "$COMMAND"
grep -q 'Rejected command outside Korri allowlist' "$COMMAND"
grep -q 'if (string_is_empty(system_id))' "$COMMAND"
grep -q 'system_id = "unknown";' "$COMMAND"

printf 'RetroArch patched source contract passed\n'
