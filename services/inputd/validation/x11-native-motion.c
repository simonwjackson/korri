#define _POSIX_C_SOURCE 200809L

#include <X11/Xlib.h>
#include <errno.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static volatile sig_atomic_t running = 1;

static void stop(int signal_number) {
  (void) signal_number;
  running = 0;
}

static int parse_positive(const char *value, const char *name) {
  char *end = NULL;
  long parsed = strtol(value, &end, 10);
  if (!value[0] || !end || *end || parsed < 1 || parsed > 10000) {
    fprintf(stderr, "invalid %s: %s\n", name, value);
    exit(2);
  }
  return (int) parsed;
}

static struct timespec add_nanoseconds(struct timespec value, int64_t nanoseconds) {
  value.tv_nsec += nanoseconds;
  while (value.tv_nsec >= 1000000000L) {
    value.tv_nsec -= 1000000000L;
    value.tv_sec += 1;
  }
  return value;
}

static double elapsed_seconds(struct timespec start, struct timespec end) {
  return (double) (end.tv_sec - start.tv_sec) +
         (double) (end.tv_nsec - start.tv_nsec) / 1000000000.0;
}

static void request_fullscreen(Display *display, Window window, Window root) {
  Atom state = XInternAtom(display, "_NET_WM_STATE", False);
  Atom fullscreen = XInternAtom(display, "_NET_WM_STATE_FULLSCREEN", False);
  XEvent event;
  memset(&event, 0, sizeof(event));
  event.type = ClientMessage;
  event.xclient.window = window;
  event.xclient.message_type = state;
  event.xclient.format = 32;
  event.xclient.data.l[0] = 1;
  event.xclient.data.l[1] = (long) fullscreen;
  event.xclient.data.l[3] = 1;
  XSendEvent(
    display,
    root,
    False,
    SubstructureRedirectMask | SubstructureNotifyMask,
    &event
  );
}

static void draw_background(Display *display, Window window, GC gc, int width, int height) {
  static const unsigned long colors[] = {
    0x171926,
    0x202c55,
    0x174f55,
    0x5b3b66,
    0x60471f,
    0x263f25,
  };
  int count = (int) (sizeof(colors) / sizeof(colors[0]));
  int band_width = (width + count - 1) / count;
  for (int index = 0; index < count; ++index) {
    XSetForeground(display, gc, colors[index]);
    XFillRectangle(display, window, gc, index * band_width, 0, (unsigned int) band_width, (unsigned int) height);
  }
}

int main(int argc, char **argv) {
  if (argc != 4 && !(argc == 5 && strcmp(argv[4], "--fullscreen") == 0)) {
    fprintf(stderr, "usage: %s WIDTH HEIGHT FPS [--fullscreen]\n", argv[0]);
    return 2;
  }

  int fullscreen = argc == 5;
  int requested_width = parse_positive(argv[1], "width");
  int requested_height = parse_positive(argv[2], "height");
  int fps = parse_positive(argv[3], "fps");
  int64_t frame_nanoseconds = 1000000000LL / fps;

  signal(SIGINT, stop);
  signal(SIGTERM, stop);

  Display *display = XOpenDisplay(NULL);
  if (!display) {
    fprintf(stderr, "could not open X display\n");
    return 1;
  }

  int screen = DefaultScreen(display);
  Window root = RootWindow(display, screen);
  Window window = XCreateSimpleWindow(
    display,
    root,
    0,
    0,
    (unsigned int) requested_width,
    (unsigned int) requested_height,
    0,
    BlackPixel(display, screen),
    BlackPixel(display, screen)
  );
  XStoreName(display, window, "Korri streaming gate");
  XSelectInput(display, window, ExposureMask | StructureNotifyMask);
  XMapWindow(display, window);
  if (fullscreen) {
    request_fullscreen(display, window, root);
  }

  GC gc = XCreateGC(display, window, 0, NULL);
  int width = requested_width;
  int height = requested_height;
  int redraw = 1;
  int previous_x = -1;
  uint64_t frame = 0;
  uint64_t interval_frames = 0;
  struct timespec next;
  struct timespec interval_start;
  clock_gettime(CLOCK_MONOTONIC, &next);
  interval_start = next;

  while (running) {
    while (XPending(display)) {
      XEvent event;
      XNextEvent(display, &event);
      if (event.type == ConfigureNotify) {
        width = event.xconfigure.width;
        height = event.xconfigure.height;
        redraw = 1;
        previous_x = -1;
      } else if (event.type == Expose) {
        redraw = 1;
      }
    }

    int lane_height = height / 7;
    if (lane_height < 32) lane_height = 32;
    int lane_y = (height - lane_height) / 2;
    int block_width = width / 24;
    if (block_width < 24) block_width = 24;
    int block_height = lane_height * 3 / 5;
    int block_y = lane_y + (lane_height - block_height) / 2;
    int travel = width - block_width;
    if (travel < 1) travel = 1;
    int period = fps * 4;
    int phase = (int) (frame % (uint64_t) period);
    int half = period / 2;
    int ramp = phase <= half ? phase : period - phase;
    int x = (int) ((int64_t) travel * ramp / half);

    if (redraw) {
      draw_background(display, window, gc, width, height);
      XSetForeground(display, gc, 0x090b12);
      XFillRectangle(display, window, gc, 0, lane_y, (unsigned int) width, (unsigned int) lane_height);
      redraw = 0;
    } else if (previous_x >= 0) {
      XSetForeground(display, gc, 0x090b12);
      XFillRectangle(
        display,
        window,
        gc,
        previous_x,
        block_y,
        (unsigned int) block_width,
        (unsigned int) block_height
      );
    }

    unsigned long color = 0x55d9ff + ((frame / (uint64_t) fps) % 3U) * 0x220900;
    XSetForeground(display, gc, color);
    XFillRectangle(
      display,
      window,
      gc,
      x,
      block_y,
      (unsigned int) block_width,
      (unsigned int) block_height
    );
    XSync(display, False);
    previous_x = x;
    ++frame;
    ++interval_frames;

    next = add_nanoseconds(next, frame_nanoseconds);
    while (clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &next, NULL) == EINTR && running) {}

    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    double interval = elapsed_seconds(interval_start, now);
    if (interval >= 1.0) {
      fprintf(stderr, "korri-validation-fps=%.3f\n", (double) interval_frames / interval);
      interval_start = now;
      interval_frames = 0;
      if (elapsed_seconds(next, now) > 1.0) {
        next = now;
      }
    }
  }

  XFreeGC(display, gc);
  XDestroyWindow(display, window);
  XCloseDisplay(display);
  return 0;
}
