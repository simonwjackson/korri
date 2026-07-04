// korri-overlay-renderer: a featherweight Wayland layer-shell overlay renderer.
//
// It is a DUMB VIEW. It owns no controller input and makes no decisions: inputd
// drives it over stdin with a tiny line protocol and it draws the result on the
// compositor `overlay` layer (above any fullscreen game/stream surface).
//
// Protocol (one command per line on stdin):
//   hide                     -> draw nothing (transparent)
//   ring <0-100>             -> hold-progress ring at the given percent
//   menu <selected> <count>  -> begin a menu; the next <count> lines are options
//   <danger:0|1> <label>     -> one option line (repeated <count> times)
//
// Rendering is software (shm + Cairo), the surface is content-sized and mostly
// transparent, so the resident footprint stays a few MB. Proven approach on
// Bandai (layer=overlay stacks above a live gamescope stream).
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/mman.h>
#include <wayland-client.h>
#include <cairo/cairo.h>
#include "wlr-layer-shell-unstable-v1-client-protocol.h"

enum mode { MODE_HIDDEN, MODE_RING, MODE_MENU };

#define MAX_OPTIONS 6
#define MAX_LABEL 64

static struct wl_compositor *compositor;
static struct wl_shm *shm;
static struct zwlr_layer_shell_v1 *layer_shell;
static struct wl_surface *surface;
static struct zwlr_layer_surface_v1 *layer_surface;
static struct wl_buffer *buffer;
static struct wl_seat *seat;
static struct wl_touch *touch;

static const int WIDTH = 760, HEIGHT = 320;
static int stride, configured = 0, running = 1;
static unsigned char *pixels;

static enum mode g_mode = MODE_HIDDEN;
static int g_ring_pct = 0;
static int g_menu_selected = 0, g_menu_count = 0, g_menu_pending = 0;
static char g_labels[MAX_OPTIONS][MAX_LABEL];
static int g_danger[MAX_OPTIONS];
// Rects of the drawn option buttons, in surface-local coords, for touch
// hit-testing. Populated by draw_menu; read by the wl_touch down handler.
static double g_opt_x[MAX_OPTIONS], g_opt_y[MAX_OPTIONS];
static double g_opt_w[MAX_OPTIONS], g_opt_h[MAX_OPTIONS];

// ---- touch input ----
// The renderer hit-tests taps against the option rects it drew and reports the
// result to inputd on stdout. inputd owns the decision; the renderer only says
// "the user touched option i" (or cancelled).
static void report_touch(double x, double y) {
  if (g_mode != MODE_MENU || g_menu_count <= 0) return;
  for (int i = 0; i < g_menu_count; i++) {
    if (x >= g_opt_x[i] && x <= g_opt_x[i] + g_opt_w[i] &&
        y >= g_opt_y[i] && y <= g_opt_y[i] + g_opt_h[i]) {
      printf("touch %d\n", i);
      fflush(stdout);
      return;
    }
  }
  printf("touch-cancel\n");
  fflush(stdout);
}

static void touch_down(void *d, struct wl_touch *t, uint32_t serial,
                       uint32_t time, struct wl_surface *surf, int32_t id,
                       wl_fixed_t x, wl_fixed_t y) {
  report_touch(wl_fixed_to_double(x), wl_fixed_to_double(y));
}
static void touch_up(void *d, struct wl_touch *t, uint32_t serial,
                     uint32_t time, int32_t id) {}
static void touch_motion(void *d, struct wl_touch *t, uint32_t time, int32_t id,
                         wl_fixed_t x, wl_fixed_t y) {}
static void touch_frame(void *d, struct wl_touch *t) {}
static void touch_cancel(void *d, struct wl_touch *t) {}
static const struct wl_touch_listener touch_listener = {
    touch_down, touch_up, touch_motion, touch_frame, touch_cancel};

static void seat_caps(void *d, struct wl_seat *s, uint32_t caps) {
  if ((caps & WL_SEAT_CAPABILITY_TOUCH) && !touch) {
    touch = wl_seat_get_touch(s);
    wl_touch_add_listener(touch, &touch_listener, NULL);
  } else if (!(caps & WL_SEAT_CAPABILITY_TOUCH) && touch) {
    wl_touch_release(touch);
    touch = NULL;
  }
}
static void seat_name(void *d, struct wl_seat *s, const char *name) {}
static const struct wl_seat_listener seat_listener = {seat_caps, seat_name};

// ---- wayland globals ----
static void reg_global(void *d, struct wl_registry *r, uint32_t name,
                       const char *iface, uint32_t ver) {
  if (!strcmp(iface, wl_compositor_interface.name))
    compositor = wl_registry_bind(r, name, &wl_compositor_interface, 4);
  else if (!strcmp(iface, wl_shm_interface.name))
    shm = wl_registry_bind(r, name, &wl_shm_interface, 1);
  else if (!strcmp(iface, zwlr_layer_shell_v1_interface.name))
    layer_shell = wl_registry_bind(r, name, &zwlr_layer_shell_v1_interface, 1);
  else if (!strcmp(iface, wl_seat_interface.name)) {
    seat = wl_registry_bind(r, name, &wl_seat_interface, ver < 5 ? ver : 5);
    wl_seat_add_listener(seat, &seat_listener, NULL);
  }
}
static void reg_remove(void *d, struct wl_registry *r, uint32_t name) {}
static const struct wl_registry_listener reg_listener = {reg_global, reg_remove};

// ---- drawing ----
static void rounded_rect(cairo_t *cr, double x, double y, double w, double h, double r) {
  cairo_new_sub_path(cr);
  cairo_arc(cr, x + w - r, y + r, r, -1.5708, 0);
  cairo_arc(cr, x + w - r, y + h - r, r, 0, 1.5708);
  cairo_arc(cr, x + r, y + h - r, r, 1.5708, 3.14159);
  cairo_arc(cr, x + r, y + r, r, 3.14159, 4.71239);
  cairo_close_path(cr);
}

static void draw_ring(cairo_t *cr) {
  double cx = WIDTH / 2.0, cy = HEIGHT / 2.0, radius = 92;
  double frac = g_ring_pct / 100.0;
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  cairo_set_line_width(cr, 7);
  cairo_set_source_rgba(cr, 1, 1, 1, 0.10); // track
  cairo_arc(cr, cx, cy, radius, 0, 6.28319);
  cairo_stroke(cr);
  int commit = frac >= 1.0;
  if (commit) cairo_set_source_rgb(cr, 0.757, 0.329, 0.247); // clay on commit
  else cairo_set_source_rgb(cr, 0.816, 0.804, 0.769);        // ink progress
  cairo_arc(cr, cx, cy, radius, -1.5708, -1.5708 + frac * 6.28319);
  cairo_stroke(cr);
  cairo_select_font_face(cr, "monospace", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_NORMAL);
  cairo_set_font_size(cr, 13);
  cairo_set_source_rgb(cr, 0.56, 0.55, 0.52);
  const char *label = commit ? "RELEASING" : "HOLD TO QUIT";
  cairo_text_extents_t ext;
  cairo_text_extents(cr, label, &ext);
  cairo_move_to(cr, cx - ext.width / 2 - ext.x_bearing, cy - ext.height / 2 - ext.y_bearing);
  cairo_show_text(cr, label);
}

static void draw_menu(cairo_t *cr) {
  int n = g_menu_count;
  if (n <= 0) return;
  double pw = WIDTH - 40, ph = 170, px = 20, py = (HEIGHT - ph) / 2.0;
  cairo_set_source_rgb(cr, 0.086, 0.086, 0.094); // panel
  rounded_rect(cr, px, py, pw, ph, 10);
  cairo_fill(cr);
  cairo_set_source_rgb(cr, 0.165, 0.165, 0.18);
  cairo_set_line_width(cr, 2);
  rounded_rect(cr, px, py, pw, ph, 10);
  cairo_stroke(cr);

  cairo_select_font_face(cr, "monospace", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_NORMAL);
  cairo_set_font_size(cr, 13);
  cairo_set_source_rgb(cr, 0.56, 0.55, 0.52);
  cairo_move_to(cr, px + 26, py + 34);
  cairo_show_text(cr, "stick / d-pad = move    A = select    B = cancel");

  double gap = 16, bx = px + 26, by = py + 58, bh = 80;
  double bw = (pw - 52 - gap * (n - 1)) / n;
  for (int i = 0; i < n; i++) {
    double x = bx + i * (bw + gap);
    if (i < MAX_OPTIONS) {
      g_opt_x[i] = x;
      g_opt_y[i] = by;
      g_opt_w[i] = bw;
      g_opt_h[i] = bh;
    }
    int sel = (i == g_menu_selected);
    if (sel) {
      if (g_danger[i]) cairo_set_source_rgb(cr, 0.757, 0.329, 0.247);
      else cairo_set_source_rgb(cr, 0.914, 0.906, 0.882);
      rounded_rect(cr, x, by, bw, bh, 8);
      cairo_fill(cr);
      if (g_danger[i]) cairo_set_source_rgb(cr, 1, 1, 1);
      else cairo_set_source_rgb(cr, 0.086, 0.086, 0.094);
    } else {
      cairo_set_source_rgb(cr, 0.22, 0.22, 0.24);
      cairo_set_line_width(cr, 2);
      rounded_rect(cr, x, by, bw, bh, 8);
      cairo_stroke(cr);
      cairo_set_source_rgb(cr, 0.914, 0.906, 0.882);
    }
    cairo_set_font_size(cr, 18);
    cairo_text_extents_t ext;
    cairo_text_extents(cr, g_labels[i], &ext);
    cairo_move_to(cr, x + (bw - ext.width) / 2 - ext.x_bearing,
                  by + (bh - ext.height) / 2 - ext.y_bearing);
    cairo_show_text(cr, g_labels[i]);
  }
}

static void render(void) {
  cairo_surface_t *cs = cairo_image_surface_create_for_data(
      pixels, CAIRO_FORMAT_ARGB32, WIDTH, HEIGHT, stride);
  cairo_t *cr = cairo_create(cs);
  cairo_set_operator(cr, CAIRO_OPERATOR_SOURCE);
  cairo_set_source_rgba(cr, 0, 0, 0, 0); // transparent clear
  cairo_paint(cr);
  cairo_set_operator(cr, CAIRO_OPERATOR_OVER);
  if (g_mode == MODE_RING) draw_ring(cr);
  else if (g_mode == MODE_MENU) draw_menu(cr);
  cairo_destroy(cr);
  cairo_surface_destroy(cs);
}

// Claim touch input only while a menu is shown; otherwise keep an empty input
// region so taps fall through to the game/stream beneath the overlay.
static void update_input_region(void) {
  struct wl_region *region = wl_compositor_create_region(compositor);
  if (g_mode == MODE_MENU)
    wl_region_add(region, 0, 0, WIDTH, HEIGHT);
  wl_surface_set_input_region(surface, region);
  wl_region_destroy(region);
}

static void commit_frame(void) {
  if (!configured) return;
  render();
  update_input_region();
  wl_surface_attach(surface, buffer, 0, 0);
  wl_surface_damage(surface, 0, 0, WIDTH, HEIGHT);
  wl_surface_commit(surface);
}

static void ls_configure(void *d, struct zwlr_layer_surface_v1 *ls,
                         uint32_t serial, uint32_t w, uint32_t h) {
  zwlr_layer_surface_v1_ack_configure(ls, serial);
  configured = 1;
  commit_frame();
}
static void ls_closed(void *d, struct zwlr_layer_surface_v1 *ls) { running = 0; }
static const struct zwlr_layer_surface_v1_listener ls_listener = {ls_configure, ls_closed};

// ---- protocol ----
static void handle_line(char *line) {
  if (g_menu_pending > 0) {
    int idx = g_menu_count;
    if (idx < MAX_OPTIONS) {
      int danger = (line[0] == '1');
      char *label = line;
      while (*label && *label != ' ') label++;
      if (*label == ' ') label++;
      g_danger[idx] = danger;
      strncpy(g_labels[idx], label, MAX_LABEL - 1);
      g_labels[idx][MAX_LABEL - 1] = 0;
      g_menu_count++;
    }
    if (--g_menu_pending == 0) commit_frame();
    return;
  }
  if (!strcmp(line, "hide")) {
    g_mode = MODE_HIDDEN;
    commit_frame();
  } else if (!strncmp(line, "ring ", 5)) {
    g_ring_pct = atoi(line + 5);
    g_mode = MODE_RING;
    commit_frame();
  } else if (!strncmp(line, "menu ", 5)) {
    int sel = 0, count = 0;
    sscanf(line + 5, "%d %d", &sel, &count);
    g_menu_selected = sel;
    g_menu_count = 0;
    g_menu_pending = count;
    g_mode = MODE_MENU;
    if (count == 0) commit_frame();
  }
}

int main(void) {
  struct wl_display *dpy = wl_display_connect(NULL);
  if (!dpy) { fprintf(stderr, "korri-overlay: no wayland display\n"); return 1; }
  struct wl_registry *reg = wl_display_get_registry(dpy);
  wl_registry_add_listener(reg, &reg_listener, NULL);
  wl_display_roundtrip(dpy);
  if (!compositor || !shm || !layer_shell) {
    fprintf(stderr, "korri-overlay: missing wayland globals\n");
    return 1;
  }
  stride = WIDTH * 4;
  int size = stride * HEIGHT;
  int fd = memfd_create("korri-overlay", MFD_CLOEXEC);
  if (fd < 0 || ftruncate(fd, size) < 0) { perror("shm"); return 1; }
  pixels = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  struct wl_shm_pool *pool = wl_shm_create_pool(shm, fd, size);
  buffer = wl_shm_pool_create_buffer(pool, 0, WIDTH, HEIGHT, stride, WL_SHM_FORMAT_ARGB8888);
  wl_shm_pool_destroy(pool);

  surface = wl_compositor_create_surface(compositor);
  layer_surface = zwlr_layer_shell_v1_get_layer_surface(
      layer_shell, surface, NULL, ZWLR_LAYER_SHELL_V1_LAYER_OVERLAY, "korri-overlay");
  zwlr_layer_surface_v1_set_size(layer_surface, WIDTH, HEIGHT);
  zwlr_layer_surface_v1_set_anchor(layer_surface, 0);
  zwlr_layer_surface_v1_set_keyboard_interactivity(layer_surface, 0);
  zwlr_layer_surface_v1_add_listener(layer_surface, &ls_listener, NULL);
  // Start with an empty input region: hidden/transparent must not eat touches.
  update_input_region();
  wl_surface_commit(surface);
  wl_display_roundtrip(dpy);

  int wfd = wl_display_get_fd(dpy);
  fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
  struct pollfd pfds[2] = {{wfd, POLLIN, 0}, {STDIN_FILENO, POLLIN, 0}};
  char inbuf[4096];
  size_t inlen = 0;
  while (running) {
    wl_display_flush(dpy);
    if (poll(pfds, 2, -1) < 0) break;
    if (pfds[0].revents & POLLIN) { if (wl_display_dispatch(dpy) < 0) break; }
    if (pfds[1].revents & POLLIN) {
      ssize_t n = read(STDIN_FILENO, inbuf + inlen, sizeof(inbuf) - 1 - inlen);
      if (n == 0) break; // stdin closed -> exit
      if (n > 0) {
        inlen += (size_t)n;
        size_t start = 0;
        for (size_t i = 0; i < inlen; i++) {
          if (inbuf[i] == '\n') {
            inbuf[i] = 0;
            handle_line(inbuf + start);
            start = i + 1;
          }
        }
        if (start > 0) {
          memmove(inbuf, inbuf + start, inlen - start);
          inlen -= start;
        }
        if (inlen >= sizeof(inbuf) - 1) inlen = 0; // overflow guard
      }
    }
  }
  return 0;
}
