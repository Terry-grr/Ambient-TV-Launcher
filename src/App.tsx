import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Settings,
} from 'lucide-react';
import {
  CURATED_WALLPAPERS,
  DEFAULT_APPS,
  DEFAULT_MANUAL_CITY,
  DEFAULT_SETTINGS,
  DEFAULT_SLIDESHOW_POOLS,
} from './data/defaults';
import {
  AppItem,
  BluetoothDevice,
  CuratedCategory,
  LauncherScreen,
  LauncherSettings,
  ManualCityOption,
  ModalOverlay,
  SlideshowPoolKey,
  WallpaperItem,
  WeatherState,
  WeatherTag,
} from './types/launcher';
import {
  clearLocalAlbumPhotos,
  loadLocalAlbumWallpapers,
  removeLocalAlbumPhoto,
  saveLocalAlbumFiles,
  updateLocalAlbumMetadata,
} from './utils/albumStorage';
import {
  fetchFourHourForecast,
  mapWeatherToTag,
  resolveDeviceLocation,
} from './services/weatherService';
import {
  filterWallpapersByWeather,
  getEffectiveWeatherTags,
  loadMergedCuratedCatalog,
  refreshOpenArchiveCatalog,
  toggleItemWeatherTag,
} from './services/wallpaperCatalogService';
import {
  getNativeBluetoothState,
  openAndroidBluetoothSettings,
  openAndroidSystemSettings,
  requestNativeBluetoothPermission,
  toggleNativeBluetooth,
} from './services/systemSettings';
import {
  fetchNativeInstalledApps,
  isNativeAndroidPlatform,
  launchNativeApp,
  openNativeAppDetails,
  uninstallNativeApp,
} from './services/nativeApps';
import {
  isSafeHttpUrl,
  parseGithubRepoSlug,
  sanitizeWallpaperImageUrl,
} from './utils/urlValidation';
import { BackdropCanvas } from './components/BackdropCanvas';
import { FerrofluidAura } from './components/FerrofluidAura';
import { AppTile } from './components/AppTile';
import { WeatherWidget } from './components/WeatherWidget';
import { AmbientView } from './components/AmbientView';
import {
  QuickSettingsDrawer,
  QuickSettingsHandle,
} from './components/QuickSettingsDrawer';
import { AppsDrawer } from './components/AppsDrawer';
import { TouchRemote } from './components/TouchRemote';
import {
  AppActionModal,
  SystemAppInfoModal,
} from './components/AppActionAndInfoModals';
import {
  AlbumPickerModal,
  QrDetailModal,
} from './components/AlbumAndWeatherModals';
import { WeatherDrawer, WeatherDrawerFocus } from './components/WeatherDrawer';
import { FullSettingsModal } from './components/FullSettingsModal';

const STORAGE_KEYS = {
  apps: 'ambient_tv_apps_v1',
  packageOrder: 'ambient_tv_package_order_v1',
  settings: 'ambient_tv_settings_v1',
  customUrls: 'ambient_tv_custom_urls_v1',
  activeWallpaperId: 'ambient_tv_active_wallpaper_v1',
  weatherPrefs: 'ambient_tv_weather_prefs_v1',
};

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatLauncherTime(date: Date, format: '12h' | '24h'): string {
  if (format === '24h') {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date
    .toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
}

function shuffleIds(ids: string[], avoidFirstId?: string): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.length > 1 && avoidFirstId && arr[0] === avoidFirstId) {
    const swapIdx = 1 + Math.floor(Math.random() * (arr.length - 1));
    [arr[0], arr[swapIdx]] = [arr[swapIdx], arr[0]];
  }
  return arr;
}

function getActiveDialog(): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
  );
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
}

function getDialogFocusables(dialog: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([type="hidden"]):not([disabled])'
    )
  );
  return candidates.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function moveDialogFocus(
  dir: 'up' | 'down' | 'left' | 'right',
  instantScroll: boolean
): boolean {
  const dialog = getActiveDialog();
  if (!dialog) return false;
  const focusables = getDialogFocusables(dialog);
  if (focusables.length === 0) return false;

  const active = document.activeElement as HTMLElement | null;
  if (!active || !dialog.contains(active) || !focusables.includes(active)) {
    const preferred =
      focusables.find((el) => !el.getAttribute('aria-label')?.startsWith('Close')) ??
      focusables[0];
    preferred.focus({ preventScroll: true });
    preferred.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: instantScroll ? 'auto' : 'smooth',
    });
    return true;
  }

  if (
    active instanceof HTMLInputElement &&
    active.type === 'range' &&
    (dir === 'left' || dir === 'right')
  ) {
    const min = Number(active.min || '0');
    const max = Number(active.max || '100');
    const step = Math.max(1, Number(active.step || '5'));
    const cur = Number(active.value);
    const next =
      dir === 'left' ? Math.max(min, cur - step) : Math.min(max, cur + step);
    if (next !== cur) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(active, String(next));
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  const curRect = active.getBoundingClientRect();
  const cx = curRect.left + curRect.width / 2;
  const cy = curRect.top + curRect.height / 2;

  let bestEl: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const cand of focusables) {
    if (cand === active) continue;
    const r = cand.getBoundingClientRect();
    const candCx = r.left + r.width / 2;
    const candCy = r.top + r.height / 2;

    let valid = false;
    let primary = 0;
    let cross = 0;
    let overlapsCross = false;

    if (dir === 'right') {
      valid = candCx > cx + 4;
      primary = candCx - cx;
      cross = Math.abs(candCy - cy);
      overlapsCross =
        Math.min(curRect.bottom, r.bottom) > Math.max(curRect.top, r.top) - 6;
    } else if (dir === 'left') {
      valid = candCx < cx - 4;
      primary = cx - candCx;
      cross = Math.abs(candCy - cy);
      overlapsCross =
        Math.min(curRect.bottom, r.bottom) > Math.max(curRect.top, r.top) - 6;
    } else if (dir === 'down') {
      valid = candCy > cy + 4;
      primary = candCy - cy;
      cross = Math.abs(candCx - cx);
      overlapsCross =
        Math.min(curRect.right, r.right) > Math.max(curRect.left, r.left) - 6;
    } else {
      valid = candCy < cy - 4;
      primary = cy - candCy;
      cross = Math.abs(candCx - cx);
      overlapsCross =
        Math.min(curRect.right, r.right) > Math.max(curRect.left, r.left) - 6;
    }

    if (!valid) continue;
    const score = overlapsCross ? primary + cross * 0.35 : primary + cross * 2.6;
    if (score < bestScore) {
      bestScore = score;
      bestEl = cand;
    }
  }

  if (bestEl) {
    bestEl.focus({ preventScroll: true });
    bestEl.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: instantScroll ? 'auto' : 'smooth',
    });
    return true;
  }
  return false;
}

export default function App() {
  // Core launcher screen & focus state
  const [screen, setScreen] = useState<LauncherScreen>('default');
  const [modal, setModal] = useState<ModalOverlay>(null);
  const [homeFocusIndex, setHomeFocusIndex] = useState<number>(0); // Defaults to App 1
  const [drawerFocusIndex, setDrawerFocusIndex] = useState<number>(0);
  const [qsFocusIndex, setQsFocusIndex] = useState<number | null>(0);
  const quickSettingsRef = useRef<QuickSettingsHandle | null>(null);
  const [touchRemoteSuppressed, setTouchRemoteSuppressed] = useState<boolean>(false);
  const [weatherFocus, setWeatherFocus] = useState<WeatherDrawerFocus>({
    section: 'hourly',
    index: 0,
  });
  const [weatherActivateSignal, setWeatherActivateSignal] = useState<number>(0);
  const [ambientRevealSignal, setAmbientRevealSignal] = useState<number>(0);
  const [movingAppId, setMovingAppId] = useState<string | null>(null);
  const [btPermissionRequired, setBtPermissionRequired] = useState<boolean>(false);
  const [btLoading, setBtLoading] = useState<boolean>(false);
  const btRefreshInFlightRef = useRef(false);

  const isNativeAndroid = isNativeAndroidPlatform();

  useEffect(() => {
    if (!isNativeAndroid) return;
    document.documentElement.classList.add('tv-perf');
    return () => {
      document.documentElement.classList.remove('tv-perf');
    };
  }, [isNativeAndroid]);

  // Apps & Settings persisted locally (web preview uses DEFAULT_APPS; Android TV loads real apps)
  const [apps, setApps] = useState<AppItem[]>(() =>
    isNativeAndroid
      ? []
      : readJsonStorage<AppItem[]>(STORAGE_KEYS.apps, DEFAULT_APPS)
  );
  const [nativeAppsError, setNativeAppsError] = useState<string | null>(null);
  const [nativeAppsLoading, setNativeAppsLoading] = useState<boolean>(false);
  const nativeRefreshInFlightRef = useRef(false);
  const [settings, setSettings] = useState<LauncherSettings>(() => {
    const stored = readJsonStorage<Partial<LauncherSettings>>(STORAGE_KEYS.settings, {});
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      slideshowPools: {
        ...DEFAULT_SLIDESHOW_POOLS,
        ...(stored.slideshowPools ?? {}),
      },
      wallpaperWeatherTags: stored.wallpaperWeatherTags ?? {},
      hiddenWallpaperIds: Array.isArray(stored.hiddenWallpaperIds)
        ? stored.hiddenWallpaperIds.filter((id): id is string => typeof id === 'string')
        : [],
      publicReleaseRepo:
        typeof stored.publicReleaseRepo === 'string' &&
        parseGithubRepoSlug(stored.publicReleaseRepo)
          ? parseGithubRepoSlug(stored.publicReleaseRepo)!
          : DEFAULT_SETTINGS.publicReleaseRepo,
    };
  });

  // Clock
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const timeText = useMemo(
    () => formatLauncherTime(now, settings.clockFormat),
    [now, settings.clockFormat]
  );

  // Wallpapers & Albums
  const [curatedWallpapers, setCuratedWallpapers] = useState<WallpaperItem[]>(() =>
    loadMergedCuratedCatalog()
  );
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [localWallpapers, setLocalWallpapers] = useState<WallpaperItem[]>([]);
  const [customUrlWallpapers, setCustomUrlWallpapers] = useState<WallpaperItem[]>(() =>
    readJsonStorage<WallpaperItem[]>(STORAGE_KEYS.customUrls, []).filter((item) => {
      if (!item?.id || !item?.imageUrl) return false;
      const safeImg = sanitizeWallpaperImageUrl(item.imageUrl);
      if (!safeImg) return false;
      item.imageUrl = safeImg;
      item.sourceUrl = isSafeHttpUrl(item.sourceUrl) ? item.sourceUrl : safeImg;
      return true;
    })
  );
  const [activeWallpaperId, setActiveWallpaperId] = useState<string>(() => {
    const stored = readJsonStorage<string | null>(STORAGE_KEYS.activeWallpaperId, null);
    if (stored) return stored;
    const randIdx = Math.floor(Math.random() * CURATED_WALLPAPERS.length);
    return CURATED_WALLPAPERS[randIdx]?.id ?? CURATED_WALLPAPERS[0].id;
  });
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});

  // Load local album blobs from IndexedDB on mount
  useEffect(() => {
    let active = true;
    void loadLocalAlbumWallpapers().then((loaded) => {
      if (active) setLocalWallpapers(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const hiddenWallpaperSet = useMemo(
    () => new Set(settings.hiddenWallpaperIds),
    [settings.hiddenWallpaperIds]
  );

  const visibleCuratedWallpapers = useMemo(
    () => curatedWallpapers.filter((w) => !hiddenWallpaperSet.has(w.id)),
    [curatedWallpapers, hiddenWallpaperSet]
  );

  const allWallpapers = useMemo(
    () => [...visibleCuratedWallpapers, ...localWallpapers, ...customUrlWallpapers],
    [visibleCuratedWallpapers, localWallpapers, customUrlWallpapers]
  );

  const handleRefreshCatalog = useCallback(async (category?: CuratedCategory) => {
    setRefreshingCatalog(true);
    try {
      const updated = await refreshOpenArchiveCatalog(category);
      setCuratedWallpapers(updated);
    } finally {
      setRefreshingCatalog(false);
    }
  }, []);

  const handleToggleImageWeatherTag = useCallback(
    (wallpaperId: string, clickedTag: WeatherTag) => {
      const item = allWallpapers.find((w) => w.id === wallpaperId);
      if (!item) return;
      setSettings((s) => {
        const current = getEffectiveWeatherTags(item, s.wallpaperWeatherTags);
        const next = toggleItemWeatherTag(current, clickedTag);
        return {
          ...s,
          wallpaperWeatherTags: {
            ...s.wallpaperWeatherTags,
            [wallpaperId]: next,
          },
        };
      });
    },
    [allWallpapers]
  );

  const refreshNativeApps = useCallback(async () => {
    if (!isNativeAndroid || nativeRefreshInFlightRef.current) return;
    nativeRefreshInFlightRef.current = true;
    setNativeAppsLoading(true);
    setNativeAppsError(null);
    const savedOrder = readJsonStorage<string[]>(STORAGE_KEYS.packageOrder, []);
    try {
      const installed = await fetchNativeInstalledApps(savedOrder);
      if (installed) {
        setApps(installed);
        setHomeFocusIndex((i) =>
          installed.length === 0 ? 0 : Math.min(i, Math.min(4, installed.length - 1))
        );
        setDrawerFocusIndex((i) =>
          installed.length === 0 ? 0 : Math.min(i, installed.length - 1)
        );
      }
    } catch (err) {
      setNativeAppsError(
        err instanceof Error
          ? err.message
          : 'Unable to query installed Android TV packages.'
      );
    } finally {
      nativeRefreshInFlightRef.current = false;
      setNativeAppsLoading(false);
    }
  }, [isNativeAndroid]);

  // Query real Android TV installed apps on mount & resume
  useEffect(() => {
    if (!isNativeAndroid) return;
    void refreshNativeApps();

    const onResume = () => {
      if (document.visibilityState === 'visible') {
        void refreshNativeApps();
      }
    };
    const onFocus = () => {
      void refreshNativeApps();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onFocus);
    };
  }, [isNativeAndroid, refreshNativeApps]);

  const refreshNativeBluetooth = useCallback(async () => {
    if (!isNativeAndroid || btRefreshInFlightRef.current) return;
    btRefreshInFlightRef.current = true;
    setBtLoading(true);
    try {
      const snapshot = await getNativeBluetoothState();
      if (snapshot) {
        setBtPermissionRequired(snapshot.permissionRequired);
        setSettings((s) => ({
          ...s,
          bluetoothEnabled: snapshot.enabled,
          bluetoothDevices: snapshot.permissionRequired
            ? s.bluetoothDevices
            : snapshot.devices,
        }));
      }
    } finally {
      btRefreshInFlightRef.current = false;
      setBtLoading(false);
    }
  }, [isNativeAndroid]);

  useEffect(() => {
    if (!isNativeAndroid || screen !== 'quick-settings') return;
    void refreshNativeBluetooth();

    const onResume = () => {
      if (document.visibilityState === 'visible') {
        void refreshNativeBluetooth();
      }
    };
    const onFocus = () => {
      void refreshNativeBluetooth();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onFocus);
    };
  }, [isNativeAndroid, screen, refreshNativeBluetooth]);

  // Persist apps (web preview) & package order (Android TV), settings, wallpaper preferences
  useEffect(() => {
    if (isNativeAndroid) {
      if (apps.length > 0) {
        localStorage.setItem(
          STORAGE_KEYS.packageOrder,
          JSON.stringify(apps.map((a) => a.packageName))
        );
      }
      return;
    }
    localStorage.setItem(STORAGE_KEYS.apps, JSON.stringify(apps));
  }, [apps, isNativeAndroid]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.customUrls, JSON.stringify(customUrlWallpapers));
  }, [customUrlWallpapers]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.activeWallpaperId,
      JSON.stringify(activeWallpaperId)
    );
  }, [activeWallpaperId]);

  // Weather state & live 4-hour forecast
  const [weather, setWeather] = useState<WeatherState>(() => {
    const savedWeatherPrefs = readJsonStorage<{
      enabled: boolean;
      locationMode: 'gps' | 'manual';
      manualCity: ManualCityOption;
    }>(STORAGE_KEYS.weatherPrefs, {
      enabled: true,
      locationMode: 'gps',
      manualCity: DEFAULT_MANUAL_CITY,
    });
    return {
      enabled: savedWeatherPrefs.enabled,
      locationMode: savedWeatherPrefs.locationMode,
      manualCity: savedWeatherPrefs.manualCity,
      activeLocationLabel: savedWeatherPrefs.manualCity.name,
      usingGpsFallback: false,
      loading: false,
      error: null,
      current: null,
      nextFourHours: [],
      hourly24Hours: [],
      daily7Days: [],
      hasWarning: false,
      warningHeadline: null,
      extendedWarningHeadline: null,
      badWeatherChanceMax: 0,
      lastUpdated: null,
    };
  });

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.weatherPrefs,
      JSON.stringify({
        enabled: weather.enabled,
        locationMode: weather.locationMode,
        manualCity: weather.manualCity,
      })
    );
  }, [weather.enabled, weather.locationMode, weather.manualCity]);

  const refreshWeather = useCallback(
    async (mode: 'gps' | 'manual', manualCity: ManualCityOption) => {
      setWeather((prev) => ({ ...prev, loading: true, error: null }));
      let lat = manualCity.latitude;
      let lon = manualCity.longitude;
      let label = manualCity.name;
      let fallbackUsed = false;

      if (mode === 'gps') {
        try {
          const loc = await resolveDeviceLocation();
          lat = loc.latitude;
          lon = loc.longitude;
          label = loc.city;
        } catch {
          fallbackUsed = true;
        }
      }

      try {
        const forecast = await fetchFourHourForecast(lat, lon);
        setWeather((prev) => ({
          ...prev,
          loading: false,
          error: null,
          activeLocationLabel: label,
          usingGpsFallback: fallbackUsed,
          current: forecast.current,
          nextFourHours: forecast.nextFourHours,
          hourly24Hours: forecast.hourly24Hours,
          daily7Days: forecast.daily7Days,
          hasWarning: forecast.hasWarning,
          warningHeadline: forecast.warningHeadline,
          extendedWarningHeadline: forecast.extendedWarningHeadline,
          badWeatherChanceMax: forecast.badWeatherChanceMax,
          lastUpdated: Date.now(),
        }));
      } catch {
        setWeather((prev) => ({
          ...prev,
          loading: false,
          error: 'Could not reach forecast feed',
          activeLocationLabel: label,
          usingGpsFallback: fallbackUsed,
        }));
      }
    },
    []
  );

  useEffect(() => {
    if (!weather.enabled && !settings.syncBackgroundToWeather) return;
    void refreshWeather(weather.locationMode, weather.manualCity);
    const interval = window.setInterval(() => {
      void refreshWeather(weather.locationMode, weather.manualCity);
    }, 1000 * 60 * 15);
    return () => window.clearInterval(interval);
  }, [
    weather.enabled,
    settings.syncBackgroundToWeather,
    weather.locationMode,
    weather.manualCity,
    refreshWeather,
  ]);

  const activeWeatherTag = useMemo<WeatherTag | null>(() => {
    if (!weather.current) return null;
    return mapWeatherToTag(weather.current.weatherCode, weather.current.windGustKmh);
  }, [weather.current]);

  const { activeSlideshowPool, usedWeatherFallback } = useMemo(() => {
    const pools = settings.slideshowPools;
    const curatedMatches = visibleCuratedWallpapers.filter(
      (item) => item.category && pools[item.category]
    );
    const localMatches = pools['local-album'] ? localWallpapers : [];
    const customMatches = pools['custom-urls'] ? customUrlWallpapers : [];
    const combined = [...curatedMatches, ...localMatches, ...customMatches];
    const fallbackPool =
      allWallpapers.length > 0 ? allWallpapers : CURATED_WALLPAPERS;
    const basePool = combined.length > 0 ? combined : fallbackPool;
    const healthyPool = basePool.filter((w) => !brokenImageIds[w.id]);
    const poolToFilter = healthyPool.length > 0 ? healthyPool : fallbackPool;

    const filtered = filterWallpapersByWeather(
      poolToFilter,
      settings.syncBackgroundToWeather,
      activeWeatherTag,
      settings.wallpaperWeatherTags
    );
    return {
      activeSlideshowPool: filtered.items,
      usedWeatherFallback: filtered.usedFallback,
    };
  }, [
    settings.slideshowPools,
    settings.syncBackgroundToWeather,
    settings.wallpaperWeatherTags,
    visibleCuratedWallpapers,
    localWallpapers,
    customUrlWallpapers,
    allWallpapers,
    brokenImageIds,
    activeWeatherTag,
  ]);

  const activeWallpaper = useMemo(() => {
    return (
      allWallpapers.find((w) => w.id === activeWallpaperId) ??
      activeSlideshowPool[0] ??
      CURATED_WALLPAPERS[0]
    );
  }, [allWallpapers, activeSlideshowPool, activeWallpaperId]);

  // If weather sync is active and weather shifts or sync turns on, align current background if mismatched
  useEffect(() => {
    if (!settings.syncBackgroundToWeather || activeSlideshowPool.length === 0) return;
    const stillMatches = activeSlideshowPool.some((w) => w.id === activeWallpaper.id);
    if (!stillMatches) {
      setActiveWallpaperId(activeSlideshowPool[0].id);
    }
  }, [
    settings.syncBackgroundToWeather,
    activeWeatherTag,
    activeSlideshowPool,
    activeWallpaper.id,
  ]);

  // Shuffled non-repeating slideshow queue across active pool
  const shuffledQueueRef = useRef<string[]>([]);
  const wallpaperHistoryRef = useRef<string[]>([]);
  const activePoolSignature = useMemo(
    () => activeSlideshowPool.map((w) => w.id).join('\u0000'),
    [activeSlideshowPool]
  );
  const activeWallpaperIdRef = useRef(activeWallpaperId);
  activeWallpaperIdRef.current = activeWallpaperId;

  useEffect(() => {
    const ids = activeSlideshowPool.map((w) => w.id);
    const curId = activeWallpaperIdRef.current;
    const rest = ids.length > 1 ? ids.filter((id) => id !== curId) : ids;
    shuffledQueueRef.current = shuffleIds(rest, curId);
    wallpaperHistoryRef.current = [];
  }, [activePoolSignature, activeSlideshowPool]);

  const handleNextWallpaper = useCallback(() => {
    if (activeSlideshowPool.length <= 1) return;
    const poolIds = activeSlideshowPool.map((w) => w.id);
    const poolSet = new Set(poolIds);
    const curId = activeWallpaper.id;

    let queue = shuffledQueueRef.current.filter(
      (id) => poolSet.has(id) && id !== curId
    );
    if (queue.length === 0) {
      const rest = poolIds.filter((id) => id !== curId);
      queue = shuffleIds(rest.length > 0 ? rest : poolIds, curId);
    }

    const [nextId, ...remaining] = queue;
    shuffledQueueRef.current = remaining;
    if (nextId) {
      wallpaperHistoryRef.current = [
        ...wallpaperHistoryRef.current.slice(-59),
        curId,
      ];
      setActiveWallpaperId(nextId);
    }
  }, [activeSlideshowPool, activeWallpaper.id]);

  const handlePrevWallpaper = useCallback(() => {
    if (activeSlideshowPool.length <= 1) return;
    const poolIds = activeSlideshowPool.map((w) => w.id);
    const poolSet = new Set(poolIds);
    const curId = activeWallpaper.id;

    const history = [...wallpaperHistoryRef.current];
    let prevId: string | undefined;
    while (history.length > 0) {
      const candidate = history.pop();
      if (candidate && poolSet.has(candidate) && candidate !== curId) {
        prevId = candidate;
        break;
      }
    }
    wallpaperHistoryRef.current = history;

    if (prevId) {
      shuffledQueueRef.current = [
        curId,
        ...shuffledQueueRef.current.filter((id) => id !== curId && id !== prevId),
      ];
      setActiveWallpaperId(prevId);
      return;
    }

    const fallbackQueue = shuffledQueueRef.current.filter(
      (id) => poolSet.has(id) && id !== curId
    );
    const candidate =
      fallbackQueue.pop() ?? poolIds.find((id) => id !== curId);
    if (candidate) {
      shuffledQueueRef.current = [
        curId,
        ...fallbackQueue.filter((id) => id !== curId),
      ];
      setActiveWallpaperId(candidate);
    }
  }, [activeSlideshowPool, activeWallpaper.id]);

  // Slideshow timer
  useEffect(() => {
    if (settings.slideshowIntervalSec <= 0 || activeSlideshowPool.length <= 1) {
      return;
    }
    const timer = window.setInterval(
      handleNextWallpaper,
      settings.slideshowIntervalSec * 1000
    );
    return () => window.clearInterval(timer);
  }, [settings.slideshowIntervalSec, activeSlideshowPool.length, handleNextWallpaper]);

  // Launch & system settings feedback toast
  const [launchToast, setLaunchToast] = useState<{ title: string; detail: string } | null>(null);
  const launchTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (launchTimerRef.current) window.clearTimeout(launchTimerRef.current);
    };
  }, []);
  const showStatusToast = useCallback((title: string, detail: string) => {
    setLaunchToast({ title, detail });
    if (launchTimerRef.current) window.clearTimeout(launchTimerRef.current);
    launchTimerRef.current = window.setTimeout(() => {
      setLaunchToast(null);
    }, 2600);
  }, []);

  const suppressOkLaunchUntilRef = useRef<number>(0);

  const handleLaunchApp = useCallback(
    (app: AppItem) => {
      if (performance.now() < suppressOkLaunchUntilRef.current) {
        return;
      }
      setModal(null);
      if (isNativeAndroid) {
        void launchNativeApp(app.packageName).then((res) => {
          if (!res.launched) {
            showStatusToast(`Unable to open ${app.name}`, app.packageName);
          }
        });
        return;
      }
      showStatusToast(`Opening ${app.name}`, app.packageName);
    },
    [isNativeAndroid, showStatusToast]
  );

  const handleOpenSystemSettings = useCallback(async () => {
    const res = await openAndroidSystemSettings();
    if (!res.launched) {
      if (res.reason === 'web-preview') {
        showStatusToast(
          'Android TV System Settings',
          'Launches com.android.tv.settings (fallback: Settings.ACTION_SETTINGS) in APK'
        );
      } else {
        showStatusToast(
          'System Settings Unavailable',
          'Could not start Settings activity on this device'
        );
      }
    }
  }, [showStatusToast]);

  const handleOpenBluetoothSettings = useCallback(async () => {
    const res = await openAndroidBluetoothSettings();
    if (!res.launched) {
      if (res.reason === 'web-preview') {
        showStatusToast(
          'Android TV Bluetooth Settings',
          'Opens Settings.ACTION_BLUETOOTH_SETTINGS to pair new devices on TV'
        );
      } else {
        showStatusToast(
          'Bluetooth Settings Unavailable',
          'Could not open Android TV Bluetooth settings'
        );
      }
    }
  }, [showStatusToast]);

  const handleToggleBluetoothRadio = useCallback(async () => {
    const targetEnable = !settings.bluetoothEnabled;
    if (!isNativeAndroid) {
      setSettings((s) => ({ ...s, bluetoothEnabled: targetEnable }));
      return;
    }

    const res = await toggleNativeBluetooth(targetEnable);
    if (res.openedSettings) {
      showStatusToast(
        'Android TV Bluetooth Settings',
        'Android 13+ toggles Bluetooth radio in system settings'
      );
      return;
    }
    if (res.changed) {
      setSettings((s) => ({ ...s, bluetoothEnabled: res.enabled }));
      void refreshNativeBluetooth();
    } else {
      void handleOpenBluetoothSettings();
    }
  }, [
    settings.bluetoothEnabled,
    isNativeAndroid,
    showStatusToast,
    refreshNativeBluetooth,
    handleOpenBluetoothSettings,
  ]);

  const handleToggleBluetoothDevice = useCallback(
    async (device: BluetoothDevice) => {
      if (!isNativeAndroid) {
        setSettings((s) => ({
          ...s,
          bluetoothDevices: s.bluetoothDevices.map((d) =>
            d.id === device.id ? { ...d, connected: !d.connected } : d
          ),
        }));
        return;
      }

      await handleOpenBluetoothSettings();
    },
    [isNativeAndroid, handleOpenBluetoothSettings]
  );

  const handleRequestBluetoothPermission = useCallback(async () => {
    await requestNativeBluetoothPermission();
    await refreshNativeBluetooth();
  }, [refreshNativeBluetooth]);

  // Reorder / Uninstall handlers
  const handleSwapOrMoveApp = useCallback(
    (targetIndex: number) => {
      if (!movingAppId) return;
      setApps((prev) => {
        const fromIdx = prev.findIndex((a) => a.id === movingAppId);
        if (fromIdx === -1 || fromIdx === targetIndex) return prev;
        const copy = [...prev];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(targetIndex, 0, moved);
        return copy;
      });
      setDrawerFocusIndex(targetIndex);
    },
    [movingAppId]
  );

  const handleUninstallApp = useCallback(
    (appId: string) => {
      if (isNativeAndroid) {
        const target = apps.find((a) => a.id === appId);
        setMovingAppId(null);
        setModal(null);
        if (target) {
          void uninstallNativeApp(target.packageName);
        }
        return;
      }
      setApps((prev) => {
        if (prev.length <= 5) return prev;
        const next = prev.filter((a) => a.id !== appId);
        return next;
      });
      setMovingAppId(null);
      setModal(null);
      setHomeFocusIndex(0);
      setDrawerFocusIndex((i) => Math.max(0, i - 1));
    },
    [apps, isNativeAndroid]
  );

  const handleClearCache = useCallback((appId: string) => {
    setApps((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, cacheMb: 0 } : a))
    );
  }, []);

  // Refs for Home Dock Selection Aura
  const dockRef = useRef<HTMLDivElement | null>(null);
  const dockTileRefs = useRef<Record<string, HTMLElement | null>>({});
  const getDockTileEl = useCallback(
    (key: string) => dockTileRefs.current[key] ?? null,
    []
  );

  const pinnedApps = useMemo(() => apps.slice(0, 5), [apps]);
  const activeHomeKey =
    pinnedApps[homeFocusIndex]?.id ?? pinnedApps[0]?.id ?? null;

  // Responsive grid column calculation for D-pad navigation in Apps Drawer
  const getDrawerCols = () => (window.innerWidth >= 640 ? 5 : 2);

  // Auto-focus first control whenever a modal dialog opens or nested sub-dialog mounts
  useEffect(() => {
    if (!modal) return;
    let subTimer: number | null = null;
    const focusModalEntry = () => {
      const dialog = getActiveDialog();
      if (!dialog) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && dialog.contains(active)) return;
      const focusables = getDialogFocusables(dialog);
      const preferred =
        focusables.find((el) => el.dataset.autofocus === 'true') ??
        focusables.find((el) => !el.getAttribute('aria-label')?.startsWith('Close')) ??
        focusables[0];
      preferred?.focus({ preventScroll: true });
      preferred?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: isNativeAndroid ? 'auto' : 'smooth',
      });
    };

    const timer = window.setTimeout(focusModalEntry, 25);
    const observer = new MutationObserver(() => {
      if (subTimer) window.clearTimeout(subTimer);
      subTimer = window.setTimeout(focusModalEntry, 20);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      if (subTimer) window.clearTimeout(subTimer);
      observer.disconnect();
    };
  }, [modal, isNativeAndroid]);

  // Unified D-Pad Direction Handler (Keyboard + Touch Remote + Modal Spatial Navigation)
  const handleDirection = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (modal) {
        moveDialogFocus(dir, isNativeAndroid);
        return;
      }

      if (screen === 'default') {
        if (dir === 'left') {
          if (homeFocusIndex > 0) {
            setHomeFocusIndex((i) => i - 1);
          } else {
            setQsFocusIndex(0);
            setScreen('quick-settings');
          }
        } else if (dir === 'right') {
          if (homeFocusIndex < pinnedApps.length - 1) {
            setHomeFocusIndex((i) => i + 1);
          } else {
            setWeatherFocus({ section: 'hourly', index: 0 });
            setScreen('weather');
          }
        } else if (dir === 'up') {
          setAmbientRevealSignal((n) => n + 1);
          setScreen('ambient');
        } else if (dir === 'down') {
          setDrawerFocusIndex(homeFocusIndex);
          setScreen('apps-drawer');
        }
        return;
      }

      if (screen === 'ambient') {
        if (dir === 'down') {
          setScreen('default');
        } else if (dir === 'up') {
          setAmbientRevealSignal((n) => n + 1);
        } else if (dir === 'right') {
          handleNextWallpaper();
        } else if (dir === 'left') {
          handlePrevWallpaper();
        }
        return;
      }

      if (screen === 'quick-settings') {
        const handled = quickSettingsRef.current?.moveFocus(dir) ?? false;
        if (!handled && dir === 'right') {
          setScreen('default');
        }
        return;
      }

      if (screen === 'weather') {
        const allResults = Array.from(
          document.querySelectorAll<HTMLElement>('[data-weather-result]')
        );
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.hasAttribute('data-weather-result')) {
          const idx = allResults.indexOf(activeEl);
          if (dir === 'down') {
            if (idx >= 0 && idx < allResults.length - 1) {
              allResults[idx + 1].focus();
              allResults[idx + 1].scrollIntoView({ block: 'nearest' });
              return;
            }
            activeEl.blur();
            setWeatherFocus({ section: 'controls', index: 3 });
            return;
          }
          if (dir === 'up') {
            if (idx > 0) {
              allResults[idx - 1].focus();
              allResults[idx - 1].scrollIntoView({ block: 'nearest' });
              return;
            }
            activeEl.blur();
            setWeatherFocus({ section: 'controls', index: 1 });
            return;
          }
          if (dir === 'left') {
            activeEl.blur();
            setScreen('default');
            return;
          }
        }

        const hourMax = Math.max(0, weather.hourly24Hours.length - 1);
        const dayMax = Math.max(0, weather.daily7Days.length - 1);

        if (weatherFocus.section === 'header') {
          if (dir === 'left') {
            if (weatherFocus.index > 0) {
              setWeatherFocus({ section: 'header', index: 0 });
            } else {
              setScreen('default');
            }
          } else if (dir === 'right') {
            setWeatherFocus({ section: 'header', index: 1 });
          } else if (dir === 'down') {
            setWeatherFocus({ section: 'hourly', index: 0 });
          }
          return;
        }

        if (weatherFocus.section === 'hourly') {
          if (dir === 'left') {
            if (weatherFocus.index > 0) {
              setWeatherFocus((f) => ({ ...f, index: f.index - 1 }));
            } else {
              setScreen('default');
            }
          } else if (dir === 'right') {
            setWeatherFocus((f) => ({
              ...f,
              index: Math.min(hourMax, f.index + 1),
            }));
          } else if (dir === 'up') {
            setWeatherFocus({ section: 'header', index: 1 });
          } else if (dir === 'down') {
            setWeatherFocus({
              section: 'daily',
              index: Math.min(dayMax, weatherFocus.index % 7),
            });
          }
          return;
        }

        if (weatherFocus.section === 'daily') {
          if (dir === 'left') {
            if (weatherFocus.index > 0) {
              setWeatherFocus((f) => ({ ...f, index: f.index - 1 }));
            } else {
              setScreen('default');
            }
          } else if (dir === 'right') {
            setWeatherFocus((f) => ({
              ...f,
              index: Math.min(dayMax, f.index + 1),
            }));
          } else if (dir === 'up') {
            setWeatherFocus({
              section: 'hourly',
              index: Math.min(hourMax, weatherFocus.index),
            });
          } else if (dir === 'down') {
            setWeatherFocus({ section: 'controls', index: 0 });
          }
          return;
        }

        // weatherFocus.section === 'controls'
        // 0: Auto Location, 1: Search input, 2: Search button, 3: Sync Wallpaper, 4: Home Widget
        if (dir === 'left') {
          if (weatherFocus.index === 2) {
            setWeatherFocus({ section: 'controls', index: 1 });
          } else if (weatherFocus.index === 4) {
            setWeatherFocus({ section: 'controls', index: 3 });
          } else {
            setScreen('default');
          }
        } else if (dir === 'right') {
          if (weatherFocus.index === 1) {
            setWeatherFocus({ section: 'controls', index: 2 });
          } else if (weatherFocus.index === 3) {
            setWeatherFocus({ section: 'controls', index: 4 });
          }
        } else if (dir === 'down') {
          if (weatherFocus.index === 0) {
            setWeatherFocus({ section: 'controls', index: 1 });
          } else if (weatherFocus.index === 1 || weatherFocus.index === 2) {
            if (allResults.length > 0) {
              allResults[0].focus();
              allResults[0].scrollIntoView({ block: 'nearest' });
            } else {
              setWeatherFocus({ section: 'controls', index: 3 });
            }
          } else if (weatherFocus.index === 3) {
            setWeatherFocus({ section: 'controls', index: 4 });
          }
        } else if (dir === 'up') {
          if (weatherFocus.index === 0) {
            setWeatherFocus({ section: 'daily', index: 0 });
          } else if (weatherFocus.index === 1 || weatherFocus.index === 2) {
            setWeatherFocus({ section: 'controls', index: 0 });
          } else if (weatherFocus.index === 3 || weatherFocus.index === 4) {
            if (allResults.length > 0) {
              const lastResult = allResults[allResults.length - 1];
              lastResult.focus();
              lastResult.scrollIntoView({ block: 'nearest' });
            } else {
              setWeatherFocus({ section: 'controls', index: 1 });
            }
          }
        }
        return;
      }

      if (screen === 'apps-drawer') {
        const cols = getDrawerCols();
        let nextIndex = drawerFocusIndex;

        if (dir === 'left') {
          nextIndex = Math.max(0, drawerFocusIndex - 1);
        } else if (dir === 'right') {
          nextIndex = Math.min(apps.length - 1, drawerFocusIndex + 1);
        } else if (dir === 'down') {
          nextIndex = Math.min(apps.length - 1, drawerFocusIndex + cols);
        } else if (dir === 'up') {
          if (drawerFocusIndex < cols && !movingAppId) {
            setHomeFocusIndex(Math.min(drawerFocusIndex, pinnedApps.length - 1));
            setScreen('default');
            return;
          }
          nextIndex = Math.max(0, drawerFocusIndex - cols);
        }

        if (movingAppId) {
          handleSwapOrMoveApp(nextIndex);
        } else {
          setDrawerFocusIndex(nextIndex);
        }
      }
    },
    [
      modal,
      screen,
      homeFocusIndex,
      pinnedApps.length,
      drawerFocusIndex,
      apps.length,
      movingAppId,
      weather.hourly24Hours.length,
      weather.daily7Days.length,
      weatherFocus,
      handleSwapOrMoveApp,
      handleNextWallpaper,
      handlePrevWallpaper,
      isNativeAndroid,
    ]
  );

  const handleOkTap = useCallback(() => {
    if (modal) {
      const dialog = getActiveDialog();
      const active = document.activeElement as HTMLElement | null;
      const target =
        active && dialog?.contains(active)
          ? active
          : dialog
          ? getDialogFocusables(dialog)[0] ?? null
          : null;
      if (target) {
        if (
          target instanceof HTMLInputElement &&
          target.type !== 'range' &&
          target.type !== 'checkbox'
        ) {
          target.focus();
        } else {
          target.click();
        }
      }
      return;
    }
    if (screen === 'default') {
      const app = pinnedApps[homeFocusIndex];
      if (app) handleLaunchApp(app);
    } else if (screen === 'ambient') {
      setModal({ type: 'qr-detail' });
    } else if (screen === 'weather') {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl?.hasAttribute('data-weather-result')) {
        activeEl.click();
        return;
      }
      if (weatherFocus.section === 'header' || weatherFocus.section === 'controls') {
        setWeatherActivateSignal((n) => n + 1);
      }
    } else if (screen === 'apps-drawer') {
      if (movingAppId) {
        setMovingAppId(null);
      } else {
        const app = apps[drawerFocusIndex];
        if (app) handleLaunchApp(app);
      }
    } else if (screen === 'quick-settings') {
      quickSettingsRef.current?.activateFocused();
    }
  }, [
    modal,
    screen,
    pinnedApps,
    homeFocusIndex,
    apps,
    drawerFocusIndex,
    movingAppId,
    weatherFocus.section,
    handleLaunchApp,
  ]);

  const handleOkLongPress = useCallback(() => {
    if (modal) return;
    if (screen === 'default') {
      const app = pinnedApps[homeFocusIndex];
      if (app) {
        suppressOkLaunchUntilRef.current = performance.now() + 2000;
        setModal({ type: 'app-action', appId: app.id, from: 'default' });
      }
    } else if (screen === 'apps-drawer') {
      const app = apps[drawerFocusIndex];
      if (app) {
        suppressOkLaunchUntilRef.current = performance.now() + 2000;
        setModal({ type: 'app-action', appId: app.id, from: 'drawer' });
      }
    }
  }, [modal, screen, pinnedApps, homeFocusIndex, apps, drawerFocusIndex]);

  const handleBack = useCallback(() => {
    if (modal) {
      const subEvent = new CustomEvent('tv-modal-subback', { cancelable: true });
      if (!window.dispatchEvent(subEvent)) {
        return;
      }
      setModal(null);
      return;
    }
    if (movingAppId) {
      setMovingAppId(null);
      return;
    }
    if (screen !== 'default') {
      setScreen('default');
    }
  }, [modal, movingAppId, screen]);

  // Keyboard D-pad & Android TV Hardware Back listener
  const enterHoldTimerRef = useRef<number | null>(null);
  const enterDidHoldRef = useRef(false);
  const enterHeldActiveRef = useRef(false);

  useEffect(() => {
    const isOkRemoteKey = (e: KeyboardEvent) =>
      e.key === 'Enter' ||
      e.key === 'NumpadEnter' ||
      e.key === 'Select' ||
      e.key === 'Accept' ||
      e.keyCode === 23;

    const onKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName;
      const isTextInput =
        tag === 'TEXTAREA' ||
        (targetEl instanceof HTMLInputElement &&
          targetEl.type !== 'range' &&
          targetEl.type !== 'checkbox');

      if (
        e.key === 'Escape' ||
        e.key === 'GoBack' ||
        e.key === 'BrowserBack' ||
        e.keyCode === 4 ||
        (e.key === 'Backspace' && !isTextInput)
      ) {
        e.preventDefault();
        setTouchRemoteSuppressed(true);
        handleBack();
        return;
      }

      if (e.key === 'ArrowUp') {
        if (tag === 'SELECT') return;
        e.preventDefault();
        setTouchRemoteSuppressed(true);
        if (isTextInput) (targetEl as HTMLElement).blur();
        handleDirection('up');
        return;
      }
      if (e.key === 'ArrowDown') {
        if (tag === 'SELECT') return;
        e.preventDefault();
        setTouchRemoteSuppressed(true);
        if (isTextInput) (targetEl as HTMLElement).blur();
        handleDirection('down');
        return;
      }

      if (isTextInput) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const inputEl = targetEl as HTMLInputElement | HTMLTextAreaElement;
          let selStart: number | null = null;
          let selEnd: number | null = null;
          try {
            selStart = inputEl.selectionStart;
            selEnd = inputEl.selectionEnd;
          } catch {
            selStart = null;
            selEnd = null;
          }
          const atStart = selStart === null || (selStart === 0 && selEnd === 0);
          const atEnd =
            selStart === null ||
            (selStart === inputEl.value.length && selEnd === inputEl.value.length);
          if (e.key === 'ArrowLeft' && atStart) {
            e.preventDefault();
            setTouchRemoteSuppressed(true);
            inputEl.blur();
            handleDirection('left');
            return;
          }
          if (e.key === 'ArrowRight' && atEnd) {
            e.preventDefault();
            setTouchRemoteSuppressed(true);
            inputEl.blur();
            handleDirection('right');
            return;
          }
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setTouchRemoteSuppressed(true);
        handleDirection('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setTouchRemoteSuppressed(true);
        handleDirection('right');
      } else if (isOkRemoteKey(e)) {
        if (tag === 'SELECT') return;
        e.preventDefault();
        if (e.repeat) {
          return;
        }
        setTouchRemoteSuppressed(true);
        if (modal) {
          if (performance.now() < suppressOkLaunchUntilRef.current) {
            return;
          }
          handleOkTap();
          return;
        }
        enterDidHoldRef.current = false;
        enterHeldActiveRef.current = true;
        if (enterHoldTimerRef.current) {
          window.clearTimeout(enterHoldTimerRef.current);
        }
        enterHoldTimerRef.current = window.setTimeout(() => {
          enterDidHoldRef.current = true;
          handleOkLongPress();
        }, 500);
      }
    };

    const onKeyPress = (e: KeyboardEvent) => {
      if (!isOkRemoteKey(e)) return;
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName;
      const isTextInput =
        tag === 'TEXTAREA' ||
        (targetEl instanceof HTMLInputElement &&
          targetEl.type !== 'range' &&
          targetEl.type !== 'checkbox');
      if (!isTextInput && tag !== 'SELECT') {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isOkRemoteKey(e)) return;
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName;
      const isTextInput =
        tag === 'TEXTAREA' ||
        (targetEl instanceof HTMLInputElement &&
          targetEl.type !== 'range' &&
          targetEl.type !== 'checkbox');
      if (isTextInput || tag === 'SELECT') return;

      e.preventDefault();
      if (enterHoldTimerRef.current) {
        window.clearTimeout(enterHoldTimerRef.current);
        enterHoldTimerRef.current = null;
      }

      if (enterDidHoldRef.current) {
        suppressOkLaunchUntilRef.current = performance.now() + 250;
        enterDidHoldRef.current = false;
        enterHeldActiveRef.current = false;
        return;
      }

      if (enterHeldActiveRef.current) {
        enterHeldActiveRef.current = false;
        if (!modal && performance.now() >= suppressOkLaunchUntilRef.current) {
          handleOkTap();
        }
      }
    };

    const onCaptureClick = (e: MouseEvent) => {
      if (enterDidHoldRef.current || performance.now() < suppressOkLaunchUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onCapturePointerUp = () => {
      if (suppressOkLaunchUntilRef.current > performance.now() + 220) {
        suppressOkLaunchUntilRef.current = performance.now() + 220;
      }
    };

    const onHardwareBack = () => {
      setTouchRemoteSuppressed(true);
      handleBack();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keypress', onKeyPress, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('click', onCaptureClick, true);
    window.addEventListener('pointerup', onCapturePointerUp, true);
    window.addEventListener('tv-hardware-back', onHardwareBack);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keypress', onKeyPress, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('click', onCaptureClick, true);
      window.removeEventListener('pointerup', onCapturePointerUp, true);
      window.removeEventListener('tv-hardware-back', onHardwareBack);
      if (enterHoldTimerRef.current) window.clearTimeout(enterHoldTimerRef.current);
    };
  }, [handleDirection, handleBack, handleOkTap, handleOkLongPress, modal]);

  // Touch swipe navigation between Default / Ambient / Quick Settings / Apps Drawer
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchRemoteSuppressed(false);
    if (modal || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || modal) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 55 && Math.abs(dy) < 55) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 60 && screen === 'default') {
        setQsFocusIndex(0);
        setScreen('quick-settings');
      } else if (dx < -60 && screen === 'default') {
        setWeatherFocus({ section: 'hourly', index: 0 });
        setScreen('weather');
      } else if (dx < -60 && screen === 'quick-settings') {
        setScreen('default');
      } else if (dx > 60 && screen === 'weather') {
        setScreen('default');
      } else if (dx < -55 && screen === 'ambient') {
        handleNextWallpaper();
      } else if (dx > 55 && screen === 'ambient') {
        handlePrevWallpaper();
      }
    } else {
      if (dy > 65 && screen === 'default') {
        setAmbientRevealSignal((n) => n + 1);
        setScreen('ambient');
      } else if (dy < -65 && screen === 'default') {
        setDrawerFocusIndex(homeFocusIndex);
        setScreen('apps-drawer');
      } else if (dy < -65 && screen === 'ambient') {
        setScreen('default');
      } else if (dy > 55 && screen === 'ambient') {
        setAmbientRevealSignal((n) => n + 1);
      }
    }
  };

  // Modal helpers
  const modalApp =
    modal && (modal.type === 'app-action' || modal.type === 'app-info')
      ? apps.find((a) => a.id === modal.appId) ?? null
      : null;

  const brokenImageIdsRef = useRef(brokenImageIds);
  brokenImageIdsRef.current = brokenImageIds;

  const handleBackdropImageError = useCallback(
    (failedId: string) => {
      setBrokenImageIds((prev) => {
        if (prev[failedId]) return prev;
        return { ...prev, [failedId]: true };
      });
      const fallbackNext = activeSlideshowPool.find(
        (w) => w.id !== failedId && !brokenImageIdsRef.current[w.id]
      );
      if (fallbackNext && failedId === activeWallpaper.id) {
        setActiveWallpaperId(fallbackNext.id);
      }
    },
    [activeSlideshowPool, activeWallpaper.id]
  );

  return (
    <main
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="relative h-dvh w-screen overflow-hidden bg-[#07080A] text-white"
    >
      {/* Full-bleed Wallpaper Background Canvas with Smooth Cross-Dissolve */}
      <BackdropCanvas
        wallpaper={activeWallpaper}
        scrimOpacity={settings.scrimOpacity}
        isAmbient={screen === 'ambient'}
        fastTransition={isNativeAndroid}
        onImageError={handleBackdropImageError}
      />

      {/* SCREEN 1: DEFAULT HOME VIEW ("Default after on") */}
      {screen !== 'ambient' && screen !== 'apps-drawer' && (
        <div className="relative z-10 flex h-full w-full flex-col justify-between p-5 sm:px-14 sm:py-10">
          {/* Top Row: Optional 12h Local Clock (left) & Weather Forecast (right) */}
          <header className="flex items-start justify-between gap-4">
            <div className="flex flex-col items-start">
              {settings.showClock && (
                <div className="font-display text-3xl font-light tracking-tight text-white tabular-nums sm:text-5xl">
                  {timeText}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setAmbientRevealSignal((n) => n + 1);
                  setScreen('ambient');
                }}
                aria-label="Enter Ambient artwork view"
                className={`${
                  settings.showClock ? 'mt-1.5' : ''
                } inline-flex min-h-[38px] items-center gap-1 rounded-xl px-2 text-xs text-white/65 transition-colors hover:bg-white/10 hover:text-white/95`}
              >
                <ChevronUp size={14} aria-hidden="true" />
                <span>Ambient view</span>
              </button>
            </div>

            <WeatherWidget
              weather={weather}
              onOpenDetail={() => {
                setWeatherFocus({ section: 'hourly', index: 0 });
                setScreen('weather');
              }}
            />
          </header>

          {/* Bottom Dock: Centered 5 Pinned 16:9 Apps + Bottom Navigation Row */}
          <footer className="flex w-full flex-col items-center">
            {/* 5 Pinned App Slots symmetrically centered (1st & 5th equidistant from edges) */}
            <div
              ref={dockRef}
              className="relative mx-auto grid w-full max-w-[92vw] grid-cols-5 gap-2.5 overflow-visible px-1 py-2.5 sm:max-w-5xl sm:gap-5"
            >
              <FerrofluidAura
                containerRef={dockRef}
                activeKey={activeHomeKey}
                getElementByKey={getDockTileEl}
                intensity={settings.ferrofluidIntensity}
                borderRadius={16}
                variant="tile"
                liteMode={isNativeAndroid}
              />

              {pinnedApps.map((app, idx) => (
                <AppTile
                  key={app.id}
                  app={app}
                  compact
                  isFocused={homeFocusIndex === idx}
                  onFocus={() => setHomeFocusIndex(idx)}
                  onSelect={() => handleLaunchApp(app)}
                  onLongPress={() =>
                    setModal({
                      type: 'app-action',
                      appId: app.id,
                      from: 'default',
                    })
                  }
                  tileRef={(el) => {
                    dockTileRefs.current[app.id] = el;
                  }}
                />
              ))}
            </div>

            {/* Bottom bar: Quick Settings (bottom-left corner) aligned with Down Chevron (bottom-center) */}
            <div className="mt-2 grid w-full grid-cols-3 items-center">
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => {
                    setQsFocusIndex(0);
                    setScreen('quick-settings');
                  }}
                  aria-label="Open Quick Settings"
                  className="group flex min-h-[48px] items-center justify-center gap-1 rounded-full px-2 text-white/70 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95 sm:px-2.5"
                >
                  <ChevronLeft
                    size={16}
                    className="transition-transform group-hover:-translate-x-0.5"
                    aria-hidden="true"
                  />
                  <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerFocusIndex(homeFocusIndex);
                    setScreen('apps-drawer');
                  }}
                  aria-label="Open all apps drawer"
                  className="flex min-h-[48px] min-w-[84px] items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
                >
                  <ChevronDown size={26} />
                </button>
              </div>

              <div aria-hidden="true" />
            </div>
          </footer>
        </div>
      )}

      {/* SCREEN 2: AMBIENT BACKDROP VIEW ("Dpad up from Default view") */}
      {screen === 'ambient' && (
        <div className="relative z-10 h-full w-full">
          <AmbientView
            wallpaper={activeWallpaper}
            revealSignal={ambientRevealSignal}
            onExitAmbient={() => setScreen('default')}
            onPrevWallpaper={handlePrevWallpaper}
            onNextWallpaper={handleNextWallpaper}
            onOpenQrDetail={() => setModal({ type: 'qr-detail' })}
          />
        </div>
      )}

      {/* SCREEN 3: ALL APPS DRAWER ("Dpad down from default view") */}
      {screen === 'apps-drawer' && (
        <div className="relative z-20 h-full w-full">
          <AppsDrawer
            apps={apps}
            focusedIndex={drawerFocusIndex}
            movingAppId={movingAppId}
            showClock={settings.showClock}
            timeText={timeText}
            weather={weather}
            ferrofluidIntensity={settings.ferrofluidIntensity}
            liteMode={isNativeAndroid}
            onFocusIndex={setDrawerFocusIndex}
            onSelectApp={(app, idx) => {
              if (movingAppId) {
                if (app.id === movingAppId) {
                  setMovingAppId(null);
                } else {
                  handleSwapOrMoveApp(idx);
                }
              } else {
                handleLaunchApp(app);
              }
            }}
            onLongPressApp={(app) =>
              setModal({
                type: 'app-action',
                appId: app.id,
                from: 'drawer',
              })
            }
            onDoneMoving={() => setMovingAppId(null)}
            onOpenWeatherDetail={() => {
              setMovingAppId(null);
              setWeatherFocus({ section: 'hourly', index: 0 });
              setScreen('weather');
            }}
            onBackHome={() => {
              setMovingAppId(null);
              setScreen('default');
            }}
          />
        </div>
      )}

      {/* SCREEN 4: QUICK SETTINGS SLIDE-OUT DRAWER ("Dpad left to Quick Settings") */}
      <QuickSettingsDrawer
        ref={quickSettingsRef}
        isOpen={screen === 'quick-settings'}
        focusedIndex={qsFocusIndex}
        onFocusIndex={setQsFocusIndex}
        settings={settings}
        weather={weather}
        isNativeAndroid={isNativeAndroid}
        btPermissionRequired={btPermissionRequired}
        btLoading={btLoading}
        onExpandBluetooth={() => void refreshNativeBluetooth()}
        onToggleBluetoothRadio={() => void handleToggleBluetoothRadio()}
        onToggleBluetoothDevice={(device) => void handleToggleBluetoothDevice(device)}
        onOpenBluetoothSettings={() => void handleOpenBluetoothSettings()}
        onRequestBluetoothPermission={() => void handleRequestBluetoothPermission()}
        onUpdateSettings={(patch) => {
          if (patch.showTouchRemote) setTouchRemoteSuppressed(false);
          setSettings((s) => ({ ...s, ...patch }));
        }}
        onToggleWeather={() =>
          setWeather((w) => ({ ...w, enabled: !w.enabled }))
        }
        onOpenFullSettings={(tab = 'general') =>
          setModal({ type: 'full-settings', tab })
        }
        onOpenSystemSettings={() => void handleOpenSystemSettings()}
        onOpenAlbumPicker={() => setModal({ type: 'album-picker' })}
        onNextWallpaper={handleNextWallpaper}
        onClose={() => setScreen('default')}
        liteMode={isNativeAndroid}
      />

      {/* SCREEN 5: WEATHER SLIDE-OUT DRAWER ("Dpad right past last app") */}
      <WeatherDrawer
        isOpen={screen === 'weather'}
        weather={weather}
        syncBackgroundToWeather={settings.syncBackgroundToWeather}
        focus={weatherFocus}
        onFocusChange={(next) =>
          setWeatherFocus((prev) =>
            prev.section === next.section && prev.index === next.index ? prev : next
          )
        }
        activateSignal={weatherActivateSignal}
        onUseGps={() => setWeather((w) => ({ ...w, locationMode: 'gps' }))}
        onSelectManualCity={(city) =>
          setWeather((w) => ({
            ...w,
            locationMode: 'manual',
            manualCity: city,
            activeLocationLabel: city.name,
          }))
        }
        onToggleEnabled={() =>
          setWeather((w) => ({ ...w, enabled: !w.enabled }))
        }
        onToggleSyncBackground={() =>
          setSettings((s) => ({
            ...s,
            syncBackgroundToWeather: !s.syncBackgroundToWeather,
          }))
        }
        onRefresh={() =>
          void refreshWeather(weather.locationMode, weather.manualCity)
        }
        onClose={() => setScreen('default')}
      />

      {/* Optional On-Screen Touch D-Pad Remote (auto-hides on hardware D-pad input) */}
      <TouchRemote
        visible={settings.showTouchRemote && !touchRemoteSuppressed}
        onDirection={handleDirection}
        onOkTap={handleOkTap}
        onOkLongPress={handleOkLongPress}
        onBack={handleBack}
        onHome={() => {
          setModal(null);
          setMovingAppId(null);
          setScreen('default');
        }}
        onHide={() => setSettings((s) => ({ ...s, showTouchRemote: false }))}
      />

      {/* App Launch / System Settings Toast Banner */}
      {launchToast && (
        <div
          role="status"
          className="fixed top-6 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-white/20 bg-[#10141E]/90 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl sm:text-base"
        >
          <span>{launchToast.title}</span>
          <span className="text-xs text-white/60 sm:text-sm">{launchToast.detail}</span>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'app-action' && modalApp && (
        <AppActionModal
          app={modalApp}
          from={modal.from}
          canUninstall={isNativeAndroid || apps.length > 5}
          onLaunch={handleLaunchApp}
          onOpenInfo={(appId) => setModal({ type: 'app-info', appId })}
          onStartMove={(appId) => {
            const idx = apps.findIndex((a) => a.id === appId);
            setMovingAppId(appId);
            if (idx >= 0) setDrawerFocusIndex(idx);
            setModal(null);
            setScreen('apps-drawer');
          }}
          onUninstall={handleUninstallApp}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'app-info' && modalApp && (
        <SystemAppInfoModal
          app={modalApp}
          canUninstall={isNativeAndroid || apps.length > 5}
          onLaunch={handleLaunchApp}
          onClearCache={handleClearCache}
          onOpenNativeDetails={
            isNativeAndroid
              ? (pkg) => {
                  setModal(null);
                  void openNativeAppDetails(pkg);
                }
              : undefined
          }
          onUninstall={handleUninstallApp}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'album-picker' && (
        <AlbumPickerModal
          curatedWallpapers={visibleCuratedWallpapers}
          localWallpapers={localWallpapers}
          customUrlWallpapers={customUrlWallpapers}
          activeWallpaperId={activeWallpaper.id}
          slideshowIntervalSec={settings.slideshowIntervalSec}
          slideshowPools={settings.slideshowPools}
          syncBackgroundToWeather={settings.syncBackgroundToWeather}
          activeWeatherTag={activeWeatherTag}
          weatherTagsMap={settings.wallpaperWeatherTags}
          activePoolCount={activeSlideshowPool.length}
          usedWeatherFallback={usedWeatherFallback}
          refreshingCatalog={refreshingCatalog}
          removedCuratedCount={settings.hiddenWallpaperIds.length}
          onToggleSlideshowPool={(poolKey: SlideshowPoolKey) =>
            setSettings((s) => ({
              ...s,
              slideshowPools: {
                ...s.slideshowPools,
                [poolKey]: !s.slideshowPools[poolKey],
              },
            }))
          }
          onToggleSyncWeather={() =>
            setSettings((s) => ({
              ...s,
              syncBackgroundToWeather: !s.syncBackgroundToWeather,
            }))
          }
          onToggleImageWeatherTag={handleToggleImageWeatherTag}
          onRefreshCatalog={handleRefreshCatalog}
          onRestoreCuratedWallpapers={() =>
            setSettings((s) => ({ ...s, hiddenWallpaperIds: [] }))
          }
          onSelectWallpaper={(id) => setActiveWallpaperId(id)}
          onUploadFiles={async (files) => {
            const added = await saveLocalAlbumFiles(files);
            if (added.length > 0) {
              setLocalWallpapers((prev) => [...prev, ...added]);
              setSettings((s) => ({
                ...s,
                slideshowPools: { ...s.slideshowPools, 'local-album': true },
              }));
              setActiveWallpaperId(added[0].id);
            }
          }}
          onDeleteLocalPhoto={async (id) => {
            await removeLocalAlbumPhoto(id);
            const remaining = allWallpapers.filter((w) => w.id !== id);
            setLocalWallpapers((prev) => prev.filter((p) => p.id !== id));
            if (activeWallpaperId === id && remaining[0]) {
              setActiveWallpaperId(remaining[0].id);
            }
          }}
          onHideCuratedWallpaper={(id) => {
            const remaining = allWallpapers.filter((w) => w.id !== id);
            setSettings((s) => ({
              ...s,
              hiddenWallpaperIds: s.hiddenWallpaperIds.includes(id)
                ? s.hiddenWallpaperIds
                : [...s.hiddenWallpaperIds, id],
            }));
            if (activeWallpaperId === id && remaining[0]) {
              setActiveWallpaperId(remaining[0].id);
            }
          }}
          onClearLocalAlbum={async () => {
            await clearLocalAlbumPhotos();
            setLocalWallpapers([]);
          }}
          onAddCustomUrl={(url, title, creator) => {
            if (!isSafeHttpUrl(url)) return;
            const item: WallpaperItem = {
              id: `url-${Date.now()}`,
              title,
              creator,
              sourceUrl: url,
              imageUrl: url,
              sourceType: 'custom-urls',
              weatherTags: ['none'],
            };
            setCustomUrlWallpapers((prev) => [...prev, item]);
            setSettings((s) => ({
              ...s,
              slideshowPools: { ...s.slideshowPools, 'custom-urls': true },
            }));
            setActiveWallpaperId(item.id);
          }}
          onRemoveCustomUrl={(id) => {
            const remaining = allWallpapers.filter((w) => w.id !== id);
            setCustomUrlWallpapers((prev) => prev.filter((u) => u.id !== id));
            if (activeWallpaperId === id && remaining[0]) {
              setActiveWallpaperId(remaining[0].id);
            }
          }}
          onChangeSlideshowInterval={(sec) =>
            setSettings((s) => ({ ...s, slideshowIntervalSec: sec }))
          }
          onUpdateWallpaperMeta={(id, title, creator) => {
            setLocalWallpapers((prev) => {
              if (!prev.some((w) => w.id === id)) return prev;
              void updateLocalAlbumMetadata(id, title, creator);
              return prev.map((w) => (w.id === id ? { ...w, title, creator } : w));
            });
            setCustomUrlWallpapers((prev) =>
              prev.some((w) => w.id === id)
                ? prev.map((w) => (w.id === id ? { ...w, title, creator } : w))
                : prev
            );
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'qr-detail' && (
        <QrDetailModal
          wallpaper={activeWallpaper}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'full-settings' && (
        <FullSettingsModal
          initialTab={modal.tab}
          settings={settings}
          weather={weather}
          apps={apps}
          activeWallpaper={activeWallpaper}
          onUpdateSettings={(patch) => {
            if (patch.showTouchRemote) setTouchRemoteSuppressed(false);
            setSettings((s) => ({ ...s, ...patch }));
          }}
          onToggleWeather={() =>
            setWeather((w) => ({ ...w, enabled: !w.enabled }))
          }
          onOpenWeatherModal={() => {
            setModal(null);
            setWeatherFocus({ section: 'hourly', index: 0 });
            setScreen('weather');
          }}
          onOpenAlbumPicker={() => setModal({ type: 'album-picker' })}
          onRestoreDefaultApps={() => {
            setApps(DEFAULT_APPS);
            setHomeFocusIndex(0);
            setDrawerFocusIndex(0);
          }}
          isNativeAndroid={isNativeAndroid}
          nativeAppsError={nativeAppsError}
          nativeAppsLoading={nativeAppsLoading}
          onRefreshNativeApps={() => void refreshNativeApps()}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
