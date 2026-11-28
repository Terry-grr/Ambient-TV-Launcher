import seedCatalogRaw from '../data/seedCatalog.json';
import { CURATED_WALLPAPERS } from '../data/defaults';
import { CuratedCategory, WallpaperItem, WeatherTag } from '../types/launcher';
import { isSafeHttpUrl, sanitizeWallpaperImageUrl } from '../utils/urlValidation';

const REMOTE_CACHE_KEY = 'ambient_tv_remote_catalog_v2';

export const SEED_CURATED_WALLPAPERS: WallpaperItem[] = (
  seedCatalogRaw as WallpaperItem[]
).map((item) => ({
  ...item,
  sourceType: 'curated',
  weatherTags:
    item.weatherTags && item.weatherTags.length > 0 ? item.weatherTags : ['none'],
}));

export function loadMergedCuratedCatalog(): WallpaperItem[] {
  let cached: WallpaperItem[] = [];
  try {
    const raw = localStorage.getItem(REMOTE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cached = parsed as WallpaperItem[];
    }
  } catch {
    cached = [];
  }

  const seen = new Set<string>();
  const merged: WallpaperItem[] = [];

  for (const item of [...CURATED_WALLPAPERS, ...SEED_CURATED_WALLPAPERS, ...cached]) {
    if (!item?.id || !item?.imageUrl) continue;
    const safeImage = sanitizeWallpaperImageUrl(item.imageUrl);
    if (!safeImage || seen.has(item.id) || seen.has(safeImage)) {
      continue;
    }
    const safeSource = isSafeHttpUrl(item.sourceUrl) ? item.sourceUrl : 'https://commons.wikimedia.org/';
    seen.add(item.id);
    seen.add(safeImage);
    merged.push({
      ...item,
      imageUrl: safeImage,
      sourceUrl: safeSource,
      sourceType: 'curated',
      weatherTags:
        item.weatherTags && item.weatherTags.length > 0 ? item.weatherTags : ['none'],
    });
  }

  return merged;
}

export function getEffectiveWeatherTags(
  item: WallpaperItem,
  overrides: Record<string, WeatherTag[]>
): WeatherTag[] {
  const overridden = overrides[item.id];
  if (overridden && overridden.length > 0) return overridden;
  if (item.weatherTags && item.weatherTags.length > 0) return item.weatherTags;
  return ['none'];
}

export function toggleItemWeatherTag(
  currentTags: WeatherTag[],
  clickedTag: WeatherTag
): WeatherTag[] {
  if (clickedTag === 'none') {
    return ['none'];
  }

  const specificOnly = currentTags.filter((t) => t !== 'none');
  const exists = specificOnly.includes(clickedTag);
  const next = exists
    ? specificOnly.filter((t) => t !== clickedTag)
    : [...specificOnly, clickedTag];

  return next.length > 0 ? next : ['none'];
}

export function filterWallpapersByWeather(
  items: WallpaperItem[],
  syncEnabled: boolean,
  activeWeatherTag: WeatherTag | null,
  overrides: Record<string, WeatherTag[]>
): { items: WallpaperItem[]; usedFallback: boolean } {
  if (!syncEnabled || !activeWeatherTag || activeWeatherTag === 'none') {
    return { items, usedFallback: false };
  }

  const matched = items.filter((item) => {
    const tags = getEffectiveWeatherTags(item, overrides);
    return tags.includes(activeWeatherTag) || tags.includes('none');
  });

  if (matched.length > 0) {
    return { items: matched, usedFallback: false };
  }

  const noneOnly = items.filter((item) =>
    getEffectiveWeatherTags(item, overrides).includes('none')
  );
  if (noneOnly.length > 0) {
    return { items: noneOnly, usedFallback: true };
  }

  return { items, usedFallback: true };
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferWeatherTags(title: string): WeatherTag[] {
  const t = title.toLowerCase();
  const tags = new Set<WeatherTag>();
  if (/\b(storm|stormy|thunder|lightning|cyclone|hurricane|tempest|gale|squall)\b/.test(t))
    tags.add('stormy');
  if (/\b(rain|rainy|drizzle|shower|monsoon|wet|downpour)\b/.test(t)) tags.add('rainy');
  if (/\b(snow|snowy|winter|blizzard|frost|glacier|iceberg|frozen|icicle)\b/.test(t))
    tags.add('snowy');
  if (/\b(fog|foggy|mist|misty|haze|hazy|vapor)\b/.test(t)) tags.add('foggy');
  if (/\b(cloud|clouds|cloudy|overcast|cumulus|nimbus)\b/.test(t)) tags.add('cloudy');
  if (/\b(sun|sunny|sunlit|sunset|sunrise|sunshine|clear sky|golden hour|noon)\b/.test(t))
    tags.add('clear');
  return tags.size > 0 ? Array.from(tags) : ['none'];
}

async function fetchNasaCategory(
  query: string,
  category: CuratedCategory,
  page: number
): Promise<WallpaperItem[]> {
  try {
    const res = await fetch(
      `https://images-api.nasa.gov/search?q=${encodeURIComponent(
        query
      )}&media_type=image&page_size=24&page=${page}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const out: WallpaperItem[] = [];
    for (const entry of data?.collection?.items ?? []) {
      const meta = entry?.data?.[0];
      const thumb = entry?.links?.find((l: { render?: string }) => l.render === 'image')?.href;
      const safeImage = thumb
        ? sanitizeWallpaperImageUrl(String(thumb).replace(/^http:\/\//i, 'https://'))
        : null;
      if (!meta?.title || !meta?.nasa_id || !safeImage) continue;
      const sourceUrl = `https://images.nasa.gov/details/${encodeURIComponent(String(meta.nasa_id))}`;
      out.push({
        id: `nasa-${category}-${meta.nasa_id}`,
        title: stripHtml(String(meta.title)).slice(0, 90),
        creator: stripHtml(meta.center ? `NASA · ${meta.center}` : 'NASA Archive'),
        sourceUrl,
        imageUrl: safeImage,
        sourceType: 'curated',
        category,
        weatherTags: ['none'],
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchCmaCategory(
  query: string,
  category: CuratedCategory,
  skip: number,
  typeFilter = ''
): Promise<WallpaperItem[]> {
  try {
    const typeParam = typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : '';
    const res = await fetch(
      `https://openaccess-api.clevelandart.org/api/artworks/?has_image=1&cc0=1${typeParam}&q=${encodeURIComponent(
        query
      )}&skip=${skip}&limit=40`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const out: WallpaperItem[] = [];
    for (const art of data?.data ?? []) {
      const img = art?.images?.web;
      const safeImage = img?.url ? sanitizeWallpaperImageUrl(String(img.url)) : null;
      if (
        !safeImage ||
        Number(img.width) < 700 ||
        Number(img.width) < Number(img.height) * 1.05
      ) {
        continue;
      }
      const fallbackSource = `https://www.clevelandart.org/art/${encodeURIComponent(
        String(art.accession_number || art.id)
      )}`;
      const safeSource =
        typeof art.url === 'string' && isSafeHttpUrl(art.url) ? art.url : fallbackSource;
      const title = stripHtml(String(art.title || 'Untitled Work')).slice(0, 90);
      const creator = stripHtml(
        String(art.creators?.[0]?.description || art.culture?.[0] || 'Cleveland Museum of Art')
      ).slice(0, 65);
      out.push({
        id: `cma-${category}-${art.id}`,
        title,
        creator,
        sourceUrl: safeSource,
        imageUrl: safeImage,
        sourceType: 'curated',
        category,
        weatherTags: inferWeatherTags(title),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchWmSearch(
  query: string,
  category: CuratedCategory,
  offset: number
): Promise<WallpaperItem[]> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: '30',
      gsroffset: String(offset),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1600',
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    const out: WallpaperItem[] = [];
    for (const page of Object.values(data?.query?.pages ?? {}) as Array<{
      pageid: number;
      title: string;
      imageinfo?: Array<{
        thumburl?: string;
        descriptionurl?: string;
        mime?: string;
        width?: number;
        height?: number;
        extmetadata?: { Artist?: { value?: string } };
      }>;
    }>) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;
      if (info.mime !== 'image/jpeg' && info.mime !== 'image/webp') continue;
      if (!info.width || !info.height || info.width < 900 || info.width < info.height * 1.15) {
        continue;
      }
      const safeImage = sanitizeWallpaperImageUrl(info.thumburl.split('?')[0]);
      if (!safeImage) continue;
      const cleanTitle = stripHtml(
        page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')
      ).slice(0, 90);
      if (!cleanTitle || /chart|diagram|map|logo|icon|flag/i.test(cleanTitle)) continue;

      const metaArtist = stripHtml(info.extmetadata?.Artist?.value ?? '');
      const creator =
        metaArtist && metaArtist.length <= 55 ? metaArtist : 'Wikimedia Commons Archive';

      const fallbackSource = `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`;
      const safeSource =
        typeof info.descriptionurl === 'string' && isSafeHttpUrl(info.descriptionurl)
          ? info.descriptionurl
          : fallbackSource;

      out.push({
        id: `wm-${category}-${page.pageid}`,
        title: cleanTitle,
        creator,
        sourceUrl: safeSource,
        imageUrl: safeImage,
        sourceType: 'curated',
        category,
        weatherTags: inferWeatherTags(cleanTitle),
      });
    }
    return out;
  } catch {
    return [];
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const categoryPullCursor: Record<string, number> = {};

export async function refreshOpenArchiveCatalog(
  targetCategory?: CuratedCategory
): Promise<WallpaperItem[]> {
  const cursorKey = targetCategory ?? 'all';
  const prevStep = categoryPullCursor[cursorKey] ?? 0;
  const step = prevStep;
  categoryPullCursor[cursorKey] = (prevStep + 1) % 6;

  const page = 1 + step;
  const offset = step * 25;

  const shouldFetch = (cat: CuratedCategory) =>
    !targetCategory || targetCategory === cat;

  const fastBatches: Promise<WallpaperItem[]>[] = [];
  if (shouldFetch('space')) fastBatches.push(fetchNasaCategory('nebula', 'space', page));
  if (shouldFetch('satellite')) {
    fastBatches.push(fetchNasaCategory('earth from space', 'satellite', page));
  }
  if (shouldFetch('classical-art')) {
    fastBatches.push(fetchCmaCategory('landscape', 'classical-art', offset, 'Painting'));
  }
  if (shouldFetch('abstract-art')) {
    fastBatches.push(fetchCmaCategory('abstract', 'abstract-art', offset));
  }
  if (shouldFetch('ink-art')) {
    fastBatches.push(fetchCmaCategory('ink landscape', 'ink-art', offset));
  }
  if (shouldFetch('geometric')) {
    fastBatches.push(fetchCmaCategory('geometric', 'geometric', offset));
  }

  const fastResults = await Promise.all(fastBatches);

  const wmTargets: Array<[string, CuratedCategory]> = [
    ['filetype:bitmap forest waterfall', 'nature'],
    ['filetype:bitmap alpine mountain valley', 'landscape'],
    ['filetype:bitmap ocean sunset waves', 'seascapes'],
    ['filetype:bitmap wildlife national park', 'animals'],
    ['filetype:bitmap minimalist architecture', 'architecture'],
    ['filetype:bitmap geometric abstract pattern', 'geometric'],
  ];

  const selectedWmTargets = wmTargets.filter(([, cat]) => shouldFetch(cat));
  const wmItems: WallpaperItem[] = [];
  for (let i = 0; i < selectedWmTargets.length; i++) {
    const [q, cat] = selectedWmTargets[i];
    const batch = await fetchWmSearch(q, cat, offset);
    wmItems.push(...batch);
    if (i < selectedWmTargets.length - 1) {
      await wait(650);
    }
  }

  const fresh = [...fastResults.flat(), ...wmItems];

  if (fresh.length > 0) {
    try {
      const existing = loadMergedCuratedCatalog();
      const map = new Map<string, WallpaperItem>();
      for (const item of [...existing, ...fresh]) {
        if (!map.has(item.id)) map.set(item.id, item);
      }
      const remoteOnly = Array.from(map.values()).filter(
        (w) => !w.id.startsWith('curated-')
      );
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(remoteOnly.slice(0, 420)));
    } catch {
      // Ignore storage quota errors
    }
  }

  return loadMergedCuratedCatalog();
}
