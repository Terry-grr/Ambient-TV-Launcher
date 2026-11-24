import React, { useEffect, useRef, useState } from 'react';
import { WallpaperItem } from '../types/launcher';

interface BackdropCanvasProps {
  wallpaper: WallpaperItem;
  scrimOpacity: number;
  isAmbient: boolean;
  fastTransition?: boolean;
  onImageError: (wallpaperId: string) => void;
}

export const BackdropCanvas: React.FC<BackdropCanvasProps> = ({
  wallpaper,
  scrimOpacity,
  isAmbient,
  fastTransition = false,
  onImageError,
}) => {
  const [baseWallpaper, setBaseWallpaper] = useState<WallpaperItem>(wallpaper);
  const [incomingWallpaper, setIncomingWallpaper] = useState<WallpaperItem | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);

  const baseRef = useRef<WallpaperItem>(wallpaper);
  const incomingRef = useRef<WallpaperItem | null>(null);
  const incomingVisibleRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const onImageErrorRef = useRef(onImageError);
  onImageErrorRef.current = onImageError;

  useEffect(() => {
    baseRef.current = baseWallpaper;
  }, [baseWallpaper]);

  useEffect(() => {
    incomingRef.current = incomingWallpaper;
    incomingVisibleRef.current = incomingVisible;
  }, [incomingWallpaper, incomingVisible]);

  useEffect(() => {
    if (wallpaper.id === baseRef.current.id && !incomingRef.current) {
      return;
    }

    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    // If user cycles rapidly mid-crossfade, keep the visible incoming artwork as the new base
    if (incomingRef.current && incomingVisibleRef.current) {
      setBaseWallpaper(incomingRef.current);
      baseRef.current = incomingRef.current;
    }

    if (wallpaper.id === baseRef.current.id) {
      setIncomingWallpaper(null);
      setIncomingVisible(false);
      return;
    }

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;

    const loader = new Image();
    loader.referrerPolicy = 'no-referrer';

    const revealIncoming = () => {
      if (cancelled) return;
      setIncomingWallpaper(wallpaper);
      setIncomingVisible(false);

      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (cancelled) return;
          setIncomingVisible(true);
          settleTimerRef.current = window.setTimeout(() => {
            if (cancelled) return;
            setBaseWallpaper(wallpaper);
            setIncomingWallpaper(null);
            setIncomingVisible(false);
          }, 1020);
        });
      });
    };

    loader.onload = () => {
      if (cancelled) return;
      if (typeof loader.decode === 'function') {
        loader.decode().then(revealIncoming, revealIncoming);
      } else {
        revealIncoming();
      }
    };

    loader.onerror = () => {
      if (cancelled) return;
      onImageErrorRef.current(wallpaper.id);
    };

    loader.src = wallpaper.imageUrl;

    return () => {
      cancelled = true;
      loader.onload = null;
      loader.onerror = null;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [wallpaper]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#07080A]">
      {/* Outgoing / Base Wallpaper Layer (remains at 100% underneath during crossfade) */}
      <img
        key={`base-${baseWallpaper.id}`}
        src={baseWallpaper.imageUrl}
        alt={baseWallpaper.title}
        referrerPolicy="no-referrer"
        onError={() => onImageError(baseWallpaper.id)}
        style={
          baseWallpaper.cropScale
            ? { transform: `scale(${baseWallpaper.cropScale})` }
            : undefined
        }
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Overlapping Incoming Wallpaper Layer (pre-decoded, smoothly fades 0 -> 1 over base) */}
      {incomingWallpaper && (
        <img
          key={`in-${incomingWallpaper.id}`}
          src={incomingWallpaper.imageUrl}
          alt={incomingWallpaper.title}
          referrerPolicy="no-referrer"
          style={{
            opacity: incomingVisible ? 1 : 0,
            transform: incomingWallpaper.cropScale
              ? `scale(${incomingWallpaper.cropScale})`
              : undefined,
            transition: fastTransition
              ? 'opacity 420ms ease-out'
              : 'opacity 950ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className="absolute inset-0 h-full w-full object-cover will-change-[opacity]"
        />
      )}

      {/* Measured Scrim for WCAG AA Contrast on Clock, Weather & Dock */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: isAmbient ? 0.22 : scrimOpacity,
          background:
            'linear-gradient(180deg, rgba(6,8,12,0.72) 0%, rgba(6,8,12,0.12) 34%, rgba(6,8,12,0.18) 60%, rgba(6,8,12,0.88) 100%)',
        }}
      />
    </div>
  );
};
