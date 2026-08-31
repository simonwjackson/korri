#include <array>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <optional>
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
