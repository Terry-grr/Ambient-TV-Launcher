import {
  ManualCityOption,
  WeatherDaySlice,
  WeatherHourSlice,
  WeatherTag,
} from '../types/launcher';

export function mapWeatherToTag(code: number, windGustKmh = 0): WeatherTag {
  if (code >= 95 || windGustKmh >= 65) return 'stormy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowy';
  if (code === 45 || code === 48) return 'foggy';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 0 || code === 1) return 'clear';
  return 'cloudy';
}

export function interpretWmoCode(code: number): {
  label: string;
  isBadWeather: boolean;
  isSevereWarning: boolean;
} {
  if (code === 0) return { label: 'Clear sky', isBadWeather: false, isSevereWarning: false };
  if (code === 1) return { label: 'Mainly clear', isBadWeather: false, isSevereWarning: false };
  if (code === 2) return { label: 'Partly cloudy', isBadWeather: false, isSevereWarning: false };
  if (code === 3) return { label: 'Overcast', isBadWeather: false, isSevereWarning: false };
  if (code === 45 || code === 48) return { label: 'Fog', isBadWeather: true, isSevereWarning: false };
  if (code >= 51 && code <= 55) return { label: 'Drizzle', isBadWeather: true, isSevereWarning: false };
  if (code === 56 || code === 57) return { label: 'Freezing drizzle', isBadWeather: true, isSevereWarning: true };
  if (code === 61 || code === 63) return { label: 'Rain', isBadWeather: true, isSevereWarning: false };
  if (code === 65) return { label: 'Heavy rain', isBadWeather: true, isSevereWarning: true };
  if (code === 66 || code === 67) return { label: 'Freezing rain', isBadWeather: true, isSevereWarning: true };
  if (code === 71 || code === 73) return { label: 'Snowfall', isBadWeather: true, isSevereWarning: false };
  if (code === 75 || code === 77) return { label: 'Heavy snow', isBadWeather: true, isSevereWarning: true };
  if (code === 80 || code === 81) return { label: 'Rain showers', isBadWeather: true, isSevereWarning: false };
  if (code === 82) return { label: 'Violent rain showers', isBadWeather: true, isSevereWarning: true };
  if (code === 85) return { label: 'Snow showers', isBadWeather: true, isSevereWarning: false };
  if (code === 86) return { label: 'Heavy snow showers', isBadWeather: true, isSevereWarning: true };
  if (code === 95) return { label: 'Thunderstorm', isBadWeather: true, isSevereWarning: true };
  if (code === 96 || code === 99) return { label: 'Thunderstorm & hail', isBadWeather: true, isSevereWarning: true };
  return { label: 'Cloudy', isBadWeather: false, isSevereWarning: false };
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getBrowserCoordinates(): Promise<{ latitude: number; longitude: number }> {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation unavailable');
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: roundCoordinate(pos.coords.latitude),
          longitude: roundCoordinate(pos.coords.longitude),
        });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: false,
        timeout: 3500,
        maximumAge: 1000 * 60 * 10,
      }
    );
  });
}

export async function getIpApproxLocation(): Promise<{
  latitude: number;
  longitude: number;
  city?: string;
}> {
  // Primary keyless CORS-enabled HTTPS IP geolocation
  try {
    const data = (await fetchJsonWithTimeout('https://get.geojs.io/v1/ip/geo.json', 4500)) as {
      latitude?: string | number;
      longitude?: string | number;
      city?: string;
      region?: string;
    };
    const lat = Number(data?.latitude);
    const lon = Number(data?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const cityName = typeof data.city === 'string' && data.city.trim()
        ? data.city.trim()
        : typeof data.region === 'string' && data.region.trim()
        ? data.region.trim()
        : undefined;
      return {
        latitude: roundCoordinate(lat),
        longitude: roundCoordinate(lon),
        city: cityName,
      };
    }
  } catch {
    // Try secondary provider below
  }

  // Secondary HTTPS IP geolocation backup
  const backup = (await fetchJsonWithTimeout('https://ipwho.is/', 4500)) as {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
    region?: string;
  };
  if (backup?.success === false) {
    throw new Error('IP geolocation unavailable');
  }
  const lat = Number(backup?.latitude);
  const lon = Number(backup?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('IP geolocation coordinates invalid');
  }
  const cityName = typeof backup.city === 'string' && backup.city.trim()
    ? backup.city.trim()
    : typeof backup.region === 'string' && backup.region.trim()
    ? backup.region.trim()
    : undefined;
  return {
    latitude: roundCoordinate(lat),
    longitude: roundCoordinate(lon),
    city: cityName,
  };
}

export async function reverseLookupCityName(latitude: number, longitude: number): Promise<string> {
  const lat = roundCoordinate(latitude);
  const lon = roundCoordinate(longitude);
  try {
    const data = (await fetchJsonWithTimeout(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
        lat
      )}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`,
      4500
    )) as { city?: string; locality?: string; principalSubdivision?: string };
    return data.city || data.locality || data.principalSubdivision || 'Current Location';
  } catch {
    return 'Current Location';
  }
}

export async function resolveDeviceLocation(): Promise<{
  latitude: number;
  longitude: number;
  city: string;
  source: 'gps' | 'ip';
}> {
  try {
    const coords = await getBrowserCoordinates();
    const city = await reverseLookupCityName(coords.latitude, coords.longitude);
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      city,
      source: 'gps',
    };
  } catch {
    const ipLoc = await getIpApproxLocation();
    const city =
      ipLoc.city ?? (await reverseLookupCityName(ipLoc.latitude, ipLoc.longitude));
    return {
      latitude: ipLoc.latitude,
      longitude: ipLoc.longitude,
      city,
      source: 'ip',
    };
  }
}

export async function searchCitiesByName(query: string): Promise<ManualCityOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      trimmed
    )}&count=6&language=en&format=json`
  );
  if (!res.ok) throw new Error('City lookup failed');
  const data = await res.json();
  const results = (data.results ?? []) as Array<{
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;

  return results.map((item) => ({
    name: item.name,
    region: item.admin1,
    country: item.country || '',
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}

export interface ForecastPayload {
  current: {
    tempC: number;
    weatherCode: number;
    conditionLabel: string;
    windKmh: number;
    windGustKmh: number;
  };
  nextFourHours: WeatherHourSlice[];
  hourly24Hours: WeatherHourSlice[];
  daily7Days: WeatherDaySlice[];
  hasWarning: boolean;
  warningHeadline: string | null;
  extendedWarningHeadline: string | null;
  badWeatherChanceMax: number;
}

async function fetchOfficialAreaAlertHeadline(
  lat: number,
  lon: number
): Promise<string | null> {
  // US National Weather Service active CAP alerts (keyless CORS endpoint; returns 400 outside US)
  try {
    const data = (await fetchJsonWithTimeout(
      `https://api.weather.gov/alerts/active?point=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`,
      2500
    )) as {
      features?: Array<{
        properties?: {
          status?: string;
          messageType?: string;
          severity?: string;
          event?: string;
          headline?: string;
        };
      }>;
    };
    const features = Array.isArray(data?.features) ? data.features : [];
    const active = features.find((f) => {
      const props = f?.properties;
      if (!props) return false;
      if (props.status && props.status !== 'Actual') return false;
      if (props.messageType === 'Cancel') return false;
      return Boolean(props.event || props.headline);
    });
    if (!active?.properties) return null;
    return active.properties.event || active.properties.headline || null;
  } catch {
    return null;
  }
}

export async function fetchFourHourForecast(
  latitude: number,
  longitude: number
): Promise<ForecastPayload> {
  const lat = roundCoordinate(latitude);
  const lon = roundCoordinate(longitude);
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,uv_index,wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset` +
    `&forecast_hours=25&forecast_days=7&timezone=auto`;

  const [res, officialAlertHeadline] = await Promise.all([
    fetch(url),
    fetchOfficialAreaAlertHeadline(lat, lon),
  ]);
  if (!res.ok) {
    throw new Error('Weather feed unavailable');
  }
  const data = await res.json();

  const currentCode = Number(data.current?.weather_code ?? 0);
  const currentInfo = interpretWmoCode(currentCode);

  const times: string[] = data.hourly?.time ?? [];
  const temps: number[] = data.hourly?.temperature_2m ?? [];
  const apparentTemps: number[] = data.hourly?.apparent_temperature ?? [];
  const humidities: number[] = data.hourly?.relative_humidity_2m ?? [];
  const probs: number[] = data.hourly?.precipitation_probability ?? [];
  const precips: number[] = data.hourly?.precipitation ?? [];
  const codes: number[] = data.hourly?.weather_code ?? [];
  const cloudCovers: number[] = data.hourly?.cloud_cover ?? [];
  const uvIndices: number[] = data.hourly?.uv_index ?? [];
  const windSpeeds: number[] = data.hourly?.wind_speed_10m ?? [];
  const gusts: number[] = data.hourly?.wind_gusts_10m ?? [];
  const windDirs: number[] = data.hourly?.wind_direction_10m ?? [];

  // Take the next 24 upcoming hours (skipping index 0 when 25 slots are returned)
  const startIdx = times.length >= 25 ? 1 : 0;
  const hourlyCount = Math.min(24, Math.max(0, times.length - startIdx));
  const hourly24Hours: WeatherHourSlice[] = [];

  for (let i = 0; i < hourlyCount; i++) {
    const idx = startIdx + i;
    const iso = times[idx];
    const hourDate = new Date(iso);
    const timeLabel = Number.isNaN(hourDate.getTime())
      ? `+${i + 1}h`
      : hourDate.toLocaleTimeString([], { hour: 'numeric', hour12: true }).toLowerCase();

    const wmo = Number(codes[idx] ?? 0);
    const wmoInfo = interpretWmoCode(wmo);
    const prob = Math.round(Number(probs[idx] ?? 0));
    const gust = Math.round(Number(gusts[idx] ?? 0));
    const isHighWind = gust >= 45;
    const isSevere = wmoInfo.isSevereWarning || gust >= 70;
    const isBad = wmoInfo.isBadWeather || prob >= 25 || isHighWind;

    hourly24Hours.push({
      timeIso: iso,
      timeLabel,
      tempC: Math.round(Number(temps[idx] ?? 0)),
      apparentTempC: Math.round(Number(apparentTemps[idx] ?? temps[idx] ?? 0)),
      precipProb: prob,
      precipMm: Math.round(Number(precips[idx] ?? 0) * 10) / 10,
      humidityPct: Math.round(Number(humidities[idx] ?? 0)),
      cloudCoverPct: Math.round(Number(cloudCovers[idx] ?? 0)),
      uvIndex: Math.round(Number(uvIndices[idx] ?? 0) * 10) / 10,
      weatherCode: wmo,
      conditionLabel: wmoInfo.label,
      windSpeedKmh: Math.round(Number(windSpeeds[idx] ?? 0)),
      windGustKmh: gust,
      windDirectionDeg: Math.round(Number(windDirs[idx] ?? 0)),
      isBadWeather: isBad,
      isSevereWarning: isSevere,
    });
  }

  // Next 4 hours summary: only severe storm/gale/official alerts mark hasWarning = true
  const nextFourHours = hourly24Hours.slice(0, 4);
  let severeTrigger: string | null = officialAlertHeadline;
  let likelyPrecipNote: string | null = null;
  let badWeatherChanceMax = 0;

  for (const slot of nextFourHours) {
    if (slot.precipProb > badWeatherChanceMax) {
      badWeatherChanceMax = slot.precipProb;
    }
    const wmoInfo = interpretWmoCode(slot.weatherCode);
    if (!severeTrigger) {
      if (wmoInfo.isSevereWarning) {
        severeTrigger = `${wmoInfo.label} expected around ${slot.timeLabel}`;
      } else if (slot.windGustKmh >= 70) {
        severeTrigger = `Strong wind gusts (${slot.windGustKmh} km/h) at ${slot.timeLabel}`;
      }
    }
    if (!likelyPrecipNote && slot.precipProb >= 65) {
      likelyPrecipNote = `${slot.precipProb}% chance of ${slot.conditionLabel.toLowerCase()} at ${slot.timeLabel}`;
    }
  }

  const anyBadWeather = nextFourHours.some((h) => h.isBadWeather);
  const firstBad = nextFourHours.find((h) => h.isBadWeather);
  const plainForecastNote =
    likelyPrecipNote ??
    (anyBadWeather && firstBad
      ? badWeatherChanceMax >= 25
        ? `${badWeatherChanceMax}% chance of ${firstBad.conditionLabel.toLowerCase()} in next 4h`
        : `${firstBad.conditionLabel} possible in next 4h`
      : null);

  const warningHeadline = severeTrigger ?? plainForecastNote;

  // Extended check for the 24h/7d drawer when next 4h are calm
  let hasSevereIn24h = Boolean(severeTrigger);
  let extendedWarningHeadline: string | null = warningHeadline;
  if (!extendedWarningHeadline) {
    const severeHour = hourly24Hours.find((h) => h.isSevereWarning);
    if (severeHour) {
      hasSevereIn24h = true;
      extendedWarningHeadline = `${severeHour.conditionLabel} expected around ${severeHour.timeLabel}`;
    } else {
      const likelyRainHour = hourly24Hours.find((h) => h.precipProb >= 65);
      if (likelyRainHour) {
        extendedWarningHeadline = `${likelyRainHour.precipProb}% chance of ${likelyRainHour.conditionLabel.toLowerCase()} at ${likelyRainHour.timeLabel}`;
      }
    }
  }

  // 7-Day forecast parsing
  const dayTimes: string[] = data.daily?.time ?? [];
  const dayCodes: number[] = data.daily?.weather_code ?? [];
  const dayMaxTemps: number[] = data.daily?.temperature_2m_max ?? [];
  const dayMinTemps: number[] = data.daily?.temperature_2m_min ?? [];
  const dayApparentMax: number[] = data.daily?.apparent_temperature_max ?? [];
  const dayApparentMin: number[] = data.daily?.apparent_temperature_min ?? [];
  const dayProbs: number[] = data.daily?.precipitation_probability_max ?? [];
  const dayPrecipSums: number[] = data.daily?.precipitation_sum ?? [];
  const dayWindMax: number[] = data.daily?.wind_speed_10m_max ?? [];
  const dayGusts: number[] = data.daily?.wind_gusts_10m_max ?? [];
  const dayWindDirs: number[] = data.daily?.wind_direction_10m_dominant ?? [];
  const dayUvMax: number[] = data.daily?.uv_index_max ?? [];
  const daySunrise: string[] = data.daily?.sunrise ?? [];
  const daySunset: string[] = data.daily?.sunset ?? [];

  const daily7Days: WeatherDaySlice[] = dayTimes.slice(0, 7).map((dateIso, i) => {
    const wmo = Number(dayCodes[i] ?? 0);
    const wmoInfo = interpretWmoCode(wmo);
    const precipProbMax = Math.round(Number(dayProbs[i] ?? 0));
    const windGustMaxKmh = Math.round(Number(dayGusts[i] ?? 0));
    const isSevere = wmoInfo.isSevereWarning || windGustMaxKmh >= 75;
    const isBad = wmoInfo.isBadWeather || precipProbMax >= 35 || windGustMaxKmh >= 50;

    let dayLabel = `Day ${i + 1}`;
    if (i === 0) dayLabel = 'Today';
    else if (i === 1) dayLabel = 'Tomorrow';
    else {
      const parsed = new Date(`${dateIso}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        dayLabel = parsed.toLocaleDateString([], { weekday: 'short' });
      }
    }

    return {
      dateIso,
      dayLabel,
      weatherCode: wmo,
      conditionLabel: wmoInfo.label,
      tempMaxC: Math.round(Number(dayMaxTemps[i] ?? 0)),
      tempMinC: Math.round(Number(dayMinTemps[i] ?? 0)),
      apparentTempMaxC: Math.round(Number(dayApparentMax[i] ?? dayMaxTemps[i] ?? 0)),
      apparentTempMinC: Math.round(Number(dayApparentMin[i] ?? dayMinTemps[i] ?? 0)),
      precipProbMax,
      precipSumMm: Math.round(Number(dayPrecipSums[i] ?? 0) * 10) / 10,
      windSpeedMaxKmh: Math.round(Number(dayWindMax[i] ?? 0)),
      windGustMaxKmh,
      windDirectionDeg: Math.round(Number(dayWindDirs[i] ?? 0)),
      uvIndexMax: Math.round(Number(dayUvMax[i] ?? 0) * 10) / 10,
      sunriseIso: daySunrise[i],
      sunsetIso: daySunset[i],
      isBadWeather: isBad,
      isSevereWarning: isSevere,
    };
  });

  if (!extendedWarningHeadline) {
    const severeDay = daily7Days.find((d) => d.isSevereWarning);
    if (severeDay) {
      hasSevereIn24h = true;
      extendedWarningHeadline = `${severeDay.dayLabel}: ${severeDay.conditionLabel} advisory`;
    }
  }

  return {
    current: {
      tempC: Math.round(Number(data.current?.temperature_2m ?? 0)),
      weatherCode: currentCode,
      conditionLabel: currentInfo.label,
      windKmh: Math.round(Number(data.current?.wind_speed_10m ?? 0)),
      windGustKmh: Math.round(Number(data.current?.wind_gusts_10m ?? 0)),
    },
    nextFourHours,
    hourly24Hours,
    daily7Days,
    hasWarning: Boolean(officialAlertHeadline || hasSevereIn24h),
    warningHeadline,
    extendedWarningHeadline,
    badWeatherChanceMax,
  };
}
