import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudSun,
  Download,
  ExternalLink,
  GitBranch,
  Image as ImageIcon,
  QrCode,
  RefreshCw,
  RotateCcw,
  Sliders,
  Tv,
  X,
} from 'lucide-react';
import {
  WEATHER_TAG_LABELS,
} from '../data/defaults';
import {
  AppItem,
  FerrofluidIntensity,
  LauncherSettings,
  WallpaperItem,
  WeatherState,
  WeatherTag,
} from '../types/launcher';
import { getEffectiveWeatherTags } from '../services/wallpaperCatalogService';
import { testCustomCapFeed } from '../services/weatherService';
import {
  isSafeHttpsUrl,
  normalizeSafeHttpsFeedUrl,
  parseGithubRepoSlug,
} from '../utils/urlValidation';
import { QrPasteModal } from './QrPasteModal';

interface FullSettingsModalProps {
  initialTab: 'general' | 'weather' | 'albums' | 'apps' | 'github';
  settings: LauncherSettings;
  weather: WeatherState;
  apps: AppItem[];
  activeWallpaper: WallpaperItem;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => void;
  onToggleWeather: () => void;
  onOpenWeatherModal: () => void;
  onOpenAlbumPicker: () => void;
  onOpenAppsEditMode: () => void;
  onRestoreDefaultApps: () => void;
  isNativeAndroid?: boolean;
  nativeAppsError?: string | null;
  nativeAppsLoading?: boolean;
  onRefreshNativeApps?: () => void;
  onClose: () => void;
}

interface GithubReleaseInfo {
  tagName: string;
  version: string;
  title: string;
  notes: string;
  publishedAt: string;
  htmlUrl: string;
  apkUrl: string | null;
  apkName: string | null;
}

function normalizeSemver(raw: string): [number, number, number] {
  const cleaned = raw.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareSemver(a: string, b: string): number {
  const [a1, a2, a3] = normalizeSemver(a);
  const [b1, b2, b3] = normalizeSemver(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

export const FullSettingsModal: React.FC<FullSettingsModalProps> = ({
  initialTab,
  settings,
  weather,
  apps,
  activeWallpaper,
  onUpdateSettings,
  onToggleWeather,
  onOpenWeatherModal,
  onOpenAlbumPicker,
  onOpenAppsEditMode,
  onRestoreDefaultApps,
  isNativeAndroid = false,
  nativeAppsError = null,
  nativeAppsLoading = false,
  onRefreshNativeApps,
  onClose,
}) => {
  const [tab, setTab] = useState(initialTab);
  const installedVersion = import.meta.env.VITE_APP_VERSION || '0.0.1';

  const [repoInput, setRepoInput] = useState(settings.publicReleaseRepo);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [latestRelease, setLatestRelease] = useState<GithubReleaseInfo | null>(null);
  const [capFeedInput, setCapFeedInput] = useState(settings.customCapFeedUrl || '');
  const [capTesting, setCapTesting] = useState(false);
  const [showCapQrModal, setShowCapQrModal] = useState(false);
  const capSaveBtnRef = useRef<HTMLButtonElement | null>(null);
  const capQrBtnRef = useRef<HTMLButtonElement | null>(null);
  const [capFeedback, setCapFeedback] = useState<{
    type: 'ok' | 'error';
    message: string;
  } | null>(null);

  const tabs = [
    { id: 'general', label: 'Display', icon: Sliders },
    { id: 'weather', label: 'Weather', icon: CloudSun },
    { id: 'albums', label: 'Albums', icon: ImageIcon },
    { id: 'apps', label: 'Apps', icon: Tv },
    { id: 'github', label: 'GitHub', icon: GitBranch },
  ] as const;

  const handleCheckUpdates = async () => {
    const slug = parseGithubRepoSlug(repoInput);
    if (!slug) {
      setUpdateError('Enter a valid public GitHub repository as owner/repo.');
      return;
    }

    setRepoInput(slug);
    onUpdateSettings({ publicReleaseRepo: slug });
    setCheckingUpdate(true);
    setUpdateError(null);
    setLatestRelease(null);

    try {
      const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });

      if (res.status === 404) {
        setUpdateError('No public releases found for this repository yet.');
        return;
      }
      if (!res.ok) {
        setUpdateError(`GitHub API returned status ${res.status}.`);
        return;
      }

      const data = await res.json();
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const apkAsset = assets.find(
        (asset: { name?: string }) =>
          typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.apk')
      );

      const rawHtmlUrl = String(data.html_url || '');
      const safeHtmlUrl = isSafeHttpsUrl(rawHtmlUrl)
        ? rawHtmlUrl
        : `https://github.com/${slug}/releases`;
      const rawApkUrl = typeof apkAsset?.browser_download_url === 'string'
        ? apkAsset.browser_download_url
        : '';
      const safeApkUrl = isSafeHttpsUrl(rawApkUrl) ? rawApkUrl : null;

      const tagName = String(data.tag_name || 'v0.0.0');
      setLatestRelease({
        tagName,
        version: tagName.replace(/^v/i, ''),
        title: String(data.name || tagName),
        notes: String(data.body || ''),
        publishedAt: data.published_at
          ? new Date(data.published_at).toLocaleDateString()
          : '',
        htmlUrl: safeHtmlUrl,
        apkUrl: safeApkUrl,
        apkName: apkAsset?.name ?? null,
      });
    } catch {
      setUpdateError('Could not reach GitHub right now.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const hasNewerVersion =
    latestRelease !== null &&
    compareSemver(latestRelease.version, installedVersion) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Full Launcher Settings"
    >
      <div className="tv-surface flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0F121A]/95 shadow-2xl backdrop-blur-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img
              src="/ambient-tv-icon.svg"
              alt=""
              aria-hidden="true"
              className="h-8 w-8 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-display truncate text-base font-semibold text-white sm:text-lg">
                Launcher Settings
              </h2>
              <p className="mt-0.5 truncate text-xs text-white/60">
                Display, weather, background albums & GitHub updates
              </p>
            </div>
          </div>
          <button
            type="button"
            data-dialog-close="true"
            onClick={onClose}
            aria-label="Close Launcher Settings"
            className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs (wraps cleanly so tabs & focus outlines never clip) */}
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 px-5 py-2.5 sm:px-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm ${
                  active
                    ? 'bg-white font-semibold text-[#07080A]'
                    : 'bg-white/6 text-white/75 hover:bg-white/12 hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6 sm:p-5 sm:pb-6">
          {tab === 'general' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Show Clock</div>
                  <div className="mt-0.5 text-xs text-white/60">
                    Display or hide the top-left time readout on Home and Apps Drawer
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ showClock: !settings.showClock })
                  }
                  className={`min-h-[36px] shrink-0 scroll-my-3 rounded-xl px-3.5 text-xs font-semibold ${
                    settings.showClock
                      ? 'bg-white text-[#07080A]'
                      : 'border border-white/15 bg-white/8 text-white'
                  }`}
                >
                  {settings.showClock ? 'Shown' : 'Hidden'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Clock Format</div>
                  <div className="mt-0.5 text-xs text-white/60">
                    Default uses 12h local time (12:00 am)
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(['12h', '24h'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onUpdateSettings({ clockFormat: fmt })}
                      className={`min-h-[36px] scroll-my-3 rounded-xl px-3 text-xs font-semibold uppercase ${
                        settings.clockFormat === fmt
                          ? 'bg-white text-[#07080A]'
                          : 'border border-white/15 bg-white/5 text-white/75'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-sm font-medium text-white">
                  Selection Aura
                </div>
                <div className="mt-0.5 text-xs text-white/60">
                  Border glow intensity when navigating tiles (unwraps and wraps between items)
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {(['subtle', 'balanced', 'vivid'] as FerrofluidIntensity[]).map(
                    (level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ ferrofluidIntensity: level })
                        }
                        className={`min-h-[36px] scroll-my-3 rounded-xl text-xs font-medium capitalize ${
                          settings.ferrofluidIntensity === level
                            ? 'bg-white font-semibold text-[#07080A]'
                            : 'border border-white/15 bg-white/5 text-white/75'
                        }`}
                      >
                        {level}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-white">
                    Backdrop Legibility Scrim
                  </span>
                  <span className="text-xs text-white/70 tabular-nums">
                    {Math.round(settings.scrimOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={85}
                  value={Math.round(settings.scrimOpacity * 100)}
                  onChange={(e) =>
                    onUpdateSettings({
                      scrimOpacity: Number(e.target.value) / 100,
                    })
                  }
                  aria-label="Backdrop legibility scrim"
                  className="mt-2 h-2 w-full scroll-my-3 accent-white"
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    On-Screen Touch D-Pad Remote
                  </div>
                  <div className="mt-0.5 text-xs text-white/60">
                    For testing D-pad navigation on touchscreens
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      showTouchRemote: !settings.showTouchRemote,
                    })
                  }
                  className={`min-h-[36px] shrink-0 scroll-my-3 rounded-xl px-3.5 text-xs font-semibold ${
                    settings.showTouchRemote
                      ? 'bg-white text-[#07080A]'
                      : 'border border-white/15 bg-white/8 text-white'
                  }`}
                >
                  {settings.showTouchRemote ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}

          {tab === 'weather' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    Top-Right Weather Forecast
                  </div>
                  <div className="mt-0.5 text-xs text-white/60">
                    Shows Celsius temperature & 4-hour bad-weather warnings on
                    Home and Apps Drawer
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleWeather}
                  className={`min-h-[36px] shrink-0 rounded-xl px-3.5 text-xs font-semibold ${
                    weather.enabled
                      ? 'bg-white text-[#07080A]'
                      : 'border border-white/15 bg-white/8 text-white'
                  }`}
                >
                  {weather.enabled ? 'On' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    Sync Background to Weather
                  </div>
                  <div className="mt-0.5 text-xs text-white/60">
                    Filters ticked slideshow albums to images tagged with the current weather condition or None
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      syncBackgroundToWeather: !settings.syncBackgroundToWeather,
                    })
                  }
                  className={`min-h-[36px] shrink-0 rounded-xl px-3.5 text-xs font-semibold ${
                    settings.syncBackgroundToWeather
                      ? 'bg-white text-[#07080A]'
                      : 'border border-white/15 bg-white/8 text-white'
                  }`}
                >
                  {settings.syncBackgroundToWeather ? 'On' : 'Off'}
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-sm font-medium text-white">
                  Active Location: {weather.activeLocationLabel}
                </div>
                <p className="mt-1 text-xs text-white/65">
                  Uses browser GPS automatically with manual city search fallback.
                </p>
                <button
                  type="button"
                  onClick={onOpenWeatherModal}
                  className="mt-2.5 min-h-[38px] rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
                >
                  Configure GPS / Manual City & View 4h Forecast
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-sm font-medium text-white">
                  Regional CAP Warning Feed (Optional)
                </div>
                <p className="mt-1 text-xs leading-relaxed text-white/65">
                  New Zealand (MetService), US (NWS), Australia (BOM), Canada (Alert Ready), and
                  Europe (MeteoAlarm) are built in. For any other country or regional feed, paste an{' '}
                  <span className="text-white/85">https://</span> CAP RSS or Atom URL from WMO SWIC (
                  <span className="text-white/85">severeweather.wmo.int</span>) or your national
                  meteorological service.
                </p>

                <div className="mt-2.5 flex flex-wrap gap-2 sm:flex-nowrap">
                  <input
                    type="url"
                    value={capFeedInput}
                    onChange={(e) => {
                      setCapFeedInput(e.target.value);
                      setCapFeedback(null);
                    }}
                    placeholder="https://severeweather.wmo.int/v2/cap-alerts/.../rss.xml"
                    aria-label="Custom CAP warning RSS or Atom feed URL"
                    className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-3 text-xs text-white placeholder-white/40 focus:border-white focus:outline-none sm:text-sm"
                  />
                  <button
                    ref={capQrBtnRef}
                    type="button"
                    onClick={() => setShowCapQrModal(true)}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-white/8 px-3 text-xs font-medium text-white hover:bg-white/15"
                  >
                    <QrCode size={14} />
                    <span>Phone QR</span>
                  </button>
                  <button
                    ref={capSaveBtnRef}
                    type="button"
                    disabled={capTesting}
                    onClick={async () => {
                      const trimmed = capFeedInput.trim();
                      if (!trimmed) {
                        onUpdateSettings({ customCapFeedUrl: '' });
                        setCapFeedback({
                          type: 'ok',
                          message: 'Cleared custom feed; using built-in regional alerts.',
                        });
                        return;
                      }
                      const normalized = normalizeSafeHttpsFeedUrl(trimmed);
                      if (!normalized) {
                        setCapFeedback({
                          type: 'error',
                          message: 'Enter a valid public https:// RSS, Atom, or CAP XML URL.',
                        });
                        return;
                      }
                      setCapTesting(true);
                      setCapFeedback(null);
                      const result = await testCustomCapFeed(normalized);
                      setCapTesting(false);
                      if (!result.ok) {
                        setCapFeedback({
                          type: 'error',
                          message: result.error || 'Could not verify custom CAP feed.',
                        });
                        return;
                      }
                      setCapFeedInput(normalized);
                      onUpdateSettings({ customCapFeedUrl: normalized });
                      setCapFeedback({
                        type: 'ok',
                        message: `Saved ${result.title || 'CAP feed'} (${result.entryCount} active feed entries).`,
                      });
                    }}
                    className="min-h-[40px] shrink-0 whitespace-nowrap rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90 disabled:opacity-60"
                  >
                    {capTesting ? 'Verifying…' : 'Save Feed'}
                  </button>
                  {(settings.customCapFeedUrl || capFeedInput.trim()) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCapFeedInput('');
                        onUpdateSettings({ customCapFeedUrl: '' });
                        setCapFeedback({
                          type: 'ok',
                          message: 'Cleared custom feed; using built-in regional alerts.',
                        });
                      }}
                      className="min-h-[40px] shrink-0 whitespace-nowrap rounded-xl border border-white/15 bg-white/8 px-3.5 text-xs font-medium text-white hover:bg-white/15"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {capFeedback && (
                  <p
                    className={`mt-2 text-xs ${
                      capFeedback.type === 'ok' ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {capFeedback.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'albums' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-white/12 bg-black/40 p-3 sm:flex-nowrap">
                <div className="aspect-video w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50 sm:w-44">
                  <img
                    src={activeWallpaper.imageUrl}
                    alt={activeWallpaper.title}
                    referrerPolicy="no-referrer"
                    style={
                      activeWallpaper.cropScale
                        ? { transform: `scale(${activeWallpaper.cropScale})` }
                        : undefined
                    }
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-white/50">
                    Current Background
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium text-white">
                    {activeWallpaper.title}
                  </div>
                  <div className="truncate text-xs text-white/60">
                    {activeWallpaper.creator}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-white/50">
                    Weather:{' '}
                    {getEffectiveWeatherTags(
                      activeWallpaper,
                      settings.wallpaperWeatherTags
                    )
                      .map((t: WeatherTag) => WEATHER_TAG_LABELS[t])
                      .join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenAlbumPicker}
                  className="min-h-[38px] shrink-0 rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
                >
                  Manage Albums
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    Sync Background to Weather
                  </div>
                  <div className="mt-0.5 text-xs text-white/60">
                    Matches ticked albums against live forecast conditions and None-tagged art
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      syncBackgroundToWeather: !settings.syncBackgroundToWeather,
                    })
                  }
                  className={`min-h-[36px] shrink-0 rounded-xl px-3.5 text-xs font-semibold ${
                    settings.syncBackgroundToWeather
                      ? 'bg-white text-[#07080A]'
                      : 'border border-white/15 bg-white/8 text-white'
                  }`}
                >
                  {settings.syncBackgroundToWeather ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}

          {tab === 'apps' && (
            <div className="space-y-2.5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <div className="text-sm font-medium text-white">
                  Installed Apps ({apps.length})
                </div>
                <p className="mt-1 text-xs text-white/65">
                  The first 5 apps in your Apps Drawer automatically appear on the
                  Default Home screen. Hold OK on any app to move, inspect, or
                  uninstall it.
                </p>
                {isNativeAndroid && nativeAppsError && (
                  <div className="mt-2.5 rounded-xl border border-amber-400/35 bg-amber-500/12 px-3 py-2 text-xs text-amber-200">
                    {nativeAppsError}
                  </div>
                )}
                {isNativeAndroid && !nativeAppsError && apps.length === 0 && !nativeAppsLoading && (
                  <div className="mt-2.5 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/75">
                    No launchable Android TV apps returned yet. Try refreshing below.
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenAppsEditMode}
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
                  >
                    <span>Open Apps Drawer</span>
                  </button>

                  {isNativeAndroid ? (
                    onRefreshNativeApps && (
                      <button
                        type="button"
                        disabled={nativeAppsLoading}
                        onClick={onRefreshNativeApps}
                        className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-medium text-white hover:bg-white/18 disabled:opacity-60"
                      >
                        <RefreshCw
                          size={14}
                          className={nativeAppsLoading ? 'animate-spin' : ''}
                        />
                        <span>
                          {nativeAppsLoading
                            ? 'Scanning Installed TV Apps…'
                            : 'Refresh Installed TV Apps'}
                        </span>
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={onRestoreDefaultApps}
                      className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-medium text-white hover:bg-white/18"
                    >
                      <RotateCcw size={14} />
                      <span>Restore Default Apps & Order</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'github' && (
            <div className="space-y-2.5 pb-1">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <img
                    src="/ambient-tv-icon.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-9 w-9 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white/55">Installed Version</div>
                    <div className="font-display mt-0.5 text-base font-semibold text-white tabular-nums sm:text-lg">
                      v{installedVersion}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={checkingUpdate}
                  onClick={() => void handleCheckUpdates()}
                  className="inline-flex min-h-[38px] shrink-0 scroll-my-3 items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90 disabled:opacity-60"
                >
                  <RefreshCw
                    size={14}
                    className={checkingUpdate ? 'animate-spin' : ''}
                  />
                  <span>
                    {checkingUpdate ? 'Checking…' : 'Check for Updates'}
                  </span>
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <label
                  htmlFor="github-release-repo"
                  className="block text-xs font-semibold text-white"
                >
                  Public APK Releases Repository
                </label>
                <p className="mt-0.5 text-xs text-white/60">
                  Enter your separate public GitHub repo (<code>owner/repo</code>) where builds publish APK releases.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    id="github-release-repo"
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="username/ambient-tv-releases"
                    className="min-h-[38px] flex-1 scroll-my-4 rounded-xl border border-white/15 bg-black/40 px-3 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const slug = parseGithubRepoSlug(repoInput);
                      if (!slug) {
                        setUpdateError(
                          'Enter a valid public GitHub repository as owner/repo.'
                        );
                        return;
                      }
                      setUpdateError(null);
                      setRepoInput(slug);
                      onUpdateSettings({ publicReleaseRepo: slug });
                    }}
                    className="min-h-[38px] shrink-0 scroll-my-4 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-medium text-white hover:bg-white/20"
                  >
                    Save
                  </button>
                </div>
              </div>

              {updateError && (
                <div className="rounded-2xl border border-amber-400/35 bg-amber-500/12 p-3 text-xs text-amber-200">
                  {updateError}
                </div>
              )}

              {latestRelease && (
                <div className="rounded-2xl border border-white/15 bg-black/35 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={16}
                        className={
                          hasNewerVersion ? 'text-amber-300' : 'text-emerald-300'
                        }
                      />
                      <span className="text-sm font-semibold text-white">
                        {hasNewerVersion
                          ? `Update available · ${latestRelease.tagName}`
                          : `Up to date · ${latestRelease.tagName}`}
                      </span>
                    </div>
                    {latestRelease.publishedAt && (
                      <span className="text-xs text-white/55">
                        Published {latestRelease.publishedAt}
                      </span>
                    )}
                  </div>

                  {latestRelease.notes && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-white/70">
                      {latestRelease.notes}
                    </p>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {latestRelease.apkUrl && (
                      <a
                        href={latestRelease.apkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
                      >
                        <Download size={14} />
                        <span>
                          Download {latestRelease.apkName || 'APK'}
                        </span>
                      </a>
                    )}
                    <a
                      href={latestRelease.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-4 text-xs font-medium text-white hover:bg-white/15"
                    >
                      <span>View Release</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/65">
                <div className="font-semibold text-white/85">
                  Private Build → Public Release Setup
                </div>
                <p className="mt-1">
                  In your private repo settings, set variables{' '}
                  <code>APP_MAJOR_MINOR</code> (e.g. <code>0.0</code>),{' '}
                  <code>BUILD_PATCH_OFFSET</code> (e.g. <code>0</code>), and{' '}
                  <code>PUBLIC_RELEASE_REPO</code> (<code>owner/repo</code>), plus
                  secret <code>PUBLIC_REPO_TOKEN</code>. Version computes as{' '}
                  <code>MAJOR_MINOR.(run_number - OFFSET)</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCapQrModal && (
        <QrPasteModal
          fieldLabel="CAP Warning Feed URL"
          requireHttpsOnly
          onReceiveUrl={(receivedUrl) => {
            setCapFeedInput(receivedUrl);
            setCapFeedback({
              type: 'ok',
              message: 'Pasted from phone — review the URL and select Save Feed to verify and apply.',
            });
            requestAnimationFrame(() =>
              capSaveBtnRef.current?.focus({ preventScroll: true })
            );
          }}
          onClose={() => {
            setShowCapQrModal(false);
            requestAnimationFrame(() => {
              if (
                document.activeElement === document.body ||
                !document.activeElement
              ) {
                capQrBtnRef.current?.focus({ preventScroll: true });
              }
            });
          }}
        />
      )}
    </div>
  );
};
