#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$HERE/upstream"
CONFIG="$SOURCE/config.def.h"
CONFIGURATION="$SOURCE/configuration.c"
ACTIVITY="$SOURCE/pkg/android/phoenix/src/com/retroarch/browser/retroactivity/RetroActivityFuture.java"
MANIFEST="$SOURCE/pkg/android/phoenix/AndroidManifest.xml"
ANDROID_MK="$SOURCE/pkg/android/phoenix-common/jni/Android.mk"
COMMAND="$SOURCE/command.c"
COMMAND_HEADER="$SOURCE/command.h"
PLATFORM="$SOURCE/frontend/drivers/platform_unix.c"
ANDROID_INPUT="$SOURCE/input/drivers/android_input.c"

grep -q '#define DEFAULT_KIOSK_MODE_ENABLE true' "$CONFIG"
grep -q '#define DEFAULT_CONFIG_SAVE_ON_EXIT false' "$CONFIG"
grep -q '#define DEFAULT_QUIT_ON_CLOSE_CONTENT QUIT_ON_CLOSE_CONTENT_ENABLED' "$CONFIG"
grep -q '#define DEFAULT_QUIT_PRESS_TWICE false' "$CONFIG"
grep -q '#define DEFAULT_SAVESTATE_AUTO_SAVE true' "$CONFIG"
grep -q '#define DEFAULT_SAVESTATE_AUTO_LOAD true' "$CONFIG"
grep -q '#define DEFAULT_OVERLAY_ENABLE_AUTOPREFERRED false' "$CONFIG"
grep -q 'Korri runtime must not select Vulkan on Mali/Immortalis' "$CONFIGURATION"
grep -q 'Korri runtime has no touch overlay' "$CONFIGURATION"
grep -q 'getAssets().open("cores/mgba_libretro_android.so")' "$ACTIVITY"
grep -q 'installBundledCore();' "$ACTIVITY"
if grep -q 'target.exists() && !target.delete()' "$ACTIVITY"; then
  echo 'bundled core publish deletes the last-known-good core before replacement' >&2
  exit 1
fi
grep -q '!temporary.renameTo(target)' "$ACTIVITY"
grep -q 'android:name="com.korri.retroarch.permission.LAUNCH"' "$MANIFEST"
grep -q 'android:protectionLevel="signature"' "$MANIFEST"
grep -q 'RetroActivityFuture.*android:permission="com.korri.retroarch.permission.LAUNCH"' "$MANIFEST"
grep -q 'CoreSideloadActivity.*android:exported="false"' "$MANIFEST"
grep -q 'RetroActivityFuture.*android:launchMode="standard"' "$MANIFEST"
grep -q -- '-DHAVE_COMMAND' "$ANDROID_MK"
grep -q -- '-DHAVE_MENU' "$ANDROID_MK"
grep -q -- '-DHAVE_RGUI' "$ANDROID_MK"
grep -q 'case CMD_EVENT_MENU_TOGGLE:' "$SOURCE/retroarch.c"
grep -q '#define DEFAULT_NETWORK_CMD_ENABLE true' "$CONFIG"
grep -q 'Korri Android command channel is loopback-only' "$COMMAND"
grep -q 'command_network_set_token' "$COMMAND_HEADER"
grep -q 'strlen(token) == 64' "$COMMAND"
grep -q 'string_is_equal(buf, network_command_token)' "$COMMAND"
grep -q 'strcmp(command, "GET_STATUS")' "$COMMAND"
grep -q 'strcmp(command, "SHOW_MENU")' "$COMMAND"
grep -q 'strcmp(command, "QUIT")' "$COMMAND"
grep -q 'MENU_ST_FLAG_ALIVE' "$COMMAND"
grep -q 'command_event(CMD_EVENT_MENU_TOGGLE, NULL)' "$COMMAND"
grep -q 'SHOW_MENU OK' "$COMMAND"
grep -q 'SHOW_MENU ERROR' "$COMMAND"
grep -q 'QUIT OK' "$COMMAND"
grep -q 'Rejected unauthenticated Korri command' "$COMMAND"
grep -q 'Rejected command outside Korri allowlist' "$COMMAND"
auth_line="$(grep -n 'string_is_equal(buf, network_command_token)' "$COMMAND" | head -1 | cut -d: -f1)"
allowlist_line="$(grep -n 'strcmp(command, "SHOW_MENU")' "$COMMAND" | head -1 | cut -d: -f1)"
[[ "$auth_line" -lt "$allowlist_line" ]] || {
  echo 'RetroArch command authentication must precede allowlist selection' >&2
  exit 1
}
grep -q 'NewStringUTF(env, "KORRI_CONTROL_TOKEN")' "$PLATFORM"
grep -q 'if (string_is_empty(system_id))' "$COMMAND"
grep -q 'system_id = "unknown";' "$COMMAND"
grep -q 'Korri synchronously persists the auto state before Android pause' "$ANDROID_INPUT"
grep -q 'content_wait_for_save_state_task();' "$ANDROID_INPUT"

printf 'RetroArch patched source contract passed\n'
