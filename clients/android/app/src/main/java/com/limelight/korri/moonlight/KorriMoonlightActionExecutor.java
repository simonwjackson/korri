package com.limelight.korri.moonlight;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/** Closed, UI-thread Artemis effect executor with no Activity-bearing contract. */
public final class KorriMoonlightActionExecutor {
    private static final long UI_TIMEOUT_SECONDS = 5;

    public enum Outcome {
        EXECUTED,
        INVALID_VALUE,
        UNAVAILABLE,
        STALE,
        FAILED
    }

    public enum Effect {
        DISCONNECT("disconnect", Form.COMMAND),
        QUIT_HOST("quit-host", Form.COMMAND),
        TOGGLE_KEYBOARD("toggle-keyboard", Form.COMMAND),
        TOGGLE_FULL_KEYBOARD("toggle-full-keyboard", Form.COMMAND),
        SET_FILL_MODE("set-fill-mode", Form.TOGGLE),
        SET_ZOOM_MODE("set-zoom-mode", Form.TOGGLE),
        ROTATE_SCREEN("rotate-screen", Form.COMMAND),
        TOGGLE_HUD("toggle-hud", Form.COMMAND),
        TOGGLE_FLOATING_MENU("toggle-floating-menu", Form.COMMAND),
        TOGGLE_KEYBOARD_CONTROLLER("toggle-keyboard-controller", Form.COMMAND),
        SWITCH_TOUCH_SENSITIVITY("switch-touch-sensitivity", Form.COMMAND),
        SET_MOUSE_MODE("set-mouse-mode", Form.CHOICE),
        SET_LOCAL_CURSOR("set-local-cursor", Form.COMMAND),
        SET_SGSR_EDGE_THRESHOLD("set-sgsr-edge-threshold", Form.RANGE),
        SET_SGSR_SHARPNESS("set-sgsr-sharpness", Form.RANGE),
        SET_FACE_BUTTON_FLIP("set-face-button-flip", Form.TOGGLE),
        SET_RUMBLE("set-rumble", Form.TOGGLE),
        SET_PICTURE_IN_PICTURE("set-picture-in-picture", Form.TOGGLE);

        private final String wire;
        private final Form form;

        Effect(String wire, Form form) {
            this.wire = wire;
            this.form = form;
        }

        public String wire() {
            return wire;
        }

        public static Effect fromWire(String wire) {
            for (Effect effect : values()) {
                if (effect.wire.equals(wire)) return effect;
            }
            return null;
        }
    }

    private enum Form { COMMAND, TOGGLE, CHOICE, RANGE }
    private enum ValueKind { NONE, TOGGLE, CHOICE, RANGE }

    public static final class Request {
        private final String launchId;
        private final String executorId;
        private final String generation;
        private final Effect effect;
        private final ValueKind kind;
        private final Object value;

        private Request(
                String launchId, String generation, Effect effect,
                ValueKind kind, Object value) {
            this.launchId = launchId;
            this.executorId = "android-moonlight";
            this.generation = generation;
            this.effect = effect;
            this.kind = kind;
            this.value = value;
        }

        public static Request command(String launchId, Effect effect) {
            return command(launchId, "direct", effect);
        }

        public static Request command(String launchId, String generation, Effect effect) {
            return new Request(launchId, generation, effect, ValueKind.NONE, null);
        }

        public static Request toggle(String launchId, Effect effect, boolean value) {
            return toggle(launchId, "direct", effect, value);
        }

        public static Request toggle(
                String launchId, String generation, Effect effect, boolean value) {
            return new Request(launchId, generation, effect, ValueKind.TOGGLE, value);
        }

        public static Request choice(String launchId, Effect effect, String value) {
            return choice(launchId, "direct", effect, value);
        }

        public static Request choice(
                String launchId, String generation, Effect effect, String value) {
            return new Request(launchId, generation, effect, ValueKind.CHOICE, value);
        }

        public static Request range(String launchId, Effect effect, int value) {
            return range(launchId, "direct", effect, value);
        }

        public static Request range(
                String launchId, String generation, Effect effect, int value) {
            return new Request(launchId, generation, effect, ValueKind.RANGE, value);
        }

        public String launchId() {
            return launchId;
        }

        public String executorId() {
            return executorId;
        }

        public String generation() {
            return generation;
        }

        public boolean needsStatePublication() {
            return effect != null && effect.form != Form.COMMAND;
        }
    }

    public interface UiDispatcher {
        boolean isUiThread();
        void dispatch(Runnable action);
    }

    public interface Authorization {
        boolean isCurrent();
    }

    /** Live Game operations and current values. Production's implementation is Game itself. */
    public interface Actions {
        boolean available(Effect effect);
        boolean fillMode();
        void setFillMode(boolean value);
        boolean zoomMode();
        void setZoomMode(boolean value);
        String mouseMode();
        void setMouseMode(String value);
        boolean localCursor();
        void toggleLocalCursor();
        int sgsrSharpness();
        void setSgsrSharpness(int value);
        int sgsrEdgeThreshold();
        void setSgsrEdgeThreshold(int value);
        boolean faceButtonFlip();
        void setFaceButtonFlip(boolean value);
        boolean rumble();
        void setRumble(boolean value);
        boolean pictureInPicture();
        void setPictureInPicture(boolean value);
        void disconnect();
        void quitHost();
        void toggleKeyboard();
        void toggleFullKeyboard();
        void rotateScreen();
        void toggleHud();
        void toggleFloatingMenu();
        void toggleKeyboardController();
        void switchTouchSensitivity();
    }

    private final Actions actions;
    private final UiDispatcher ui;

    public KorriMoonlightActionExecutor(Actions actions, UiDispatcher ui) {
        this.actions = actions;
        this.ui = ui;
    }

    public Outcome execute(Request request) {
        return execute(request, () -> true);
    }

    public Outcome execute(Request request, Authorization authorization) {
        if (request == null || request.effect == null || authorization == null
                || !valid(request)) {
            return Outcome.INVALID_VALUE;
        }
        return onUiThread(() -> authorization.isCurrent()
                ? apply(request)
                : Outcome.STALE);
    }

    public String stateJson(String launchId, String generation) {
        return onUiThread(() -> buildState(launchId, generation), "");
    }

    private boolean valid(Request request) {
        switch (request.effect.form) {
            case COMMAND:
                return request.kind == ValueKind.NONE;
            case TOGGLE:
                return request.kind == ValueKind.TOGGLE && request.value instanceof Boolean;
            case CHOICE:
                if (request.kind != ValueKind.CHOICE || !(request.value instanceof String)) return false;
                String choice = (String) request.value;
                return choice.length() == 1 && choice.charAt(0) >= '0' && choice.charAt(0) <= '5';
            case RANGE:
                if (request.kind != ValueKind.RANGE || !(request.value instanceof Integer)) return false;
                int value = (Integer) request.value;
                return request.effect == Effect.SET_SGSR_SHARPNESS
                        ? value >= 0 && value <= 50
                        : value >= 1 && value <= 32;
            default:
                return false;
        }
    }

    private Outcome apply(Request request) {
        try {
            if (!actions.available(request.effect)) return Outcome.UNAVAILABLE;
            switch (request.effect) {
                case DISCONNECT: actions.disconnect(); break;
                case QUIT_HOST: actions.quitHost(); break;
                case TOGGLE_KEYBOARD: actions.toggleKeyboard(); break;
                case TOGGLE_FULL_KEYBOARD: actions.toggleFullKeyboard(); break;
                case SET_FILL_MODE:
                    boolean fill = (Boolean) request.value;
                    if (actions.fillMode() != fill) actions.setFillMode(fill);
                    break;
                case SET_ZOOM_MODE:
                    boolean zoom = (Boolean) request.value;
                    if (actions.zoomMode() != zoom) actions.setZoomMode(zoom);
                    break;
                case ROTATE_SCREEN: actions.rotateScreen(); break;
                case TOGGLE_HUD: actions.toggleHud(); break;
                case TOGGLE_FLOATING_MENU: actions.toggleFloatingMenu(); break;
                case TOGGLE_KEYBOARD_CONTROLLER: actions.toggleKeyboardController(); break;
                case SWITCH_TOUCH_SENSITIVITY: actions.switchTouchSensitivity(); break;
                case SET_MOUSE_MODE:
                    String mode = (String) request.value;
                    if (!mode.equals(actions.mouseMode())) actions.setMouseMode(mode);
                    break;
                case SET_LOCAL_CURSOR: actions.toggleLocalCursor(); break;
                case SET_SGSR_EDGE_THRESHOLD:
                    int threshold = (Integer) request.value;
                    if (actions.sgsrEdgeThreshold() != threshold) actions.setSgsrEdgeThreshold(threshold);
                    break;
                case SET_SGSR_SHARPNESS:
                    int sharpness = (Integer) request.value;
                    if (actions.sgsrSharpness() != sharpness) actions.setSgsrSharpness(sharpness);
                    break;
                case SET_FACE_BUTTON_FLIP:
                    boolean flip = (Boolean) request.value;
                    if (actions.faceButtonFlip() != flip) actions.setFaceButtonFlip(flip);
                    break;
                case SET_RUMBLE:
                    boolean rumble = (Boolean) request.value;
                    if (actions.rumble() != rumble) actions.setRumble(rumble);
                    break;
                case SET_PICTURE_IN_PICTURE:
                    boolean pip = (Boolean) request.value;
                    if (actions.pictureInPicture() != pip) actions.setPictureInPicture(pip);
                    break;
            }
            return Outcome.EXECUTED;
        } catch (RuntimeException error) {
            return Outcome.FAILED;
        }
    }

    private String buildState(String launchId, String generation) throws Exception {
        JSONArray effects = new JSONArray();
        for (Effect effect : Effect.values()) {
            JSONObject entry = new JSONObject().put("effect", effect.wire);
            try {
                boolean fulfillable = actions.available(effect);
                entry.put("fulfillable", fulfillable);
                if (fulfillable) {
                    JSONObject value = currentValue(effect);
                    if (value != null) entry.put("value", value);
                }
            } catch (RuntimeException error) {
                entry.put("fulfillable", false);
            }
            effects.put(entry);
        }
        return new JSONObject()
                .put("launchId", launchId)
                .put("executorId", "android-moonlight")
                .put("generation", generation)
                .put("effects", effects)
                .toString();
    }

    private JSONObject currentValue(Effect effect) throws Exception {
        switch (effect) {
            case SET_FILL_MODE: return typed("toggle", actions.fillMode());
            case SET_ZOOM_MODE: return typed("toggle", actions.zoomMode());
            case SET_MOUSE_MODE: return typed("choice", actions.mouseMode());
            case SET_SGSR_EDGE_THRESHOLD: return typed("range", actions.sgsrEdgeThreshold());
            case SET_SGSR_SHARPNESS: return typed("range", actions.sgsrSharpness());
            case SET_FACE_BUTTON_FLIP: return typed("toggle", actions.faceButtonFlip());
            case SET_RUMBLE: return typed("toggle", actions.rumble());
            case SET_PICTURE_IN_PICTURE: return typed("toggle", actions.pictureInPicture());
            default: return null;
        }
    }

    private static JSONObject typed(String kind, Object value) throws Exception {
        return new JSONObject().put("kind", kind).put("value", value);
    }

    private Outcome onUiThread(java.util.concurrent.Callable<Outcome> action) {
        return onUiThread(action, Outcome.UNAVAILABLE);
    }

    private <T> T onUiThread(java.util.concurrent.Callable<T> action, T unavailable) {
        if (ui.isUiThread()) {
            try {
                return action.call();
            } catch (Exception error) {
                return unavailable;
            }
        }
        FutureTask<T> task = new FutureTask<>(action);
        ui.dispatch(task);
        try {
            return task.get(UI_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception error) {
            task.cancel(false);
            return unavailable;
        }
    }
}
