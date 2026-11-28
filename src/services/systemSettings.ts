import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { BluetoothDevice, TvInputDevice } from '../types/launcher';

interface NativeBluetoothDevicePayload {
  id: string;
  name: string;
  address?: string;
  type?: 'remote' | 'audio' | 'gamepad' | 'peripheral';
  connected?: boolean;
  battery?: number;
}

interface NativeTvInputPayload {
  id: string;
  name: string;
  detail?: string;
  type?: 'hdmi' | 'tuner' | 'composite' | 'component' | 'displayport' | 'other';
  state?: 'connected' | 'standby' | 'disconnected';
  isPassthrough?: boolean;
  packageName?: string;
}

interface TvSystemSettingsPlugin {
  openSystemSettings(): Promise<{ target: string }>;
  openBluetoothSettings(): Promise<{ target: string }>;
  openTvInputSettings(): Promise<{ target: string }>;
  getTvInputs(): Promise<{
    supported: boolean;
    inputs: NativeTvInputPayload[];
  }>;
  switchTvInput(options: { inputId: string }): Promise<{
    switched: boolean;
    method: string;
  }>;
  getBluetoothDevices(): Promise<{
    enabled: boolean;
    permissionRequired?: boolean;
    devices: NativeBluetoothDevicePayload[];
  }>;
  requestBluetoothPermission(): Promise<{ granted: boolean }>;
  toggleBluetooth(options: { enable: boolean }): Promise<{
    changed: boolean;
    openedSettings?: boolean;
    enabled: boolean;
  }>;
  showSoftInput(): Promise<void>;
  startQrPasteSession(options: { fieldLabel?: string }): Promise<{
    url: string;
    token: string;
    ip: string;
    port: number;
  }>;
  stopQrPasteSession(): Promise<void>;
  addListener(
    eventName: 'qrPasteReceived',
    listenerFunc: (event: { token: string; url: string }) => void
  ): Promise<PluginListenerHandle>;
}

const TvSystemSettings = registerPlugin<TvSystemSettingsPlugin>('TvSystemSettings');

export interface QrPasteSessionInfo {
  url: string;
  token: string;
  ip: string;
  port: number;
}

export interface SystemSettingsLaunchResult {
  launched: boolean;
  target: string;
  reason?: 'web-preview' | 'error';
}

export interface NativeBluetoothSnapshot {
  enabled: boolean;
  permissionRequired: boolean;
  devices: BluetoothDevice[];
}

export async function openAndroidSystemSettings(): Promise<SystemSettingsLaunchResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      launched: false,
      target: 'com.android.tv.settings',
      reason: 'web-preview',
    };
  }

  try {
    const result = await TvSystemSettings.openSystemSettings();
    return {
      launched: true,
      target: result?.target || 'com.android.tv.settings',
    };
  } catch {
    return {
      launched: false,
      target: 'android.settings.SETTINGS',
      reason: 'error',
    };
  }
}

export async function openAndroidBluetoothSettings(): Promise<SystemSettingsLaunchResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      launched: false,
      target: 'android.settings.BLUETOOTH_SETTINGS',
      reason: 'web-preview',
    };
  }

  try {
    const result = await TvSystemSettings.openBluetoothSettings();
    return {
      launched: true,
      target: result?.target || 'android.settings.BLUETOOTH_SETTINGS',
    };
  } catch {
    return {
      launched: false,
      target: 'android.settings.BLUETOOTH_SETTINGS',
      reason: 'error',
    };
  }
}

export async function openAndroidInputSettings(): Promise<SystemSettingsLaunchResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      launched: false,
      target: 'com.android.tv.settings.inputs',
      reason: 'web-preview',
    };
  }

  try {
    const result = await TvSystemSettings.openTvInputSettings();
    return {
      launched: true,
      target: result?.target || 'com.android.tv.settings',
    };
  } catch {
    return {
      launched: false,
      target: 'android.settings.DISPLAY_SETTINGS',
      reason: 'error',
    };
  }
}

export async function getNativeTvInputs(): Promise<{
  supported: boolean;
  inputs: TvInputDevice[];
} | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const res = await TvSystemSettings.getTvInputs();
    const raw = Array.isArray(res?.inputs) ? res.inputs : [];
    const inputs: TvInputDevice[] = raw
      .filter((item) => item && typeof item.id === 'string' && item.id.trim().length > 0)
      .map((item) => ({
        id: item.id,
        name: (item.name || 'TV Input').trim(),
        detail: (item.detail || '').trim(),
        type:
          item.type === 'hdmi' ||
          item.type === 'tuner' ||
          item.type === 'composite' ||
          item.type === 'component' ||
          item.type === 'displayport'
            ? item.type
            : 'other',
        state:
          item.state === 'connected' || item.state === 'standby'
            ? item.state
            : 'disconnected',
        isPassthrough: Boolean(item.isPassthrough),
        packageName: item.packageName,
      }));
    return {
      supported: Boolean(res?.supported),
      inputs,
    };
  } catch {
    return null;
  }
}

export async function switchNativeTvInput(
  inputId: string
): Promise<{ switched: boolean; method: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { switched: false, method: 'web-preview' };
  }
  try {
    const res = await TvSystemSettings.switchTvInput({ inputId });
    return {
      switched: Boolean(res?.switched),
      method: res?.method || 'unknown',
    };
  } catch {
    return { switched: false, method: 'error' };
  }
}

export async function getNativeBluetoothState(): Promise<NativeBluetoothSnapshot | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const res = await TvSystemSettings.getBluetoothDevices();
    const rawDevices = Array.isArray(res?.devices) ? res.devices : [];
    const devices: BluetoothDevice[] = rawDevices
      .filter((d) => d && typeof d.name === 'string' && d.name.trim().length > 0)
      .map((d, idx) => ({
        id: d.id || d.address || `bt-native-${idx}`,
        name: d.name.trim(),
        address: d.address,
        type:
          d.type === 'remote' || d.type === 'audio' || d.type === 'gamepad'
            ? d.type
            : 'peripheral',
        connected: Boolean(d.connected),
        battery:
          typeof d.battery === 'number' && d.battery >= 0 && d.battery <= 100
            ? d.battery
            : undefined,
      }));

    return {
      enabled: Boolean(res?.enabled),
      permissionRequired: Boolean(res?.permissionRequired),
      devices,
    };
  } catch {
    return null;
  }
}

export async function requestNativeBluetoothPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await TvSystemSettings.requestBluetoothPermission();
    return Boolean(res?.granted);
  } catch {
    return false;
  }
}

export async function toggleNativeBluetooth(
  enable: boolean
): Promise<{ changed: boolean; openedSettings: boolean; enabled: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { changed: true, openedSettings: false, enabled: enable };
  }
  try {
    const res = await TvSystemSettings.toggleBluetooth({ enable });
    return {
      changed: Boolean(res?.changed),
      openedSettings: Boolean(res?.openedSettings),
      enabled: Boolean(res?.enabled),
    };
  } catch {
    return { changed: false, openedSettings: false, enabled: !enable };
  }
}

export async function showAndroidSoftKeyboard(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await TvSystemSettings.showSoftInput();
  } catch {
    // Ignore unsupported platform/IME errors
  }
}

export async function startAndroidQrPasteSession(
  fieldLabel: string
): Promise<QrPasteSessionInfo> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Phone QR Paste local Wi-Fi server runs in the Android TV app.');
  }
  return await TvSystemSettings.startQrPasteSession({ fieldLabel });
}

export async function stopAndroidQrPasteSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await TvSystemSettings.stopQrPasteSession();
  } catch {
    // Ignore teardown errors
  }
}

export async function addAndroidQrPasteListener(
  onReceive: (payload: { token: string; url: string }) => void
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }
  try {
    const handle = await TvSystemSettings.addListener('qrPasteReceived', onReceive);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

