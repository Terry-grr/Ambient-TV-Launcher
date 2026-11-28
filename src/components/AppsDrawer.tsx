import React, { useCallback, useEffect, useRef } from 'react';
import { ArrowLeftRight, Check, ChevronUp } from 'lucide-react';
import {
  AppItem,
  FerrofluidIntensity,
  WeatherState,
} from '../types/launcher';
import { AppTile } from './AppTile';
import { FerrofluidAura } from './FerrofluidAura';
import { WeatherWidget } from './WeatherWidget';

interface AppsDrawerProps {
  apps: AppItem[];
  focusedIndex: number;
  movingAppId: string | null;
  showClock: boolean;
  timeText: string;
  weather: WeatherState;
  ferrofluidIntensity: FerrofluidIntensity;
  liteMode?: boolean;
  onFocusIndex: (index: number) => void;
  onSelectApp: (app: AppItem, index: number) => void;
  onLongPressApp: (app: AppItem) => void;
  onDoneMoving: () => void;
  onOpenWeatherDetail: () => void;
  onBackHome: () => void;
}

export const AppsDrawer: React.FC<AppsDrawerProps> = ({
  apps,
  focusedIndex,
  movingAppId,
  showClock,
  timeText,
  weather,
  ferrofluidIntensity,
  liteMode = false,
  onFocusIndex,
  onSelectApp,
  onLongPressApp,
  onDoneMoving,
  onOpenWeatherDetail,
  onBackHome,
}) => {
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Record<string, HTMLElement | null>>({});

  const getTileEl = useCallback((key: string) => tileRefs.current[key] ?? null, []);

  const pinnedApps = apps.slice(0, 5);
  const drawerApps = apps.slice(5);
  const movingApp = movingAppId ? apps.find((a) => a.id === movingAppId) : null;
  const activeKey = apps[focusedIndex]?.id ?? apps[0]?.id ?? null;

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container || !activeKey) return;
    if (focusedIndex < 5) {
      container.scrollTo({ top: 0, behavior: liteMode ? 'auto' : 'smooth' });
      return;
    }
    const tileEl = tileRefs.current[activeKey];
    const scrollTarget = tileEl?.closest('button') ?? tileEl;
    scrollTarget?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: liteMode ? 'auto' : 'smooth',
    });
  }, [focusedIndex, activeKey, liteMode]);

  return (
    <div className="tv-surface relative flex h-full w-full flex-col justify-between bg-[#07080A]/65 p-5 backdrop-blur-2xl sm:px-14 sm:py-10">
      {/* Top Bar: Clock (left, if enabled), Up chevron (center), Weather (right) */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 pt-1">
          {showClock && (
            <div className="font-display text-2xl font-light tracking-tight text-white tabular-nums sm:text-4xl">
              {timeText}
            </div>
          )}
          <p className={`${showClock ? 'mt-1' : ''} text-xs text-white/60`}>
            All Apps · Hold OK to open app options
          </p>
        </div>

        <button
          type="button"
          tabIndex={-1}
          onClick={onBackHome}
          aria-label="Back to default launcher view"
          className="flex min-h-[44px] min-w-[64px] items-center justify-center rounded-full border border-white/15 bg-white/8 px-3 text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronUp size={22} />
        </button>

        <div className="flex justify-end">
          <WeatherWidget weather={weather} onOpenDetail={onOpenWeatherDetail} />
        </div>
      </header>

      {/* Active Move Mode Banner */}
      {movingApp && (
        <div className="mx-auto mt-3 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/40 bg-amber-500/15 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-xs text-amber-100 sm:text-sm">
            <ArrowLeftRight size={16} className="shrink-0 text-amber-300" />
            <span>
              Moving <strong>{movingApp.name}</strong> · Tap any app slot or use
              arrows to reorder. Top 5 stay on Home.
            </span>
          </div>
          <button
            type="button"
            onClick={onDoneMoving}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-semibold text-[#07080A] hover:bg-white/90"
          >
            <Check size={14} />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* Main Grid with Pinned Top Row + Horizontal Divider + Remaining Apps */}
      <div
        ref={gridContainerRef}
        className="no-scrollbar relative mx-auto mt-5 w-full max-w-6xl flex-1 overflow-y-auto px-3.5 py-3.5"
      >
        <FerrofluidAura
          containerRef={gridContainerRef}
          activeKey={activeKey}
          getElementByKey={getTileEl}
          intensity={ferrofluidIntensity}
          borderRadius={12}
          variant="tile"
          pulseActive={Boolean(movingAppId)}
          liteMode={liteMode}
        />

        {/* Row 1: Pinned 5 apps shown on Default View */}
        <div className="relative z-10">
          <div className="mb-2.5 flex items-center justify-between px-1 text-xs text-white/60 sm:text-sm">
            <span>Default Home Row</span>
            <span>First 5 apps</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-5">
            {pinnedApps.map((app, idx) => (
              <AppTile
                key={app.id}
                app={app}
                isFocused={focusedIndex === idx}
                isMovingSource={movingAppId === app.id}
                inMoveMode={Boolean(movingAppId)}
                onFocus={() => onFocusIndex(idx)}
                onSelect={() => onSelectApp(app, idx)}
                onLongPress={() => onLongPressApp(app)}
                tileRef={(el) => {
                  tileRefs.current[app.id] = el;
                }}
              />
            ))}
          </div>
        </div>

        {/* Horizontal Divider Line from Sketch */}
        <div className="relative z-10 my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-xs text-white/50 sm:text-sm">Installed Apps</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>

        {/* Rows 2+: Remaining Apps */}
        {drawerApps.length > 0 ? (
          <div className="relative z-10 grid grid-cols-2 gap-3 pb-6 sm:grid-cols-5 sm:gap-5">
            {drawerApps.map((app, offsetIdx) => {
              const idx = 5 + offsetIdx;
              return (
                <AppTile
                  key={app.id}
                  app={app}
                  isFocused={focusedIndex === idx}
                  isMovingSource={movingAppId === app.id}
                  inMoveMode={Boolean(movingAppId)}
                  onFocus={() => onFocusIndex(idx)}
                  onSelect={() => onSelectApp(app, idx)}
                  onLongPress={() => onLongPressApp(app)}
                  tileRef={(el) => {
                    tileRefs.current[app.id] = el;
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="relative z-10 py-8 text-center text-sm text-white/55">
            All remaining apps are pinned above the divider.
          </div>
        )}
      </div>
    </div>
  );
};
