import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { WallpaperItem } from '../types/launcher';

interface AmbientViewProps {
  wallpaper: WallpaperItem;
  revealSignal: number;
  onExitAmbient: () => void;
  onPrevWallpaper: () => void;
  onNextWallpaper: () => void;
  onOpenQrDetail: () => void;
}

const CREDIT_HIDE_DELAY_MS = 10_000;

export const AmbientView: React.FC<AmbientViewProps> = ({
  wallpaper,
  revealSignal,
  onExitAmbient,
  onPrevWallpaper,
  onNextWallpaper,
  onOpenQrDetail,
}) => {
  const [showCreditBox, setShowCreditBox] = useState(true);
  const [tapRevealCount, setTapRevealCount] = useState(0);

  useEffect(() => {
    setShowCreditBox(true);
    const timer = window.setTimeout(() => {
      setShowCreditBox(false);
    }, CREDIT_HIDE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [wallpaper.id, revealSignal, tapRevealCount]);

  const handleReveal = () => {
    setShowCreditBox(true);
    setTapRevealCount((n) => n + 1);
  };

  return (
    <div className="relative flex h-full w-full flex-col justify-between p-4 sm:px-10 sm:py-7">
      {/* Tap anywhere on open canvas to unhide title & controls for 10s */}
      <button
        type="button"
        onClick={handleReveal}
        aria-label="Show artwork title and controls"
        className="absolute inset-0 z-0 cursor-default focus:outline-none"
      />

      {/* Top-left: Compact artwork title + creator chip (click or OK opens QR & details modal) */}
      <div
        className={`relative z-10 flex items-start justify-start transition-all duration-500 ${
          showCreditBox
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenQrDetail();
          }}
          aria-label={`Background details and QR link for ${wallpaper.title}`}
          className="group flex max-w-xs flex-col items-start rounded-xl border border-white/12 bg-[#0B0D12]/55 px-3 py-2 text-left backdrop-blur-md transition-all hover:border-white/30 hover:bg-[#0B0D12]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98] sm:max-w-sm sm:px-3.5 sm:py-2.5"
        >
          <h2 className="font-display w-full truncate text-xs font-medium text-white/95 sm:text-sm">
            {wallpaper.title}
          </h2>
          <div className="mt-0.5 flex w-full items-center gap-1.5 text-[11px] text-white/65">
            {wallpaper.creator && (
              <>
                <span className="truncate">{wallpaper.creator}</span>
                <span aria-hidden="true" className="text-white/40">
                  ·
                </span>
              </>
            )}
            <span className="inline-flex shrink-0 items-center gap-1 text-white/60 group-hover:text-white/90">
              <span>QR & details</span>
              <ExternalLink size={11} aria-hidden="true" />
            </span>
          </div>
        </button>
      </div>

      {/* Compact Left / Right Background Cycling Controls */}
      <div
        className={`pointer-events-none relative z-10 flex items-center justify-between transition-opacity duration-500 ${
          showCreditBox ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrevWallpaper();
          }}
          tabIndex={showCreditBox ? 0 : -1}
          aria-label="Previous background"
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/25 text-white/75 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-black/50 hover:text-white active:scale-95 ${
            showCreditBox ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <ChevronLeft size={17} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNextWallpaper();
          }}
          tabIndex={showCreditBox ? 0 : -1}
          aria-label="Next background"
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/25 text-white/75 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-black/50 hover:text-white active:scale-95 ${
            showCreditBox ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {/* Compact Bottom-center return chevron */}
      <div
        className={`relative z-10 flex justify-center transition-opacity duration-500 ${
          showCreditBox ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExitAmbient();
          }}
          tabIndex={showCreditBox ? 0 : -1}
          aria-label="Return to default launcher view"
          className="flex h-9 min-w-[56px] items-center justify-center rounded-full border border-white/12 bg-black/30 px-3 text-white/75 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </div>
  );
};
