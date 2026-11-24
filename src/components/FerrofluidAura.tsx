import React, { useEffect, useId, useRef, useState } from 'react';
import { FerrofluidIntensity } from '../types/launcher';

interface RectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface ContainerSize {
  width: number;
  height: number;
}

interface FerrofluidAuraProps {
  containerRef: React.RefObject<HTMLElement | null>;
  activeKey: string | null;
  getElementByKey: (key: string) => HTMLElement | null;
  intensity: FerrofluidIntensity;
  borderRadius?: number;
  variant?: 'tile' | 'row';
  pulseActive?: boolean;
  liteMode?: boolean;
}

interface TransitionState {
  from: RectBox;
  to: RectBox;
  progress: number; // 0 -> 1
  durationMs: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes exact point at arc length `s` along a rounded rectangle
 * (walking clockwise from top-left straight segment start).
 */
function sampleRoundedRectAt(
  x: number,
  y: number,
  w: number,
  h: number,
  rInput: number,
  sInput: number
): { pt: Point; perimeter: number } {
  const r = Math.max(0, Math.min(rInput, w / 2 - 0.5, h / 2 - 0.5));
  const topLen = Math.max(0, w - 2 * r);
  const rightLen = Math.max(0, h - 2 * r);
  const arcLen = (Math.PI / 2) * r;
  const perimeter = 2 * topLen + 2 * rightLen + 4 * arcLen;

  let s = ((sInput % perimeter) + perimeter) % perimeter;

  const segs = [
    { kind: 'line', len: topLen, x0: x + r, y0: y, dx: 1, dy: 0 },
    { kind: 'arc', len: arcLen, cx: x + w - r, cy: y + r, a0: -Math.PI / 2 },
    { kind: 'line', len: rightLen, x0: x + w, y0: y + r, dx: 0, dy: 1 },
    { kind: 'arc', len: arcLen, cx: x + w - r, cy: y + h - r, a0: 0 },
    { kind: 'line', len: topLen, x0: x + w - r, y0: y + h, dx: -1, dy: 0 },
    { kind: 'arc', len: arcLen, cx: x + r, cy: y + h - r, a0: Math.PI / 2 },
    { kind: 'line', len: rightLen, x0: x, y0: y + h - r, dx: 0, dy: -1 },
    { kind: 'arc', len: arcLen, cx: x + r, cy: y + r, a0: Math.PI },
  ] as const;

  for (const seg of segs) {
    if (s <= seg.len + 1e-6) {
      if (seg.kind === 'line') {
        const d = Math.min(s, seg.len);
        return {
          pt: { x: seg.x0 + seg.dx * d, y: seg.y0 + seg.dy * d },
          perimeter,
        };
      }
      const theta = seg.a0 + (seg.len > 0 ? (s / seg.len) * (Math.PI / 2) : 0);
      return {
        pt: {
          x: seg.cx + Math.cos(theta) * r,
          y: seg.cy + Math.sin(theta) * r,
        },
        perimeter,
      };
    }
    s -= seg.len;
  }

  return {
    pt: { x: x + r, y },
    perimeter,
  };
}

/**
 * Builds two symmetric half-perimeter SVG paths originating from perimeter arc length `sAnchor`:
 * one sweeping clockwise by L/2, one sweeping counter-clockwise by L/2.
 * Using `pathLength={1}` with `strokeDasharray="1 2"` and `strokeDashoffset={1 - p}` expands
 * or retracts the entire border cleanly from/into `sAnchor`.
 */
function buildSplitBorderPaths(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  sAnchor: number,
  steps = 36
): { cwPath: string; ccwPath: string } {
  const { perimeter } = sampleRoundedRectAt(x, y, w, h, r, 0);
  const half = perimeter / 2;

  const cwPts: string[] = [];
  const ccwPts: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const dist = (i / steps) * half;
    const pCw = sampleRoundedRectAt(x, y, w, h, r, sAnchor + dist).pt;
    const pCcw = sampleRoundedRectAt(x, y, w, h, r, sAnchor - dist).pt;
    cwPts.push(`${i === 0 ? 'M' : 'L'} ${pCw.x.toFixed(2)} ${pCw.y.toFixed(2)}`);
    ccwPts.push(`${i === 0 ? 'M' : 'L'} ${pCcw.x.toFixed(2)} ${pCcw.y.toFixed(2)}`);
  }

  return {
    cwPath: cwPts.join(' '),
    ccwPath: ccwPts.join(' '),
  };
}

function getEdgeCenterS(
  w: number,
  h: number,
  rInput: number,
  side: 'top' | 'right' | 'bottom' | 'left'
): number {
  const r = Math.max(0, Math.min(rInput, w / 2 - 0.5, h / 2 - 0.5));
  const topLen = Math.max(1, w - 2 * r);
  const rightLen = Math.max(1, h - 2 * r);
  const arcLen = (Math.PI / 2) * r;

  if (side === 'top') return 0.5 * topLen;
  if (side === 'right') return topLen + arcLen + 0.5 * rightLen;
  if (side === 'bottom') return topLen + arcLen + rightLen + arcLen + 0.5 * topLen;
  return 2 * topLen + 3 * arcLen + rightLen + 0.5 * rightLen;
}

export const FerrofluidAura: React.FC<FerrofluidAuraProps> = ({
  containerRef,
  activeKey,
  getElementByKey,
  intensity,
  borderRadius = 16,
  variant = 'tile',
  pulseActive = false,
  liteMode = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const [rect, setRect] = useState<RectBox | null>(null);
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
  });
  const [transition, setTransition] = useState<TransitionState | null>(null);

  const prevRectRef = useRef<RectBox | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startUnwrapWrapAnimation = (from: RectBox, to: RectBox) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setTransition(null);
        return;
      }

      const durationMs = liteMode ? 200 : variant === 'row' ? 230 : 300;
      const startTime = performance.now();

      const step = (now: number) => {
        const raw = clamp01((now - startTime) / durationMs);
        setTransition({ from, to, progress: raw, durationMs });
        if (raw < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          setTransition(null);
          rafRef.current = null;
        }
      };

      setTransition({ from, to, progress: 0, durationMs });
      rafRef.current = requestAnimationFrame(step);
    };

    const measure = () => {
      const container = containerRef.current;
      if (!container || !activeKey) {
        prevRectRef.current = null;
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const el = getElementByKey(activeKey);
      if (!el) {
        prevRectRef.current = null;
        setRect((prev) => (prev === null ? prev : null));
        return;
      }

      const cBox = container.getBoundingClientRect();
      const eBox = el.getBoundingClientRect();

      const nextW = Math.max(1, container.scrollWidth || cBox.width);
      const nextH = Math.max(1, container.scrollHeight || cBox.height);
      setContainerSize((prev) =>
        Math.abs(prev.width - nextW) < 0.5 && Math.abs(prev.height - nextH) < 0.5
          ? prev
          : { width: nextW, height: nextH }
      );

      const next: RectBox = {
        x: eBox.left - cBox.left + container.scrollLeft,
        y: eBox.top - cBox.top + container.scrollTop,
        width: eBox.width,
        height: eBox.height,
      };

      const prev = prevRectRef.current;
      if (
        prev &&
        (Math.abs(prev.x - next.x) > 3 || Math.abs(prev.y - next.y) > 3)
      ) {
        startUnwrapWrapAnimation(prev, next);
      }

      prevRectRef.current = next;
      setRect((current) =>
        current &&
        Math.abs(current.x - next.x) < 0.5 &&
        Math.abs(current.y - next.y) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.height - next.height) < 0.5
          ? current
          : next
      );
    };

    measure();
    const measureRaf = requestAnimationFrame(measure);
    const container = containerRef.current;

    const ro = new ResizeObserver(() => measure());
    if (container) ro.observe(container);
    window.addEventListener('resize', measure);
    container?.addEventListener('scroll', measure, { passive: true });

    return () => {
      cancelAnimationFrame(measureRaf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      container?.removeEventListener('scroll', measure);
    };
  }, [activeKey, containerRef, getElementByKey, variant, liteMode]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!rect || containerSize.width <= 0 || containerSize.height <= 0) {
    return null;
  }

  // Hollow border-only perimeter offset outside the tile/row so interior never lightens
  const pad = variant === 'row' ? 2 : 3.5;
  const targetX = rect.x - pad;
  const targetY = rect.y - pad;
  const targetW = rect.width + pad * 2;
  const targetH = rect.height + pad * 2;
  const targetR = borderRadius + pad;
  const targetCx = targetX + targetW / 2;
  const targetCy = targetY + targetH / 2;

  const glowBlur =
    intensity === 'subtle' ? 4 : intensity === 'vivid' ? 9 : 6.5;
  const glowOpacity =
    intensity === 'subtle' ? 0.36 : intensity === 'vivid' ? 0.72 : 0.54;
  const ringStrokeWidth =
    intensity === 'subtle' ? 1.5 : intensity === 'vivid' ? 2.25 : 1.85;

  const crispColor = pulseActive ? '#FCD34D' : '#F4F8FF';
  const glowColor = pulseActive ? '#F59E0B' : '#CFE6FF';

  const t = transition ? transition.progress : 1;
  const isAnimating = transition !== null && t < 1;
  const filterMargin = 54;

  // Steady settled state (no active unwrap/wrap transition)
  if (!isAnimating || !transition) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-20 overflow-visible"
        style={{
          width: `${containerSize.width}px`,
          height: `${containerSize.height}px`,
        }}
      >
        <svg
          width={containerSize.width}
          height={containerSize.height}
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
          className="overflow-visible"
        >
          {!liteMode && (
            <defs>
              <filter
                id={`ferro-glow-${uid}`}
                filterUnits="userSpaceOnUse"
                x={-filterMargin}
                y={-filterMargin}
                width={containerSize.width + filterMargin * 2}
                height={containerSize.height + filterMargin * 2}
              >
                <feGaussianBlur stdDeviation={glowBlur} />
              </filter>
            </defs>
          )}

          <rect
            x={targetX}
            y={targetY}
            width={targetW}
            height={targetH}
            rx={targetR}
            ry={targetR}
            fill="none"
            stroke={glowColor}
            strokeWidth={ringStrokeWidth + 3.5}
            strokeOpacity={liteMode ? glowOpacity * 0.34 : glowOpacity}
            filter={liteMode ? undefined : `url(#ferro-glow-${uid})`}
          />

          <rect
            x={targetX}
            y={targetY}
            width={targetW}
            height={targetH}
            rx={targetR}
            ry={targetR}
            fill="none"
            stroke={crispColor}
            strokeWidth={ringStrokeWidth}
            strokeOpacity={1}
          />
        </svg>
      </div>
    );
  }

  // Unwrap from previous border & wrap around next border (no jumping droplet)
  const fromX = transition.from.x - pad;
  const fromY = transition.from.y - pad;
  const fromW = transition.from.width + pad * 2;
  const fromH = transition.from.height + pad * 2;
  const fromCx = fromX + fromW / 2;
  const fromCy = fromY + fromH / 2;

  const dx = targetCx - fromCx;
  const dy = targetCy - fromCy;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  const sourceSide: 'top' | 'right' | 'bottom' | 'left' = horizontal
    ? dx >= 0
      ? 'right'
      : 'left'
    : dy >= 0
    ? 'bottom'
    : 'top';

  const targetSide: 'top' | 'right' | 'bottom' | 'left' = horizontal
    ? dx >= 0
      ? 'left'
      : 'right'
    : dy >= 0
    ? 'top'
    : 'bottom';

  const sSource = getEdgeCenterS(fromW, fromH, targetR, sourceSide);
  const sTarget = getEdgeCenterS(targetW, targetH, targetR, targetSide);

  const retractProgress = 1 - easeInOutCubic(clamp01(t / 0.52));
  const expandProgress = easeOutCubic(clamp01((t - 0.38) / 0.62));

  const pathSteps = liteMode ? 22 : 36;
  const sourceSplits = buildSplitBorderPaths(
    fromX,
    fromY,
    fromW,
    fromH,
    targetR,
    sSource,
    pathSteps
  );
  const targetSplits = buildSplitBorderPaths(
    targetX,
    targetY,
    targetW,
    targetH,
    targetR,
    sTarget,
    pathSteps
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-20 overflow-visible"
      style={{
        width: `${containerSize.width}px`,
        height: `${containerSize.height}px`,
      }}
    >
      <svg
        width={containerSize.width}
        height={containerSize.height}
        viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
        className="overflow-visible"
      >
        {!liteMode && (
          <defs>
            <filter
              id={`ferro-glow-${uid}`}
              filterUnits="userSpaceOnUse"
              x={-filterMargin}
              y={-filterMargin}
              width={containerSize.width + filterMargin * 2}
              height={containerSize.height + filterMargin * 2}
            >
              <feGaussianBlur stdDeviation={glowBlur} />
            </filter>
          </defs>
        )}

        {/* Outward perimeter bloom on unwrapping source & wrapping target */}
        <g filter={liteMode ? undefined : `url(#ferro-glow-${uid})`}>
          {retractProgress > 0.02 && (
            <>
              <path
                d={sourceSplits.cwPath}
                pathLength={1}
                fill="none"
                stroke={glowColor}
                strokeWidth={ringStrokeWidth + 3}
                strokeLinecap="round"
                strokeDasharray="1 2"
                strokeDashoffset={1 - retractProgress}
                strokeOpacity={
                  (liteMode ? glowOpacity * 0.34 : glowOpacity) * retractProgress
                }
              />
              <path
                d={sourceSplits.ccwPath}
                pathLength={1}
                fill="none"
                stroke={glowColor}
                strokeWidth={ringStrokeWidth + 3}
                strokeLinecap="round"
                strokeDasharray="1 2"
                strokeDashoffset={1 - retractProgress}
                strokeOpacity={
                  (liteMode ? glowOpacity * 0.34 : glowOpacity) * retractProgress
                }
              />
            </>
          )}
          {expandProgress > 0.02 && (
            <>
              <path
                d={targetSplits.cwPath}
                pathLength={1}
                fill="none"
                stroke={glowColor}
                strokeWidth={ringStrokeWidth + 3.5}
                strokeLinecap="round"
                strokeDasharray="1 2"
                strokeDashoffset={1 - expandProgress}
                strokeOpacity={
                  (liteMode ? glowOpacity * 0.34 : glowOpacity) *
                  (0.4 + 0.6 * expandProgress)
                }
              />
              <path
                d={targetSplits.ccwPath}
                pathLength={1}
                fill="none"
                stroke={glowColor}
                strokeWidth={ringStrokeWidth + 3.5}
                strokeLinecap="round"
                strokeDasharray="1 2"
                strokeDashoffset={1 - expandProgress}
                strokeOpacity={
                  (liteMode ? glowOpacity * 0.34 : glowOpacity) *
                  (0.4 + 0.6 * expandProgress)
                }
              />
            </>
          )}
        </g>

        {/* Crisp luminous hairline unwrapping from previous and wrapping onto next */}
        {retractProgress > 0.03 && (
          <>
            <path
              d={sourceSplits.cwPath}
              pathLength={1}
              fill="none"
              stroke={crispColor}
              strokeWidth={ringStrokeWidth}
              strokeLinecap="round"
              strokeDasharray="1 2"
              strokeDashoffset={1 - retractProgress}
              strokeOpacity={retractProgress}
            />
            <path
              d={sourceSplits.ccwPath}
              pathLength={1}
              fill="none"
              stroke={crispColor}
              strokeWidth={ringStrokeWidth}
              strokeLinecap="round"
              strokeDasharray="1 2"
              strokeDashoffset={1 - retractProgress}
              strokeOpacity={retractProgress}
            />
          </>
        )}

        {expandProgress > 0.02 && (
          <>
            <path
              d={targetSplits.cwPath}
              pathLength={1}
              fill="none"
              stroke={crispColor}
              strokeWidth={ringStrokeWidth}
              strokeLinecap="round"
              strokeDasharray="1 2"
              strokeDashoffset={1 - expandProgress}
              strokeOpacity={0.65 + 0.35 * expandProgress}
            />
            <path
              d={targetSplits.ccwPath}
              pathLength={1}
              fill="none"
              stroke={crispColor}
              strokeWidth={ringStrokeWidth}
              strokeLinecap="round"
              strokeDasharray="1 2"
              strokeDashoffset={1 - expandProgress}
              strokeOpacity={0.65 + 0.35 * expandProgress}
            />
          </>
        )}
      </svg>
    </div>
  );
};
