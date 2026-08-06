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
DIAGNOSTICS_PATCH="$HERE/patches/0013-secret-free-control-diagnostics.patch"
CONTENT_IDENTITY_PATCH="$HERE/patches/0014-report-full-content-leaf.patch"

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
grep -q 'strlen(token) != 64' "$COMMAND"
grep -q '#define KORRI_REQUEST_SIZE (1 + KORRI_NONCE_SIZE + 1 + KORRI_MAC_SIZE)' "$COMMAND"
grep -q 'sha256_hash(inner_hex' "$COMMAND"
grep -q 'korri_hmac_sha256' "$COMMAND"
grep -q 'korri_constant_time_equal' "$COMMAND"
grep -q '#define KORRI_NONCE_WINDOW_SIZE 32' "$COMMAND"
grep -q 'request_nonces\[KORRI_NONCE_WINDOW_SIZE\]\[KORRI_NONCE_SIZE\]' "$COMMAND"
grep -q 'korri_nonce_seen' "$COMMAND"
grep -q 'korri_remember_nonce' "$COMMAND"
grep -q 'korri_reset_nonce_window();' "$COMMAND"
grep -q 'request_nonce_cursor = (request_nonce_cursor + 1) % KORRI_NONCE_WINDOW_SIZE' "$COMMAND"
grep -q 'Rejected replayed Korri command' "$COMMAND"
grep -q 'ret != KORRI_REQUEST_SIZE' "$COMMAND"
grep -q 'case 1: command = "GET_STATUS"' "$COMMAND"
grep -q 'case 2: command = "SHOW_MENU"' "$COMMAND"
grep -q 'case 3: command = "QUIT"' "$COMMAND"
auth_line="$(grep -n 'korri_constant_time_equal(expected_mac' "$COMMAND" | head -1 | cut -d: -f1)"
replay_line="$(grep -n 'korri_nonce_seen(buf + 1)' "$COMMAND" | head -1 | cut -d: -f1)"
insert_line="$(grep -n 'korri_remember_nonce(buf + 1)' "$COMMAND" | head -1 | cut -d: -f1)"
allowlist_line="$(grep -n 'case 1: command = "GET_STATUS"' "$COMMAND" | head -1 | cut -d: -f1)"
[[ "$auth_line" -lt "$replay_line" && "$replay_line" -lt "$insert_line" && "$insert_line" -lt "$allowlist_line" ]] || {
  echo 'RetroArch command authentication and replay rejection must precede allowlist selection' >&2
  exit 1
}
grep -q 'if (len > KORRI_MAX_RESULT_SIZE)' "$COMMAND"
grep -q 'MENU_ST_FLAG_ALIVE' "$COMMAND"
grep -q 'menu_st->selection_ptr' "$COMMAND"
grep -q 'crc32=%08lx,menu=%u,selection=%lu' "$COMMAND"
grep -q 'GET_STATUS CONTENTLESS menu=%u,selection=%lu' "$COMMAND"
status_function="$(sed -n '/^bool command_get_status(command_t \*cmd, const char\* arg)/,/^}/p' "$COMMAND")"
grep -Fq 'const char *content_path       = path_get(RARCH_PATH_CONTENT);' <<<"$status_function"
grep -Fq 'content_leaf = path_basename(path_get(RARCH_PATH_CONTENT));' <<<"$status_function"
grep -Fq 'if ((flags & CONTENT_ST_FLAG_IS_INITED) && content_leaf)' <<<"$status_function"
grep -Fq 'strlcpy(reply + _len, content_leaf, sizeof(reply) - _len)' <<<"$status_function"
grep -Fq 'string_is_equal(content_leaf, ".")' <<<"$status_function"
grep -Fq 'string_is_equal(content_leaf, "..")' <<<"$status_function"
grep -Fq "strchr(content_leaf, '/')" <<<"$status_function"
grep -Fq "strchr(content_leaf, '\\\\')" <<<"$status_function"
grep -Fq "strchr(content_leaf, ',')" <<<"$status_function"
grep -Fq "strchr(content_leaf, '\\r')" <<<"$status_function"
grep -Fq "strchr(content_leaf, '\\n')" <<<"$status_function"
if grep -Fq 'RARCH_PATH_BASENAME' <<<"$status_function"; then
  echo 'RetroArch status must not use the extension-stripping RARCH_PATH_BASENAME' >&2
  exit 1
fi
if grep -Eq '(strlcpy|snprintf).*content_path' <<<"$status_function"; then
  echo 'RetroArch status must never serialize the content directory or full path' >&2
  exit 1
fi
grep -Eq '^\+.*content_leaf = path_basename\(path_get\(RARCH_PATH_CONTENT\)\);' "$CONTENT_IDENTITY_PATCH"
grep -q '0014-report-full-content-leaf.patch' "$HERE/patches/README.md"
grep -q 'command_event(CMD_EVENT_MENU_TOGGLE, NULL)' "$COMMAND"
grep -q 'SHOW_MENU OK' "$COMMAND"
grep -q 'SHOW_MENU ERROR' "$COMMAND"
grep -q 'QUIT OK' "$COMMAND"
grep -q 'Rejected unauthenticated Korri command' "$COMMAND"
grep -q 'Korri listener ready authority=%s' "$COMMAND"
grep -q 'Korri authenticated request accepted command=%u' "$COMMAND"
grep -q 'Korri authenticated reply attempted command=%u length=%lu' "$COMMAND"
grep -q 'Korri authenticated reply sent command=%u length=%lu' "$COMMAND"
grep -q 'Korri listener ready authority=%s' "$DIAGNOSTICS_PATCH"
grep -q 'Korri authenticated request accepted command=%u' "$DIAGNOSTICS_PATCH"
grep -q 'Korri authenticated reply sent command=%u length=%lu' "$DIAGNOSTICS_PATCH"
diagnostic_lines="$(grep -E 'Korri (listener ready|authenticated request accepted|authenticated reply (attempted|sent))' "$COMMAND")"
if grep -Eqi 'token|nonce|frame|payload|capability|path|port' <<<"$diagnostic_lines"; then
  echo 'RetroArch control diagnostics contain secret or endpoint material' >&2
  exit 1
fi
grep -q 'korri_secure_wipe(network_command_token, sizeof(network_command_token))' "$COMMAND"
grep -q 'korri_secure_wipe(netcmd->token, sizeof(netcmd->token))' "$COMMAND"
if grep -q 'string_is_equal(buf, network_command_token)' "$COMMAND"; then
  echo 'RetroArch control token must never be sent over UDP' >&2
  exit 1
fi
grep -q 'NewStringUTF(env, "KORRI_CONTROL_TOKEN")' "$PLATFORM"
grep -q 'GetMethodID(env, intent_class, "removeExtra"' "$PLATFORM"
grep -q 'CallVoidMethod(env, obj, remove_extra, token_key)' "$PLATFORM"
grep -q 'if (string_is_empty(system_id))' "$COMMAND"
grep -q 'system_id = "unknown";' "$COMMAND"
grep -q 'Korri synchronously persists the auto state before Android pause' "$ANDROID_INPUT"
grep -q 'content_wait_for_save_state_task();' "$ANDROID_INPUT"

printf 'RetroArch patched source contract passed\n'
