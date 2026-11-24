import { Capacitor, registerPlugin } from '@capacitor/core';
import { AppItem } from '../types/launcher';

export interface NativeInstalledAppPayload {
  name: string;
  packageName: string;
  icon: string;
  iconTransparent?: boolean;
  iconIsBanner?: boolean;
  version?: string;
  category?: string;
  isTvApp?: boolean;
}

interface TvAppsPlugin {
  getInstalledApps(): Promise<{ apps: NativeInstalledAppPayload[] }>;
  launchApp(options: { packageName: string }): Promise<{ launched: boolean; packageName: string }>;
  openAppDetails(options: { packageName: string }): Promise<{ opened: boolean }>;
  uninstallApp(options: { packageName: string }): Promise<{ initiated: boolean }>;
}

const TvApps = registerPlugin<TvAppsPlugin>('TvApps');

const SAFE_PACKAGE_NAME_RE = /^[a-zA-Z0-9_.]+$/;
const SAFE_BASE64_ICON_RE =
  /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

export function isNativeAndroidPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isSafePackageName(pkg: string): boolean {
  return typeof pkg === 'string' && pkg.length > 0 && pkg.length <= 200 && SAFE_PACKAGE_NAME_RE.test(pkg);
}

export function sanitizeBase64IconDataUrl(raw?: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512_000) return undefined;
  return SAFE_BASE64_ICON_RE.test(trimmed) ? trimmed : undefined;
}

export function mergeAppsWithSavedOrder(
  apps: AppItem[],
  savedPackageOrder: string[]
): AppItem[] {
  if (!Array.isArray(savedPackageOrder) || savedPackageOrder.length === 0) {
    return apps;
  }
  const rankMap = new Map<string, number>();
  savedPackageOrder.forEach((pkg, idx) => {
    if (typeof pkg === 'string' && !rankMap.has(pkg)) {
      rankMap.set(pkg, idx);
    }
  });

  return [...apps].sort((a, b) => {
    const rankA = rankMap.get(a.packageName);
    const rankB = rankMap.get(b.packageName);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return 0;
  });
}

export async function fetchNativeInstalledApps(
  savedPackageOrder: string[] = []
): Promise<AppItem[] | null> {
  if (!isNativeAndroidPlatform()) {
    return null;
  }

  const res = await TvApps.getInstalledApps();
  const rawList = Array.isArray(res?.apps) ? res.apps : [];

  const mapped: AppItem[] = rawList
    .filter((entry) => entry && isSafePackageName(entry.packageName))
    .map((entry) => {
      const iconDataUrl = sanitizeBase64IconDataUrl(entry.icon);
      const displayName =
        typeof entry.name === 'string' && entry.name.trim().length > 0
          ? entry.name.trim()
          : entry.packageName;

      return {
        id: `pkg:${entry.packageName}`,
        name: displayName,
        category:
          typeof entry.category === 'string' && entry.category.trim().length > 0
            ? entry.category.trim()
            : entry.isTvApp
            ? 'Android TV'
            : 'Installed App',
        packageName: entry.packageName,
        version:
          typeof entry.version === 'string' && entry.version.trim().length > 0
            ? entry.version.trim()
            : '1.0',
        sizeMb: 0,
        cacheMb: 0,
        accentColor: '#1E293B',
        iconKey: 'tv-app',
        iconDataUrl,
        iconTransparent: Boolean(entry.iconTransparent),
        iconIsBanner: Boolean(entry.iconIsBanner),
        permissions: [entry.isTvApp ? 'Leanback TV Launcher Activity' : 'Standard Launcher Activity'],
        description: `Installed Android package (${entry.packageName}).`,
      };
    });

  return mergeAppsWithSavedOrder(mapped, savedPackageOrder);
}

export async function launchNativeApp(
  packageName: string
): Promise<{ launched: boolean; reason: 'native' | 'web-preview' | 'error' }> {
  if (!isNativeAndroidPlatform()) {
    return { launched: false, reason: 'web-preview' };
  }
  if (!isSafePackageName(packageName)) {
    return { launched: false, reason: 'error' };
  }
  try {
    const res = await TvApps.launchApp({ packageName });
    return {
      launched: Boolean(res?.launched),
      reason: res?.launched ? 'native' : 'error',
    };
  } catch {
    return { launched: false, reason: 'error' };
  }
}

export async function openNativeAppDetails(packageName: string): Promise<boolean> {
  if (!isNativeAndroidPlatform() || !isSafePackageName(packageName)) {
    return false;
  }
  try {
    await TvApps.openAppDetails({ packageName });
    return true;
  } catch {
    return false;
  }
}

export async function uninstallNativeApp(packageName: string): Promise<boolean> {
  if (!isNativeAndroidPlatform() || !isSafePackageName(packageName)) {
    return false;
  }
  try {
    await TvApps.uninstallApp({ packageName });
    return true;
  } catch {
    return false;
  }
}
