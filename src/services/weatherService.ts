import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  ManualCityOption,
  WeatherAlertItem,
  WeatherDaySlice,
  WeatherHourSlice,
  WeatherTag,
} from '../types/launcher';
import { normalizeSafeHttpsFeedUrl } from '../utils/urlValidation';

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
      const cityName =
        typeof data.city === 'string' && data.city.trim()
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
  const cityName =
    typeof backup.city === 'string' && backup.city.trim()
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

export interface ForecastOptions {
  regionHint?: string;
  countryHint?: string;
  customCapFeedUrl?: string;
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
  activeAlerts: WeatherAlertItem[];
  hasWarning: boolean;
  warningHeadline: string | null;
  extendedWarningHeadline: string | null;
  badWeatherChanceMax: number;
}

interface ParsedCapCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

interface ParsedCapArea {
  areaDesc: string;
  polygons: Array<Array<[number, number]>>;
  circles: ParsedCapCircle[];
}

interface ParsedCapAlertRecord {
  id: string;
  event: string;
  headline: string;
  severity: WeatherAlertItem['severity'];
  colourLevel?: WeatherAlertItem['colourLevel'];
  description?: string;
  instruction?: string;
  onsetIso?: string;
  expiresIso?: string;
  nextUpdateIso?: string;
  webUrl?: string;
  areas: ParsedCapArea[];
}

const CAP_CACHE_TTL_MS = 120_000;
const capAlertCache = new Map<
  string,
  { fetchedAt: number; versionKey: string; record: ParsedCapAlertRecord | null }
>();

const TIMEZONE_TO_METEOALARM_SLUG: Record<string, string> = {
  'Europe/Andorra': 'andorra',
  'Europe/Vienna': 'austria',
  'Europe/Brussels': 'belgium',
  'Europe/Sarajevo': 'bosnia-herzegovina',
  'Europe/Sofia': 'bulgaria',
  'Europe/Zagreb': 'croatia',
  'Asia/Nicosia': 'cyprus',
  'Europe/Prague': 'czechia',
  'Europe/Copenhagen': 'denmark',
  'Europe/Tallinn': 'estonia',
  'Europe/Helsinki': 'finland',
  'Europe/Paris': 'france',
  'Europe/Berlin': 'germany',
  'Europe/Athens': 'greece',
  'Europe/Budapest': 'hungary',
  'Atlantic/Reykjavik': 'iceland',
  'Europe/Dublin': 'ireland',
  'Europe/Rome': 'italy',
  'Europe/Riga': 'latvia',
  'Europe/Vilnius': 'lithuania',
  'Europe/Luxembourg': 'luxembourg',
  'Europe/Malta': 'malta',
  'Europe/Chisinau': 'moldova',
  'Europe/Podgorica': 'montenegro',
  'Europe/Amsterdam': 'netherlands',
  'Europe/Skopje': 'republic-of-north-macedonia',
  'Europe/Oslo': 'norway',
  'Europe/Warsaw': 'poland',
  'Europe/Lisbon': 'portugal',
  'Atlantic/Madeira': 'portugal',
  'Atlantic/Azores': 'portugal',
  'Europe/Bucharest': 'romania',
  'Europe/Belgrade': 'serbia',
  'Europe/Bratislava': 'slovakia',
  'Europe/Ljubljana': 'slovenia',
  'Europe/Madrid': 'spain',
  'Atlantic/Canary': 'spain',
  'Europe/Stockholm': 'sweden',
  'Europe/Zurich': 'switzerland',
  'Europe/London': 'united-kingdom',
};

const COUNTRY_NAME_TO_METEOALARM_SLUG: Record<string, string> = {
  andorra: 'andorra',
  austria: 'austria',
  belgium: 'belgium',
  'bosnia and herzegovina': 'bosnia-herzegovina',
  'bosnia-herzegovina': 'bosnia-herzegovina',
  bulgaria: 'bulgaria',
  croatia: 'croatia',
  cyprus: 'cyprus',
  czechia: 'czechia',
  'czech republic': 'czechia',
  denmark: 'denmark',
  estonia: 'estonia',
  finland: 'finland',
  france: 'france',
  germany: 'germany',
  greece: 'greece',
  hungary: 'hungary',
  iceland: 'iceland',
  ireland: 'ireland',
  italy: 'italy',
  latvia: 'latvia',
  lithuania: 'lithuania',
  luxembourg: 'luxembourg',
  malta: 'malta',
  moldova: 'moldova',
  montenegro: 'montenegro',
  netherlands: 'netherlands',
  'the netherlands': 'netherlands',
  'north macedonia': 'republic-of-north-macedonia',
  norway: 'norway',
  poland: 'poland',
  portugal: 'portugal',
  romania: 'romania',
  serbia: 'serbia',
  slovakia: 'slovakia',
  slovenia: 'slovenia',
  spain: 'spain',
  sweden: 'sweden',
  switzerland: 'switzerland',
  'united kingdom': 'united-kingdom',
  uk: 'united-kingdom',
  'great britain': 'united-kingdom',
};

function isInNewZealandBounds(lat: number, lon: number): boolean {
  if (lat < -48.5 || lat > -33.5) return false;
  return (lon >= 165.0 && lon <= 180.0) || (lon >= -178.0 && lon <= -175.0);
}

function isInUsBounds(lat: number, lon: number, countryHint?: string): boolean {
  const c = (countryHint || '').trim().toLowerCase();
  if (c === 'canada') return false;
  if (c === 'united states' || c === 'usa' || c === 'us') return true;
  if (lat >= 17.5 && lat <= 49.0 && lon >= -125.0 && lon <= -66.0) return true;
  if (lat >= 54.0 && lat <= 71.5 && lon >= -170.0 && lon <= -141.0) return true;
  if (lat >= 18.5 && lat <= 22.5 && lon >= -161.0 && lon <= -154.5) return true;
  return false;
}

function isInAustraliaBounds(lat: number, lon: number, countryHint?: string, tz?: string): boolean {
  const c = (countryHint || '').trim().toLowerCase();
  if (c === 'australia') return true;
  if (tz && tz.startsWith('Australia/')) return true;
  return lat >= -44.0 && lat <= -10.0 && lon >= 112.0 && lon <= 154.5;
}

function isInCanadaBounds(lat: number, lon: number, countryHint?: string, tz?: string): boolean {
  const c = (countryHint || '').trim().toLowerCase();
  if (c === 'canada') return true;
  if (
    tz &&
    /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Whitehorse|Yellowknife|Iqaluit|Moncton|Thunder_Bay)/.test(
      tz
    )
  ) {
    return true;
  }
  return lat > 49.0 && lat <= 83.5 && lon >= -141.0 && lon <= -52.0;
}

function resolveMeteoalarmSlug(tz?: string, countryHint?: string): string | null {
  const normalizedCountry = (countryHint || '').trim().toLowerCase();
  if (normalizedCountry && COUNTRY_NAME_TO_METEOALARM_SLUG[normalizedCountry]) {
    return COUNTRY_NAME_TO_METEOALARM_SLUG[normalizedCountry];
  }
  if (tz && TIMEZONE_TO_METEOALARM_SLUG[tz]) {
    return TIMEZONE_TO_METEOALARM_SLUG[tz];
  }
  return null;
}

async function fetchXmlText(
  upstreamUrl: string,
  proxyUrl?: string,
  timeoutMs = 7000
): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: upstreamUrl,
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      headers: {
        Accept:
          'application/xml, application/rss+xml, application/atom+xml, application/cap+xml, text/xml',
      },
    });
    if (res.status < 200 || res.status >= 300 || typeof res.data !== 'string') {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.data;
  }

  const target =
    proxyUrl || `/api/cap-proxy?url=${encodeURIComponent(upstreamUrl)}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      headers: {
        Accept:
          'application/xml, application/rss+xml, application/atom+xml, application/cap+xml, text/xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    window.clearTimeout(timer);
  }
}

function getDirectChildrenByLocalName(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (child.localName === localName) {
      out.push(child);
    }
  }
  return out;
}

function getFirstChildText(parent: Element, localName: string): string {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (child.localName === localName) {
      return (child.textContent || '').trim();
    }
  }
  return '';
}

function normalizeSeverity(raw: string): WeatherAlertItem['severity'] {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'extreme') return 'Extreme';
  if (normalized === 'severe') return 'Severe';
  if (normalized === 'moderate') return 'Moderate';
  if (normalized === 'minor') return 'Minor';
  return 'Unknown';
}

function normalizeColourLevel(
  rawColour: string,
  awarenessLevel: string,
  headlineOrEvent: string,
  severity: WeatherAlertItem['severity']
): WeatherAlertItem['colourLevel'] {
  const colour = `${rawColour} ${awarenessLevel}`.trim().toLowerCase();
  if (colour.includes('red') || colour.startsWith('4;')) return 'Red';
  if (colour.includes('orange') || colour.startsWith('3;')) return 'Orange';
  if (colour.includes('yellow') || colour.startsWith('2;')) return 'Yellow';

  const text = headlineOrEvent.toLowerCase();
  if (text.includes('red warning') || severity === 'Extreme') return 'Red';
  if (text.includes('orange warning') || text.includes('warning') || severity === 'Severe') {
    return 'Orange';
  }
  if (text.includes('watch') || text.includes('advisory') || severity === 'Moderate') {
    return 'Yellow';
  }
  return undefined;
}

function parseCapPolygon(rawPolygon: string, spaceSeparatedPairs = false): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const tokens = rawPolygon.trim().split(/\s+/);
  if (spaceSeparatedPairs) {
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const lat = Number(tokens[i]);
      const lon = Number(tokens[i + 1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push([lat, lon]);
      }
    }
    return points;
  }
  for (const token of tokens) {
    const [latStr, lonStr] = token.split(',');
    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push([lat, lon]);
    }
  }
  return points;
}

function parseCapCircle(rawCircle: string): ParsedCapCircle | null {
  const tokens = rawCircle.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const [latStr, lonStr] = tokens[0].split(',');
  const lat = Number(latStr);
  const lon = Number(lonStr);
  const radiusKm = Number(tokens[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm)) {
    return null;
  }
  return { lat, lon, radiusKm };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeLonNear(lon: number, refLon: number): number {
  let adjusted = lon;
  while (adjusted - refLon > 180) adjusted -= 360;
  while (adjusted - refLon < -180) adjusted += 360;
  return adjusted;
}

function pointInPolygon(lat: number, lon: number, ring: Array<[number, number]>): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0];
    const xi = normalizeLonNear(ring[i][1], lon);
    const yj = ring[j][0];
    const xj = normalizeLonNear(ring[j][1], lon);
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function minDistanceToPolygonDeg(
  lat: number,
  lon: number,
  ring: Array<[number, number]>
): number {
  if (ring.length === 0) return Infinity;
  let minSq = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const aLat = ring[i][0];
    const aLon = normalizeLonNear(ring[i][1], lon);
    const b = ring[(i + 1) % ring.length];
    const bLat = b[0];
    const bLon = normalizeLonNear(b[1], lon);
    const dLat = bLat - aLat;
    const dLon = bLon - aLon;
    const lenSq = dLat * dLat + dLon * dLon;
    const t =
      lenSq > 0
        ? Math.max(0, Math.min(1, ((lat - aLat) * dLat + (lon - aLon) * dLon) / lenSq))
        : 0;
    const projLat = aLat + t * dLat;
    const projLon = aLon + t * dLon;
    const distSq = (lat - projLat) * (lat - projLat) + (lon - projLon) * (lon - projLon);
    if (distSq < minSq) minSq = distSq;
  }
  return Math.sqrt(minSq);
}

function normalizeTextForAreaMatch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseCapAlertXml(
  xmlText: string,
  fallbackId: string
): ParsedCapAlertRecord | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return null;
  }
  const alertEl = doc.documentElement;
  if (!alertEl || alertEl.localName !== 'alert') {
    return null;
  }

  const status = getFirstChildText(alertEl, 'status');
  const msgType = getFirstChildText(alertEl, 'msgType');
  if (status && status !== 'Actual') return null;
  if (msgType === 'Cancel') return null;

  const infos = getDirectChildrenByLocalName(alertEl, 'info');
  if (infos.length === 0) return null;
  const infoEl =
    infos.find((el) => getFirstChildText(el, 'language').toLowerCase().startsWith('en')) ??
    infos[0];

  const expiresIso = getFirstChildText(infoEl, 'expires') || undefined;
  if (expiresIso) {
    const expiresMs = Date.parse(expiresIso);
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      return null;
    }
  }

  const event = getFirstChildText(infoEl, 'event');
  const headline = getFirstChildText(infoEl, 'headline') || event;
  if (!headline && !event) return null;

  const severity = normalizeSeverity(getFirstChildText(infoEl, 'severity'));
  const description = getFirstChildText(infoEl, 'description') || undefined;
  const instruction = getFirstChildText(infoEl, 'instruction') || undefined;
  const onsetIso =
    getFirstChildText(infoEl, 'onset') ||
    getFirstChildText(infoEl, 'effective') ||
    undefined;
  const webUrl = getFirstChildText(infoEl, 'web') || undefined;

  let rawColour = '';
  let awarenessLevel = '';
  let nextUpdateIso: string | undefined;
  for (const paramEl of getDirectChildrenByLocalName(infoEl, 'parameter')) {
    const key = getFirstChildText(paramEl, 'valueName');
    const val = getFirstChildText(paramEl, 'value');
    if (key === 'ColourCode' && val) rawColour = val;
    else if (key === 'awareness_level' && val) awarenessLevel = val;
    else if (key === 'NextUpdate' && val) nextUpdateIso = val;
  }

  const areas: ParsedCapArea[] = [];
  for (const areaEl of getDirectChildrenByLocalName(infoEl, 'area')) {
    const areaDesc = getFirstChildText(areaEl, 'areaDesc');
    const polygons: Array<Array<[number, number]>> = [];
    for (const polyEl of getDirectChildrenByLocalName(areaEl, 'polygon')) {
      const parsed = parseCapPolygon(polyEl.textContent || '');
      if (parsed.length >= 3) {
        polygons.push(parsed);
      }
    }
    const circles: ParsedCapCircle[] = [];
    for (const circleEl of getDirectChildrenByLocalName(areaEl, 'circle')) {
      const parsedCircle = parseCapCircle(circleEl.textContent || '');
      if (parsedCircle) {
        circles.push(parsedCircle);
      }
    }
    areas.push({ areaDesc, polygons, circles });
  }

  return {
    id: getFirstChildText(alertEl, 'identifier') || fallbackId,
    event: event || headline,
    headline: headline || event,
    severity,
    colourLevel: normalizeColourLevel(
      rawColour,
      awarenessLevel,
      `${headline} ${event}`,
      severity
    ),
    description,
    instruction,
    onsetIso,
    expiresIso,
    nextUpdateIso,
    webUrl,
    areas,
  };
}

function scoreAlertPriority(alert: WeatherAlertItem): number {
  let score = 0;
  if (alert.colourLevel === 'Red') score += 400;
  else if (alert.colourLevel === 'Orange') score += 300;
  else if (alert.colourLevel === 'Yellow') score += 200;
  else if (/warning/i.test(`${alert.event} ${alert.headline}`)) score += 250;
  else if (/watch/i.test(`${alert.event} ${alert.headline}`)) score += 150;

  if (alert.severity === 'Extreme') score += 40;
  else if (alert.severity === 'Severe') score += 30;
  else if (alert.severity === 'Moderate') score += 20;
  else if (alert.severity === 'Minor') score += 10;
  return score;
}

function normalizeCapLinkUrl(rawHref: string, baseFeedUrl: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  try {
    const resolved = new URL(trimmed, baseFeedUrl);
    if (resolved.hostname.toLowerCase() === 'capcp2.naad-adna.pelmorex.com') {
      resolved.protocol = 'https:';
    }
    return normalizeSafeHttpsFeedUrl(resolved.toString());
  } catch {
    return null;
  }
}

interface CapFeedConfig {
  source: Exclude<WeatherAlertItem['source'], 'nws' | 'forecast'>;
  feedUrl: string;
  feedProxyUrl?: string;
  resolveAlertProxyUrl?: (alertUrl: string) => string | undefined;
  maxEntries?: number;
}

function matchAlertRecordToLocation(
  record: ParsedCapAlertRecord,
  lat: number,
  lon: number,
  areaHints: string[]
): string[] {
  const normalizedHints = areaHints
    .map((h) => normalizeTextForAreaMatch(h))
    .filter((h) => h.length >= 3);
  const matchingAreas: string[] = [];

  for (const area of record.areas) {
    let matchesArea = false;
    if (area.polygons.length > 0 || area.circles.length > 0) {
      if (area.polygons.length > 0) {
        matchesArea = area.polygons.some(
          (poly) =>
            pointInPolygon(lat, lon, poly) ||
            minDistanceToPolygonDeg(lat, lon, poly) <= 0.032
        );
      }
      if (!matchesArea && area.circles.length > 0) {
        matchesArea = area.circles.some(
          (circle) =>
            haversineKm(lat, lon, circle.lat, circle.lon) <= circle.radiusKm + 3.5
        );
      }
    } else if (normalizedHints.length > 0 && area.areaDesc) {
      const descNorm = normalizeTextForAreaMatch(area.areaDesc);
      matchesArea = normalizedHints.some((hint) => descNorm.includes(hint));
    }

    if (matchesArea && area.areaDesc) {
      matchingAreas.push(area.areaDesc);
    }
  }
  return matchingAreas;
}

async function fetchCapFeedAlerts(
  lat: number,
  lon: number,
  areaHints: string[],
  config: CapFeedConfig
): Promise<WeatherAlertItem[]> {
  try {
    const feedXml = await fetchXmlText(config.feedUrl, config.feedProxyUrl, 7500);
    const parser = new DOMParser();
    const doc = parser.parseFromString(feedXml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return [];
    }

    const root = doc.documentElement;
    if (!root) return [];

    // Direct CAP <alert> XML URL passed directly as feed
    if (root.localName === 'alert') {
      const directRecord = parseCapAlertXml(feedXml, config.feedUrl);
      if (!directRecord) return [];
      const matchingAreas = matchAlertRecordToLocation(directRecord, lat, lon, areaHints);
      if (matchingAreas.length === 0) return [];
      return [
        {
          id: directRecord.id,
          source: config.source,
          event: directRecord.event,
          headline: directRecord.headline,
          severity: directRecord.severity,
          colourLevel: directRecord.colourLevel,
          areaDesc: Array.from(new Set(matchingAreas)).join('; '),
          description: directRecord.description,
          instruction: directRecord.instruction,
          onsetIso: directRecord.onsetIso,
          expiresIso: directRecord.expiresIso,
          nextUpdateIso: directRecord.nextUpdateIso,
          webUrl: directRecord.webUrl,
        },
      ];
    }

    const now = Date.now();
    const maxEntries = config.maxEntries ?? 18;
    const candidateLinks = new Map<string, { url: string; versionKey: string }>();

    // RSS 2.0 <item> extraction
    const rssItems = Array.from(doc.getElementsByTagName('item'));
    for (const itemEl of rssItems) {
      if (candidateLinks.size >= maxEntries) break;
      const title = getFirstChildText(itemEl, 'title');
      if (/test message/i.test(title)) continue;
      const linkText = getFirstChildText(itemEl, 'link');
      const guidText = getFirstChildText(itemEl, 'guid');
      const pubDate = getFirstChildText(itemEl, 'pubDate');

      const candidateUrl =
        normalizeCapLinkUrl(linkText, config.feedUrl) ||
        normalizeCapLinkUrl(guidText, config.feedUrl);
      if (!candidateUrl) continue;

      if (!candidateLinks.has(candidateUrl)) {
        candidateLinks.set(candidateUrl, { url: candidateUrl, versionKey: pubDate || candidateUrl });
      }
    }

    // Atom <entry> extraction (Meteoalarm & Canada Alert Ready / NAADS)
    if (rssItems.length === 0) {
      const atomEntries = getDirectChildrenByLocalName(root, 'entry');
      const normalizedHints = areaHints
        .map((h) => normalizeTextForAreaMatch(h))
        .filter((h) => h.length >= 3);

      for (const entryEl of atomEntries) {
        if (candidateLinks.size >= maxEntries) break;
        const title = getFirstChildText(entryEl, 'title');
        if (/test message/i.test(title)) continue;

        const capStatus = getFirstChildText(entryEl, 'status');
        if (capStatus && capStatus !== 'Actual') continue;

        const capExpires = getFirstChildText(entryEl, 'expires');
        if (capExpires) {
          const expMs = Date.parse(capExpires);
          if (Number.isFinite(expMs) && expMs <= now) continue;
        }

        // Pre-filter by <georss:polygon> when present (e.g. Canada NAADS)
        const geoPolys: Array<Array<[number, number]>> = [];
        for (let i = 0; i < entryEl.children.length; i++) {
          const child = entryEl.children[i];
          if (child.localName === 'polygon') {
            const pts = parseCapPolygon(child.textContent || '', true);
            if (pts.length >= 3) geoPolys.push(pts);
          }
        }
        if (geoPolys.length > 0) {
          const nearGeoPoly = geoPolys.some(
            (poly) =>
              pointInPolygon(lat, lon, poly) ||
              minDistanceToPolygonDeg(lat, lon, poly) <= 0.04
          );
          if (!nearGeoPoly) continue;
        } else {
          // If Atom entry provides cap:areaDesc without polygon (e.g. Meteoalarm), pre-filter when hints match or keep if uncertain
          const entryAreaDesc = getFirstChildText(entryEl, 'areaDesc');
          if (entryAreaDesc && normalizedHints.length > 0) {
            const descNorm = normalizeTextForAreaMatch(entryAreaDesc);
            const matchesHint = normalizedHints.some((hint) => descNorm.includes(hint));
            if (!matchesHint) {
              // Skip fetching CAP XML if entry already narrows to a different areaDesc unless no hint matched anything
              continue;
            }
          }
        }

        const linkEls = getDirectChildrenByLocalName(entryEl, 'link');
        const capLinkEl =
          linkEls.find((el) =>
            (el.getAttribute('type') || '').toLowerCase().includes('cap+xml')
          ) ||
          linkEls.find((el) => (el.getAttribute('rel') || 'alternate') === 'alternate') ||
          linkEls[0];

        const href = capLinkEl?.getAttribute('href') || '';
        const capUrl = normalizeCapLinkUrl(href, config.feedUrl);
        if (!capUrl) continue;
        const updated =
          getFirstChildText(entryEl, 'updated') ||
          getFirstChildText(entryEl, 'published') ||
          capUrl;

        if (!candidateLinks.has(capUrl)) {
          candidateLinks.set(capUrl, { url: capUrl, versionKey: updated });
        }
      }
    }

    const targets = Array.from(candidateLinks.values()).slice(0, maxEntries);
    if (targets.length === 0) return [];

    const parsedRecords = await Promise.all(
      targets.map(async ({ url, versionKey }) => {
        const cached = capAlertCache.get(url);
        if (
          cached &&
          cached.versionKey === versionKey &&
          now - cached.fetchedAt < CAP_CACHE_TTL_MS
        ) {
          return cached.record;
        }
        try {
          const capXml = await fetchXmlText(
            url,
            config.resolveAlertProxyUrl?.(url),
            6000
          );
          const record = parseCapAlertXml(capXml, url);
          capAlertCache.set(url, { fetchedAt: now, versionKey, record });
          return record;
        } catch {
          return cached?.record ?? null;
        }
      })
    );

    const matchedAlerts: WeatherAlertItem[] = [];
    const seenIds = new Set<string>();

    for (const record of parsedRecords) {
      if (!record || seenIds.has(record.id)) continue;
      const matchingAreas = matchAlertRecordToLocation(record, lat, lon, areaHints);
      if (matchingAreas.length === 0) continue;

      seenIds.add(record.id);
      matchedAlerts.push({
        id: record.id,
        source: config.source,
        event: record.event,
        headline: record.headline,
        severity: record.severity,
        colourLevel: record.colourLevel,
        areaDesc: Array.from(new Set(matchingAreas)).join('; '),
        description: record.description,
        instruction: record.instruction,
        onsetIso: record.onsetIso,
        expiresIso: record.expiresIso,
        nextUpdateIso: record.nextUpdateIso,
        webUrl: record.webUrl,
      });
    }

    matchedAlerts.sort((a, b) => scoreAlertPriority(b) - scoreAlertPriority(a));
    return matchedAlerts;
  } catch {
    return [];
  }
}

export async function testCustomCapFeed(rawUrl: string): Promise<{
  ok: boolean;
  title?: string;
  entryCount: number;
  error?: string;
}> {
  const safeUrl = normalizeSafeHttpsFeedUrl(rawUrl);
  if (!safeUrl) {
    return {
      ok: false,
      entryCount: 0,
      error: 'Enter a valid public https:// RSS, Atom, or CAP XML feed URL.',
    };
  }
  try {
    const xmlText = await fetchXmlText(safeUrl, undefined, 8000);
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return {
        ok: false,
        entryCount: 0,
        error: 'URL responded, but did not return valid XML.',
      };
    }
    const root = doc.documentElement;
    if (!root) {
      return { ok: false, entryCount: 0, error: 'Empty XML response.' };
    }
    if (root.localName === 'alert') {
      const headline =
        getFirstChildText(
          getDirectChildrenByLocalName(root, 'info')[0] || root,
          'headline'
        ) || 'CAP 1.2 Alert';
      return { ok: true, title: headline, entryCount: 1 };
    }
    const rssItems = doc.getElementsByTagName('item').length;
    const atomEntries = getDirectChildrenByLocalName(root, 'entry').length;
    if (root.localName !== 'rss' && root.localName !== 'feed') {
      return {
        ok: false,
        entryCount: 0,
        error: 'Feed must be an RSS 2.0, Atom, or OASIS CAP XML feed.',
      };
    }
    const channelEl = getDirectChildrenByLocalName(root, 'channel')[0];
    const title =
      (channelEl ? getFirstChildText(channelEl, 'title') : '') ||
      getFirstChildText(root, 'title') ||
      'Custom CAP Feed';
    return {
      ok: true,
      title,
      entryCount: rssItems + atomEntries,
    };
  } catch (err) {
    return {
      ok: false,
      entryCount: 0,
      error: err instanceof Error ? err.message : 'Unable to reach custom CAP feed URL.',
    };
  }
}

async function fetchNwsActiveAlerts(
  lat: number,
  lon: number
): Promise<WeatherAlertItem[]> {
  try {
    const data = (await fetchJsonWithTimeout(
      `https://api.weather.gov/alerts/active?point=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`,
      3000
    )) as {
      features?: Array<{
        id?: string;
        properties?: {
          status?: string;
          messageType?: string;
          severity?: string;
          event?: string;
          headline?: string;
          areaDesc?: string;
          description?: string;
          instruction?: string;
          onset?: string;
          effective?: string;
          expires?: string;
        };
      }>;
    };
    const features = Array.isArray(data?.features) ? data.features : [];
    const alerts: WeatherAlertItem[] = [];
    for (const f of features) {
      const props = f?.properties;
      if (!props) continue;
      if (props.status && props.status !== 'Actual') continue;
      if (props.messageType === 'Cancel') continue;
      if (!props.event && !props.headline) continue;
      if (props.expires) {
        const expMs = Date.parse(props.expires);
        if (Number.isFinite(expMs) && expMs <= Date.now()) continue;
      }
      const severity = normalizeSeverity(props.severity || '');
      alerts.push({
        id: f.id || props.headline || props.event || `nws-${alerts.length}`,
        source: 'nws',
        event: props.event || props.headline || 'Weather Alert',
        headline: props.event || props.headline || 'Weather Alert',
        severity,
        colourLevel:
          severity === 'Extreme' ? 'Red' : severity === 'Severe' ? 'Orange' : 'Yellow',
        areaDesc: props.areaDesc || undefined,
        description: props.description || undefined,
        instruction: props.instruction || undefined,
        onsetIso: props.onset || props.effective || undefined,
        expiresIso: props.expires || undefined,
      });
    }
    alerts.sort((a, b) => scoreAlertPriority(b) - scoreAlertPriority(a));
    return alerts;
  } catch {
    return [];
  }
}

async function fetchRegionalOfficialAlerts(
  lat: number,
  lon: number,
  areaHints: string[],
  tz?: string,
  options?: ForecastOptions
): Promise<{ alerts: WeatherAlertItem[]; hasOfficialFeed: boolean }> {
  const safeCustomUrl = options?.customCapFeedUrl
    ? normalizeSafeHttpsFeedUrl(options.customCapFeedUrl)
    : null;

  const tasks: Array<Promise<WeatherAlertItem[]>> = [];
  let hasRegionalProvider = false;

  if (safeCustomUrl) {
    tasks.push(
      fetchCapFeedAlerts(lat, lon, areaHints, {
        source: 'custom',
        feedUrl: safeCustomUrl,
      })
    );
  }

  if (isInNewZealandBounds(lat, lon)) {
    hasRegionalProvider = true;
    tasks.push(
      fetchCapFeedAlerts(lat, lon, areaHints, {
        source: 'metservice',
        feedUrl: 'https://alerts.metservice.com/cap/rss',
        feedProxyUrl: '/api/metservice-cap?target=rss',
        resolveAlertProxyUrl: (alertUrl) => {
          try {
            const id = new URL(alertUrl).searchParams.get('id');
            if (id) {
              return `/api/metservice-cap?target=alert&id=${encodeURIComponent(id)}`;
            }
          } catch {
            // Fall back to generic proxy
          }
          return undefined;
        },
      })
    );
  } else if (isInUsBounds(lat, lon, options?.countryHint)) {
    hasRegionalProvider = true;
    tasks.push(fetchNwsActiveAlerts(lat, lon));
  } else if (isInAustraliaBounds(lat, lon, options?.countryHint, tz)) {
    hasRegionalProvider = true;
    tasks.push(
      fetchCapFeedAlerts(lat, lon, areaHints, {
        source: 'bom',
        feedUrl: 'https://severeweather.wmo.int/v2/cap-alerts/au-bom-en/rss.xml',
      })
    );
  } else if (isInCanadaBounds(lat, lon, options?.countryHint, tz)) {
    hasRegionalProvider = true;
    tasks.push(
      fetchCapFeedAlerts(lat, lon, areaHints, {
        source: 'canada',
        feedUrl: 'https://rss.naad-adna.pelmorex.com/',
        maxEntries: 24,
      })
    );
  } else {
    const meteoalarmSlug = resolveMeteoalarmSlug(tz, options?.countryHint);
    if (meteoalarmSlug) {
      hasRegionalProvider = true;
      tasks.push(
        fetchCapFeedAlerts(lat, lon, areaHints, {
          source: 'meteoalarm',
          feedUrl: `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${meteoalarmSlug}`,
          maxEntries: 20,
        })
      );
    }
  }

  const results = await Promise.all(tasks);
  const merged: WeatherAlertItem[] = [];
  const seen = new Set<string>();
  for (const list of results) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  merged.sort((a, b) => scoreAlertPriority(b) - scoreAlertPriority(a));

  return {
    alerts: merged,
    hasOfficialFeed: Boolean(safeCustomUrl) || hasRegionalProvider,
  };
}

function parseOpenMeteoLocalIsoToUtcMs(
  iso: string | undefined,
  utcOffsetSeconds: number
): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
    iso.trim()
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  const utcWallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(utcWallMs)) return null;
  return utcWallMs - utcOffsetSeconds * 1000;
}

function getAlertWindowMs(alert: WeatherAlertItem, nowMs: number): [number, number] {
  const parsedOnset = alert.onsetIso ? Date.parse(alert.onsetIso) : Number.NaN;
  const parsedExpires = alert.expiresIso ? Date.parse(alert.expiresIso) : Number.NaN;
  const hasOnset = Number.isFinite(parsedOnset);
  const hasExpires = Number.isFinite(parsedExpires);

  if (hasOnset && hasExpires) {
    return [parsedOnset, Math.max(parsedOnset, parsedExpires)];
  }
  if (hasOnset) {
    return [parsedOnset, parsedOnset + 24 * 3600_000];
  }
  if (hasExpires) {
    return [Math.min(nowMs, parsedExpires), parsedExpires];
  }
  return [nowMs, nowMs + 24 * 3600_000];
}

function findOverlappingOfficialAlert(
  slotStartMs: number | null,
  slotEndMs: number | null,
  alerts: WeatherAlertItem[],
  nowMs: number
): WeatherAlertItem | null {
  if (alerts.length === 0 || slotStartMs === null || slotEndMs === null) {
    return null;
  }
  for (const alert of alerts) {
    const [alertStartMs, alertEndMs] = getAlertWindowMs(alert, nowMs);
    const overlaps =
      alertEndMs > alertStartMs
        ? slotStartMs < alertEndMs && slotEndMs > alertStartMs
        : slotStartMs <= alertStartMs && alertStartMs < slotEndMs;
    if (overlaps) {
      return alert;
    }
  }
  return null;
}

export async function fetchFourHourForecast(
  latitude: number,
  longitude: number,
  cityNameHint?: string,
  options?: ForecastOptions
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

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Weather feed unavailable');
  }
  const data = await res.json();
  const tz = typeof data.timezone === 'string' ? data.timezone : undefined;
  const areaHints = [cityNameHint || '', options?.regionHint || ''].filter(Boolean);

  const { alerts: activeAlerts, hasOfficialFeed: hasOfficialAlertFeed } =
    await fetchRegionalOfficialAlerts(lat, lon, areaHints, tz, options);

  const utcOffsetSeconds = Number.isFinite(Number(data.utc_offset_seconds))
    ? Number(data.utc_offset_seconds)
    : 0;
  const nowMs = Date.now();

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
    const slotStartMs = parseOpenMeteoLocalIsoToUtcMs(iso, utcOffsetSeconds);
    const slotEndMs = slotStartMs !== null ? slotStartMs + 3600_000 : null;
    const overlappingAlert = findOverlappingOfficialAlert(
      slotStartMs,
      slotEndMs,
      activeAlerts,
      nowMs
    );
    const isSevere = hasOfficialAlertFeed
      ? Boolean(overlappingAlert)
      : Boolean(overlappingAlert) || wmoInfo.isSevereWarning || gust >= 85;
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
      warningColour: overlappingAlert?.colourLevel,
      warningHeadline: overlappingAlert
        ? overlappingAlert.headline || overlappingAlert.event
        : undefined,
    });
  }

  const primaryOfficialAlert = activeAlerts[0] ?? null;
  const officialAlertHeadline =
    primaryOfficialAlert ? primaryOfficialAlert.headline || primaryOfficialAlert.event : null;

  const nextFourHours = hourly24Hours.slice(0, 4);
  let severeTrigger: string | null = officialAlertHeadline;
  let likelyPrecipNote: string | null = null;
  let badWeatherChanceMax = 0;

  for (const slot of nextFourHours) {
    if (slot.precipProb > badWeatherChanceMax) {
      badWeatherChanceMax = slot.precipProb;
    }
    const wmoInfo = interpretWmoCode(slot.weatherCode);
    if (!severeTrigger && !hasOfficialAlertFeed) {
      if (wmoInfo.isSevereWarning) {
        severeTrigger = `${wmoInfo.label} expected around ${slot.timeLabel}`;
      } else if (slot.windGustKmh >= 85) {
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

  let hasSevereIn24h = Boolean(severeTrigger);
  let extendedWarningHeadline: string | null = warningHeadline;
  if (!extendedWarningHeadline) {
    if (!hasOfficialAlertFeed) {
      const severeHour = hourly24Hours.find((h) => h.isSevereWarning);
      if (severeHour) {
        hasSevereIn24h = true;
        extendedWarningHeadline = `${severeHour.conditionLabel} expected around ${severeHour.timeLabel}`;
      }
    }
    if (!extendedWarningHeadline) {
      const likelyRainHour = hourly24Hours.find((h) => h.precipProb >= 65);
      if (likelyRainHour) {
        extendedWarningHeadline = `${likelyRainHour.precipProb}% chance of ${likelyRainHour.conditionLabel.toLowerCase()} at ${likelyRainHour.timeLabel}`;
      }
    }
  }

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
    const dayStartMs = parseOpenMeteoLocalIsoToUtcMs(dateIso, utcOffsetSeconds);
    const dayEndMs = dayStartMs !== null ? dayStartMs + 24 * 3600_000 : null;
    const overlappingAlert = findOverlappingOfficialAlert(
      dayStartMs,
      dayEndMs,
      activeAlerts,
      nowMs
    );
    const isSevere = hasOfficialAlertFeed
      ? Boolean(overlappingAlert)
      : Boolean(overlappingAlert) || wmoInfo.isSevereWarning || windGustMaxKmh >= 85;
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
      warningColour: overlappingAlert?.colourLevel,
      warningHeadline: overlappingAlert
        ? overlappingAlert.headline || overlappingAlert.event
        : undefined,
    };
  });

  if (!extendedWarningHeadline && !hasOfficialAlertFeed) {
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
    activeAlerts,
    hasWarning: hasOfficialAlertFeed
      ? activeAlerts.length > 0
      : Boolean(activeAlerts.length > 0 || hasSevereIn24h),
    warningHeadline,
    extendedWarningHeadline,
    badWeatherChanceMax,
  };
}
