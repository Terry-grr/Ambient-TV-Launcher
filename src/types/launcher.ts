export type LauncherScreen =
  | 'default'
  | 'ambient'
  | 'quick-settings'
  | 'apps-drawer'
  | 'weather';

export type FerrofluidIntensity = 'subtle' | 'balanced' | 'vivid';
export type ClockFormat = '12h' | '24h';
export type CuratedCategory =
  | 'nature'
  | 'landscape'
  | 'seascapes'
  | 'animals'
  | 'space'
  | 'satellite'
  | 'classical-art'
  | 'abstract-art'
  | 'ink-art'
  | 'architecture'
  | 'geometric';
export type WallpaperSourceMode = 'curated' | 'local-album' | 'custom-urls';
export type SlideshowPoolKey = CuratedCategory | 'local-album' | 'custom-urls';
export type AlbumBrowseFilter = 'all' | SlideshowPoolKey;
export type WeatherTag =
  | 'none'
  | 'clear'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'foggy';

export interface AppItem {
  id: string;
  name: string;
  category: string;
  packageName: string;
  version: string;
  sizeMb: number;
  cacheMb: number;
  accentColor: string;
  iconKey: string;
  iconDataUrl?: string;
  iconTransparent?: boolean;
  iconIsBanner?: boolean;
  permissions: string[];
  description: string;
}

export interface WallpaperItem {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  imageUrl: string;
  sourceType: WallpaperSourceMode;
  category?: CuratedCategory;
  weatherTags?: WeatherTag[];
  cropScale?: number;
}

export interface WeatherHourSlice {
  timeIso: string;
  timeLabel: string;
  tempC: number;
  apparentTempC?: number;
  precipProb: number;
  precipMm?: number;
  humidityPct?: number;
  cloudCoverPct?: number;
  uvIndex?: number;
  weatherCode: number;
  conditionLabel: string;
  windSpeedKmh?: number;
  windGustKmh: number;
  windDirectionDeg?: number;
  isBadWeather: boolean;
  isSevereWarning?: boolean;
}

export interface WeatherDaySlice {
  dateIso: string;
  dayLabel: string;
  weatherCode: number;
  conditionLabel: string;
  tempMaxC: number;
  tempMinC: number;
  apparentTempMaxC?: number;
  apparentTempMinC?: number;
  precipProbMax: number;
  precipSumMm?: number;
  windSpeedMaxKmh?: number;
  windGustMaxKmh: number;
  windDirectionDeg?: number;
  uvIndexMax?: number;
  sunriseIso?: string;
  sunsetIso?: string;
  isBadWeather: boolean;
  isSevereWarning: boolean;
}

export interface ManualCityOption {
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface WeatherState {
  enabled: boolean;
  locationMode: 'gps' | 'manual';
  manualCity: ManualCityOption;
  activeLocationLabel: string;
  usingGpsFallback: boolean;
  loading: boolean;
  error: string | null;
  current: {
    tempC: number;
    weatherCode: number;
    conditionLabel: string;
    windKmh: number;
    windGustKmh: number;
  } | null;
  nextFourHours: WeatherHourSlice[];
  hourly24Hours: WeatherHourSlice[];
  daily7Days: WeatherDaySlice[];
  hasWarning: boolean;
  warningHeadline: string | null;
  extendedWarningHeadline: string | null;
  badWeatherChanceMax: number;
  lastUpdated: number | null;
}

export interface BluetoothDevice {
  id: string;
  name: string;
  type: 'remote' | 'audio' | 'gamepad' | 'peripheral';
  connected: boolean;
  battery?: number;
  address?: string;
}

export interface TvInputDevice {
  id: string;
  name: string;
  detail: string;
  type: 'hdmi' | 'tuner' | 'composite' | 'component' | 'displayport' | 'other';
  state: 'connected' | 'standby' | 'disconnected';
  isPassthrough: boolean;
  packageName?: string;
}

export interface LauncherSettings {
  showClock: boolean;
  clockFormat: ClockFormat;
  scrimOpacity: number; // 0.35 to 0.85
  ferrofluidIntensity: FerrofluidIntensity;
  slideshowIntervalSec: number; // 0 = manual, 20, 45, 90, 120, 180, 240
  slideshowPools: Record<SlideshowPoolKey, boolean>;
  syncBackgroundToWeather: boolean;
  wallpaperWeatherTags: Record<string, WeatherTag[]>;
  hiddenWallpaperIds: string[];
  publicReleaseRepo: string;
  activeInput: string;
  wifiEnabled: boolean;
  wifiNetwork: string;
  bluetoothEnabled: boolean;
  bluetoothDevices: BluetoothDevice[];
  showTouchRemote: boolean;
}

export type ModalOverlay =
  | null
  | { type: 'app-action'; appId: string; from: 'default' | 'drawer' }
  | { type: 'app-info'; appId: string }
  | { type: 'full-settings'; tab: 'general' | 'weather' | 'albums' | 'apps' | 'github' }
  | { type: 'album-picker' }
  | { type: 'qr-detail' };
