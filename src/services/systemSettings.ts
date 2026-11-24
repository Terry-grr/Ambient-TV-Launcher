import { Capacitor, registerPlugin } from '@capacitor/core';
import { BluetoothDevice } from '../types/launcher';

interface NativeBluetoothDevicePayload {
  id: string;
  name: string;
  address?: string;
  type?: 'remote' | 'audio' | 'gamepad' | 'peripheral';
  connected?: boolean;
  battery?: number;
}

interface TvSystemSettingsPlugin {
  openSystemSettings(): Promise<{ target: string }>;
  openBluetoothSettings(): Promise<{ target: string }>;
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
}

const TvSystemSettings = registerPlugin<TvSystemSettingsPlugin>('TvSystemSettings');

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
