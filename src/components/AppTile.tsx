import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, GripHorizontal } from 'lucide-react';
import { AppItem } from '../types/launcher';
import { AppIconGlyph } from './AppIconGlyph';

interface AppTileProps {
  app: AppItem;
  isFocused: boolean;
  isMovingSource?: boolean;
  inMoveMode?: boolean;
  compact?: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onFocus: () => void;
  tileRef?: (el: HTMLElement | null) => void;
}

const LONG_PRESS_MS = 500;

export const AppTile: React.FC<AppTileProps> = ({
  app,
  isFocused,
  isMovingSource = false,
  inMoveMode = false,
  compact = false,
  onSelect,
  onLongPress,
  onFocus,
  tileRef,
}) => {
  const [holdProgress, setHoldProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const didLongPressRef = useRef(false);

  const clearTimers = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoldProgress(0);
  };

  useEffect(() => clearTimers, []);

  const startPress = () => {
    didLongPressRef.current = false;
    startTimeRef.current = performance.now();
    onFocus();

    const step = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const ratio = Math.min(1, elapsed / LONG_PRESS_MS);
      setHoldProgress(ratio);
      if (ratio < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    timerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      clearTimers();
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const endPress = () => {
    clearTimers();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (didLongPressRef.current) {
      e.preventDefault();
      didLongPressRef.current = false;
      return;
    }
    onFocus();
    onSelect();
  };

  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = ringCircumference * (1 - holdProgress);

  return (
    <button
      type="button"
      tabIndex={-1}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={clearTimers}
      onPointerLeave={clearTimers}
      onContextMenu={(e) => {
        e.preventDefault();
        clearTimers();
        onFocus();
        onLongPress();
      }}
      onClick={handleClick}
      onFocus={onFocus}
      aria-label={`${app.name} (${app.category})${isMovingSource ? ', selected to move' : ''}`}
      className={`group relative z-10 flex min-h-[44px] w-full scroll-my-4 flex-col items-center justify-center rounded-xl transition-transform duration-150 focus-visible:outline-none active:scale-[0.96] ${
        compact ? 'p-0.5 sm:p-1' : 'px-1.5 py-2'
      }`}
    >
      {/* True 16:9 Tile: Native TV banners fill edge-to-edge; fallback icons sit over obsidian #050608 without squircle boxes */}
      <div
        ref={tileRef}
        className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border transition-colors duration-200 sm:rounded-2xl ${
          isMovingSource
            ? 'border-amber-300/80 bg-[#050608]'
            : isFocused
            ? 'border-white/10 bg-[#050608] shadow-[0_10px_24px_rgba(0,0,0,0.55)]'
            : 'border-white/12 bg-[#050608] group-hover:border-white/25'
        }`}
      >
        {app.iconDataUrl ? (
          <img
            src={app.iconDataUrl}
            alt=""
            aria-hidden="true"
            decoding="async"
            className={
              app.iconIsBanner
                ? 'h-full w-full object-cover'
                : 'h-full w-full bg-[#050608] object-contain p-1.5'
            }
          />
        ) : (
          <AppIconGlyph
            iconKey={app.iconKey}
            accentColor={app.accentColor}
            className="h-7 w-7 sm:h-10 sm:w-10"
          />
        )}

        {/* Long-press circular indicator for mobile touch feedback */}
        {holdProgress > 0.08 && (
          <svg
            className="pointer-events-none absolute inset-0 m-auto h-7 w-7 -rotate-90 sm:h-10 sm:w-10"
            viewBox="0 0 44 44"
            aria-hidden="true"
          >
            <circle
              cx="22"
              cy="22"
              r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="2.5"
            />
            <circle
              cx="22"
              cy="22"
              r={ringRadius}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
        )}

        {inMoveMode && (
          <div className="absolute top-1 right-1 text-white/75">
            {isMovingSource ? (
              <GripHorizontal size={13} className="text-amber-300" />
            ) : (
              <ArrowLeftRight size={11} className="text-white/55" />
            )}
          </div>
        )}
      </div>

      {/* App titles removed on Home dock (compact), kept in All Apps Drawer */}
      {!compact && (
        <span
          className={`mt-2.5 max-w-full truncate text-xs font-medium tracking-wide transition-colors sm:text-sm ${
            isFocused ? 'text-white' : 'text-white/75 group-hover:text-white'
          }`}
        >
          {app.name}
        </span>
      )}
    </button>
  );
};
