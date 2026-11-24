import fs from 'node:fs';
import path from 'node:path';

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

// Package visibility queries for Android 11+ (Leanback & Standard launchers + Settings + Bluetooth)
const queriesBlock = `    <queries>
        <package android:name="com.android.tv.settings" />
        <intent>
            <action android:name="android.settings.SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.settings.BLUETOOTH_SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.settings.APPLICATION_DETAILS_SETTINGS" />
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

if (!manifest.includes('android:banner=')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:banner="@mipmap/ic_launcher"'
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
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        try {
            String target = launchSettingsAction(Settings.ACTION_SETTINGS);
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
  if (fs.existsSync(mainActivityPath)) {
    let mainActivity = fs.readFileSync(mainActivityPath, 'utf8');

    if (!mainActivity.includes('import android.os.Bundle;')) {
      mainActivity = mainActivity.replace(
        'import com.getcapacitor.BridgeActivity;',
        'import android.os.Bundle;\nimport androidx.activity.OnBackPressedCallback;\nimport com.getcapacitor.BridgeActivity;'
      );
    } else if (!mainActivity.includes('OnBackPressedCallback')) {
      mainActivity = mainActivity.replace(
        'import com.getcapacitor.BridgeActivity;',
        'import androidx.activity.OnBackPressedCallback;\nimport com.getcapacitor.BridgeActivity;'
      );
    }

    const backCallbackSnippet = `        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
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
        });`;

    if (mainActivity.includes('public class MainActivity extends BridgeActivity {}')) {
      mainActivity = mainActivity.replace(
        'public class MainActivity extends BridgeActivity {}',
        `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TvSystemSettingsPlugin.class);
        registerPlugin(TvAppsPlugin.class);
        super.onCreate(savedInstanceState);
${backCallbackSnippet}
    }
}`
      );
    } else {
      if (!mainActivity.includes('registerPlugin(TvSystemSettingsPlugin.class);')) {
        mainActivity = mainActivity.replace(
          'super.onCreate(savedInstanceState);',
          'registerPlugin(TvSystemSettingsPlugin.class);\n        super.onCreate(savedInstanceState);'
        );
      }
      if (!mainActivity.includes('registerPlugin(TvAppsPlugin.class);')) {
        mainActivity = mainActivity.replace(
          'super.onCreate(savedInstanceState);',
          'registerPlugin(TvAppsPlugin.class);\n        super.onCreate(savedInstanceState);'
        );
      }
      if (!mainActivity.includes('tv-hardware-back')) {
        mainActivity = mainActivity.replace(
          'super.onCreate(savedInstanceState);',
          `super.onCreate(savedInstanceState);\n${backCallbackSnippet}`
        );
      }
    }

    fs.writeFileSync(mainActivityPath, mainActivity, 'utf8');
    console.log('Registered TvSystemSettingsPlugin, TvAppsPlugin & hardware Back bridge in MainActivity.java.');
  }
}
