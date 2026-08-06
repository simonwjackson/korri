#!/usr/bin/env bash
# Sourceable helpers for deciding Android `am instrument -w` completion.

korri_android_instrumentation_passed() {
  local status="$1"
  local log_file="$2"

  [[ "$status" -eq 0 ]] || return 1
  if grep -E 'FAILURES!!!|INSTRUMENTATION_FAILED' "$log_file" >/dev/null; then
    return 1
  fi
  grep -E 'OK \([[:space:]]*1 test[s]?\)' "$log_file" >/dev/null
}
