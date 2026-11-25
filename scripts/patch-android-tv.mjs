import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const manifestPath = path.resolve(
  process.cwd(),
  'android/app/src/main/AndroidManifest.xml'
);

if (!fs.existsSync(manifestPath)) {
  console.error(`AndroidManifest.xml not found at ${manifestPath}`);
  process.exit(1);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

const requiredPermissions = [
  { name: 'android.permission.INTERNET' },
  { name: 'android.permission.ACCESS_COARSE_LOCATION' },
  { name: 'android.permission.QUERY_ALL_PACKAGES' },
  { name: 'android.permission.REQUEST_DELETE_PACKAGES' },
  { name: 'android.permission.BLUETOOTH', maxSdk: 30 },
  { name: 'android.permission.BLUETOOTH_ADMIN', maxSdk: 30 },
  { name: 'android.permission.BLUETOOTH_CONNECT' },
];

for (const perm of requiredPermissions) {
  if (!manifest.includes(perm.name)) {
    const maxSdkAttr = perm.maxSdk ? ` android:maxSdkVersion="${perm.maxSdk}"` : '';
    manifest = manifest.replace(
      '<application',
      `    <uses-permission android:name="${perm.name}"${maxSdkAttr} />\n    <application`
    );
  }
}

const tvFeatures = [
  '<uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
  '<uses-feature android:name="android.software.leanback" android:required="false" />',
  '<uses-feature android:name="android.hardware.location.network" android:required="false" />',
];

for (const feature of tvFeatures) {
  const featureName = feature.match(/android:name="([^"]+)"/)?.[1];
  if (featureName && !manifest.includes(featureName)) {
    manifest = manifest.replace('<application', `    ${feature}\n    <application`);
  }
}

// Package visibility queries for Android 11+ (Leanback & Standard launchers + Settings + Bluetooth + Live TV / Inputs)
const queriesBlock = `    <queries>
        <package android:name="com.android.tv.settings" />
        <package android:name="com.android.settings" />
        <package android:name="com.google.android.tv" />
        <package android:name="com.android.tv" />
        <intent>
            <action android:name="android.settings.SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.settings.BLUETOOTH_SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.settings.DISPLAY_SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.settings.APPLICATION_DETAILS_SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="content" android:host="android.media.tv" />
        </intent>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
        </intent>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>`;

if (/<queries>[\s\S]*?<\/queries>/.test(manifest)) {
  manifest = manifest.replace(/<queries>[\s\S]*?<\/queries>/, queriesBlock.trimStart());
} else {
  manifest = manifest.replace('<application', `${queriesBlock}\n    <application`);
}

if (manifest.includes('android:allowBackup="true"')) {
  manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
} else if (!manifest.includes('android:allowBackup=')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:allowBackup="false"'
  );
}

if (manifest.includes('android:banner=')) {
  manifest = manifest.replace(/android:banner="[^"]*"/, 'android:banner="@drawable/tv_banner"');
} else {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:banner="@drawable/tv_banner"'
  );
}

const tvCategories = [
  '<category android:name="android.intent.category.HOME" />',
  '<category android:name="android.intent.category.DEFAULT" />',
  '<category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
];

for (const cat of tvCategories) {
  const catName = cat.match(/android:name="([^"]+)"/)?.[1];
  if (catName && !manifest.includes(catName)) {
    manifest = manifest.replace(
      '<category android:name="android.intent.category.LAUNCHER" />',
      `<category android:name="android.intent.category.LAUNCHER" />\n                ${cat}`
    );
  }
}

if (!manifest.includes('android:launchMode="singleTask"')) {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:launchMode="singleTask"\n            android:stateNotNeeded="true"'
  );
}

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log('Patched AndroidManifest.xml with Google TV HOME, Leanback, Package queries & permissions.');

// Enable Kotlin Android plugin in Gradle aligned with Capacitor 8 / Java 21
const rootGradlePath = path.resolve(process.cwd(), 'android/build.gradle');
if (fs.existsSync(rootGradlePath)) {
  let rootGradle = fs.readFileSync(rootGradlePath, 'utf8');
  if (!rootGradle.includes('kotlin-gradle-plugin')) {
    rootGradle = rootGradle.replace(
      /classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"]/,
      (match) => `${match}\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'`
    );
    fs.writeFileSync(rootGradlePath, rootGradle, 'utf8');
    console.log('Added kotlin-gradle-plugin to android/build.gradle.');
  }
}

const appGradlePath = path.resolve(process.cwd(), 'android/app/build.gradle');
if (fs.existsSync(appGradlePath)) {
  let appGradle = fs.readFileSync(appGradlePath, 'utf8');

  if (!appGradle.includes('kotlin-android')) {
    appGradle = appGradle.replace(
      "apply plugin: 'com.android.application'",
      "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'"
    );
  }

  if (!appGradle.includes('kotlinOptions')) {
    appGradle = appGradle.replace(
      /android\s*\{/,
      `android {\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_21\n        targetCompatibility JavaVersion.VERSION_21\n    }\n    kotlinOptions {\n        jvmTarget = '21'\n    }`
    );
  }

  const versionName = process.env.ANDROID_VERSION_NAME;
  const versionCode = process.env.ANDROID_VERSION_CODE;
  if (versionName && versionCode) {
    appGradle = appGradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    appGradle = appGradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
    console.log(`Patched build.gradle to versionName "${versionName}" (versionCode ${versionCode}).`);
  }

  fs.writeFileSync(appGradlePath, appGradle, 'utf8');
  console.log('Configured kotlin-android & Java 21 compatibility in android/app/build.gradle.');
}

// Generate native Capacitor plugins (TvSystemSettingsPlugin.java + TvAppsPlugin.kt)
const javaPkgDir = path.resolve(
  process.cwd(),
  'android/app/src/main/java/com/ambient/tvlauncher'
);

if (fs.existsSync(javaPkgDir)) {
  const settingsPluginPath = path.join(javaPkgDir, 'TvSystemSettingsPlugin.java');
  const settingsPluginJava = `package com.ambient.tvlauncher;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(
    name = "TvSystemSettings",
    permissions = {
        @Permission(
            strings = { "android.permission.BLUETOOTH_CONNECT" },
            alias = "bluetooth"
        )
    }
)
public class TvSystemSettingsPlugin extends Plugin {

    private boolean hasBluetoothConnectPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        return ContextCompat.checkSelfPermission(
            getContext(),
            "android.permission.BLUETOOTH_CONNECT"
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothAdapter resolveBluetoothAdapter() {
        BluetoothManager btManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (btManager != null && btManager.getAdapter() != null) {
            return btManager.getAdapter();
        }
        return BluetoothAdapter.getDefaultAdapter();
    }

    private String launchSettingsAction(String action) {
        PackageManager pm = getContext().getPackageManager();

        Intent tvActionIntent = new Intent(action);
        tvActionIntent.setPackage("com.android.tv.settings");
        tvActionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (tvActionIntent.resolveActivity(pm) != null) {
                getContext().startActivity(tvActionIntent);
                return "com.android.tv.settings";
            }
        } catch (ActivityNotFoundException ignored) {
            // Fall through to generic action
        }

        Intent genericIntent = new Intent(action);
        genericIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (genericIntent.resolveActivity(pm) != null) {
                getContext().startActivity(genericIntent);
                return action;
            }
        } catch (ActivityNotFoundException ignored) {
            // Fall through to general Settings
        }

        if (Settings.ACTION_SETTINGS.equals(action)) {
            Intent tvPackageIntent = pm.getLaunchIntentForPackage("com.android.tv.settings");
            if (tvPackageIntent != null) {
                tvPackageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(tvPackageIntent);
                return "com.android.tv.settings";
            }
        }

        Intent fallbackIntent = new Intent(Settings.ACTION_SETTINGS);
        fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(fallbackIntent);
        return "android.settings.SETTINGS";
    }

    private String launchTopLevelSystemSettings() {
        PackageManager pm = getContext().getPackageManager();
        int topLevelFlags = Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED;

        // 1. Explicit Android TV / Google TV root settings activity
        String[][] tvRoots = new String[][] {
            new String[] { "com.android.tv.settings", "com.android.tv.settings.MainSettings" },
            new String[] { "com.android.settings", "com.android.settings.Settings" },
        };
        for (String[] root : tvRoots) {
            try {
                Intent rootIntent = new Intent(Intent.ACTION_MAIN);
                rootIntent.setComponent(new ComponentName(root[0], root[1]));
                rootIntent.addFlags(topLevelFlags);
                if (rootIntent.resolveActivity(pm) != null) {
                    getContext().startActivity(rootIntent);
                    return root[0];
                }
            } catch (Throwable ignored) {
                // Try next root activity
            }
        }

        // 2. Package Leanback/standard launch intent for Android TV Settings
        String[] settingsPackages = new String[] { "com.android.tv.settings", "com.android.settings" };
        for (String pkg : settingsPackages) {
            try {
                Intent pkgIntent = pm.getLeanbackLaunchIntentForPackage(pkg);
                if (pkgIntent == null) {
                    pkgIntent = pm.getLaunchIntentForPackage(pkg);
                }
                if (pkgIntent != null) {
                    pkgIntent.addFlags(topLevelFlags);
                    getContext().startActivity(pkgIntent);
                    return pkg;
                }
            } catch (Throwable ignored) {
                // Try next package
            }
        }

        // 3. Settings.ACTION_SETTINGS scoped to com.android.tv.settings, then generic
        try {
            Intent tvActionIntent = new Intent(Settings.ACTION_SETTINGS);
            tvActionIntent.setPackage("com.android.tv.settings");
            tvActionIntent.addFlags(topLevelFlags);
            if (tvActionIntent.resolveActivity(pm) != null) {
                getContext().startActivity(tvActionIntent);
                return "com.android.tv.settings";
            }
        } catch (Throwable ignored) {
            // Fall through to generic Settings
        }

        Intent fallbackIntent = new Intent(Settings.ACTION_SETTINGS);
        fallbackIntent.addFlags(topLevelFlags);
        getContext().startActivity(fallbackIntent);
        return "android.settings.SETTINGS";
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        try {
            String target = launchTopLevelSystemSettings();
            JSObject result = new JSObject();
            result.put("target", target);
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Unable to open system settings", ex);
        }
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            String target = launchSettingsAction(Settings.ACTION_BLUETOOTH_SETTINGS);
            JSObject result = new JSObject();
            result.put("target", target);
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Unable to open Bluetooth settings", ex);
        }
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (hasBluetoothConnectPermission()) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback");
    }

    @PermissionCallback
    private void bluetoothPermsCallback(PluginCall call) {
        boolean granted = hasBluetoothConnectPermission() ||
            getPermissionState("bluetooth") == PermissionState.GRANTED;
        JSObject res = new JSObject();
        res.put("granted", granted);
        call.resolve(res);
    }

    @PluginMethod
    public void getBluetoothDevices(PluginCall call) {
        try {
            BluetoothAdapter adapter = resolveBluetoothAdapter();
            if (adapter == null) {
                JSObject res = new JSObject();
                res.put("enabled", false);
                res.put("permissionRequired", false);
                res.put("devices", new JSArray());
                call.resolve(res);
                return;
            }

            if (!hasBluetoothConnectPermission()) {
                JSObject res = new JSObject();
                res.put("enabled", false);
                res.put("permissionRequired", true);
                res.put("devices", new JSArray());
                call.resolve(res);
                return;
            }

            boolean enabled = false;
            try {
                enabled = adapter.isEnabled();
            } catch (SecurityException ignored) {
                enabled = false;
            }

            Set<String> gattConnectedAddresses = new HashSet<>();
            try {
                BluetoothManager btManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
                if (btManager != null) {
                    List<BluetoothDevice> gattDevs = btManager.getConnectedDevices(BluetoothProfile.GATT);
                    if (gattDevs != null) {
                        for (BluetoothDevice d : gattDevs) {
                            if (d.getAddress() != null) gattConnectedAddresses.add(d.getAddress());
                        }
                    }
                    List<BluetoothDevice> gattServerDevs = btManager.getConnectedDevices(BluetoothProfile.GATT_SERVER);
                    if (gattServerDevs != null) {
                        for (BluetoothDevice d : gattServerDevs) {
                            if (d.getAddress() != null) gattConnectedAddresses.add(d.getAddress());
                        }
                    }
                }
            } catch (Throwable ignored) {
                // Ignore profile check failures on restricted OEM builds
            }

            List<JSObject> items = new ArrayList<>();
            Set<BluetoothDevice> bonded = null;
            try {
                bonded = adapter.getBondedDevices();
            } catch (SecurityException ignored) {
                bonded = null;
            }

            if (bonded != null) {
                for (BluetoothDevice device : bonded) {
                    if (device == null) continue;
                    String addr = device.getAddress() != null ? device.getAddress() : "";
                    String name = null;
                    try {
                        name = device.getName();
                    } catch (SecurityException ignored) {
                        name = null;
                    }
                    if (name == null || name.trim().isEmpty()) {
                        name = !addr.isEmpty() ? addr : "Bluetooth Device";
                    }

                    String devType = "peripheral";
                    try {
                        BluetoothClass btClass = device.getBluetoothClass();
                        if (btClass != null) {
                            int major = btClass.getMajorDeviceClass();
                            if (major == BluetoothClass.Device.Major.AUDIO_VIDEO) {
                                devType = "audio";
                            } else if (major == BluetoothClass.Device.Major.PERIPHERAL) {
                                String lower = name.toLowerCase();
                                if (lower.contains("remote") || lower.contains("rc")) {
                                    devType = "remote";
                                } else if (lower.contains("controller") || lower.contains("gamepad") || lower.contains("dualsense") || lower.contains("xbox")) {
                                    devType = "gamepad";
                                }
                            }
                        }
                    } catch (Throwable ignored) {
                        // Keep default peripheral type
                    }

                    boolean isConnected = gattConnectedAddresses.contains(addr);
                    if (!isConnected) {
                        try {
                            Method m = device.getClass().getMethod("isConnected");
                            Object val = m.invoke(device);
                            if (val instanceof Boolean) {
                                isConnected = (Boolean) val;
                            }
                        } catch (Throwable ignored) {
                            // Hidden method blocked on some builds
                        }
                    }

                    int battery = -1;
                    try {
                        Method bm = device.getClass().getMethod("getBatteryLevel");
                        Object bVal = bm.invoke(device);
                        if (bVal instanceof Integer) {
                            int pct = (Integer) bVal;
                            if (pct >= 0 && pct <= 100) {
                                battery = pct;
                            }
                        }
                    } catch (Throwable ignored) {
                        // Battery level unavailable
                    }

                    JSObject entry = new JSObject();
                    entry.put("id", !addr.isEmpty() ? addr : name);
                    entry.put("name", name.trim());
                    entry.put("address", addr);
                    entry.put("type", devType);
                    entry.put("connected", isConnected);
                    if (battery >= 0) {
                        entry.put("battery", battery);
                    }
                    items.add(entry);
                }
            }

            Collections.sort(items, new Comparator<JSObject>() {
                @Override
                public int compare(JSObject a, JSObject b) {
                    boolean ca = a.optBoolean("connected", false);
                    boolean cb = b.optBoolean("connected", false);
                    if (ca != cb) return ca ? -1 : 1;
                    return a.optString("name", "").compareToIgnoreCase(b.optString("name", ""));
                }
            });

            JSArray jsonDevices = new JSArray();
            for (JSObject item : items) {
                jsonDevices.put(item);
            }

            JSObject res = new JSObject();
            res.put("enabled", enabled);
            res.put("permissionRequired", false);
            res.put("devices", jsonDevices);
            call.resolve(res);
        } catch (Exception ex) {
            call.reject("Unable to read Bluetooth devices", ex);
        }
    }

    @PluginMethod
    public void toggleBluetooth(PluginCall call) {
        boolean targetEnable = call.getBoolean("enable", true);
        BluetoothAdapter adapter = resolveBluetoothAdapter();
        if (adapter == null) {
            JSObject res = new JSObject();
            res.put("changed", false);
            res.put("openedSettings", false);
            res.put("enabled", false);
            call.resolve(res);
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && hasBluetoothConnectPermission()) {
            try {
                @SuppressWarnings("deprecation")
                boolean ok = targetEnable ? adapter.enable() : adapter.disable();
                if (ok) {
                    JSObject res = new JSObject();
                    res.put("changed", true);
                    res.put("openedSettings", false);
                    res.put("enabled", targetEnable);
                    call.resolve(res);
                    return;
                }
            } catch (Throwable ignored) {
                // Fall back to opening TV Bluetooth settings
            }
        }

        try {
            launchSettingsAction(Settings.ACTION_BLUETOOTH_SETTINGS);
            JSObject res = new JSObject();
            res.put("changed", false);
            res.put("openedSettings", true);
            res.put("enabled", adapter.isEnabled());
            call.resolve(res);
        } catch (Exception ex) {
            call.reject("Unable to open Bluetooth settings", ex);
        }
    }

    private String mapTvInputType(int type) {
        switch (type) {
            case TvInputInfo.TYPE_HDMI:
                return "hdmi";
            case TvInputInfo.TYPE_TUNER:
                return "tuner";
            case TvInputInfo.TYPE_COMPOSITE:
                return "composite";
            case TvInputInfo.TYPE_COMPONENT:
                return "component";
            case TvInputInfo.TYPE_DISPLAY_PORT:
                return "displayport";
            default:
                return "other";
        }
    }

    private String defaultTvInputLabel(int type) {
        switch (type) {
            case TvInputInfo.TYPE_HDMI:
                return "HDMI";
            case TvInputInfo.TYPE_TUNER:
                return "Live TV";
            case TvInputInfo.TYPE_COMPOSITE:
                return "Composite (AV)";
            case TvInputInfo.TYPE_COMPONENT:
                return "Component";
            case TvInputInfo.TYPE_DISPLAY_PORT:
                return "DisplayPort";
            case TvInputInfo.TYPE_DVI:
                return "DVI";
            case TvInputInfo.TYPE_VGA:
                return "VGA";
            case TvInputInfo.TYPE_SCART:
                return "SCART";
            default:
                return "TV Input";
        }
    }

    @PluginMethod
    public void getTvInputs(PluginCall call) {
        try {
            TvInputManager tvManager = (TvInputManager) getContext().getSystemService(Context.TV_INPUT_SERVICE);
            if (tvManager == null) {
                JSObject res = new JSObject();
                res.put("supported", false);
                res.put("inputs", new JSArray());
                call.resolve(res);
                return;
            }

            List<TvInputInfo> rawList = tvManager.getTvInputList();
            List<JSObject> items = new ArrayList<>();
            if (rawList != null) {
                for (TvInputInfo info : rawList) {
                    if (info == null) continue;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        try {
                            if (info.isHidden(getContext())) continue;
                        } catch (Throwable ignored) {
                            // Keep visible if hidden check fails
                        }
                    }

                    String id = info.getId();
                    if (id == null || id.trim().isEmpty()) continue;

                    String baseLabel = "";
                    try {
                        CharSequence cs = info.loadLabel(getContext());
                        if (cs != null) baseLabel = cs.toString().trim();
                    } catch (Throwable ignored) {
                        baseLabel = "";
                    }

                    String customLabel = "";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        try {
                            CharSequence cs = info.loadCustomLabel(getContext());
                            if (cs != null) customLabel = cs.toString().trim();
                        } catch (Throwable ignored) {
                            customLabel = "";
                        }
                    }

                    String name = !customLabel.isEmpty()
                        ? customLabel
                        : (!baseLabel.isEmpty() ? baseLabel : defaultTvInputLabel(info.getType()));

                    String cecName = "";
                    try {
                        Method hdmiMethod = info.getClass().getMethod("getHdmiDeviceInfo");
                        Object hdmiInfo = hdmiMethod.invoke(info);
                        if (hdmiInfo != null) {
                            Method displayNameMethod = hdmiInfo.getClass().getMethod("getDisplayName");
                            Object displayNameObj = displayNameMethod.invoke(hdmiInfo);
                            if (displayNameObj != null) {
                                cecName = displayNameObj.toString().trim();
                            }
                        }
                    } catch (Throwable ignored) {
                        cecName = "";
                    }

                    int stateCode = TvInputManager.INPUT_STATE_DISCONNECTED;
                    try {
                        stateCode = tvManager.getInputState(id);
                    } catch (Throwable ignored) {
                        stateCode = TvInputManager.INPUT_STATE_DISCONNECTED;
                    }

                    String stateStr = "disconnected";
                    String stateLabel = "No signal";
                    if (stateCode == TvInputManager.INPUT_STATE_CONNECTED) {
                        stateStr = "connected";
                        stateLabel = "Connected";
                    } else if (stateCode == TvInputManager.INPUT_STATE_CONNECTED_STANDBY) {
                        stateStr = "standby";
                        stateLabel = "Standby";
                    }

                    String detail = stateLabel;
                    if (!cecName.isEmpty() && !cecName.equalsIgnoreCase(name)) {
                        detail = cecName + " · " + stateLabel;
                    } else if (!customLabel.isEmpty() && !baseLabel.isEmpty() && !customLabel.equalsIgnoreCase(baseLabel)) {
                        detail = baseLabel + " · " + stateLabel;
                    } else if (!info.isPassthroughInput() && info.getType() == TvInputInfo.TYPE_TUNER) {
                        detail = "Channels";
                    }

                    String pkgName = "";
                    if (info.getServiceInfo() != null && info.getServiceInfo().packageName != null) {
                        pkgName = info.getServiceInfo().packageName;
                    }

                    JSObject entry = new JSObject();
                    entry.put("id", id);
                    entry.put("name", name);
                    entry.put("detail", detail);
                    entry.put("type", mapTvInputType(info.getType()));
                    entry.put("state", stateStr);
                    entry.put("isPassthrough", info.isPassthroughInput());
                    entry.put("packageName", pkgName);
                    items.add(entry);
                }
            }

            Collections.sort(items, new Comparator<JSObject>() {
                @Override
                public int compare(JSObject a, JSObject b) {
                    boolean pa = a.optBoolean("isPassthrough", false);
                    boolean pb = b.optBoolean("isPassthrough", false);
                    if (pa != pb) return pa ? -1 : 1;
                    boolean ca = "connected".equals(a.optString("state"));
                    boolean cb = "connected".equals(b.optString("state"));
                    if (ca != cb) return ca ? -1 : 1;
                    return a.optString("name", "").compareToIgnoreCase(b.optString("name", ""));
                }
            });

            JSArray arr = new JSArray();
            for (JSObject item : items) {
                arr.put(item);
            }

            JSObject res = new JSObject();
            res.put("supported", true);
            res.put("inputs", arr);
            call.resolve(res);
        } catch (Exception ex) {
            call.reject("Unable to read TV inputs", ex);
        }
    }

    @PluginMethod
    public void switchTvInput(PluginCall call) {
        String inputId = call.getString("inputId", "");
        if (inputId == null || inputId.trim().isEmpty()) {
            call.reject("inputId is required");
            return;
        }

        PackageManager pm = getContext().getPackageManager();
        TvInputManager tvManager = (TvInputManager) getContext().getSystemService(Context.TV_INPUT_SERVICE);
        TvInputInfo matched = null;
        if (tvManager != null && tvManager.getTvInputList() != null) {
            for (TvInputInfo info : tvManager.getTvInputList()) {
                if (info != null && inputId.equals(info.getId())) {
                    matched = info;
                    break;
                }
            }
        }

        // 1. Direct passthrough input switch (HDMI, Composite, Component, VGA, DisplayPort)
        if (matched == null || matched.isPassthroughInput()) {
            try {
                Uri passthroughUri = TvContract.buildChannelUriForPassthroughInput(inputId);
                Intent viewIntent = new Intent(Intent.ACTION_VIEW, passthroughUri);
                viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (viewIntent.resolveActivity(pm) != null) {
                    getContext().startActivity(viewIntent);
                    JSObject res = new JSObject();
                    res.put("switched", true);
                    res.put("method", "passthrough-uri");
                    call.resolve(res);
                    return;
                }
            } catch (Throwable ignored) {
                // Try explicit TV player / channels fallback
            }
        }

        // 2. Live Channels / Tuner input via TvContract.Channels.CONTENT_URI
        if (matched != null && matched.getType() == TvInputInfo.TYPE_TUNER) {
            try {
                Intent liveIntent = new Intent(Intent.ACTION_VIEW, TvContract.Channels.CONTENT_URI);
                liveIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (liveIntent.resolveActivity(pm) != null) {
                    getContext().startActivity(liveIntent);
                    JSObject res = new JSObject();
                    res.put("switched", true);
                    res.put("method", "channels-uri");
                    call.resolve(res);
                    return;
                }
            } catch (Throwable ignored) {
                // Try service setup or package launch
            }
        }

        // 3. Input service setup intent or hosting package Leanback launch
        if (matched != null) {
            try {
                Intent setupIntent = matched.createSetupIntent();
                if (setupIntent != null) {
                    setupIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (setupIntent.resolveActivity(pm) != null) {
                        getContext().startActivity(setupIntent);
                        JSObject res = new JSObject();
                        res.put("switched", true);
                        res.put("method", "setup-intent");
                        call.resolve(res);
                        return;
                    }
                }
            } catch (Throwable ignored) {
                // Fall back to package launch
            }

            if (matched.getServiceInfo() != null && matched.getServiceInfo().packageName != null) {
                String pkg = matched.getServiceInfo().packageName;
                if (!pkg.equals("com.android.tv.inputs") && !pkg.equals(getContext().getPackageName())) {
                    Intent pkgIntent = pm.getLeanbackLaunchIntentForPackage(pkg);
                    if (pkgIntent == null) {
                        pkgIntent = pm.getLaunchIntentForPackage(pkg);
                    }
                    if (pkgIntent != null) {
                        pkgIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        try {
                            getContext().startActivity(pkgIntent);
                            JSObject res = new JSObject();
                            res.put("switched", true);
                            res.put("method", "package-launch");
                            call.resolve(res);
                            return;
                        } catch (Throwable ignored) {
                            // Fall through
                        }
                    }
                }
            }
        }

        JSObject res = new JSObject();
        res.put("switched", false);
        res.put("method", "unavailable");
        call.resolve(res);
    }

    @PluginMethod
    public void openTvInputSettings(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String[][] knownActivities = new String[][] {
            new String[] { "com.android.tv.settings", "com.android.tv.settings.inputs.InputsActivity" },
            new String[] { "com.android.tv.settings", "com.android.tv.settings.device.inputs.InputsActivity" },
        };
        for (String[] pair : knownActivities) {
            try {
                Intent intent = new Intent();
                intent.setComponent(new ComponentName(pair[0], pair[1]));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(pm) != null) {
                    getContext().startActivity(intent);
                    JSObject res = new JSObject();
                    res.put("target", pair[1]);
                    call.resolve(res);
                    return;
                }
            } catch (Throwable ignored) {
                // Try next known activity
            }
        }

        try {
            String target = launchSettingsAction(Settings.ACTION_DISPLAY_SETTINGS);
            JSObject res = new JSObject();
            res.put("target", target);
            call.resolve(res);
        } catch (Exception ex) {
            call.reject("Unable to open TV input settings", ex);
        }
    }
}
`;
  fs.writeFileSync(settingsPluginPath, settingsPluginJava, 'utf8');
  console.log('Generated TvSystemSettingsPlugin.java.');

  const appsPluginPath = path.join(javaPkgDir, 'TvAppsPlugin.kt');
  const appsPluginKt = `package com.ambient.tvlauncher

import android.content.ComponentName
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import kotlin.math.roundToInt

@CapacitorPlugin(name = "TvApps")
class TvAppsPlugin : Plugin() {

    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val safePackageRegex = Regex("^[a-zA-Z0-9_.]+$")

    private data class ResolvedEntry(
        val packageName: String,
        val resolveInfo: ResolveInfo?,
        val activityInfo: ActivityInfo?,
        val appInfo: ApplicationInfo?,
        val isTvApp: Boolean
    )

    @PluginMethod
    fun getInstalledApps(call: PluginCall) {
        ioExecutor.execute {
            try {
                val pm = context.packageManager
                val selfPackage = context.packageName

                val leanbackIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
                }
                val standardIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }

                val leanbackApps = runCatching { queryActivitiesCompat(pm, leanbackIntent) }.getOrDefault(emptyList())
                val standardApps = runCatching { queryActivitiesCompat(pm, standardIntent) }.getOrDefault(emptyList())

                val uniqueByPackage = LinkedHashMap<String, ResolvedEntry>()

                for (ri in leanbackApps) {
                    val act = ri.activityInfo ?: continue
                    val pkg = act.packageName ?: continue
                    if (pkg.isBlank() || pkg == selfPackage) continue
                    if (!uniqueByPackage.containsKey(pkg)) {
                        uniqueByPackage[pkg] = ResolvedEntry(
                            packageName = pkg,
                            resolveInfo = ri,
                            activityInfo = act,
                            appInfo = act.applicationInfo,
                            isTvApp = true
                        )
                    }
                }

                for (ri in standardApps) {
                    val act = ri.activityInfo ?: continue
                    val pkg = act.packageName ?: continue
                    if (pkg.isBlank() || pkg == selfPackage) continue
                    if (!uniqueByPackage.containsKey(pkg)) {
                        uniqueByPackage[pkg] = ResolvedEntry(
                            packageName = pkg,
                            resolveInfo = ri,
                            activityInfo = act,
                            appInfo = act.applicationInfo,
                            isTvApp = false
                        )
                    }
                }

                // Fallback scan for OEM Android TV ROMs where queryIntentActivities omits launchable packages
                val installedApps = runCatching { getInstalledApplicationsCompat(pm) }.getOrDefault(emptyList())
                for (appInfo in installedApps) {
                    val pkg = appInfo.packageName ?: continue
                    if (pkg.isBlank() || pkg == selfPackage || uniqueByPackage.containsKey(pkg)) continue

                    val leanbackLaunch = runCatching { pm.getLeanbackLaunchIntentForPackage(pkg) }.getOrNull()
                    val standardLaunch = if (leanbackLaunch == null) {
                        runCatching { pm.getLaunchIntentForPackage(pkg) }.getOrNull()
                    } else null

                    val targetIntent = leanbackLaunch ?: standardLaunch ?: continue
                    val resolved = runCatching { resolveActivityCompat(pm, targetIntent) }.getOrNull()

                    uniqueByPackage[pkg] = ResolvedEntry(
                        packageName = pkg,
                        resolveInfo = resolved,
                        activityInfo = resolved?.activityInfo,
                        appInfo = appInfo,
                        isTvApp = leanbackLaunch != null
                    )
                }

                val entries = uniqueByPackage.values.mapNotNull { item ->
                    runCatching {
                        val pkg = item.packageName
                        val label = runCatching {
                            item.resolveInfo?.loadLabel(pm)?.toString()?.trim()
                                ?: item.appInfo?.loadLabel(pm)?.toString()?.trim()
                        }.getOrNull().takeUnless { it.isNullOrBlank() } ?: pkg

                        val version = getPackageVersionCompat(pm, pkg)
                        val category = resolveCategoryLabel(item.appInfo, item.isTvApp)

                        val bannerDrawable = resolveBannerDrawable(pm, item)
                        val (iconDataUrl, iconTransparent, iconIsBanner) = if (bannerDrawable != null) {
                            encodeWideBanner16x9Base64(bannerDrawable, fillWide = true)
                        } else {
                            val iconDrawable = runCatching {
                                pm.getApplicationIcon(pkg)
                            }.getOrElse {
                                item.resolveInfo?.loadIcon(pm) ?: item.appInfo?.loadIcon(pm)
                            }
                            encodeFallbackIcon16x9Base64(iconDrawable)
                        }

                        Triple(item.isTvApp, label.lowercase(), JSObject().apply {
                            put("name", label)
                            put("packageName", pkg)
                            put("icon", iconDataUrl)
                            put("iconTransparent", iconTransparent)
                            put("iconIsBanner", iconIsBanner)
                            put("version", version)
                            put("category", category)
                            put("isTvApp", item.isTvApp)
                        })
                    }.getOrNull()
                }.sortedWith(
                    compareByDescending<Triple<Boolean, String, JSObject>> { it.first }
                        .thenBy { it.second }
                )

                val jsonApps = JSArray()
                for ((_, _, obj) in entries) {
                    jsonApps.put(obj)
                }

                val result = JSObject()
                result.put("apps", jsonApps)
                call.resolve(result)
            } catch (ex: Exception) {
                call.reject("Failed to query installed apps", ex)
            }
        }
    }

    @PluginMethod
    fun launchApp(call: PluginCall) {
        val packageName = call.getString("packageName")?.trim() ?: ""
        if (!safePackageRegex.matches(packageName) || packageName == context.packageName) {
            call.reject("Invalid target package name")
            return
        }

        val pm = context.packageManager
        val launchIntent = pm.getLeanbackLaunchIntentForPackage(packageName)
            ?: pm.getLaunchIntentForPackage(packageName)

        if (launchIntent == null) {
            call.reject("No launchable activity found for package")
            return
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(launchIntent)
            val result = JSObject()
            result.put("launched", true)
            result.put("packageName", packageName)
            call.resolve(result)
        } catch (ex: Exception) {
            call.reject("Unable to launch application", ex)
        }
    }

    @PluginMethod
    fun openAppDetails(call: PluginCall) {
        val packageName = call.getString("packageName")?.trim() ?: ""
        if (!safePackageRegex.matches(packageName)) {
            call.reject("Invalid target package name")
            return
        }

        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
            call.resolve(JSObject().put("opened", true))
        } catch (ex: Exception) {
            call.reject("Unable to open app details", ex)
        }
    }

    @PluginMethod
    fun uninstallApp(call: PluginCall) {
        val packageName = call.getString("packageName")?.trim() ?: ""
        if (!safePackageRegex.matches(packageName) || packageName == context.packageName) {
            call.reject("Invalid target package name")
            return
        }

        val intent = Intent(Intent.ACTION_DELETE).apply {
            data = Uri.fromParts("package", packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
            call.resolve(JSObject().put("initiated", true))
        } catch (ex: Exception) {
            call.reject("Unable to start uninstall flow", ex)
        }
    }

    private fun resolveBannerDrawable(pm: PackageManager, entry: ResolvedEntry): Drawable? {
        runCatching { entry.activityInfo?.loadBanner(pm) }.getOrNull()?.let { return it }
        val actName = entry.activityInfo?.name
        if (!actName.isNullOrBlank()) {
            runCatching {
                pm.getActivityBanner(ComponentName(entry.packageName, actName))
            }.getOrNull()?.let { return it }
        }
        runCatching { pm.getApplicationBanner(entry.packageName) }.getOrNull()?.let { return it }
        return runCatching { entry.appInfo?.loadBanner(pm) }.getOrNull()
    }

    private fun queryActivitiesCompat(pm: PackageManager, intent: Intent): List<ResolveInfo> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(
                intent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong())
            )
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
        }
    }

    private fun resolveActivityCompat(pm: PackageManager, intent: Intent): ResolveInfo? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.resolveActivity(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.resolveActivity(intent, 0)
        }
    }

    private fun getInstalledApplicationsCompat(pm: PackageManager): List<ApplicationInfo> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getInstalledApplications(PackageManager.ApplicationInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.getInstalledApplications(0)
        }
    }

    private fun getPackageVersionCompat(pm: PackageManager, packageName: String): String {
        return runCatching {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(packageName, 0)
            }
            info.versionName?.takeIf { it.isNotBlank() } ?: "1.0"
        }.getOrDefault("1.0")
    }

    private fun resolveCategoryLabel(appInfo: ApplicationInfo?, isTvApp: Boolean): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appInfo != null) {
            when (appInfo.category) {
                ApplicationInfo.CATEGORY_GAME -> return "Games"
                ApplicationInfo.CATEGORY_AUDIO -> return "Music & Audio"
                ApplicationInfo.CATEGORY_VIDEO -> return "Video & Streaming"
                ApplicationInfo.CATEGORY_IMAGE -> return "Photos & Media"
                ApplicationInfo.CATEGORY_SOCIAL -> return "Social"
                ApplicationInfo.CATEGORY_NEWS -> return "News"
                ApplicationInfo.CATEGORY_MAPS -> return "Maps & Navigation"
                ApplicationInfo.CATEGORY_PRODUCTIVITY -> return "Productivity"
            }
        }
        return if (isTvApp) "Android TV" else "Installed App"
    }

    private fun encodeWideBanner16x9Base64(drawable: Drawable, fillWide: Boolean): Triple<String, Boolean, Boolean> {
        val targetW = 256
        val targetH = 144
        val bitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(5, 6, 8))

        val iw = drawable.intrinsicWidth
        val ih = drawable.intrinsicHeight
        val isWideDrawable = iw <= 0 || ih <= 0 || (iw.toFloat() / ih.toFloat()) >= 1.35f

        if (fillWide && isWideDrawable) {
            drawable.setBounds(0, 0, targetW, targetH)
            drawable.draw(canvas)
        } else {
            val boxH = (targetH * 0.72f).roundToInt()
            val ratio = if (iw > 0 && ih > 0) iw.toFloat() / ih.toFloat() else 1f
            val boxW = (boxH * ratio).roundToInt().coerceAtMost((targetW * 0.86f).roundToInt())
            val left = (targetW - boxW) / 2
            val top = (targetH - boxH) / 2
            drawable.setBounds(left, top, left + boxW, top + boxH)
            drawable.draw(canvas)
        }

        val stream = ByteArrayOutputStream()
        val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Bitmap.CompressFormat.WEBP_LOSSY
        } else {
            @Suppress("DEPRECATION")
            Bitmap.CompressFormat.WEBP
        }
        bitmap.compress(format, 85, stream)
        bitmap.recycle()

        val encoded = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        return Triple("data:image/webp;base64,$encoded", false, true)
    }

    private fun encodeFallbackIcon16x9Base64(drawable: Drawable?): Triple<String, Boolean, Boolean> {
        if (drawable == null) return Triple("", true, false)
        val targetW = 256
        val targetH = 144
        val bitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(5, 6, 8))

        val iw = drawable.intrinsicWidth
        val ih = drawable.intrinsicHeight
        val boxH = (targetH * 0.68f).roundToInt()
        val ratio = if (iw > 0 && ih > 0) iw.toFloat() / ih.toFloat() else 1f
        val boxW = (boxH * ratio).roundToInt().coerceAtMost((targetW * 0.84f).roundToInt())
        val left = (targetW - boxW) / 2
        val top = (targetH - boxH) / 2
        drawable.setBounds(left, top, left + boxW, top + boxH)
        drawable.draw(canvas)

        val stream = ByteArrayOutputStream()
        val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Bitmap.CompressFormat.WEBP_LOSSY
        } else {
            @Suppress("DEPRECATION")
            Bitmap.CompressFormat.WEBP
        }
        bitmap.compress(format, 85, stream)
        bitmap.recycle()

        val encoded = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        return Triple("data:image/webp;base64,$encoded", false, true)
    }
}
`;
  fs.writeFileSync(appsPluginPath, appsPluginKt, 'utf8');
  console.log('Generated TvAppsPlugin.kt.');

  const mainActivityPath = path.join(javaPkgDir, 'MainActivity.java');
  const mainActivityJava = `package com.ambient.tvlauncher;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long OK_LONG_PRESS_MS = 420L;
    private final Handler okHandler = new Handler(Looper.getMainLooper());
    private boolean okLongPressTriggered = false;
    private final Runnable okLongPressRunnable = () -> {
        okLongPressTriggered = true;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('tv-hardware-ok-longpress'));",
                    null
                )
            );
        }
    };

    private boolean isOkKeyCode(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_DPAD_CENTER
            || keyCode == KeyEvent.KEYCODE_ENTER
            || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TvSystemSettingsPlugin.class);
        registerPlugin(TvAppsPlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() ->
                        getBridge().getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('tv-hardware-back'));",
                            null
                        )
                    );
                }
            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isOkKeyCode(event.getKeyCode())) {
            int action = event.getAction();
            if (action == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) {
                    okHandler.removeCallbacks(okLongPressRunnable);
                    okLongPressTriggered = false;
                    okHandler.postDelayed(okLongPressRunnable, OK_LONG_PRESS_MS);
                } else if (okLongPressTriggered) {
                    return true;
                }
            } else if (action == KeyEvent.ACTION_UP) {
                okHandler.removeCallbacks(okLongPressRunnable);
                if (okLongPressTriggered) {
                    okLongPressTriggered = false;
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().post(() ->
                            getBridge().getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('tv-hardware-ok-longpress-end'));",
                                null
                            )
                        );
                    }
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onDestroy() {
        okHandler.removeCallbacks(okLongPressRunnable);
        super.onDestroy();
    }
}
`;
  fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');
  console.log('Generated MainActivity.java with native OK long-press & hardware Back bridge.');
}

// Generate Android adaptive launcher icon & 16:9 TV banner VectorDrawables from user SVG logo
const resDir = path.resolve(process.cwd(), 'android/app/src/main/res');
if (fs.existsSync(resDir)) {
  const drawableDir = path.join(resDir, 'drawable');
  const drawableV24Dir = path.join(resDir, 'drawable-v24');
  const mipmapAnyDpiDir = path.join(resDir, 'mipmap-anydpi-v26');
  fs.mkdirSync(drawableDir, { recursive: true });
  fs.mkdirSync(drawableV24Dir, { recursive: true });
  fs.mkdirSync(mipmapAnyDpiDir, { recursive: true });

  const logoShapesXml = `            <!-- TV top (lightest) -->
            <path
                android:fillColor="#FF8A9CC2"
                android:pathData="M116,222 L170,190 L414,190 L362,222 Z" />
            <!-- TV side (darkest) -->
            <path
                android:fillColor="#FF34415C"
                android:pathData="M362,222 L414,190 L414,366 L362,406 Z" />
            <!-- TV front (mid) -->
            <path
                android:fillColor="#FF4A5A7A"
                android:pathData="M116,222 H362 V406 H116 Z" />
            <!-- Screen sunset gradient -->
            <path android:pathData="M146,246 H336 V382 H146 Z">
                <aapt:attr name="android:fillColor">
                    <gradient
                        android:type="linear"
                        android:startX="146"
                        android:startY="246"
                        android:endX="146"
                        android:endY="382">
                        <item android:offset="0.0" android:color="#FFF6B58A" />
                        <item android:offset="0.55" android:color="#FFE0809A" />
                        <item android:offset="1.0" android:color="#FF8A6BB5" />
                    </gradient>
                </aapt:attr>
            </path>
            <!-- Clipped screen horizon elements -->
            <group>
                <clip-path android:pathData="M146,246 H336 V382 H146 Z" />
                <path
                    android:fillColor="#F2FDE7C8"
                    android:pathData="M288,274 A17,17 0 1 0 288,308 A17,17 0 1 0 288,274 Z" />
                <path
                    android:fillColor="#8CFDE7C8"
                    android:pathData="M202,273 H238 A6,6 0 0 1 244,279 A6,6 0 0 1 238,285 H202 A6,6 0 0 1 196,279 A6,6 0 0 1 202,273 Z" />
                <path
                    android:fillColor="#FF6A5A9E"
                    android:pathData="M146,338 Q190,299 236,329 Q282,359 336,317 V382 H146 Z" />
                <path
                    android:fillColor="#FF33295C"
                    android:pathData="M146,360 Q196,331 246,355 Q296,379 336,349 V382 H146 Z" />
            </group>
            <!-- Antennas -->
            <path
                android:fillColor="#00000000"
                android:strokeColor="#FF4A5A7A"
                android:strokeWidth="9"
                android:strokeLineCap="round"
                android:pathData="M248,200 L194,102" />
            <path
                android:fillColor="#00000000"
                android:strokeColor="#FF4A5A7A"
                android:strokeWidth="9"
                android:strokeLineCap="round"
                android:pathData="M276,200 L330,102" />
            <!-- Antenna base -->
            <path
                android:fillColor="#FF5F7096"
                android:pathData="M240,200 A22,6 0 1 0 284,200 A22,6 0 1 0 240,200 Z" />`;

  const icBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FF0A0E17"
        android:pathData="M0,0 H108 V108 H0 Z" />
</vector>
`;

  const icForegroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="21.625"
        android:translateY="21.625"
        android:scaleX="0.185"
        android:scaleY="0.185">
        <group
            android:translateX="-90"
            android:translateY="-78">
${logoShapesXml}
        </group>
    </group>
</vector>
`;

  const tvBannerXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="320dp"
    android:height="180dp"
    android:viewportWidth="320"
    android:viewportHeight="180">
    <path android:pathData="M0,0 H320 V180 H0 Z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="0"
                android:startY="0"
                android:endX="320"
                android:endY="180">
                <item android:offset="0.0" android:color="#FF090D16" />
                <item android:offset="1.0" android:color="#FF151C2C" />
            </gradient>
        </aapt:attr>
    </path>
    <group
        android:translateX="98.05"
        android:translateY="28.05"
        android:scaleX="0.354"
        android:scaleY="0.354">
        <group
            android:translateX="-90"
            android:translateY="-78">
${logoShapesXml}
        </group>
    </group>
</vector>
`;

  const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;

  fs.writeFileSync(path.join(drawableDir, 'ic_launcher_background.xml'), icBackgroundXml, 'utf8');
  fs.writeFileSync(path.join(drawableDir, 'ic_launcher_foreground.xml'), icForegroundXml, 'utf8');
  fs.writeFileSync(path.join(drawableV24Dir, 'ic_launcher_foreground.xml'), icForegroundXml, 'utf8');
  fs.writeFileSync(path.join(drawableDir, 'tv_banner.xml'), tvBannerXml, 'utf8');
  fs.writeFileSync(path.join(mipmapAnyDpiDir, 'ic_launcher.xml'), adaptiveIconXml, 'utf8');
  fs.writeFileSync(path.join(mipmapAnyDpiDir, 'ic_launcher_round.xml'), adaptiveIconXml, 'utf8');
  console.log('Generated adaptive launcher icons & 16:9 tv_banner VectorDrawables.');

  // Generate crisp anti-aliased raster PNG launcher icons in mipmap-* (used as the APK file icon by Android & file managers)
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const makePngChunk = (type, data) => {
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    if (len > 0) data.copy(chunk, 8);
    const crc = crc32(chunk.subarray(4, 8 + len));
    chunk.writeUInt32BE(crc, 8 + len);
    return chunk;
  };

  const encodeRgbaPng = (width, height, rgba) => {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * (stride + 1);
      raw[rowOffset] = 0;
      rgba.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const idat = zlib.deflateSync(raw, { level: 6 });
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([
      sig,
      makePngChunk('IHDR', ihdr),
      makePngChunk('IDAT', idat),
      makePngChunk('IEND', Buffer.alloc(0)),
    ]);
  };

  const buildCurveLookup = (x0, y0, cx1, cy1, x1, y1, cx2, cy2, x2, y2) => {
    const minX = 146;
    const maxX = 336;
    const lut = new Float32Array(maxX - minX + 1);
    const samples = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const omt = 1 - t;
      samples.push({
        x: omt * omt * x0 + 2 * omt * t * cx1 + t * t * x1,
        y: omt * omt * y0 + 2 * omt * t * cy1 + t * t * y1,
      });
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const omt = 1 - t;
      samples.push({
        x: omt * omt * x1 + 2 * omt * t * cx2 + t * t * x2,
        y: omt * omt * y1 + 2 * omt * t * cy2 + t * t * y2,
      });
    }
    let idx = 0;
    for (let x = minX; x <= maxX; x++) {
      while (idx + 1 < samples.length && samples[idx + 1].x < x) idx++;
      const a = samples[idx];
      const b = samples[Math.min(idx + 1, samples.length - 1)];
      const span = b.x - a.x;
      const frac = span > 1e-4 ? Math.max(0, Math.min(1, (x - a.x) / span)) : 0;
      lut[x - minX] = a.y + (b.y - a.y) * frac;
    }
    return lut;
  };

  const sampleCurveLut = (lut, sx) => {
    const clamped = Math.max(146, Math.min(336, sx));
    const lo = Math.floor(clamped) - 146;
    const hi = Math.min(lut.length - 1, lo + 1);
    const f = clamped - Math.floor(clamped);
    return lut[lo] + (lut[hi] - lut[lo]) * f;
  };

  const backHillLut = buildCurveLookup(146, 338, 190, 299, 236, 329, 282, 359, 336, 317);
  const frontHillLut = buildCurveLookup(146, 360, 196, 331, 246, 355, 296, 379, 336, 349);

  const pointInConvexQuad = (px, py, pts) => {
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
      if (cross >= 0) pos++;
      if (cross <= 0) neg++;
    }
    return pos === 4 || neg === 4;
  };

  const distToSegmentSq = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)) : 0;
    const nx = x1 + t * dx;
    const ny = y1 + t * dy;
    return (px - nx) * (px - nx) + (py - ny) * (py - ny);
  };

  const tvTopQuad = [[116, 222], [170, 190], [414, 190], [362, 222]];
  const tvSideQuad = [[362, 222], [414, 190], [414, 366], [362, 406]];

  const sampleSvgLogo = (sx, sy) => {
    // Antenna base ellipse
    const ex = (sx - 262) / 22;
    const ey = (sy - 200) / 6;
    if (ex * ex + ey * ey <= 1) return [95, 112, 150, 255];

    // Antennas (stroke-width 9 => radius 4.5)
    if (
      distToSegmentSq(sx, sy, 248, 200, 194, 102) <= 20.25 ||
      distToSegmentSq(sx, sy, 276, 200, 330, 102) <= 20.25
    ) {
      return [74, 90, 122, 255];
    }

    // Screen area
    if (sx >= 146 && sx <= 336 && sy >= 246 && sy <= 382) {
      const t = (sy - 246) / 136;
      let r;
      let g;
      let b;
      if (t <= 0.55) {
        const k = t / 0.55;
        r = 246 + (224 - 246) * k;
        g = 181 + (128 - 181) * k;
        b = 138 + (154 - 138) * k;
      } else {
        const k = (t - 0.55) / 0.45;
        r = 224 + (138 - 224) * k;
        g = 128 + (107 - 128) * k;
        b = 154 + (181 - 154) * k;
      }
      // Sun circle (288, 291, r=17) alpha 0.95
      const sdx = sx - 288;
      const sdy = sy - 291;
      if (sdx * sdx + sdy * sdy <= 289) {
        r = r * 0.05 + 253 * 0.95;
        g = g * 0.05 + 231 * 0.95;
        b = b * 0.05 + 200 * 0.95;
      }
      // Cloud rounded pill (196..244, 273..285, rx=6) alpha 0.55
      if (sx >= 196 && sx <= 244 && sy >= 273 && sy <= 285) {
        const cx = sx < 202 ? 202 : sx > 238 ? 238 : sx;
        const cy = 279;
        if ((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) <= 36) {
          r = r * 0.45 + 253 * 0.55;
          g = g * 0.45 + 231 * 0.55;
          b = b * 0.45 + 200 * 0.55;
        }
      }
      if (sy >= sampleCurveLut(frontHillLut, sx)) {
        return [51, 41, 92, 255];
      }
      if (sy >= sampleCurveLut(backHillLut, sx)) {
        return [106, 90, 158, 255];
      }
      return [Math.round(r), Math.round(g), Math.round(b), 255];
    }

    // TV front face
    if (sx >= 116 && sx <= 362 && sy >= 222 && sy <= 406) {
      return [74, 90, 122, 255];
    }
    // TV top face
    if (pointInConvexQuad(sx, sy, tvTopQuad)) {
      return [138, 156, 194, 255];
    }
    // TV side face
    if (pointInConvexQuad(sx, sy, tvSideQuad)) {
      return [52, 65, 92, 255];
    }
    return null;
  };

  const renderAmbientTvIconPng = (size, mode) => {
    const rgba = Buffer.alloc(size * size * 4);
    const subGrid = 3;
    const invSub = 1 / (subGrid * subGrid);
    const logoRatio = mode === 'foreground' ? 0.58 : mode === 'round' ? 0.72 : 0.76;
    const svgSize = 350;
    const logoPixelSpan = size * logoRatio;
    const logoOffset = (size - logoPixelSpan) / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;

        for (let syi = 0; syi < subGrid; syi++) {
          const py = y + (syi + 0.5) / subGrid;
          for (let sxi = 0; sxi < subGrid; sxi++) {
            const px = x + (sxi + 0.5) / subGrid;

            let bgAlpha = 0;
            if (mode === 'square') {
              const margin = size * 0.04;
              const radius = size * 0.21;
              const innerMin = margin + radius;
              const innerMax = size - margin - radius;
              if (px >= margin && px <= size - margin && py >= margin && py <= size - margin) {
                const cx = px < innerMin ? innerMin : px > innerMax ? innerMax : px;
                const cy = py < innerMin ? innerMin : py > innerMax ? innerMax : py;
                if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= radius * radius) {
                  bgAlpha = 1;
                }
              }
            } else if (mode === 'round') {
              const half = size * 0.5;
              const rMax = size * 0.46;
              const dx = px - half;
              const dy = py - half;
              if (dx * dx + dy * dy <= rMax * rMax) {
                bgAlpha = 1;
              }
            }

            const sx = 90 + ((px - logoOffset) / logoPixelSpan) * svgSize;
            const sy = 78 + ((py - logoOffset) / logoPixelSpan) * svgSize;
            const fg = sx >= 85 && sx <= 445 && sy >= 75 && sy <= 430 ? sampleSvgLogo(sx, sy) : null;

            if (fg) {
              sumR += fg[0];
              sumG += fg[1];
              sumB += fg[2];
              sumA += 255;
            } else if (bgAlpha > 0) {
              sumR += 10;
              sumG += 14;
              sumB += 23;
              sumA += 255;
            }
          }
        }

        const outIdx = (y * size + x) * 4;
        const alpha = Math.round(sumA * invSub);
        if (alpha > 0) {
          rgba[outIdx] = Math.round(sumR / (sumA / 255 || 1));
          rgba[outIdx + 1] = Math.round(sumG / (sumA / 255 || 1));
          rgba[outIdx + 2] = Math.round(sumB / (sumA / 255 || 1));
          rgba[outIdx + 3] = alpha;
        }
      }
    }
    return encodeRgbaPng(size, size, rgba);
  };

  const mipmapDensities = [
    { dir: 'mipmap-mdpi', iconSize: 48, fgSize: 108 },
    { dir: 'mipmap-hdpi', iconSize: 72, fgSize: 162 },
    { dir: 'mipmap-xhdpi', iconSize: 96, fgSize: 216 },
    { dir: 'mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
    { dir: 'mipmap-xxxhdpi', iconSize: 192, fgSize: 432 },
  ];

  for (const density of mipmapDensities) {
    const mipDir = path.join(resDir, density.dir);
    fs.mkdirSync(mipDir, { recursive: true });
    fs.writeFileSync(
      path.join(mipDir, 'ic_launcher.png'),
      renderAmbientTvIconPng(density.iconSize, 'square')
    );
    fs.writeFileSync(
      path.join(mipDir, 'ic_launcher_round.png'),
      renderAmbientTvIconPng(density.iconSize, 'round')
    );
    fs.writeFileSync(
      path.join(mipDir, 'ic_launcher_foreground.png'),
      renderAmbientTvIconPng(density.fgSize, 'foreground')
    );
  }
  console.log('Generated mipmap-* raster PNG launcher icons for APK & legacy launchers.');

  // Replace default Capacitor splash.png bitmaps with custom dark Ambient TV logo splash screen
  const splashPngDirs = [
    'drawable',
    'drawable-land-mdpi',
    'drawable-land-hdpi',
    'drawable-land-xhdpi',
    'drawable-land-xxhdpi',
    'drawable-land-xxxhdpi',
    'drawable-port-mdpi',
    'drawable-port-hdpi',
    'drawable-port-xhdpi',
    'drawable-port-xxhdpi',
    'drawable-port-xxxhdpi',
  ];
  for (const dirName of splashPngDirs) {
    const legacySplash = path.join(resDir, dirName, 'splash.png');
    if (fs.existsSync(legacySplash)) {
      fs.unlinkSync(legacySplash);
    }
  }

  const splashLogoXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="148dp"
    android:height="148dp"
    android:viewportWidth="350"
    android:viewportHeight="350">
    <group
        android:translateX="-90"
        android:translateY="-78">
${logoShapesXml}
    </group>
</vector>
`;

  const splashLayerXml = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#FF07080A" />
        </shape>
    </item>
    <item
        android:width="148dp"
        android:height="148dp"
        android:gravity="center"
        android:drawable="@drawable/splash_logo" />
</layer-list>
`;

  fs.writeFileSync(path.join(drawableDir, 'splash_logo.xml'), splashLogoXml, 'utf8');
  fs.writeFileSync(path.join(drawableDir, 'splash.xml'), splashLayerXml, 'utf8');

  const stylesPath = path.join(resDir, 'values', 'styles.xml');
  if (fs.existsSync(stylesPath)) {
    let stylesXml = fs.readFileSync(stylesPath, 'utf8');
    const launchStyleBlock = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:windowBackground">@drawable/splash</item>
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">#07080A</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>`;

    if (/<style\s+name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/.test(stylesXml)) {
      stylesXml = stylesXml.replace(
        /<style\s+name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/,
        launchStyleBlock.trimStart()
      );
    } else if (stylesXml.includes('</resources>')) {
      stylesXml = stylesXml.replace('</resources>', `${launchStyleBlock}\n</resources>`);
    }
    fs.writeFileSync(stylesPath, stylesXml, 'utf8');
  }
  console.log('Configured custom Ambient TV icon launch splash screen.');
}

