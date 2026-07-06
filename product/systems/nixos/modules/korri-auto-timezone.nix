# Korri appliances derive their timezone automatically.
#
# Timezone is location state, not configuration: handheld appliances travel
# across timezones, so shipping a hardcoded zone is wrong for every user
# outside it. The nix-on-rocks guest substrate deliberately leaves
# `time.timeZone` unset (UTC by default) and treats local-time derivation as
# downstream product policy. This module is that policy for Korri: importing
# it opts a platform into IP-geolocation-based detection via the upstream
# tzupdate service — a oneshot after network-online plus an hourly re-check
# timer — so devices that cross borders converge on the local zone without
# user action. The upstream module also forces `time.timeZone = null`, which
# keeps imperative `timedatectl set-timezone` available as a manual override
# between re-checks.
{ ... }:
{
  key = "korri-auto-timezone";

  services.tzupdate.enable = true;
}
