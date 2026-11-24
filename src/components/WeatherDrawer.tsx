import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Search,
  Wind,
  X,
} from 'lucide-react';
import { searchCitiesByName } from '../services/weatherService';
import { ManualCityOption, WeatherState } from '../types/launcher';
import { renderWeatherIcon } from './WeatherWidget';

export interface WeatherDrawerFocus {
  section: 'header' | 'hourly' | 'daily' | 'controls';
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

  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const headerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hourlyStripRef = useRef<HTMLDivElement | null>(null);
  const hourlyCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dailyCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const controlRefs = useRef<Array<HTMLButtonElement | HTMLInputElement | null>>([]);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchSubmitRef = useRef<HTMLButtonElement | null>(null);

  const lastHandledActivateSignalRef = useRef<number>(activateSignal);
  const focusRef = useRef<WeatherDrawerFocus>(focus);
  focusRef.current = focus;
  const callbacksRef = useRef({
    onRefresh,
    onClose,
    onUseGps,
    onToggleSyncBackground,
    onToggleEnabled,
  });
  callbacksRef.current = {
    onRefresh,
    onClose,
    onUseGps,
    onToggleSyncBackground,
    onToggleEnabled,
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

  const activeWarning = weather.warningHeadline ?? weather.extendedWarningHeadline;

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
          {/* Active Weather Warning Callout */}
          {activeWarning && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs font-medium text-amber-200 sm:text-sm"
            >
              <AlertTriangle size={17} className="shrink-0 text-amber-300" aria-hidden="true" />
              <div className="min-w-0 leading-snug">
                <span className="font-semibold text-amber-100">Warning · </span>
                <span>{activeWarning}</span>
              </div>
            </div>
          )}

          {/* Current Summary Card */}
          {weather.current ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-3.5">
                {renderWeatherIcon(
                  weather.current.weatherCode,
                  32,
                  weather.hasWarning ? 'text-amber-300' : 'text-white'
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
                <span className="text-xs text-white/55">Scroll right</span>
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
                return (
                  <button
                    key={slot.timeIso}
                    ref={(el) => {
                      hourlyCardRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseEnter={() => onFocusChange({ section: 'hourly', index: idx })}
                    onFocus={() => onFocusChange({ section: 'hourly', index: idx })}
                    onClick={() => onFocusChange({ section: 'hourly', index: idx })}
                    className={`flex min-h-[96px] flex-[0_0_calc((100%-1.5rem)/5)] snap-start flex-col items-center justify-between rounded-xl border p-1.5 text-center transition-all min-[390px]:flex-[0_0_calc((100%-2.25rem)/7)] ${
                      isFocused
                        ? 'border-white bg-white/16 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]'
                        : slot.isBadWeather
                        ? 'border-amber-300/35 bg-amber-500/12 hover:bg-amber-500/18'
                        : 'border-white/10 bg-black/35 hover:bg-white/8'
                    }`}
                  >
                    <span className="text-[11px] font-medium whitespace-nowrap text-white/75 sm:text-xs">
                      {slot.timeLabel}
                    </span>
                    <div className="my-0.5 flex justify-center">
                      {renderWeatherIcon(
                        slot.weatherCode,
                        18,
                        slot.isBadWeather ? 'text-amber-300' : 'text-white/90'
                      )}
                    </div>
                    <span className="font-display text-sm font-medium text-white tabular-nums sm:text-base">
                      {slot.tempC}°
                    </span>
                    <span
                      className={`text-[11px] tabular-nums sm:text-xs ${
                        slot.precipProb >= 30 ? 'text-amber-200' : 'text-white/60'
                      }`}
                    >
                      {slot.precipProb}%
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Row 2: Next 7 Days */}
          <section aria-label="7-Day Weather Forecast">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold text-white sm:text-sm">Next 7 Days</h3>
              <span aria-hidden="true" className="text-xs text-white/35">
                ·
              </span>
              <span className="text-xs text-white/55">High / Low</span>
            </div>

            <div className="no-scrollbar grid grid-cols-7 gap-1.5 max-[359px]:flex max-[359px]:overflow-x-auto">
              {weather.daily7Days.map((day, idx) => {
                const isFocused = focus.section === 'daily' && focus.index === idx;
                const shortDay = day.dayLabel === 'Tomorrow' ? 'Tmrw' : day.dayLabel;
                return (
                  <button
                    key={day.dateIso}
                    ref={(el) => {
                      dailyCardRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseEnter={() => onFocusChange({ section: 'daily', index: idx })}
                    onFocus={() => onFocusChange({ section: 'daily', index: idx })}
                    onClick={() => onFocusChange({ section: 'daily', index: idx })}
                    className={`flex min-h-[108px] flex-col items-center justify-between rounded-xl border p-1.5 text-center transition-all max-[359px]:min-w-[54px] ${
                      isFocused
                        ? 'border-white bg-white/16 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]'
                        : day.isBadWeather
                        ? 'border-amber-300/35 bg-amber-500/12 hover:bg-amber-500/18'
                        : 'border-white/10 bg-black/35 hover:bg-white/8'
                    }`}
                  >
                    <span className="w-full truncate text-[11px] font-semibold text-white/85 sm:text-xs">
                      {shortDay}
                    </span>
                    <div className="my-0.5 flex justify-center">
                      {renderWeatherIcon(
                        day.weatherCode,
                        18,
                        day.isBadWeather ? 'text-amber-300' : 'text-white/90'
                      )}
                    </div>
                    <div className="font-display text-sm leading-tight font-medium text-white tabular-nums sm:text-base">
                      <div>{day.tempMaxC}°</div>
                      <div className="text-xs text-white/60">{day.tempMinC}°</div>
                    </div>
                    <span
                      className={`text-[11px] tabular-nums sm:text-xs ${
                        day.precipProbMax >= 35 ? 'text-amber-200' : 'text-white/60'
                      }`}
                    >
                      {day.precipProbMax}%
                    </span>
                  </button>
                );
              })}
            </div>
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
