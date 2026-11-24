# Ambient TV Launcher

A calm, minimalist Android TV / Google TV home screen built around uninterrupted artwork, weather awareness, and fluid remote-first navigation.

> [!IMPORTANT]
> **Beta Software · Hobby Project**: Ambient TV Launcher is an independent personal hobby project currently in **beta**. Features, layouts, and D-pad behaviors are actively evolving, and some hardware/OEM-specific features (such as TV input switching, Bluetooth status, or launcher overrides) may behave differently across Android TV / Google TV devices. Use at your own discretion and please back up or keep your stock launcher available via ADB when testing.

> [!NOTE]
> Public APK releases and synchronized GPL-3.0 source code are published together to this repository starting from secondary releases (`v0.1.0+`).

---

## Features

- **Minimalist Home Dock**: Centered 5-slot `16:9` radiused app dock with border-only selection aura animations, optional 12h/24h clock, and a 4-hour weather summary with severe-weather alerts.
- **Ambient Mode (`D-pad Up`)**: Full-bleed artwork canvas with smooth overlapping cross-dissolves. All controls (title, QR attribution card, navigation arrows, and chevron) fade cleanly out after 10 seconds; press **Up** or tap to reveal, **Left/Right** to cycle wallpapers, and **OK** to inspect the artwork source.
- **Weather-Synced Background Albums**: 250+ curated widescreen wallpapers across 11 categories (Nature, Landscape, Seascapes, Animals, Space, Satellite, Classical Paintings, Abstract & Modern, Ink & Minimalist, Architecture, Geometric), plus local device photo/folder albums and custom `https://` image URLs, with multi-tag weather filtering.
- **All Apps Drawer (`D-pad Down`)**: Full installed app grid with long-press reordering, info modal, and restore defaults.
- **Quick Settings & System Settings (`D-pad Left`)**: Quick toggles for inputs, display options, albums, weather, and a **Full Settings** shortcut that launches Android TV System Settings (`com.android.tv.settings` with standard Android Settings fallback).
- **In-App Update Checker**: Check this repository's latest GitHub Release directly inside **Main Settings → GitHub**.

---

## Installing & Updating the APK

1. Download the latest `.apk` file from the **Releases** page on this repository.
2. Enable **Developer options → USB debugging / Wireless debugging** (or **Install unknown apps** for your file manager) on your Android TV / Google TV device.
3. Sideload via ADB from a computer on the same Wi-Fi network:
   ```bash
   adb connect <TV_IP_ADDRESS>:5555
   adb install -r ambient-tv-launcher-vX.Y.Z-release.apk
   ```
   *(If upgrading between a Debug APK and a Signed Release APK, run `adb uninstall com.ambient.tvlauncher` first because Android requires matching signing keys for in-place upgrades.)*

---

## Safely Setting Ambient TV Launcher as Your Default Launcher (ADB)

Android TV / Google TV normally forces the stock launcher back when you press the Home button unless it is disabled for the current user. **Always use `pm disable-user --user 0` instead of `pm uninstall`**, because disabling keeps the stock package intact on `/system` for instant recovery.

### Step 1: Connect and Confirm Both Launchers Exist

Never disable your stock launcher before confirming **Ambient TV Launcher** is installed and working!

```bash
adb connect <TV_IP_ADDRESS>:5555
adb shell pm list packages | grep -iE "ambient|launcher"
```

Verify `package:com.ambient.tvlauncher` appears in the output, and open it once on the TV to make sure it renders normally.

### Step 2: Set the Default Home Activity

```bash
adb shell cmd package set-home-activity com.ambient.tvlauncher/.MainActivity
```

### Step 3: Safely Disable the Stock Launcher (Reversible)

Depending on your device OS, disable **one** of the following stock launcher packages (whichever appeared in Step 1):

- **Google TV (Chromecast with Google TV, Google TV Streamer, newer Sony/TCL/Hisense):**
  ```bash
  adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
  adb shell pm disable-user --user 0 com.google.android.tungsten.setupwraith
  ```
- **Classic Android TV:**
  ```bash
  adb shell pm disable-user --user 0 com.google.android.tvlauncher
  ```

Press the **Home** button on your remote to confirm Ambient TV Launcher opens immediately.

### Step 4: How to Restore the Stock Launcher Anytime

If you ever want to switch back to Google TV / Android TV's default home screen, reconnect over ADB and re-enable the package:

```bash
# Re-enable Google TV launcher
adb shell pm enable com.google.android.apps.tv.launcherx
adb shell pm enable com.google.android.tungsten.setupwraith

# OR re-enable classic Android TV launcher
adb shell pm enable com.google.android.tvlauncher

# Reset Home activity back to stock
adb shell cmd package set-home-activity com.google.android.apps.tv.launcherx/.HomeActivity
```

*(Note: Some TV OEMs re-enable the stock launcher automatically after major Android system OTAs; if that happens, simply re-run Step 2 and Step 3.)*

---

## Privacy & Network Disclosures

- **Zero Telemetry & Zero Ads**: Ambient TV Launcher contains no analytics SDKs, ad trackers, user accounts, or background telemetry.
- **On-Device Storage**: Settings, weather tag overrides, and custom URLs are stored locally on your device. Local album photos stay strictly on-device in IndexedDB (`android:allowBackup="false"` prevents cloud backup export).
- **Approximate Weather Location**: When Weather is enabled in GPS mode, the launcher requests coarse city-level location (`ACCESS_COARSE_LOCATION`) and rounds latitude/longitude to 2 decimal places (`~1.1 km`) before querying [Open-Meteo](https://open-meteo.com/) and [BigDataCloud](https://www.bigdatacloud.com/). You can also disable Weather or switch to a manual city at any time.
- **External Wallpaper & Update Requests**: Loading curated open-access images or tapping **Refresh Catalog** connects directly to NASA Images, Cleveland Museum of Art Open Access, and Wikimedia Commons with `referrerPolicy="no-referrer"`. Checking for updates in Settings queries the public GitHub Releases API only when requested.

---

## Legal Notices & Disclaimers

- **License (GNU GPL-3.0-or-later)**: This software is free open-source software licensed under the **GNU General Public License v3.0 or later** ([LICENSE](./LICENSE)). You may run, study, share, and modify it under the terms of the GPLv3.
- **No Warranty**: In accordance with Sections 15 and 16 of the GNU GPLv3, this software and compiled APKs are provided **"AS IS"** without warranty of any kind, express or implied.
- **ADB & Device Modification Risk**: Disabling system packages via ADB is performed at your own risk. Always verify `com.ambient.tvlauncher` is installed and functional before disabling your stock launcher, and keep USB/Wireless Debugging credentials secure on trusted home networks only.
- **Third-Party Trademarks**: Preset app titles, descriptions, and Android package names (such as YouTube, Netflix, Plex, Spotify, Twitch, Prime Video, Disney+, Apple TV, Jellyfin, Kodi, Stremio, Steam Link, VLC) are trademarks of their respective owners. Ambient TV Launcher is an independent project with no affiliation or endorsement from any third-party brand or device manufacturer.
- **Artwork & Media Attribution**: Curated wallpapers bundle original generated artwork alongside public-domain / CC0 works from the Cleveland Museum of Art Open Access initiative, NASA public-domain imagery, and Wikimedia Commons open media archives. Individual titles, creator credits, and source QR links are displayed in Ambient Mode.
