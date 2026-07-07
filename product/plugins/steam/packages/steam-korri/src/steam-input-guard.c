#define _GNU_SOURCE

#include <dlfcn.h>
#include <errno.h>
#include <linux/input.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <unistd.h>

static ssize_t (*real_read_fn)(int, void *, size_t) = NULL;
static int (*real_ioctl_fn)(int, unsigned long, void *) = NULL;

static bool env_enabled(const char *name, bool default_value) {
  const char *value = getenv(name);
  if (value == NULL || value[0] == '\0') return default_value;
  return !(strcmp(value, "0") == 0 || strcasecmp(value, "false") == 0 ||
           strcasecmp(value, "no") == 0 || strcasecmp(value, "off") == 0);
}

static bool guard_enabled(void) {
  return env_enabled("KORRI_STEAM_INPUT_GUARD", true);
}

static bool debug_enabled(void) {
  return env_enabled("KORRI_STEAM_INPUT_GUARD_DEBUG", false);
}

static bool is_linux_input_event_fd(int fd) {
  struct stat st;
  if (fstat(fd, &st) != 0) return false;
  if (!S_ISCHR(st.st_mode)) return false;

  // Linux input event nodes are character devices on major 13 with event-node
  // minors starting at 64. This intentionally excludes /dev/uinput (major 10)
  // so Steam can still create its virtual pads.
  return major(st.st_rdev) == 13 && minor(st.st_rdev) >= 64;
}

static void resolve_read(void) {
  if (real_read_fn == NULL) {
    real_read_fn = (ssize_t(*)(int, void *, size_t))dlsym(RTLD_NEXT, "read");
  }
}

static void resolve_ioctl(void) {
  if (real_ioctl_fn == NULL) {
    real_ioctl_fn = (int (*)(int, unsigned long, void *))dlsym(RTLD_NEXT, "ioctl");
  }
}

ssize_t read(int fd, void *buf, size_t count) {
  resolve_read();
  if (real_read_fn == NULL) {
    errno = ENOSYS;
    return -1;
  }

  ssize_t bytes = real_read_fn(fd, buf, count);
  if (bytes <= 0 || !guard_enabled()) return bytes;
  if (((size_t)bytes % sizeof(struct input_event)) != 0) return bytes;
  if (!is_linux_input_event_fd(fd)) return bytes;

  struct input_event *events = (struct input_event *)buf;
  size_t event_count = (size_t)bytes / sizeof(struct input_event);
  size_t filtered = 0;

  for (size_t i = 0; i < event_count; i++) {
    if (events[i].type == EV_KEY && events[i].code == BTN_MODE) {
      // Reserve physical Home/Guide for Korri. Keep the read size stable by
      // replacing the button event with a harmless sync marker instead of
      // shortening the stream; evdev readers already tolerate SYN_REPORT.
      events[i].type = EV_SYN;
      events[i].code = SYN_REPORT;
      events[i].value = 0;
      filtered++;
    }
  }

  if (filtered > 0 && debug_enabled()) {
    fprintf(stderr,
            "korri-steam-input-guard: filtered %zu BTN_MODE event(s) on fd %d\n",
            filtered, fd);
  }

  return bytes;
}

int ioctl(int fd, unsigned long request, ...) {
  if (guard_enabled() && request == EVIOCGRAB && is_linux_input_event_fd(fd)) {
    if (debug_enabled()) {
      fprintf(stderr,
              "korri-steam-input-guard: no-op EVIOCGRAB on input fd %d\n",
              fd);
    }
    return 0;
  }

  void *arg = NULL;
  va_list ap;
  va_start(ap, request);
  if (_IOC_DIR(request) != _IOC_NONE) {
    arg = va_arg(ap, void *);
  }
  va_end(ap);

  resolve_ioctl();
  if (real_ioctl_fn == NULL) {
    errno = ENOSYS;
    return -1;
  }
  return real_ioctl_fn(fd, request, arg);
}
