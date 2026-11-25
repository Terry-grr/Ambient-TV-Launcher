import React from 'react';
import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  Wind,
} from 'lucide-react';
import { WeatherState } from '../types/launcher';

interface WeatherWidgetProps {
  weather: WeatherState;
  onOpenDetail: () => void;
}

export function renderWeatherIcon(code: number, size = 20, className = '') {
  if (code === 0 || code === 1) return <Sun size={size} className={className} />;
  if (code === 2 || code === 3) return <Cloud size={size} className={className} />;
  if (code === 45 || code === 48) return <CloudFog size={size} className={className} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle size={size} className={className} />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return <CloudRain size={size} className={className} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow size={size} className={className} />;
  if (code >= 95) return <CloudLightning size={size} className={className} />;
  return <Wind size={size} className={className} />;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  weather,
  onOpenDetail,
}) => {
  if (!weather.enabled) return null;

  const primaryAlert = weather.activeAlerts[0];
  const isRedWarning =
    weather.hasWarning &&
    (primaryAlert?.colourLevel === 'Red' || primaryAlert?.severity === 'Extreme');
  const warningTextColor = isRedWarning ? 'text-red-300' : 'text-amber-300';

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      aria-label="Open weather forecast drawer"
      className="group flex min-h-[44px] flex-col items-end justify-center rounded-2xl px-3 py-1.5 text-right transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98]"
    >
      {weather.loading && !weather.current ? (
        <span className="text-xs font-medium text-white/75 sm:text-sm">Loading weather…</span>
      ) : weather.error && !weather.current ? (
        <span className="text-xs font-medium text-white/75 sm:text-sm">
          Weather unavailable · Tap to set city
        </span>
      ) : weather.current ? (
        <>
          <div className="flex items-center gap-2">
            {renderWeatherIcon(
              weather.current.weatherCode,
              21,
              weather.hasWarning ? warningTextColor : 'text-white/90'
            )}
            <span className="font-display text-xl font-normal tracking-tight text-white tabular-nums sm:text-3xl">
              {weather.current.tempC}°C
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1.5 text-xs text-white/75 sm:text-sm">
            <span>{weather.activeLocationLabel}</span>
            <span aria-hidden="true" className="text-white/45">
              ·
            </span>
            <span>{weather.current.conditionLabel}</span>
          </div>

          {weather.warningHeadline &&
            (weather.hasWarning ? (
              <div
                className={`mt-0.5 flex items-center justify-end gap-1 text-xs font-medium ${warningTextColor}`}
              >
                <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
                <span>Warning · {weather.warningHeadline}</span>
              </div>
            ) : (
              <div className="mt-0.5 text-right text-xs text-white/70">
                {weather.warningHeadline}
              </div>
            ))}
        </>
      ) : null}
    </button>
  );
};
