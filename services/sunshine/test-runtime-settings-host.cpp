#include <boost/asio.hpp>
#include <array>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <memory>
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

struct Session : std::enable_shared_from_this<Session> {
  explicit Session(boost::asio::io_context& io, int& delivered)
      : timer(io), delivered(delivered) {}
  boost::asio::steady_timer timer;
  std::uint32_t pending{};
  bool armed{};
  int& delivered;
  void query(std::uint32_t id) {
    pending = id;
    if (armed) return;
    armed = true;
    timer.expires_after(5ms);
    std::weak_ptr<Session> weak = shared_from_this();
    timer.async_wait([weak](const boost::system::error_code& error) {
      if (error) return;
      if (auto owner = weak.lock()) {
        owner->armed = false;
        owner->delivered = static_cast<int>(owner->pending);
      }
    });
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

  boost::asio::io_context io;
  int delivered = 0;
  {
    auto session = std::make_shared<Session>(io, delivered);
    for (std::uint32_t id = 1; id <= 1000; ++id) session->query(id);
    assert(session->armed);
  }
  io.run_for(20ms);
  assert(delivered == 0); // destruction cancels safe weak delivery

  io.restart();
  auto session = std::make_shared<Session>(io, delivered);
  for (std::uint32_t id = 1; id <= 1000; ++id) session->query(id);
  io.run_for(20ms);
  assert(delivered == 1000); // one bounded task coalesces the flood
}
