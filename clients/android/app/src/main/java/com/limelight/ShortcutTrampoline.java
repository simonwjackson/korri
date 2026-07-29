package com.limelight;

import android.app.Activity;
import android.app.Service;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import androidx.appcompat.app.AppCompatActivity;

import com.limelight.computers.ComputerDatabaseManager;
import com.limelight.computers.ComputerManagerListener;
import com.limelight.computers.ComputerManagerService;
import com.limelight.nvstream.http.ComputerDetails;
import com.limelight.nvstream.http.NvApp;
import com.limelight.nvstream.http.NvHTTP;
import com.limelight.nvstream.http.PairingManager;
import com.limelight.nvstream.wol.WakeOnLanSender;
import com.limelight.utils.CacheHelper;
import com.limelight.utils.Dialog;
import com.limelight.utils.ServerHelper;
import com.limelight.utils.ShortcutHelper;
import com.limelight.utils.SpinnerDialog;
import com.limelight.utils.UiHelper;

import org.xmlpull.v1.XmlPullParserException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

public class ShortcutTrampoline extends AppCompatActivity {
    private String uuidString;
    private NvApp app;
    private ArrayList<Intent> intentStack = new ArrayList<>();

    private int wakeHostTries = 10;
    private ComputerDetails computer;
    private SpinnerDialog blockingLoadSpinner;

    private ComputerManagerService.ComputerManagerBinder managerBinder;

    private static final String TAG = "ShortcutTrampoline";

    private int overrideWidth = -1;
    private int overrideHeight = -1;
    private int overrideFps = -1;
    private int overrideBitrate = -1;
    private String overrideFramePacing = null;
    private String overrideUltraLowLatency = null;
    private String overrideVideoScaleMode = null;
    private String overrideCodec = null;
    private String overrideDisplayTopCenter = null;
    private String overrideReduceRefreshRate = null;
    private String overrideLowLatencyFrameBalance = null;
    private String overrideTightVsync = null;
    private String overridePip = null;
    private String overrideAutoOrientation = null;
    private String overrideFlipFaceButtons = null;
    private String overrideHdr = null;
    private String overrideMouseEmulation = null;
    private String overrideTouchscreenMode = null;
    private String overrideAbsoluteMouseMode = null;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        public void onServiceConnected(ComponentName className, IBinder binder) {
            final ComputerManagerService.ComputerManagerBinder localBinder =
                    ((ComputerManagerService.ComputerManagerBinder)binder);

            // Wait in a separate thread to avoid stalling the UI
            new Thread() {
                @Override
                public void run() {
                    // Wait for the binder to be ready
                    localBinder.waitForReady();

                    // Now make the binder visible
                    managerBinder = localBinder;

                    // Get the computer object
                    computer = managerBinder.getComputer(uuidString);

                    if (computer == null) {
                        Dialog.displayDialog(ShortcutTrampoline.this,
                                getResources().getString(R.string.conn_error_title),
                                getResources().getString(R.string.scut_pc_not_found),
                                true);

                        if (blockingLoadSpinner != null) {
                            blockingLoadSpinner.dismiss();
                            blockingLoadSpinner = null;
                        }

                        if (managerBinder != null) {
                            unbindService(serviceConnection);
                            managerBinder = null;
                        }

                        return;
                    }

                    // Force CMS to repoll this machine
                    managerBinder.invalidateStateForComputer(computer.uuid);

                    // Start polling
                    managerBinder.startPolling(new ComputerManagerListener() {
                        @Override
                        public void notifyComputerUpdated(final ComputerDetails details) {
                            // Don't care about other computers
                            if (!details.uuid.equalsIgnoreCase(uuidString)) {
                                return;
                            }

                            // Try to wake the target PC if it's not online (up to some retry limit)
                            if (details.state != ComputerDetails.State.ONLINE && details.macAddress != null && --wakeHostTries >= 0) {
                                try {
                                    // Make a best effort attempt to wake the target PC
                                    WakeOnLanSender.sendWolPacket(computer);

                                    // If we sent at least one WoL packet, reset the computer state
                                    // to force ComputerManager to poll it again.
                                    managerBinder.invalidateStateForComputer(computer.uuid);
                                    return;
                                } catch (IOException e) {
                                    // If we got an exception, we couldn't send a single WoL packet,
                                    // so fallthrough into the offline error path.
                                    e.printStackTrace();
                                }
                            }

                            if (details.state != ComputerDetails.State.UNKNOWN) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        // Stop showing the spinner
                                        if (blockingLoadSpinner != null) {
                                            blockingLoadSpinner.dismiss();
                                            blockingLoadSpinner = null;
                                        }

                                        // If the managerBinder was destroyed before this callback,
                                        // just finish the activity.
                                        if (managerBinder == null) {
                                            finish();
                                            return;
                                        }

                                        if (details.state == ComputerDetails.State.ONLINE && details.pairState == PairingManager.PairState.PAIRED) {
                                            
                                            // Launch game if provided app ID, otherwise launch app view
                                            if (app != null) {
                                            if (details.runningGameId == 0 || details.runningGameId == app.getAppId() || Objects.equals(details.runningGameUUID, app.getAppUUID())) {
                                                intentStack.add(ServerHelper.createStartIntent(ShortcutTrampoline.this, app, details, managerBinder, overrideWidth, overrideHeight, overrideFps, overrideBitrate, overrideFramePacing, overrideUltraLowLatency, overrideVideoScaleMode, overrideCodec, overrideDisplayTopCenter, overrideReduceRefreshRate, overrideLowLatencyFrameBalance, overrideTightVsync, overridePip, overrideAutoOrientation, overrideFlipFaceButtons, overrideHdr, overrideMouseEmulation, overrideTouchscreenMode, overrideAbsoluteMouseMode));

                                                    // Close this activity
                                                    finish();

                                                    // Now start the activities
                                                    startActivities(intentStack.toArray(new Intent[]{}));
                                                } else {
                                                    // Create the start intent immediately, so we can safely unbind the managerBinder
                                                    // below before we return.
                                                    final Intent startIntent = ServerHelper.createStartIntent(ShortcutTrampoline.this, app, details, managerBinder, overrideWidth, overrideHeight, overrideFps, overrideBitrate, overrideFramePacing, overrideUltraLowLatency, overrideVideoScaleMode, overrideCodec, overrideDisplayTopCenter, overrideReduceRefreshRate, overrideLowLatencyFrameBalance, overrideTightVsync, overridePip, overrideAutoOrientation, overrideFlipFaceButtons, overrideHdr, overrideMouseEmulation, overrideTouchscreenMode, overrideAbsoluteMouseMode);

                                                    UiHelper.displayQuitConfirmationDialog(ShortcutTrampoline.this, new Runnable() {
                                                        @Override
                                                        public void run() {
                                                            intentStack.add(startIntent);

                                                            // Close this activity
                                                            finish();

                                                            // Now start the activities
                                                            startActivities(intentStack.toArray(new Intent[]{}));
                                                        }
                                                    }, new Runnable() {
                                                        @Override
                                                        public void run() {
                                                            // Close this activity
                                                            finish();
                                                        }
                                                    });
                                                }
                                            } else {
                                                // Close this activity
                                                finish();

                                                // Add the PC view at the back (and clear the task)
                                                Intent i;
                                                i = new Intent(ShortcutTrampoline.this, PcView.class);
                                                i.setAction(Intent.ACTION_MAIN);
                                                i.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
                                                intentStack.add(i);

                                                // Take this intent's data and create an intent to start the app view
                                                i = new Intent(getIntent());
                                                i.setClass(ShortcutTrampoline.this, AppView.class);
                                                intentStack.add(i);

                                                // If a game is running, we'll make the stream the top level activity
                                                if (details.runningGameId != 0) {
                                                    intentStack.add(ServerHelper.createStartIntent(ShortcutTrampoline.this,
                                                            new NvApp(null, null, details.runningGameId, false), details, managerBinder, overrideWidth, overrideHeight, overrideFps, overrideBitrate, overrideFramePacing, overrideUltraLowLatency, overrideVideoScaleMode, overrideCodec, overrideDisplayTopCenter, overrideReduceRefreshRate, overrideLowLatencyFrameBalance, overrideTightVsync, overridePip, overrideAutoOrientation, overrideFlipFaceButtons, overrideHdr, overrideMouseEmulation, overrideTouchscreenMode, overrideAbsoluteMouseMode));
                                                }

                                                // Now start the activities
                                                startActivities(intentStack.toArray(new Intent[]{}));
                                            }
                                            
                                        }
                                        else if (details.state == ComputerDetails.State.OFFLINE) {
                                            // Computer offline - display an error dialog
                                            Dialog.displayDialog(ShortcutTrampoline.this,
                                                    getResources().getString(R.string.conn_error_title),
                                                    getResources().getString(R.string.error_pc_offline),
                                                    true);
                                        } else if (details.pairState != PairingManager.PairState.PAIRED) {
                                            // Computer not paired - display an error dialog
                                            Dialog.displayDialog(ShortcutTrampoline.this,
                                                    getResources().getString(R.string.conn_error_title),
                                                    getResources().getString(R.string.scut_not_paired),
                                                    true);
                                        }

                                        // We don't want any more callbacks from now on, so go ahead
                                        // and unbind from the service
                                        if (managerBinder != null) {
                                            managerBinder.stopPolling();
                                            unbindService(serviceConnection);
                                            managerBinder = null;
                                        }
                                    }
                                });
                            }
                        }
                    });
                }
            }.start();
        }

        public void onServiceDisconnected(ComponentName className) {
            managerBinder = null;
        }
    };

    protected boolean validateHostInput(String hostUUID, String hostName) {
        // Validate PC UUID/Name
        if (hostUUID == null && hostName == null) {
            Dialog.displayDialog(ShortcutTrampoline.this,
                    getResources().getString(R.string.conn_error_title),
                    getResources().getString(R.string.scut_invalid_uuid),
                    true);
            return false;
        }

        if (hostUUID != null && !hostUUID.isEmpty()) {
            try {
                UUID.fromString(hostUUID);
            } catch (IllegalArgumentException ex) {
                Dialog.displayDialog(ShortcutTrampoline.this,
                        getResources().getString(R.string.conn_error_title),
                        getResources().getString(R.string.scut_invalid_uuid),
                        true);
                return false;
            }
        } else {
            // UUID is null, so fallback to Name
            if (hostName == null || hostName.isEmpty()) {
                Dialog.displayDialog(ShortcutTrampoline.this,
                        getResources().getString(R.string.conn_error_title),
                        getResources().getString(R.string.scut_invalid_uuid),
                        true);
                return false;
            }
        }

        return true;
    }


    protected boolean validateAppInput(String appUUID, String appIDStr, String appName) {
        if (appUUID == null && appIDStr == null && appName == null) {
            // We're just going to the AppView
            return false;
        }

        if (appUUID != null && !appUUID.isEmpty()) {
            try {
                UUID.fromString(appUUID);
            } catch (IllegalArgumentException ex) {
                Dialog.displayDialog(ShortcutTrampoline.this,
                        getResources().getString(R.string.conn_error_title),
                        getResources().getString(R.string.scut_invalid_app_id),
                        true);
                return false;
            }
        } else {
            // Validate App ID (if provided)
            if (appIDStr != null && !appIDStr.isEmpty()) {
                try {
                    Integer.parseInt(appIDStr);
                } catch (NumberFormatException ex) {
                    Dialog.displayDialog(ShortcutTrampoline.this,
                            getResources().getString(R.string.conn_error_title),
                            getResources().getString(R.string.scut_invalid_app_id),
                            true);
                    return false;
                }
            }
        }

        return true;
    }

    private Map<String, String> parseArtFileData(Uri fileUri) {
        if (fileUri == null) {
            return null;
        }

        Map<String, String> artData = new HashMap<>();

        try (InputStream inputStream = getContentResolver().openInputStream(fileUri);
             BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.startsWith("#") || line.isEmpty()) {
                    continue; // Skip comments and empty lines
                }

                if (!line.startsWith("[")) {
                    throw new IOException("Invalid .art file format");
                }

                int separatorIndex = line.indexOf(' ');
                if (separatorIndex > 0 && separatorIndex < line.length() - 1) {
                    String key = line.substring(0, separatorIndex).trim();
                    String value = line.substring(separatorIndex + 1).trim();
                    if (key.endsWith("]")) {
                        key = key.substring(1, key.length() - 1);
                        artData.put(key, value);
                    } else {
                        throw new IOException("Invalid .art file format");
                    }
                }
            }
        } catch (IOException e) {
            Log.e(TAG, "Error reading .art file", e);
            Dialog.displayDialog(ShortcutTrampoline.this,
                    getResources().getString(R.string.conn_error_title),
                    "Error reading .art file: " + e.getMessage(),
                    true);
        }
        return artData;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);


        UiHelper.notifyNewRootView(this);
        ComputerDatabaseManager dbManager = new ComputerDatabaseManager(this);
        ComputerDetails _computer = null;

        Intent intent = getIntent();
        String action = intent.getAction();
        Uri dataUri = intent.getData();

        String hostUUID = null;
        String hostName = null;
        String appName = null;
        String appUUID = null;
        String appIDStr = null;

        if (Intent.ACTION_VIEW.equals(action) && dataUri != null) {
            Map<String, String> artData = parseArtFileData(dataUri);

            if (artData != null) {
                hostUUID = artData.get(ShortcutHelper.KEY_HOST_UUID);
                hostName = artData.get(ShortcutHelper.KEY_HOST_NAME);
                appName = artData.get(ShortcutHelper.KEY_APP_NAME);
                appUUID = artData.get(ShortcutHelper.KEY_APP_UUID);
                appIDStr = artData.get(ShortcutHelper.KEY_APP_ID);

                // Extract resolution from .art file if present
                String widthStr = artData.get(ShortcutHelper.KEY_WIDTH);
                String heightStr = artData.get(ShortcutHelper.KEY_HEIGHT);
                if (widthStr != null && heightStr != null) {
                    try {
                        overrideWidth = Integer.parseInt(widthStr);
                        overrideHeight = Integer.parseInt(heightStr);
                    } catch (NumberFormatException e) {
                        // Ignore invalid values
                    }
                }

                // Extract fps from .art file if present
                String fpsStr = artData.get(ShortcutHelper.KEY_FPS);
                if (fpsStr != null) {
                    try {
                        overrideFps = Integer.parseInt(fpsStr);
                    } catch (NumberFormatException e) {
                        // Ignore invalid values
                    }
                }

                // Extract bitrate from .art file if present
                String bitrateStr = artData.get(ShortcutHelper.KEY_BITRATE);
                if (bitrateStr != null) {
                    try {
                        overrideBitrate = Integer.parseInt(bitrateStr);
                    } catch (NumberFormatException e) {
                        // Ignore invalid values
                    }
                }

                // Extract frame pacing from .art file if present
                String framePacingStr = artData.get(ShortcutHelper.KEY_FRAME_PACING);
                if (framePacingStr != null) {
                    overrideFramePacing = framePacingStr;
                }

                // Extract ultra low latency from .art file if present
                String ultraLowLatencyStr = artData.get(ShortcutHelper.KEY_ULTRA_LOW_LATENCY);
                if (ultraLowLatencyStr != null) {
                    overrideUltraLowLatency = ultraLowLatencyStr;
                }

                // Extract video scale mode from .art file if present
                String videoScaleModeStr = artData.get(ShortcutHelper.KEY_VIDEO_SCALE_MODE);
                if (videoScaleModeStr != null) {
                    overrideVideoScaleMode = videoScaleModeStr;
                }

                // Extract codec from .art file if present
                String codecStr = artData.get(ShortcutHelper.KEY_CODEC);
                if (codecStr != null) {
                    overrideCodec = codecStr;
                }

                // Extract display top center from .art file if present
                String displayTopCenterStr = artData.get(ShortcutHelper.KEY_DISPLAY_TOP_CENTER);
                if (displayTopCenterStr != null) {
                    overrideDisplayTopCenter = displayTopCenterStr;
                }

                // Extract reduce refresh rate from .art file if present
                String reduceRefreshRateStr = artData.get(ShortcutHelper.KEY_REDUCE_REFRESH_RATE);
                if (reduceRefreshRateStr != null) {
                    overrideReduceRefreshRate = reduceRefreshRateStr;
                }

                // Extract low latency frame balance from .art file if present
                String lfrStr = artData.get(ShortcutHelper.KEY_LOW_LATENCY_FRAME_BALANCE);
                if (lfrStr != null) {
                    overrideLowLatencyFrameBalance = lfrStr;
                }

                // Extract tight vsync from .art file if present
                String tightVsyncStr = artData.get(ShortcutHelper.KEY_TIGHT_VSYNC);
                if (tightVsyncStr != null) {
                    overrideTightVsync = tightVsyncStr;
                }

                // Extract PIP from .art file if present
                String pipStr = artData.get(ShortcutHelper.KEY_PIP);
                if (pipStr != null) {
                    overridePip = pipStr;
                }

                // Extract auto orientation from .art file if present
                String autoOrientationStr = artData.get(ShortcutHelper.KEY_AUTO_ORIENTATION);
                if (autoOrientationStr != null) {
                    overrideAutoOrientation = autoOrientationStr;
                }

                // Extract flip face buttons from .art file if present
                String flipFaceButtonsStr = artData.get(ShortcutHelper.KEY_FLIP_FACE_BUTTONS);
                if (flipFaceButtonsStr != null) {
                    String normalized = flipFaceButtonsStr.trim().toLowerCase();
                    if (normalized.equals("true") || normalized.equals("false")) {
                        overrideFlipFaceButtons = normalized;
                    }
                }

                // Extract HDR from .art file if present
                String hdrStr = artData.get(ShortcutHelper.KEY_HDR);
                if (hdrStr != null) {
                    String normalized = hdrStr.trim().toLowerCase();
                    if (normalized.equals("true") || normalized.equals("false")) {
                        overrideHdr = normalized;
                    }
                }

                // Extract mouse emulation from .art file if present
                String mouseEmulationStr = artData.get(ShortcutHelper.KEY_MOUSE_EMULATION);
                if (mouseEmulationStr != null) {
                    String normalized = mouseEmulationStr.trim().toLowerCase();
                    if (normalized.equals("true") || normalized.equals("false")) {
                        overrideMouseEmulation = normalized;
                    }
                }

                // Extract touchscreen mode from .art file if present
                String touchscreenModeStr = artData.get(ShortcutHelper.KEY_TOUCHSCREEN_MODE);
                if (touchscreenModeStr != null) {
                    String normalized = touchscreenModeStr.trim().toLowerCase();
                    // Valid values: multitouch, absolute, trackpad-natural, trackpad-gaming, disabled, absolute-swapped
                    if (normalized.equals("multitouch") || 
                        normalized.equals("absolute") ||
                        normalized.equals("trackpad-natural") ||
                        normalized.equals("trackpad-gaming") ||
                        normalized.equals("disabled") ||
                        normalized.equals("absolute-swapped")) {
                        overrideTouchscreenMode = normalized;
                    }
                }

                // Extract absolute mouse mode from .art file if present
                String absoluteMouseModeStr = artData.get(ShortcutHelper.KEY_ABSOLUTE_MOUSE_MODE);
                if (absoluteMouseModeStr != null) {
                    String normalized = absoluteMouseModeStr.trim().toLowerCase();
                    if (normalized.equals("true") || normalized.equals("false")) {
                        overrideAbsoluteMouseMode = normalized;
                    }
                }
            }
        }

        {
            // PC arguments, both are optional, but at least one must be provided
            if (hostUUID == null) {
                hostUUID = getIntent().getStringExtra(AppView.UUID_EXTRA);
            }
            if (hostName == null) {
                hostName = getIntent().getStringExtra(AppView.NAME_EXTRA);
            }

            // App arguments, all optional, but one must be provided in order to start an app
            if (appUUID == null) {
                appUUID = getIntent().getStringExtra(Game.EXTRA_APP_UUID);
            }
            if (appIDStr == null) {
                appIDStr = getIntent().getStringExtra(Game.EXTRA_APP_ID);
            }
            if (appName == null) {
                appName = getIntent().getStringExtra(Game.EXTRA_APP_NAME);
            }

            // Resolution override from intent extras (takes precedence over .art file)
            int intentWidth = getIntent().getIntExtra(Game.EXTRA_WIDTH, -1);
            int intentHeight = getIntent().getIntExtra(Game.EXTRA_HEIGHT, -1);
            if (intentWidth > 0 && intentHeight > 0) {
                overrideWidth = intentWidth;
                overrideHeight = intentHeight;
            }

            // FPS override from intent extras (takes precedence over .art file)
            int intentFps = getIntent().getIntExtra(Game.EXTRA_FPS, -1);
            if (intentFps > 0) {
                overrideFps = intentFps;
            }

            // Bitrate override from intent extras (takes precedence over .art file)
            int intentBitrate = getIntent().getIntExtra(Game.EXTRA_BITRATE, -1);
            if (intentBitrate > 0) {
                overrideBitrate = intentBitrate;
            }

            // Frame pacing override from intent extras (takes precedence over .art file)
            String intentFramePacing = getIntent().getStringExtra(Game.EXTRA_FRAME_PACING);
            if (intentFramePacing != null) {
                overrideFramePacing = intentFramePacing;
            }

            // Ultra low latency override from intent extras (takes precedence over .art file)
            String intentUltraLowLatency = getIntent().getStringExtra(Game.EXTRA_ULTRA_LOW_LATENCY);
            if (intentUltraLowLatency != null) {
                overrideUltraLowLatency = intentUltraLowLatency;
            }

            // Video scale mode override from intent extras (takes precedence over .art file)
            String intentVideoScaleMode = getIntent().getStringExtra(Game.EXTRA_VIDEO_SCALE_MODE);
            if (intentVideoScaleMode != null) {
                overrideVideoScaleMode = intentVideoScaleMode;
            }

            // Codec override from intent extras (takes precedence over .art file)
            String intentCodec = getIntent().getStringExtra(Game.EXTRA_CODEC);
            if (intentCodec != null) {
                overrideCodec = intentCodec;
            }

            // Display top center override from intent extras (takes precedence over .art file)
            String intentDisplayTopCenter = getIntent().getStringExtra(Game.EXTRA_DISPLAY_TOP_CENTER);
            if (intentDisplayTopCenter != null) {
                overrideDisplayTopCenter = intentDisplayTopCenter;
            }

            // Reduce refresh rate override from intent extras (takes precedence over .art file)
            String intentReduceRefreshRate = getIntent().getStringExtra(Game.EXTRA_REDUCE_REFRESH_RATE);
            if (intentReduceRefreshRate != null) {
                overrideReduceRefreshRate = intentReduceRefreshRate;
            }

            // Low latency frame balance override from intent extras (takes precedence over .art file)
            String intentLfr = getIntent().getStringExtra(Game.EXTRA_LOW_LATENCY_FRAME_BALANCE);
            if (intentLfr != null) {
                overrideLowLatencyFrameBalance = intentLfr;
            }

            // Tight vsync override from intent extras (takes precedence over .art file)
            String intentTightVsync = getIntent().getStringExtra(Game.EXTRA_TIGHT_VSYNC);
            if (intentTightVsync != null) {
                overrideTightVsync = intentTightVsync;
            }

            // PIP override from intent extras (takes precedence over .art file)
            String intentPip = getIntent().getStringExtra(Game.EXTRA_PIP);
            if (intentPip != null) {
                overridePip = intentPip;
            }

            // Auto orientation override from intent extras (takes precedence over .art file)
            String intentAutoOrientation = getIntent().getStringExtra(Game.EXTRA_AUTO_ORIENTATION);
            if (intentAutoOrientation != null) {
                overrideAutoOrientation = intentAutoOrientation;
            }

            // Flip face buttons override from intent extras (takes precedence over .art file)
            String intentFlipFaceButtons = getIntent().getStringExtra(Game.EXTRA_FLIP_FACE_BUTTONS);
            if (intentFlipFaceButtons != null) {
                overrideFlipFaceButtons = intentFlipFaceButtons;
            }

            // HDR override from intent extras (takes precedence over .art file)
            String intentHdr = getIntent().getStringExtra(Game.EXTRA_HDR);
            if (intentHdr != null) {
                overrideHdr = intentHdr;
            }

            // Mouse emulation override from intent extras (takes precedence over .art file)
            String intentMouseEmulation = getIntent().getStringExtra(Game.EXTRA_MOUSE_EMULATION);
            if (intentMouseEmulation != null) {
                overrideMouseEmulation = intentMouseEmulation;
            }

            // Touchscreen mode override from intent extras (takes precedence over .art file)
            String intentTouchscreenMode = getIntent().getStringExtra(Game.EXTRA_TOUCHSCREEN_MODE);
            if (intentTouchscreenMode != null) {
                overrideTouchscreenMode = intentTouchscreenMode;
            }

            // Absolute mouse mode override from intent extras (takes precedence over .art file)
            String intentAbsoluteMouseMode = getIntent().getStringExtra(Game.EXTRA_ABSOLUTE_MOUSE_MODE);
            if (intentAbsoluteMouseMode != null) {
                overrideAbsoluteMouseMode = intentAbsoluteMouseMode;
            }
        }

        if (!validateHostInput(hostUUID, hostName)) {
            // Invalid input, so just return
//            finish();
            return;
        }

        if (hostUUID == null || hostUUID.isEmpty()) {
            // Use hostName to find the corresponding UUID
            _computer = dbManager.getComputerByName(hostName);

            if (_computer == null) {
                Dialog.displayDialog(ShortcutTrampoline.this,
                        getResources().getString(R.string.conn_error_title),
                        getResources().getString(R.string.scut_pc_not_found),
                        true);
//                    finish();
                return;
            }

            hostUUID = _computer.uuid;
        }

        uuidString = hostUUID;

        // Set the AppView UUID intent
        setIntent(new Intent(getIntent()).putExtra(AppView.UUID_EXTRA, uuidString));

        if (validateAppInput(appUUID, appIDStr, appName)) {
            // If app data came from .art file or was determined by appNameString from extras
            if (appUUID != null && !appUUID.isEmpty()) {
                app = new NvApp(appName, // appName can be null if only UUID is provided
                        appUUID,
                        -1, // App ID is not strictly needed if UUID is present
                        getIntent().getBooleanExtra(Game.EXTRA_APP_HDR, false)); // HDR info still from intent
            } else if (appIDStr != null && !appIDStr.isEmpty()) {
                int appID = Integer.parseInt(appIDStr);
                app = new NvApp(appName, // appName can be null if only App ID is provided
                        null,
                        appID,
                        getIntent().getBooleanExtra(Game.EXTRA_APP_HDR, false)); // HDR info still from intent
            } else if (appName != null && !appName.isEmpty()) {
                // Use appNameString (from .art file or intent extra) to find the corresponding AppId and AppUUID
                try {
                    int appID = -1;
                    String appUuidFromFile = null;
                    String rawAppList = CacheHelper.readInputStreamToString(CacheHelper.openCacheFileForInput(getCacheDir(), "applist", uuidString));

                    if (rawAppList.isEmpty()) {
                        Dialog.displayDialog(ShortcutTrampoline.this,
                                getResources().getString(R.string.conn_error_title),
                                getResources().getString(R.string.scut_invalid_app_id) + " (applist cache empty or unreadable)",
                                true);
//                    finish();
                        return;
                    }
                    List<NvApp> applist = NvHTTP.getAppListByReader(new StringReader(rawAppList));

                    for (NvApp _app : applist) {
                        if (_app.getAppName().equalsIgnoreCase(appName)) {
                            appID = _app.getAppId();
                            appUuidFromFile = _app.getAppUUID();
                            break;
                        }
                    }
                    if (appID < 0 && appUuidFromFile == null) { // Need at least one
                        Dialog.displayDialog(ShortcutTrampoline.this,
                                getResources().getString(R.string.conn_error_title),
                                getResources().getString(R.string.scut_invalid_app_id) + " (app not found in cache)",
                                true);
//                    finish();
                        return;
                    }
                    // Update intent with found app ID and UUID if they weren't originally there
                    Intent currentIntent = getIntent();
                    if (currentIntent.getStringExtra(Game.EXTRA_APP_ID) == null && appID != -1) {
                        currentIntent.putExtra(Game.EXTRA_APP_ID, String.valueOf(appID));
                    }
                    if (currentIntent.getStringExtra(Game.EXTRA_APP_UUID) == null && appUuidFromFile != null) {
                        currentIntent.putExtra(Game.EXTRA_APP_UUID, appUuidFromFile);
                    }
                    app = new NvApp(
                            appName,
                            appUuidFromFile,
                            appID,
                            getIntent().getBooleanExtra(Game.EXTRA_APP_HDR, false));
                } catch (IOException | XmlPullParserException e) {
                    Log.e(TAG, "Error processing app list from cache", e);
                    Dialog.displayDialog(ShortcutTrampoline.this,
                            getResources().getString(R.string.conn_error_title),
                            getResources().getString(R.string.scut_invalid_app_id) + " (error parsing applist cache)",
                            true);
//                finish();
                    return;
                }
            }
        }

        // Bind to the computer manager service
        bindService(new Intent(this, ComputerManagerService.class), serviceConnection,
                Service.BIND_AUTO_CREATE);

        blockingLoadSpinner = SpinnerDialog.displayDialog(this, getResources().getString(R.string.conn_establishing_title),
                getResources().getString(R.string.applist_connect_msg), true);
    }

    @Override
    protected void onStop() {
        super.onStop();

        if (blockingLoadSpinner != null) {
            blockingLoadSpinner.dismiss();
            blockingLoadSpinner = null;
        }

        Dialog.closeDialogs();

        if (managerBinder != null) {
            managerBinder.stopPolling();
            unbindService(serviceConnection);
            managerBinder = null;
        }

        finish();
    }
}
