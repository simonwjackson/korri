#include <array>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <limits>
#include <optional>
#include <string>
#include <vector>

using namespace std::chrono_literals;

#pragma pack(push, 1)
struct Prefix { std::uint32_t request_id; std::uint16_t operation; std::uint16_t reserved; };
struct ValueRequest { Prefix prefix; std::uint32_t value; };
struct ResolutionRequest { Prefix prefix; std::uint32_t width; std::uint32_t height; };
#pragma pack(pop)

static bool valid(const std::vector<std::uint8_t>& bytes) {
  if (bytes.size() < sizeof(Prefix)) return false;
  Prefix prefix{};
  std::memcpy(&prefix, bytes.data(), sizeof(prefix));
  std::size_t expected = sizeof(Prefix);
  if (prefix.operation == 3) expected = sizeof(ResolutionRequest);
  else if (prefix.operation == 1 || prefix.operation == 2) expected = sizeof(ValueRequest);
  return prefix.request_id > 0 && prefix.reserved == 0 && bytes.size() == expected;
}

template<class T> static std::vector<std::uint8_t> bytes(T value, std::size_t extra = 0) {
  std::vector<std::uint8_t> result(sizeof(T) + extra);
  std::memcpy(result.data(), &value, sizeof(T));
  return result;
}

struct NvencRateControl {
  bool dynamic_supported{true};
  bool constant_qp{};
  bool driver_succeeds{true};
  std::uint32_t average_bps{7'308'000};
  std::uint32_t max_bps{7'308'000};
  std::uint32_t vbv_buffer{121'800};
};

static bool reconfigure_nvenc(NvencRateControl& active, std::uint32_t bitrate_kbps,
                              std::uint32_t fps = 60, std::uint32_t vbv_increase_percent = 0) {
  if (bitrate_kbps < 500 || bitrate_kbps > 150'000 || fps == 0 ||
      !active.dynamic_supported || active.constant_qp || active.average_bps == 0 ||
      active.max_bps == 0 || active.vbv_buffer == 0) return false;
  const std::uint64_t requested = static_cast<std::uint64_t>(bitrate_kbps) * 1000;
  if (requested == 0 || requested > std::numeric_limits<std::uint32_t>::max()) return false;

  auto candidate = active;
  auto scaled = fps > 0 ? requested / fps : 0;
  if (scaled > 0 && vbv_increase_percent > 0) {
    scaled += scaled * vbv_increase_percent / 100;
  }
  if (scaled == 0 || scaled > std::numeric_limits<std::uint32_t>::max()) return false;
  candidate.average_bps = static_cast<std::uint32_t>(requested);
  candidate.max_bps = static_cast<std::uint32_t>(requested);
  candidate.vbv_buffer = static_cast<std::uint32_t>(scaled);

  if (!active.driver_succeeds) return false;
  active = candidate;
  return true;
}

std::optional<std::string> chooseEncoder(
  std::string requested,
  bool requestedWorks,
  bool strict,
  std::string fallback
) {
  if (requestedWorks) return requested;
  if (strict) return std::nullopt;
  return fallback;
}

struct NvencAttemptLimiter {
  std::optional<std::chrono::steady_clock::time_point> completed;
  bool blocked{};

  bool allowed(std::chrono::steady_clock::time_point now) const {
    return !blocked && (!completed || now - *completed >= 500ms);
  }

  void finish(std::chrono::steady_clock::time_point started,
              std::chrono::steady_clock::time_point finished,
              bool success) {
    completed = finished;
    if (!success || finished - started > 100ms) blocked = true;
  }

  void reset_for_recreated_encoder() {
    completed.reset();
    blocked = false;
  }
};

struct SerializedCapabilityAck {
  bool pending{};
  bool enabled{};
  std::uint32_t newest_request_id{};
  std::chrono::steady_clock::time_point due{};
  int delivered{};

  void query(std::uint32_t request_id, bool next_enabled,
             std::chrono::steady_clock::time_point now) {
    newest_request_id = request_id;
    enabled = next_enabled;
    if (!pending) {
      pending = true;
      due = now + 100ms;
    }
  }

  void process(std::chrono::steady_clock::time_point now, bool connected) {
    if (!pending || now < due) return;
    pending = false;
    if (connected) delivered = static_cast<int>(newest_request_id);
  }
};

int main() {
  assert(chooseEncoder("nvenc", true, true, "vaapi") == "nvenc");
  assert(!chooseEncoder("nvenc", false, true, "vaapi"));
  assert(chooseEncoder("nvenc", false, false, "vaapi") == "vaapi");

  NvencRateControl nvenc;
  assert(reconfigure_nvenc(nvenc, 1000));
  assert(nvenc.average_bps == 1'000'000);
  assert(nvenc.max_bps == 1'000'000);
  assert(nvenc.vbv_buffer == 16'666); // preserve Sunshine's one-frame VBV policy
  assert(reconfigure_nvenc(nvenc, 7308));
  assert(nvenc.vbv_buffer == 121'800); // restore has no cumulative rounding drift

  NvencRateControl increased_vbv;
  assert(reconfigure_nvenc(increased_vbv, 1000, 60, 20));
  assert(increased_vbv.vbv_buffer == 19'999);

  NvencRateControl driver_failure;
  driver_failure.driver_succeeds = false;
  const auto driver_failure_before = driver_failure;
  assert(!reconfigure_nvenc(driver_failure, 1000));
  assert(driver_failure.average_bps == driver_failure_before.average_bps);
  assert(driver_failure.max_bps == driver_failure_before.max_bps);
  assert(driver_failure.vbv_buffer == driver_failure_before.vbv_buffer);

  NvencRateControl unsupported;
  unsupported.dynamic_supported = false;
  assert(!reconfigure_nvenc(unsupported, 1000));
  NvencRateControl const_qp;
  const_qp.constant_qp = true;
  assert(!reconfigure_nvenc(const_qp, 1000));
  assert(reconfigure_nvenc(nvenc, 500));
  assert(reconfigure_nvenc(nvenc, 150'000));
  assert(!reconfigure_nvenc(nvenc, 499));
  assert(!reconfigure_nvenc(nvenc, 150'001));
  assert(!reconfigure_nvenc(nvenc, 1000, 0));

  const auto reconfigured_at = std::chrono::steady_clock::now();
  NvencAttemptLimiter limiter;
  assert(limiter.allowed(reconfigured_at));
  limiter.finish(reconfigured_at, reconfigured_at + 20ms, true);
  assert(!limiter.allowed(reconfigured_at + 519ms));
  assert(limiter.allowed(reconfigured_at + 520ms));

  NvencAttemptLimiter failed_limiter;
  failed_limiter.finish(reconfigured_at, reconfigured_at + 20ms, false);
  assert(!failed_limiter.allowed(reconfigured_at + 10s));

  NvencAttemptLimiter slow_limiter;
  slow_limiter.finish(reconfigured_at, reconfigured_at + 101ms, true);
  assert(!slow_limiter.allowed(reconfigured_at + 10s));
  slow_limiter.reset_for_recreated_encoder();
  assert(slow_limiter.allowed(reconfigured_at + 102ms));

  assert(valid(bytes(Prefix{1, 0, 0})));
  assert(valid(bytes(ValueRequest{{1, 1, 0}, 500})));
  assert(valid(bytes(ValueRequest{{1, 2, 0}, 60})));
  assert(valid(bytes(ResolutionRequest{{1, 3, 0}, 1280, 720})));
  assert(!valid(bytes(Prefix{0, 0, 0})));
  assert(!valid(bytes(Prefix{1, 0, 1})));
  assert(!valid(bytes(Prefix{1, 0, 0}, 1)));
  assert(!valid(bytes(ValueRequest{{1, 1, 0}, 500}, 1)));
  assert(!valid(bytes(ValueRequest{{1, 2, 0}, 60}, 1)));
  assert(!valid(bytes(ResolutionRequest{{1, 3, 0}, 1280, 720}, 1)));
  assert(!valid(bytes(Prefix{1, 1, 0})));
  assert(!valid(bytes(ValueRequest{{1, 3, 0}, 1})));
  assert(!valid(bytes(ValueRequest{{1, 99, 0}, 1})));

  const auto now = std::chrono::steady_clock::now();
  SerializedCapabilityAck disconnected;
  disconnected.query(7, true, now);
  disconnected.process(now + 99ms, false);
  assert(disconnected.pending);
  disconnected.process(now + 100ms, false);
  assert(!disconnected.pending);
  assert(disconnected.delivered == 0); // removal/disconnect before due drops the ACK

  SerializedCapabilityAck coalesced;
  for (std::uint32_t id = 1; id <= 1000; ++id) {
    coalesced.query(id, true, now);
  }
  assert(coalesced.pending);
  assert(coalesced.newest_request_id == 1000);
  assert(coalesced.due == now + 100ms); // flood does not extend or multiply work
  coalesced.process(now + 99ms, true);
  assert(coalesced.delivered == 0);
  coalesced.process(now + 100ms, true);
  assert(coalesced.delivered == 1000);
  assert(!coalesced.pending);
}
