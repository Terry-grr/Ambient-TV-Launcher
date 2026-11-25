import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  Droplets,
  LocateFixed,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import { searchCitiesByName } from '../services/weatherService';
import { ManualCityOption, WeatherState } from '../types/launcher';
import { renderWeatherIcon } from './WeatherWidget';

function formatCompassDirection(deg?: number): string {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function formatClockFromIso(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function formatShortDateFromIso(iso?: string, isDateOnly = false): string {
  if (!iso) return '';
  const d = new Date(isDateOnly ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatAlertTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${day}, ${time}`;
}

function formatAlertSourceLabel(
  source: WeatherState['activeAlerts'][number]['source'],
  verbose = false
): string {
  switch (source) {
    case 'metservice':
      return verbose ? 'MetService New Zealand' : 'MetService NZ';
    case 'nws':
      return verbose ? 'NOAA National Weather Service' : 'NOAA / NWS';
    case 'meteoalarm':
      return verbose ? 'MeteoAlarm Europe' : 'MeteoAlarm EU';
    case 'bom':
      return verbose ? 'Australian Bureau of Meteorology' : 'Australia BOM';
    case 'canada':
      return verbose ? 'Alert Ready / Environment Canada' : 'Alert Ready CA';
    case 'custom':
      return verbose ? 'Custom CAP Warning Feed' : 'Custom CAP Feed';
    default:
      return verbose ? 'Official Weather Advisory' : 'Area Advisory';
  }
}

export interface WeatherDrawerFocus {
  section: 'header' | 'alert' | 'hourly' | 'daily' | 'controls';
  index: number;
}

interface WeatherDrawerProps {
  isOpen: boolean;
  weather: WeatherState;
  syncBackgroundToWeather: boolean;
  focus: WeatherDrawerFocus;
  onFocusChange: (next: WeatherDrawerFocus) => void;
  activateSignal?: number;
  onUseGps: () => void;
  onSelectManualCity: (city: ManualCityOption) => void;
  onToggleEnabled: () => void;
  onToggleSyncBackground: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const WeatherDrawer: React.FC<WeatherDrawerProps> = ({
  isOpen,
  weather,
  syncBackgroundToWeather,
  focus,
  onFocusChange,
  activateSignal = 0,
  onUseGps,
  onSelectManualCity,
  onToggleEnabled,
  onToggleSyncBackground,
  onRefresh,
  onClose,
}) => {
  const [cityQuery, setCityQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ManualCityOption[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [expandedForecast, setExpandedForecast] = useState<{
    kind: 'hourly' | 'daily';
    index: number;
  } | null>(null);

  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const alertBannerRef = useRef<HTMLButtonElement | null>(null);
  const alertDetailRef = useRef<HTMLDivElement | null>(null);
  const expandedDetailRef = useRef<HTMLDivElement | null>(null);
  const headerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hourlyStripRef = useRef<HTMLDivElement | null>(null);
  const hourlyCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dailyCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const controlRefs = useRef<Array<HTMLButtonElement | HTMLInputElement | null>>([]);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchSubmitRef = useRef<HTMLButtonElement | null>(null);

  const toggleExpandedForecast = useCallback((kind: 'hourly' | 'daily', index: number) => {
    setExpandedForecast((prev) =>
      prev && prev.kind === kind && prev.index === index ? null : { kind, index }
    );
  }, []);

  const toggleAlertExpanded = useCallback(() => {
    setAlertExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setExpandedForecast(null);
      setAlertExpanded(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setExpandedForecast(null);
    setAlertExpanded(false);
  }, [weather.activeLocationLabel]);

  useEffect(() => {
    if (!expandedForecast) return;
    const raf = requestAnimationFrame(() => {
      expandedDetailRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [expandedForecast]);

  useEffect(() => {
    if (!alertExpanded) return;
    const raf = requestAnimationFrame(() => {
      alertDetailRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [alertExpanded]);

  useEffect(() => {
    if (!isOpen) return;
    const onWeatherSubBack = (e: Event) => {
      if (expandedForecast) {
        e.preventDefault();
        setExpandedForecast(null);
      } else if (alertExpanded) {
        e.preventDefault();
        setAlertExpanded(false);
      }
    };
    window.addEventListener('tv-weather-subback', onWeatherSubBack);
    return () => window.removeEventListener('tv-weather-subback', onWeatherSubBack);
  }, [isOpen, expandedForecast, alertExpanded]);

  const lastHandledActivateSignalRef = useRef<number>(activateSignal);
  const focusRef = useRef<WeatherDrawerFocus>(focus);
  focusRef.current = focus;
  const callbacksRef = useRef({
    onRefresh,
    onClose,
    onUseGps,
    onToggleSyncBackground,
    onToggleEnabled,
    toggleExpandedForecast,
    toggleAlertExpanded,
  });
  callbacksRef.current = {
    onRefresh,
    onClose,
    onUseGps,
    onToggleSyncBackground,
    onToggleEnabled,
    toggleExpandedForecast,
    toggleAlertExpanded,
  };

  useEffect(() => {
    if (!isOpen) return;
    if (focus.section !== 'header') {
      const active = document.activeElement as HTMLElement | null;
      if (active && headerRefs.current.some((btn) => btn === active)) {
        active.blur();
      }
    }
    if (focus.section === 'header') {
      scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      const targetBtn = headerRefs.current[focus.index];
      if (targetBtn && document.activeElement !== targetBtn) {
        targetBtn.focus({ preventScroll: true });
      }
    } else if (focus.section === 'alert') {
      alertBannerRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    } else if (focus.section === 'hourly') {
      hourlyCardRefs.current[focus.index]?.scrollIntoView({
        inline: 'nearest',
        block: 'nearest',
        behavior: 'smooth',
      });
    } else if (focus.section === 'daily') {
      dailyCardRefs.current[focus.index]?.scrollIntoView({
        inline: 'nearest',
        block: 'nearest',
        behavior: 'smooth',
      });
    } else if (focus.section === 'controls') {
      controlRefs.current[focus.index]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isOpen, focus.section, focus.index]);

  useEffect(() => {
    if (!isOpen) {
      lastHandledActivateSignalRef.current = activateSignal;
      return;
    }
    if (
      activateSignal === 0 ||
      activateSignal === lastHandledActivateSignalRef.current
    ) {
      return;
    }
    lastHandledActivateSignalRef.current = activateSignal;

    const currentFocus = focusRef.current;
    const cbs = callbacksRef.current;
    if (currentFocus.section === 'header') {
      if (currentFocus.index === 0) cbs.onRefresh();
      else if (currentFocus.index === 1) cbs.onClose();
    } else if (currentFocus.section === 'alert') {
      cbs.toggleAlertExpanded();
    } else if (currentFocus.section === 'hourly') {
      cbs.toggleExpandedForecast('hourly', currentFocus.index);
    } else if (currentFocus.section === 'daily') {
      cbs.toggleExpandedForecast('daily', currentFocus.index);
    } else if (currentFocus.section === 'controls') {
      if (currentFocus.index === 0) cbs.onUseGps();
      else if (currentFocus.index === 1) searchInputRef.current?.focus();
      else if (currentFocus.index === 2) searchSubmitRef.current?.click();
      else if (currentFocus.index === 3) cbs.onToggleSyncBackground();
      else if (currentFocus.index === 4) cbs.onToggleEnabled();
    }
  }, [activateSignal, isOpen]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cityQuery.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchCitiesByName(cityQuery);
      setResults(found);
      if (found.length === 0) {
        setSearchError('No matching cities found.');
      } else {
        searchInputRef.current?.blur();
        window.setTimeout(() => {
          resultRefs.current[0]?.focus();
        }, 30);
      }
    } catch {
      setSearchError('Could not search cities right now.');
    } finally {
      setSearching(false);
    }
  };

  const scrollHourlyByPage = (direction: -1 | 1) => {
    const strip = hourlyStripRef.current;
    if (!strip) return;
    strip.scrollBy({
      left: direction * Math.max(200, strip.clientWidth * 0.8),
      behavior: 'smooth',
    });
  };

  if (!isOpen) return null;

  const activeNote = weather.warningHeadline ?? weather.extendedWarningHeadline;
  const officialAlerts = weather.activeAlerts ?? [];
  const primaryAlert = officialAlerts[0] ?? null;
  const isRedWarning =
    weather.hasWarning &&
    (primaryAlert?.colourLevel === 'Red' || primaryAlert?.severity === 'Extreme');
  const expandedHourSlot =
    expandedForecast?.kind === 'hourly'
      ? weather.hourly24Hours[expandedForecast.index] ?? null
      : null;
  const expandedDaySlot =
    expandedForecast?.kind === 'daily'
      ? weather.daily7Days[expandedForecast.index] ?? null
      : null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Weather Forecast Drawer"
    >
      {/* Backdrop click/tap closes drawer */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-out Right-Edge Weather Drawer (slim TV-proportioned width, 10-foot typography) */}
      <aside className="tv-surface relative z-10 flex h-full w-[min(88vw,460px)] flex-col border-l border-white/15 bg-[#0C0F16]/88 p-4 shadow-2xl backdrop-blur-2xl sm:w-[min(48vw,470px)] sm:p-6">
        {/* Header Bar */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-white/60 sm:text-sm">
              <span>Weather Forecast</span>
              <span aria-hidden="true">·</span>
              <span>{weather.locationMode === 'gps' ? 'Auto Location' : 'Manual City'}</span>
            </div>
            <h2 className="font-display truncate text-xl font-semibold text-white sm:text-2xl">
              {weather.activeLocationLabel}
            </h2>
            {weather.usingGpsFallback && weather.locationMode === 'gps' && (
              <p className="mt-0.5 text-xs text-white/60">
                Auto location unavailable offline · Showing fallback city
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              ref={(el) => {
                headerRefs.current[0] = el;
              }}
              type="button"
              onMouseEnter={() => onFocusChange({ section: 'header', index: 0 })}
              onFocus={() => onFocusChange({ section: 'header', index: 0 })}
              onClick={onRefresh}
              className={`min-h-[42px] rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none sm:text-sm ${
                focus.section === 'header' && focus.index === 0
                  ? 'border-white bg-white/18 text-white'
                  : 'border-white/12 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              {weather.loading ? 'Updating…' : 'Refresh'}
            </button>
            <button
              ref={(el) => {
                headerRefs.current[1] = el;
              }}
              type="button"
              onMouseEnter={() => onFocusChange({ section: 'header', index: 1 })}
              onFocus={() => onFocusChange({ section: 'header', index: 1 })}
              onClick={onClose}
              aria-label="Close Weather Drawer"
              className={`flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border transition-colors focus-visible:outline-none ${
                focus.section === 'header' && focus.index === 1
                  ? 'border-white bg-white/18 text-white'
                  : 'border-white/12 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          ref={scrollBodyRef}
          className="no-scrollbar mt-3 flex-1 space-y-3.5 overflow-y-auto pr-0.5"
        >
          {/* Weather Warning (expandable official CAP advisory when MetService/NWS alerts exist) or plain-text note */}
          {officialAlerts.length > 0 && primaryAlert ? (
            <div className="space-y-2">
              <button
                ref={alertBannerRef}
                type="button"
                aria-expanded={alertExpanded}
                onMouseEnter={() => onFocusChange({ section: 'alert', index: 0 })}
                onFocus={() => onFocusChange({ section: 'alert', index: 0 })}
                onClick={() => {
                  onFocusChange({ section: 'alert', index: 0 });
                  toggleAlertExpanded();
                }}
                className={`flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-all focus-visible:outline-none sm:text-sm ${
                  focus.section === 'alert'
                    ? isRedWarning
                      ? 'border-white bg-red-500/25 text-red-100 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]'
                      : 'border-white bg-amber-500/25 text-amber-100 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]'
                    : isRedWarning
                    ? 'border-red-400/45 bg-red-500/15 text-red-100 hover:bg-red-500/20'
                    : 'border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20'
                }`}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <AlertTriangle
                    size={17}
                    className={`mt-0.5 shrink-0 ${
                      isRedWarning ? 'text-red-300' : 'text-amber-300'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 leading-snug">
                    <div>
                      <span
                        className={`font-semibold ${
                          isRedWarning ? 'text-red-50' : 'text-amber-100'
                        }`}
                      >
                        Warning ·{' '}
                      </span>
                      <span>{primaryAlert.headline || primaryAlert.event}</span>
                    </div>
                    <div
                      className={`mt-0.5 text-[11px] font-normal ${
                        isRedWarning ? 'text-red-200/80' : 'text-amber-200/80'
                      }`}
                    >
                      {formatAlertSourceLabel(primaryAlert.source, false)}
                      {primaryAlert.areaDesc ? ` · ${primaryAlert.areaDesc}` : ''}
                      {officialAlerts.length > 1
                        ? ` · +${officialAlerts.length - 1} more`
                        : ''}
                      {' · '}
                      {alertExpanded ? 'Select to collapse' : 'Select for details'}
                    </div>
                  </div>
                </div>
                {alertExpanded ? (
                  <ChevronUp size={16} className="shrink-0 opacity-80" aria-hidden="true" />
                ) : (
                  <ChevronDown size={16} className="shrink-0 opacity-80" aria-hidden="true" />
                )}
              </button>

              {alertExpanded && (
                <div
                  ref={alertDetailRef}
                  className="space-y-3 rounded-xl border border-white/15 bg-white/[0.06] p-3.5 text-xs sm:text-sm"
                >
                  {officialAlerts.map((alert, idx) => {
                    const alertRed =
                      alert.colourLevel === 'Red' || alert.severity === 'Extreme';
                    const onsetText = formatAlertTimestamp(alert.onsetIso);
                    const expiresText = formatAlertTimestamp(alert.expiresIso);
                    const nextUpdateText = formatAlertTimestamp(alert.nextUpdateIso);
                    return (
                      <div
                        key={alert.id}
                        className={
                          idx > 0 ? 'space-y-2 border-t border-white/10 pt-3' : 'space-y-2'
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className={`font-display text-sm font-semibold sm:text-base ${
                                alertRed ? 'text-red-200' : 'text-amber-100'
                              }`}
                            >
                              {alert.headline || alert.event}
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/65 tabular-nums sm:text-xs">
                              <span>{formatAlertSourceLabel(alert.source, true)}</span>
                              {alert.areaDesc ? ` · ${alert.areaDesc}` : ''}
                              {onsetText && expiresText
                                ? ` · ${onsetText} – ${expiresText}`
                                : expiresText
                                ? ` · Until ${expiresText}`
                                : ''}
                            </div>
                          </div>
                          {idx === 0 && (
                            <button
                              type="button"
                              onClick={() => setAlertExpanded(false)}
                              aria-label="Collapse official weather warning details"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>

                        {alert.description && (
                          <p className="leading-relaxed text-white/85">
                            {alert.description}
                          </p>
                        )}

                        {alert.instruction && (
                          <p className="leading-relaxed text-white/75">
                            {!/^(action|instruction|advice)/i.test(alert.instruction)
                              ? `Advice: ${alert.instruction}`
                              : alert.instruction}
                          </p>
                        )}

                        {nextUpdateText && (
                          <div className="text-[11px] text-white/50 tabular-nums">
                            Next update: {nextUpdateText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            activeNote &&
            (weather.hasWarning ? (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs font-medium text-amber-200 sm:text-sm"
              >
                <AlertTriangle size={17} className="shrink-0 text-amber-300" aria-hidden="true" />
                <div className="min-w-0 leading-snug">
                  <span className="font-semibold text-amber-100">Warning · </span>
                  <span>{activeNote}</span>
                </div>
              </div>
            ) : (
              <p className="px-0.5 text-xs text-white/75 sm:text-sm">{activeNote}</p>
            ))
          )}

          {/* Current Summary Card */}
          {weather.current ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-3.5">
                {renderWeatherIcon(
                  weather.current.weatherCode,
                  32,
                  isRedWarning
                    ? 'text-red-300'
                    : weather.hasWarning
                    ? 'text-amber-300'
                    : 'text-white'
                )}
                <div>
                  <div className="font-display text-2xl font-medium tracking-tight text-white tabular-nums sm:text-3xl">
                    {weather.current.tempC}°C
                  </div>
                  <div className="text-xs text-white/75 sm:text-sm">
                    {weather.current.conditionLabel}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-white/70 tabular-nums sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <Wind size={14} className="text-white/55" aria-hidden="true" />
                  <span>{weather.current.windKmh} km/h</span>
                </div>
                <span aria-hidden="true" className="text-white/30">
                  ·
                </span>
                <span>Gusts {weather.current.windGustKmh}</span>
              </div>
            </div>
          ) : weather.error ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-xs text-amber-300 sm:text-sm">
              {weather.error}
            </div>
          ) : null}

          {/* Row 1: Next 24 Hours (7 visible cards across TV drawer, horizontal scroll) */}
          <section aria-label="Hourly Forecast">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-white sm:text-sm">Next 24 Hours</h3>
                <span aria-hidden="true" className="text-xs text-white/35">
                  ·
                </span>
                <span className="text-xs text-white/55">Select to expand</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => scrollHourlyByPage(-1)}
                  aria-label="Scroll hourly forecast left"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-white/75 hover:bg-white/15 hover:text-white"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollHourlyByPage(1)}
                  aria-label="Scroll hourly forecast right"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/5 text-white/75 hover:bg-white/15 hover:text-white"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div
              ref={hourlyStripRef}
              className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 snap-x snap-mandatory"
            >
              {weather.hourly24Hours.map((slot, idx) => {
                const isFocused = focus.section === 'hourly' && focus.index === idx;
                const isExpanded =
                  expandedForecast?.kind === 'hourly' && expandedForecast.index === idx;
                return (
                  <button
                    key={slot.timeIso}
                    ref={(el) => {
                      hourlyCardRefs.current[idx] = el;
                    }}
                    type="button"
                    aria-expanded={isExpanded}
                    onMouseEnter={() => onFocusChange({ section: 'hourly', index: idx })}
                    onFocus={() => onFocusChange({ section: 'hourly', index: idx })}
                    onClick={() => {
                      onFocusChange({ section: 'hourly', index: idx });
                      toggleExpandedForecast('hourly', idx);
                    }}
                    className={`flex min-h-[96px] flex-[0_0_calc((100%-1.5rem)/5)] snap-start flex-col items-center justify-between rounded-xl border p-1.5 text-center transition-all min-[390px]:flex-[0_0_calc((100%-2.25rem)/7)] ${
                      isFocused
                        ? 'border-white bg-white/16 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]'
                        : isExpanded
                        ? 'border-white/45 bg-white/[0.11]'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="text-[11px] font-medium whitespace-nowrap text-white/75 sm:text-xs">
                      {slot.timeLabel}
                    </span>
                    <div className="my-0.5 flex justify-center">
                      {renderWeatherIcon(
                        slot.weatherCode,
                        18,
                        slot.isSevereWarning
                          ? slot.warningColour === 'Red'
                            ? 'text-red-300'
                            : 'text-amber-300'
                          : 'text-white/90'
                      )}
                    </div>
                    <span className="font-display text-sm font-medium text-white tabular-nums sm:text-base">
                      {slot.tempC}°
                    </span>
                    <span className="text-[11px] text-white/65 tabular-nums sm:text-xs">
                      {slot.precipProb}%
                    </span>
                  </button>
                );
              })}
            </div>

            {expandedHourSlot && (
              <div
                ref={expandedDetailRef}
                className="mt-2 rounded-xl border border-white/15 bg-white/[0.06] p-3.5"
              >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-3">
                    {renderWeatherIcon(
                      expandedHourSlot.weatherCode,
                      26,
                      expandedHourSlot.isSevereWarning
                        ? expandedHourSlot.warningColour === 'Red'
                          ? 'text-red-300'
                          : 'text-amber-300'
                        : 'text-white'
                    )}
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-display text-sm font-semibold text-white sm:text-base">
                          {expandedHourSlot.timeLabel}
                        </span>
                        <span className="text-xs text-white/60">
                          {formatShortDateFromIso(expandedHourSlot.timeIso)}
                        </span>
                      </div>
                      <div className="text-xs text-white/80 sm:text-sm">
                        {expandedHourSlot.conditionLabel} · {expandedHourSlot.tempC}°C
                        {typeof expandedHourSlot.apparentTempC === 'number'
                          ? ` (Feels ${expandedHourSlot.apparentTempC}°)`
                          : ''}
                      </div>
                      {expandedHourSlot.isSevereWarning && expandedHourSlot.warningHeadline && (
                        <div
                          className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${
                            expandedHourSlot.warningColour === 'Red'
                              ? 'text-red-300'
                              : 'text-amber-300'
                          }`}
                        >
                          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                          <span>{expandedHourSlot.warningHeadline}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedForecast(null)}
                    aria-label="Collapse hourly forecast details"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Droplets size={12} aria-hidden="true" />
                      <span>Precipitation</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {expandedHourSlot.precipProb}%
                      {typeof expandedHourSlot.precipMm === 'number'
                        ? ` · ${expandedHourSlot.precipMm} mm`
                        : ''}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Wind size={12} aria-hidden="true" />
                      <span>Wind</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedHourSlot.windSpeedKmh === 'number'
                        ? `${expandedHourSlot.windSpeedKmh} km/h `
                        : ''}
                      {formatCompassDirection(expandedHourSlot.windDirectionDeg)}
                      {` · Gusts ${expandedHourSlot.windGustKmh}`}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Thermometer size={12} aria-hidden="true" />
                      <span>Feels Like</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedHourSlot.apparentTempC === 'number'
                        ? `${expandedHourSlot.apparentTempC}°C`
                        : `${expandedHourSlot.tempC}°C`}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Droplets size={12} aria-hidden="true" />
                      <span>Humidity</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedHourSlot.humidityPct === 'number'
                        ? `${expandedHourSlot.humidityPct}%`
                        : '—'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Cloud size={12} aria-hidden="true" />
                      <span>Cloud Cover</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedHourSlot.cloudCoverPct === 'number'
                        ? `${expandedHourSlot.cloudCoverPct}%`
                        : '—'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Sun size={12} aria-hidden="true" />
                      <span>UV Index</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedHourSlot.uvIndex === 'number'
                        ? `${expandedHourSlot.uvIndex}`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Row 2: Next 7 Days */}
          <section aria-label="7-Day Weather Forecast">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold text-white sm:text-sm">Next 7 Days</h3>
              <span aria-hidden="true" className="text-xs text-white/35">
                ·
              </span>
              <span className="text-xs text-white/55">High / Low · Select to expand</span>
            </div>

            <div className="no-scrollbar grid grid-cols-7 gap-1.5 max-[359px]:flex max-[359px]:overflow-x-auto">
              {weather.daily7Days.map((day, idx) => {
                const isFocused = focus.section === 'daily' && focus.index === idx;
                const isExpanded =
                  expandedForecast?.kind === 'daily' && expandedForecast.index === idx;
                const shortDay = day.dayLabel === 'Tomorrow' ? 'Tmrw' : day.dayLabel;
                return (
                  <button
                    key={day.dateIso}
                    ref={(el) => {
                      dailyCardRefs.current[idx] = el;
                    }}
                    type="button"
                    aria-expanded={isExpanded}
                    onMouseEnter={() => onFocusChange({ section: 'daily', index: idx })}
                    onFocus={() => onFocusChange({ section: 'daily', index: idx })}
                    onClick={() => {
                      onFocusChange({ section: 'daily', index: idx });
                      toggleExpandedForecast('daily', idx);
                    }}
                    className={`flex min-h-[108px] flex-col items-center justify-between rounded-xl border p-1.5 text-center transition-all max-[359px]:min-w-[54px] ${
                      isFocused
                        ? 'border-white bg-white/16 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]'
                        : isExpanded
                        ? 'border-white/45 bg-white/[0.11]'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="w-full truncate text-[11px] font-semibold text-white/85 sm:text-xs">
                      {shortDay}
                    </span>
                    <div className="my-0.5 flex justify-center">
                      {renderWeatherIcon(
                        day.weatherCode,
                        18,
                        day.isSevereWarning
                          ? day.warningColour === 'Red'
                            ? 'text-red-300'
                            : 'text-amber-300'
                          : 'text-white/90'
                      )}
                    </div>
                    <div className="font-display text-sm leading-tight font-medium text-white tabular-nums sm:text-base">
                      <div>{day.tempMaxC}°</div>
                      <div className="text-xs text-white/60">{day.tempMinC}°</div>
                    </div>
                    <span className="text-[11px] text-white/65 tabular-nums sm:text-xs">
                      {day.precipProbMax}%
                    </span>
                  </button>
                );
              })}
            </div>

            {expandedDaySlot && (
              <div
                ref={expandedDetailRef}
                className="mt-2 rounded-xl border border-white/15 bg-white/[0.06] p-3.5"
              >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-3">
                    {renderWeatherIcon(
                      expandedDaySlot.weatherCode,
                      26,
                      expandedDaySlot.isSevereWarning
                        ? expandedDaySlot.warningColour === 'Red'
                          ? 'text-red-300'
                          : 'text-amber-300'
                        : 'text-white'
                    )}
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-display text-sm font-semibold text-white sm:text-base">
                          {expandedDaySlot.dayLabel}
                        </span>
                        <span className="text-xs text-white/60">
                          {formatShortDateFromIso(expandedDaySlot.dateIso, true)}
                        </span>
                      </div>
                      <div className="text-xs text-white/80 sm:text-sm">
                        {expandedDaySlot.conditionLabel} · High {expandedDaySlot.tempMaxC}° / Low{' '}
                        {expandedDaySlot.tempMinC}°C
                      </div>
                      {expandedDaySlot.isSevereWarning && expandedDaySlot.warningHeadline && (
                        <div
                          className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${
                            expandedDaySlot.warningColour === 'Red'
                              ? 'text-red-300'
                              : 'text-amber-300'
                          }`}
                        >
                          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                          <span>{expandedDaySlot.warningHeadline}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedForecast(null)}
                    aria-label="Collapse daily forecast details"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Droplets size={12} aria-hidden="true" />
                      <span>Precipitation</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {expandedDaySlot.precipProbMax}% max
                      {typeof expandedDaySlot.precipSumMm === 'number'
                        ? ` · ${expandedDaySlot.precipSumMm} mm`
                        : ''}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Wind size={12} aria-hidden="true" />
                      <span>Wind</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedDaySlot.windSpeedMaxKmh === 'number'
                        ? `${expandedDaySlot.windSpeedMaxKmh} km/h `
                        : ''}
                      {formatCompassDirection(expandedDaySlot.windDirectionDeg)}
                      {` · Gusts ${expandedDaySlot.windGustMaxKmh}`}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Thermometer size={12} aria-hidden="true" />
                      <span>Feels Like</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedDaySlot.apparentTempMaxC === 'number' &&
                      typeof expandedDaySlot.apparentTempMinC === 'number'
                        ? `${expandedDaySlot.apparentTempMaxC}° / ${expandedDaySlot.apparentTempMinC}°`
                        : `${expandedDaySlot.tempMaxC}° / ${expandedDaySlot.tempMinC}°`}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Sun size={12} aria-hidden="true" />
                      <span>UV Index Max</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {typeof expandedDaySlot.uvIndexMax === 'number'
                        ? `${expandedDaySlot.uvIndexMax}`
                        : '—'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Sunrise size={12} aria-hidden="true" />
                      <span>Sunrise</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {formatClockFromIso(expandedDaySlot.sunriseIso)}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-white/55">
                      <Sunset size={12} aria-hidden="true" />
                      <span>Sunset</span>
                    </div>
                    <div className="mt-0.5 font-medium text-white tabular-nums">
                      {formatClockFromIso(expandedDaySlot.sunsetIso)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Location & Weather Preferences */}
          <section className="space-y-3 border-t border-white/10 pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white sm:text-sm">Location & Weather Sync</span>
              <button
                ref={(el) => {
                  controlRefs.current[0] = el;
                }}
                type="button"
                onMouseEnter={() => onFocusChange({ section: 'controls', index: 0 })}
                onFocus={() => onFocusChange({ section: 'controls', index: 0 })}
                onClick={() => {
                  onFocusChange({ section: 'controls', index: 0 });
                  onUseGps();
                }}
                className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none sm:text-sm ${
                  focus.section === 'controls' && focus.index === 0
                    ? 'border-white bg-white/18 text-white'
                    : 'border-white/15 bg-white/8 text-white hover:bg-white/15'
                }`}
              >
                <LocateFixed size={14} />
                <span>Use Auto Location</span>
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                ref={(el) => {
                  searchInputRef.current = el;
                  controlRefs.current[1] = el;
                }}
                type="text"
                value={cityQuery}
                onFocus={() => onFocusChange({ section: 'controls', index: 1 })}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Search manual fallback city…"
                className={`min-h-[44px] flex-1 rounded-xl border bg-black/40 px-3.5 text-xs text-white placeholder:text-white/40 focus:outline-none sm:text-sm ${
                  focus.section === 'controls' && focus.index === 1
                    ? 'border-white'
                    : 'border-white/15 focus:border-white/40'
                }`}
              />
              <button
                ref={(el) => {
                  searchSubmitRef.current = el;
                  controlRefs.current[2] = el;
                }}
                type="submit"
                disabled={searching}
                onMouseEnter={() => onFocusChange({ section: 'controls', index: 2 })}
                onFocus={() => onFocusChange({ section: 'controls', index: 2 })}
                aria-label="Search city"
                className={`flex min-h-[44px] min-w-[46px] items-center justify-center rounded-xl bg-white px-3.5 text-xs font-semibold text-[#07080A] hover:bg-white/90 focus-visible:outline-none sm:text-sm ${
                  focus.section === 'controls' && focus.index === 2
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0C0F16]'
                    : ''
                }`}
              >
                <Search size={16} />
              </button>
            </form>

            {searchError && <p className="text-xs text-amber-300 sm:text-sm">{searchError}</p>}

            {results.length > 0 && (
              <div className="space-y-1.5">
                {results.map((city, i) => (
                  <button
                    key={`${city.name}-${city.latitude}-${i}`}
                    ref={(el) => {
                      resultRefs.current[i] = el;
                    }}
                    data-weather-result=""
                    type="button"
                    onClick={() => {
                      onSelectManualCity(city);
                      setResults([]);
                      setCityQuery('');
                    }}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 text-left text-xs text-white hover:bg-white/15 focus:border-white focus:bg-white/15 focus:outline-none sm:text-sm"
                  >
                    <span className="font-medium">{city.name}</span>
                    <span className="text-white/55">
                      {[city.region, city.country].filter(Boolean).join(', ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                ref={(el) => {
                  controlRefs.current[3] = el;
                }}
                type="button"
                onMouseEnter={() => onFocusChange({ section: 'controls', index: 3 })}
                onFocus={() => onFocusChange({ section: 'controls', index: 3 })}
                onClick={() => {
                  onFocusChange({ section: 'controls', index: 3 });
                  onToggleSyncBackground();
                }}
                className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 text-xs transition-colors focus-visible:outline-none sm:text-sm ${
                  focus.section === 'controls' && focus.index === 3
                    ? 'border-white bg-white/18 text-white'
                    : 'border-white/12 bg-white/6 text-white/85 hover:bg-white/12'
                }`}
              >
                <span className="truncate">Sync Wallpaper</span>
                <span className="font-semibold text-white">
                  {syncBackgroundToWeather ? 'On' : 'Off'}
                </span>
              </button>

              <button
                ref={(el) => {
                  controlRefs.current[4] = el;
                }}
                type="button"
                onMouseEnter={() => onFocusChange({ section: 'controls', index: 4 })}
                onFocus={() => onFocusChange({ section: 'controls', index: 4 })}
                onClick={() => {
                  onFocusChange({ section: 'controls', index: 4 });
                  onToggleEnabled();
                }}
                className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 text-xs transition-colors focus-visible:outline-none sm:text-sm ${
                  focus.section === 'controls' && focus.index === 4
                    ? 'border-white bg-white/18 text-white'
                    : 'border-white/12 bg-white/6 text-white/85 hover:bg-white/12'
                }`}
              >
                <span className="truncate">Home Widget</span>
                <span className="font-semibold text-white">
                  {weather.enabled ? 'Shown' : 'Hidden'}
                </span>
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
