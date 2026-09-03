#include "korri_certificate_control.h"
#include "crypto.h"

#include <nlohmann/json.hpp>

#include <array>
#include <atomic>
#include <cassert>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/un.h>
#include <unistd.h>

namespace kc = korri_certificate_control;
namespace fs = std::filesystem;
using namespace std::chrono_literals;

static std::string read_all(const char *path) {
  std::ifstream input(path, std::ios::binary);
  assert(input.good());
  return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

static void write_all(const fs::path &path, const std::string &contents) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  assert(output.good());
  output << contents;
  output.close();
  assert(output.good());
}

static fs::path temporary_directory() {
  std::array<char, 64> pattern {};
  const std::string source = "/tmp/korri-certificate-control-XXXXXX";
  assert(source.size() < pattern.size());
  std::copy(source.begin(), source.end(), pattern.begin());
  char *created = ::mkdtemp(pattern.data());
  assert(created != nullptr);
  return created;
}

static std::size_t residue_count(const fs::path &directory) {
  std::size_t count = 0;
  for (const auto &entry : fs::directory_iterator(directory)) {
    if (entry.path().filename().string().find(".korri-") != std::string::npos) {
      ++count;
    }
  }
  return count;
}

static std::string attest_frame(const std::string &host_uuid) {
  return std::string{"{\"operation\":\"attest\",\"hostUuid\":"}
      + kc::json_quote(host_uuid) + "}";
}

static std::string provision_frame(const std::string &certificate) {
  return std::string{"{\"operation\":\"provision\",\"hostUuid\":\"sunshine-host\",\"certificate\":"}
      + kc::json_quote(certificate) + "}";
}

static std::string revoke_frame(const std::string &certificate) {
  return std::string{"{\"operation\":\"revoke\",\"hostUuid\":\"sunshine-host\",\"certificate\":"}
      + kc::json_quote(certificate) + "}";
}

static std::string receive_packet(const int fd) {
  std::array<char, kc::max_frame_bytes + 1> response {};
  const auto size = ::recv(fd, response.data(), response.size(), 0);
  assert(size > 0);
  return {response.data(), static_cast<std::size_t>(size)};
}

int main(int argc, char **argv) {
  assert(argc == 4);
  const auto client_one = read_all(argv[1]);
  const auto client_two = read_all(argv[2]);
  const auto server = read_all(argv[3]);

  const auto matching_attestation = kc::parse_request(attest_frame("sunshine-host"), "sunshine-host");
  assert(matching_attestation.action == kc::operation::attest);
  assert(matching_attestation.host_matches);
  assert(matching_attestation.certificate.empty());
  const auto foreign_attestation = kc::parse_request(attest_frame("another-host"), "sunshine-host");
  assert(foreign_attestation.action == kc::operation::attest);
  assert(!foreign_attestation.host_matches);

  std::mutex attest_mutex;
  bool attest_snapshot_called = false;
  bool attest_commit_called = false;
  const auto matching_attest_response = kc::handle_serialized_request(
      attest_frame("sunshine-host"), "sunshine-host", server, attest_mutex,
      [&]() {
        attest_snapshot_called = true;
        return std::vector<kc::named_certificate>{};
      },
      [&](std::vector<kc::named_certificate>) {
        attest_commit_called = true;
        return true;
      },
      []() { return "unused"; });
  const auto matching_attest_json = nlohmann::json::parse(matching_attest_response);
  assert(matching_attest_json == nlohmann::json({{"status", "ok"}, {"matched", true}}));
  assert(matching_attest_response.find("serverCertificate") == std::string::npos);
  assert(!attest_snapshot_called);
  assert(!attest_commit_called);
  const auto foreign_attest_json = nlohmann::json::parse(kc::handle_serialized_request(
      attest_frame("another-host"), "sunshine-host", server, attest_mutex,
      []() { return std::vector<kc::named_certificate>{}; },
      [](std::vector<kc::named_certificate>) { return true; },
      []() { return "unused"; }));
  assert(foreign_attest_json == nlohmann::json({{"status", "ok"}, {"matched", false}}));

  const auto provision = kc::parse_request(provision_frame(client_one), "sunshine-host");
  assert(provision.action == kc::operation::provision);
  assert(provision.certificate == client_one);

  std::vector<kc::named_certificate> clients;
  unsigned next_uuid = 1;
  auto uuid_factory = [&]() { return "generated-" + std::to_string(next_uuid++); };
  assert(kc::apply_provision(clients, client_one, uuid_factory).changed);
  assert(clients.size() == 1);
  assert(clients[0].name == "Korri device");
  assert(clients[0].uuid == "generated-1");
  assert(clients[0].fingerprint.size() == 64);
  assert(!kc::apply_provision(clients, client_one, uuid_factory).changed);
  assert(clients.size() == 1);
  assert(next_uuid == 2);
  assert(kc::apply_provision(clients, client_two, uuid_factory).changed);
  assert(clients.size() == 2);
  assert(!kc::apply_revoke(clients, server).changed);
  assert(kc::apply_revoke(clients, client_one).changed);
  assert(clients.size() == 1);
  assert(!kc::apply_revoke(clients, client_one).changed);
  assert(kc::validate_single_certificate(server).fingerprint.size() == 64);

  for (const auto &bad : std::vector<std::string>{
           "",
           "not a certificate",
           std::string("garbage\n") + client_one,
           client_one + client_two,
           client_one + std::string("not-whitespace"),
           std::string("x\0y", 3),
       }) {
    bool rejected = false;
    try {
      (void) kc::validate_single_certificate(bad);
    } catch (const kc::protocol_error &) {
      rejected = true;
    }
    assert(rejected);
  }

  for (const auto &bad_frame : std::vector<std::string>{
           "{}",
           "[]",
           "{\"operation\":\"attest\",\"hostUuid\":\"sunshine-host\",\"certificate\":\"x\"}",
           "{\"operation\":\"attest\",\"hostUuid\":\"sunshine-host\",\"extra\":true}",
           "{\"operation\":\"unknown\",\"hostUuid\":\"sunshine-host\",\"certificate\":\"x\"}",
           std::string{"{\"operation\":\"provision\",\"hostUuid\":\"wrong-host\",\"certificate\":"}
               + kc::json_quote(client_one) + "}",
           std::string{"{\"operation\":\"provision\",\"hostUuid\":\"sunshine-host\",\"certificate\":"}
               + kc::json_quote(client_one) + ",\"extra\":true}",
       }) {
    bool rejected = false;
    try {
      (void) kc::parse_request(bad_frame, "sunshine-host");
    } catch (const kc::protocol_error &) {
      rejected = true;
    }
    assert(rejected);
  }

  const auto directory = temporary_directory();
  const auto state_path = directory / "sunshine_state.json";
  const std::string original = R"({"credentials":{"username":"kept"},"root":{"uniqueid":"old","other":{"value":7},"devices":[{"certs":[]}]},"unrelated":[1,2,3]})";
  const std::vector<kc::named_certificate> candidate_clients {
      {"Korri device", "client-1", client_one, {}},
  };
  const auto candidate = kc::build_state_document(original, "sunshine-host", candidate_clients);
  const auto parsed_candidate = nlohmann::json::parse(candidate);
  assert(parsed_candidate["credentials"]["username"] == "kept");
  assert(parsed_candidate["unrelated"] == nlohmann::json::array({1, 2, 3}));
  assert(parsed_candidate["root"]["other"]["value"] == 7);
  assert(parsed_candidate["root"]["uniqueid"] == "sunshine-host");
  assert(!parsed_candidate["root"].contains("devices"));
  assert(parsed_candidate["root"]["named_devices"].size() == 1);
  assert(parsed_candidate["root"]["named_devices"][0]["cert"] == client_one);

  for (const auto stage : {
           kc::fault_stage::write,
           kc::fault_stage::file_sync,
           kc::fault_stage::rename,
           kc::fault_stage::directory_sync,
           kc::fault_stage::activation,
       }) {
    write_all(state_path, original);
    bool activated = false;
    kc::fault_plan fault {stage, kc::fault_stage::none, false, false};
    const auto result = kc::replace_state_and_activate(
        state_path.string(), candidate, [&]() {
          activated = true;
          return true;
        }, &fault);
    assert(result == kc::transaction_result::failed);
    assert(fault.triggered);
    assert(!activated || stage == kc::fault_stage::activation);
    assert(nlohmann::json::parse(read_all(state_path.c_str())) == nlohmann::json::parse(original));
    assert(residue_count(directory) == 0);
  }

  write_all(state_path, original);
  const auto throwing_activation = kc::replace_state_and_activate(
      state_path.string(), candidate, []() -> bool {
        throw std::runtime_error("activation failed");
      });
  assert(throwing_activation == kc::transaction_result::failed);
  assert(nlohmann::json::parse(read_all(state_path.c_str())) == nlohmann::json::parse(original));
  assert(residue_count(directory) == 0);

  write_all(state_path, original);
  kc::fault_plan throwing_recovery_fault {
      kc::fault_stage::none,
      kc::fault_stage::restore_write,
      false,
      false,
  };
  const auto throwing_recovery = kc::replace_state_and_activate(
      state_path.string(), candidate, []() -> bool {
        throw std::runtime_error("activation failed");
      }, &throwing_recovery_fault);
  assert(throwing_recovery == kc::transaction_result::recovery_failed);
  assert(throwing_recovery_fault.recovery_triggered);
  std::atomic<bool> throwing_integrity_failed {false};
  bool throwing_fatal_stop_called = false;
  assert(!kc::accept_transaction_result(
      throwing_recovery, throwing_integrity_failed, [&]() {
        throwing_fatal_stop_called = true;
      }));
  assert(throwing_integrity_failed.load());
  assert(throwing_fatal_stop_called);

  for (const auto primary_stage : {
           kc::fault_stage::directory_sync,
           kc::fault_stage::activation,
       }) {
    for (const auto recovery_stage : {
             kc::fault_stage::restore_write,
             kc::fault_stage::restore_file_sync,
             kc::fault_stage::restore_rename,
             kc::fault_stage::restore_directory_sync,
         }) {
      write_all(state_path, original);
      kc::fault_plan fault {primary_stage, recovery_stage, false, false};
      const auto result = kc::replace_state_and_activate(
          state_path.string(), candidate, []() { return true; }, &fault);
      assert(result == kc::transaction_result::recovery_failed);
      assert(fault.triggered);
      assert(fault.recovery_triggered);
      // Restore writes are same-directory atomic replacements. Before its
      // rename, the complete candidate remains live. After its rename, the
      // complete prior document is live even if the directory sync fails.
      const auto live_state = read_all(state_path.c_str());
      if (recovery_stage == kc::fault_stage::restore_directory_sync) {
        assert(live_state == original);
      } else {
        assert(live_state == candidate);
      }
      assert(residue_count(directory) == 0);
      std::atomic<bool> integrity_failed {false};
      bool fatal_stop_called = false;
      assert(!kc::accept_transaction_result(result, integrity_failed, [&]() {
        fatal_stop_called = true;
      }));
      assert(integrity_failed.load());
      assert(fatal_stop_called);
      bool later_request_served = false;
      if (!integrity_failed.load()) {
        later_request_served = true;
      }
      assert(!later_request_served);
    }
  }

  const auto state_with_client = candidate;
  const auto empty_client_state = kc::build_state_document(
      state_with_client, "sunshine-host", {});
  write_all(state_path, state_with_client);
  bool erase_all_activated = false;
  kc::fault_plan erase_all_fault {kc::fault_stage::rename, kc::fault_stage::none, false, false};
  const auto erase_all_result = kc::replace_state_and_activate(
      state_path.string(), empty_client_state, [&]() {
        erase_all_activated = true;
        return true;
      }, &erase_all_fault);
  assert(erase_all_result == kc::transaction_result::failed);
  assert(!erase_all_activated);
  assert(nlohmann::json::parse(read_all(state_path.c_str())) == parsed_candidate);
  assert(residue_count(directory) == 0);

  write_all(state_path, original);
  bool activated = false;
  assert(kc::replace_state_and_activate(
             state_path.string(), candidate, [&]() {
               activated = true;
               return true;
             }) == kc::transaction_result::committed);
  assert(activated);
  assert(nlohmann::json::parse(read_all(state_path.c_str())) == parsed_candidate);
  assert(residue_count(directory) == 0);

  std::vector<kc::named_certificate> live_clients;
  std::mutex live_mutex;
  std::atomic<unsigned> generated {0};
  std::atomic<unsigned> commits {0};
  std::vector<std::thread> workers;
  std::vector<std::string> responses(12);
  write_all(state_path, original);
  for (std::size_t index = 0; index < responses.size(); ++index) {
    workers.emplace_back([&, index]() {
      responses[index] = kc::handle_serialized_request(
          provision_frame(client_one),
          "sunshine-host",
          server,
          live_mutex,
          [&]() { return live_clients; },
          [&](std::vector<kc::named_certificate> next) {
            const auto document = kc::build_state_document(original, "sunshine-host", next);
            const auto result = kc::replace_state_and_activate(
                state_path.string(), document, [&]() {
                  live_clients = std::move(next);
                  ++commits;
                  return true;
                });
            return result == kc::transaction_result::committed;
          },
          [&]() { return "concurrent-" + std::to_string(++generated); });
    });
  }
  for (auto &worker : workers) {
    worker.join();
  }
  assert(live_clients.size() == 1);
  assert(generated == 1);
  assert(commits == 1);
  std::size_t changed = 0;
  for (const auto &response : responses) {
    const auto parsed = nlohmann::json::parse(response);
    assert(parsed["status"] == "ok");
    changed += parsed["changed"].get<bool>() ? 1 : 0;
  }
  assert(changed == 1);
  assert(nlohmann::json::parse(read_all(state_path.c_str()))["root"]["named_devices"].size() == 1);

  const auto revoke_response = kc::handle_serialized_request(
      revoke_frame(client_one), "sunshine-host", server, live_mutex,
      [&]() { return live_clients; },
      [&](std::vector<kc::named_certificate> next) {
        live_clients = std::move(next);
        return true;
      },
      []() { return "unused"; });
  assert(nlohmann::json::parse(revoke_response)["changed"] == true);
  assert(live_clients.empty());

  const auto ok = kc::success_response(server, true);
  assert(ok.find(client_one) == std::string::npos);
  assert(ok.find("private") == std::string::npos);
  assert(ok.size() <= kc::max_frame_bytes);

  struct live_state {
    std::string marker;
  };
  live_state active_state {"old"};
  crypto::cert_chain_t active_chain;
  crypto::cert_chain_t candidate_chain;
  auto candidate_x509 = crypto::x509(client_one);
  assert(candidate_x509);
  candidate_chain.add(std::move(candidate_x509));
  assert(kc::activate_verified_state(
      active_state, active_chain, live_state{"new"}, std::move(candidate_chain),
      std::vector<std::string>{client_one},
      [](const std::string &certificate) { return crypto::x509(certificate); }));
  assert(active_state.marker == "new");
  auto accepted_client = crypto::x509(client_one);
  auto rejected_client = crypto::x509(client_two);
  assert(accepted_client && rejected_client);
  assert(active_chain.verify(accepted_client.get()) == nullptr);
  assert(active_chain.verify(rejected_client.get()) != nullptr);

  int sockets[2] {-1, -1};
  const auto socket_request = provision_frame(client_one);
  assert(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) == 0);
  bool handled = false;
  std::thread packet_server([&]() {
    assert(kc::serve_one_packet(
               sockets[0], ::getuid(), ::getgid(), [&](const std::string &frame) {
                 handled = true;
                 assert(kc::parse_request(frame, "sunshine-host").action == kc::operation::provision);
                 return kc::success_response(server, true);
               }) == kc::packet_result::responded);
  });
  assert(::send(sockets[1], socket_request.data(), socket_request.size(), MSG_NOSIGNAL)
      == static_cast<ssize_t>(socket_request.size()));
  assert(receive_packet(sockets[1]).find("serverCertificate") != std::string::npos);
  packet_server.join();
  assert(handled);
  ::close(sockets[0]);
  ::close(sockets[1]);

  for (const auto wrong_identity : {0, 1}) {
    assert(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) == 0);
    assert(::send(sockets[1], socket_request.data(), socket_request.size(), MSG_NOSIGNAL)
        == static_cast<ssize_t>(socket_request.size()));
    handled = false;
    const auto expected_uid = wrong_identity == 0 ? static_cast<uid_t>(::getuid() + 1) : ::getuid();
    const auto expected_gid = wrong_identity == 1 ? static_cast<gid_t>(::getgid() + 1) : ::getgid();
    assert(kc::serve_one_packet(sockets[0], expected_uid, expected_gid, [&](const std::string &) {
             handled = true;
             return std::string{};
           }) == kc::packet_result::rejected_peer);
    assert(!handled);
    ::close(sockets[0]);
    ::close(sockets[1]);
  }

  assert(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) == 0);
  std::string oversized(kc::max_frame_bytes + 1, 'x');
  assert(::send(sockets[1], oversized.data(), oversized.size(), MSG_NOSIGNAL)
      == static_cast<ssize_t>(oversized.size()));
  handled = false;
  assert(kc::serve_one_packet(sockets[0], ::getuid(), ::getgid(), [&](const std::string &) {
           handled = true;
           return std::string{};
         }) == kc::packet_result::responded);
  assert(!handled);
  assert(nlohmann::json::parse(receive_packet(sockets[1]))["code"] == "InvalidFrame");
  ::close(sockets[0]);
  ::close(sockets[1]);

  assert(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) == 0);
  assert(::send(sockets[1], socket_request.data(), socket_request.size(), MSG_NOSIGNAL)
      == static_cast<ssize_t>(socket_request.size()));
  assert(::send(sockets[1], socket_request.data(), socket_request.size(), MSG_NOSIGNAL)
      == static_cast<ssize_t>(socket_request.size()));
  handled = false;
  assert(kc::serve_one_packet(sockets[0], ::getuid(), ::getgid(), [&](const std::string &) {
           handled = true;
           return std::string{};
         }) == kc::packet_result::responded);
  assert(!handled);
  assert(nlohmann::json::parse(receive_packet(sockets[1]))["code"] == "InvalidFrame");
  ::close(sockets[0]);
  ::close(sockets[1]);

  assert(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) == 0);
  const auto idle_start = std::chrono::steady_clock::now();
  assert(kc::serve_one_packet(sockets[0], ::getuid(), ::getgid(), [&](const std::string &) {
           return std::string{};
         }) == kc::packet_result::no_packet);
  const auto idle_elapsed = std::chrono::steady_clock::now() - idle_start;
  assert(idle_elapsed >= 200ms);
  assert(idle_elapsed < 1s);
  ::close(sockets[0]);
  ::close(sockets[1]);

  const auto socket_path = directory / "control.sock";
  const int listener = ::socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  assert(listener >= 0);
  sockaddr_un address {};
  address.sun_family = AF_UNIX;
  const auto path_string = socket_path.string();
  assert(path_string.size() < sizeof(address.sun_path));
  std::copy(path_string.begin(), path_string.end(), address.sun_path);
  assert(::bind(listener, reinterpret_cast<const sockaddr *>(&address), sizeof(address)) == 0);
  assert(::chmod(socket_path.c_str(), 0600) == 0);
  assert(::listen(listener, 4) == 0);
  assert(kc::select_systemd_descriptor(1, "korri-certificate-control") == 3);
  assert(!kc::select_systemd_descriptor(0, "korri-certificate-control"));
  assert(!kc::select_systemd_descriptor(2, "korri-certificate-control:other"));
  assert(!kc::select_systemd_descriptor(2, "other:korri-certificate-control"));
  assert(!kc::select_systemd_descriptor(1, ""));
  assert(!kc::select_systemd_descriptor(1, "wrong"));
  assert(kc::validate_and_harden_listening_descriptor(
      listener, path_string, ::getuid(), 0600));
  assert(!kc::validate_and_harden_listening_descriptor(
      listener, (directory / "wrong.sock").string(), ::getuid(), 0600));
  assert(!kc::validate_and_harden_listening_descriptor(
      listener, path_string, static_cast<uid_t>(::getuid() + 1), 0600));
  assert(!kc::validate_and_harden_listening_descriptor(
      listener, path_string, ::getuid(), 0660));

  assert(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, sockets) == 0);
  assert(!kc::validate_and_harden_listening_descriptor(
      sockets[0], path_string, ::getuid(), 0600));
  ::close(sockets[0]);
  ::close(sockets[1]);
  const int stream_listener = ::socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  assert(stream_listener >= 0);
  assert(!kc::validate_and_harden_listening_descriptor(
      stream_listener, path_string, ::getuid(), 0600));
  ::close(stream_listener);

  const int abstract_listener = ::socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
  assert(abstract_listener >= 0);
  sockaddr_un abstract_address {};
  abstract_address.sun_family = AF_UNIX;
  const std::string abstract_name = "korri-certificate-control-test";
  std::copy(abstract_name.begin(), abstract_name.end(), abstract_address.sun_path + 1);
  const auto abstract_size = static_cast<socklen_t>(
      offsetof(sockaddr_un, sun_path) + 1 + abstract_name.size());
  assert(::bind(abstract_listener, reinterpret_cast<const sockaddr *>(&abstract_address),
                abstract_size) == 0);
  assert(::listen(abstract_listener, 4) == 0);
  assert(!kc::validate_and_harden_listening_descriptor(
      abstract_listener, path_string, ::getuid(), 0600));
  ::close(abstract_listener);

  std::atomic<bool> stop {false};
  const auto shutdown_start = std::chrono::steady_clock::now();
  std::thread listener_thread([&]() {
    kc::serve_listener(listener, ::getuid(), ::getgid(), [&]() { return stop.load(); },
                       [&](const std::string &) { return kc::error_response("Unexpected"); });
  });
  std::this_thread::sleep_for(30ms);
  stop = true;
  listener_thread.join();
  assert(std::chrono::steady_clock::now() - shutdown_start < 500ms);
  ::close(listener);
  ::unlink(socket_path.c_str());

  fs::remove_all(directory);
  return 0;
}
