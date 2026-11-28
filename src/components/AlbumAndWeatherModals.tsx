import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CloudSun,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Link as LinkIcon,
  QrCode,
  RefreshCw,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  CURATED_CATEGORIES,
  CURATED_CATEGORY_LABELS,
  SLIDESHOW_POOL_LABELS,
  WEATHER_TAG_LABELS,
  WEATHER_TAG_OPTIONS,
} from '../data/defaults';
import {
  AlbumBrowseFilter,
  CuratedCategory,
  SlideshowPoolKey,
  WallpaperItem,
  WeatherTag,
} from '../types/launcher';
import { getEffectiveWeatherTags } from '../services/wallpaperCatalogService';
import { isSafeHttpUrl } from '../utils/urlValidation';
import { QrCodeSvg } from './QrCodeSvg';
import { QrPasteModal } from './QrPasteModal';

interface AlbumPickerModalProps {
  curatedWallpapers: WallpaperItem[];
  localWallpapers: WallpaperItem[];
  customUrlWallpapers: WallpaperItem[];
  activeWallpaperId: string;
  slideshowIntervalSec: number;
  slideshowPools: Record<SlideshowPoolKey, boolean>;
  syncBackgroundToWeather: boolean;
  activeWeatherTag: WeatherTag | null;
  weatherTagsMap: Record<string, WeatherTag[]>;
  activePoolCount: number;
  usedWeatherFallback: boolean;
  refreshingCatalog: boolean;
  removedCuratedCount: number;
  onToggleSlideshowPool: (poolKey: SlideshowPoolKey) => void;
  onToggleSyncWeather: () => void;
  onToggleImageWeatherTag: (wallpaperId: string, tag: WeatherTag) => void;
  onRefreshCatalog: (category?: CuratedCategory) => Promise<void>;
  onRestoreCuratedWallpapers: () => void;
  onSelectWallpaper: (wallpaperId: string) => void;
  onUploadFiles: (files: FileList) => Promise<void>;
  onDeleteLocalPhoto: (id: string) => Promise<void>;
  onHideCuratedWallpaper: (id: string) => void;
  onClearLocalAlbum: () => Promise<void>;
  onAddCustomUrl: (url: string, title: string, creator: string) => void;
  onRemoveCustomUrl: (id: string) => void;
  onChangeSlideshowInterval: (sec: number) => void;
  onUpdateWallpaperMeta: (wallpaperId: string, title: string, creator: string) => void;
  onClose: () => void;
}

type AlbumSectionTab = 'images' | 'slideshow' | 'sources';

export const AlbumPickerModal: React.FC<AlbumPickerModalProps> = ({
  curatedWallpapers,
  localWallpapers,
  customUrlWallpapers,
  activeWallpaperId,
  slideshowIntervalSec,
  slideshowPools,
  syncBackgroundToWeather,
  activeWeatherTag,
  weatherTagsMap,
  activePoolCount,
  usedWeatherFallback,
  refreshingCatalog,
  removedCuratedCount,
  onToggleSlideshowPool,
  onToggleSyncWeather,
  onToggleImageWeatherTag,
  onRefreshCatalog,
  onRestoreCuratedWallpapers,
  onSelectWallpaper,
  onUploadFiles,
  onDeleteLocalPhoto,
  onHideCuratedWallpaper,
  onClearLocalAlbum,
  onAddCustomUrl,
  onRemoveCustomUrl,
  onChangeSlideshowInterval,
  onUpdateWallpaperMeta,
  onClose,
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const multiPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const categoryBtnRef = useRef<HTMLButtonElement | null>(null);
  const weatherBtnRef = useRef<HTMLButtonElement | null>(null);
  const [sectionTab, setSectionTab] = useState<AlbumSectionTab>('images');
  const [browseFilter, setBrowseFilter] = useState<AlbumBrowseFilter>('all');
  const [weatherFilter, setWeatherFilter] = useState<'all' | 'matches-now' | WeatherTag>('all');
  const [openFilterMenu, setOpenFilterMenu] = useState<'category' | 'weather' | null>(null);
  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCreator, setEditCreator] = useState('');
  const [brokenIds, setBrokenIds] = useState<Record<string, boolean>>({});
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [creatorInput, setCreatorInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlPasteNotice, setUrlPasteNotice] = useState<string | null>(null);
  const [showUrlQrModal, setShowUrlQrModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const customUrlAddBtnRef = useRef<HTMLButtonElement | null>(null);
  const customUrlQrBtnRef = useRef<HTMLButtonElement | null>(null);

  const focusCardById = useCallback((cardId: string) => {
    requestAnimationFrame(() => {
      const el = Array.from(
        document.querySelectorAll<HTMLElement>('[data-album-card]')
      ).find((node) => node.dataset.albumCard === cardId);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await onUploadFiles(files);
    } finally {
      setUploading(false);
    }
  };

  const allCombined = useMemo(
    () => [...curatedWallpapers, ...localWallpapers, ...customUrlWallpapers],
    [curatedWallpapers, localWallpapers, customUrlWallpapers]
  );

  const editingWallpaper = useMemo(
    () => (editingTagsId ? allCombined.find((w) => w.id === editingTagsId) ?? null : null),
    [editingTagsId, allCombined]
  );

  const openTagEditor = (item: WallpaperItem) => {
    setEditingTagsId(item.id);
    setEditTitle(item.title);
    setEditCreator(item.creator);
  };

  const closeTagEditor = () => {
    if (
      editingWallpaper &&
      (editingWallpaper.sourceType === 'local-album' ||
        editingWallpaper.sourceType === 'custom-urls')
    ) {
      const nextTitle =
        editTitle.trim() ||
        (editingWallpaper.sourceType === 'local-album'
          ? 'Local Album Photo'
          : 'Custom Backdrop');
      const nextCreator =
        editCreator.trim() ||
        (editingWallpaper.sourceType === 'local-album'
          ? 'Device Album'
          : 'Web Image');
      if (
        nextTitle !== editingWallpaper.title ||
        nextCreator !== editingWallpaper.creator
      ) {
        onUpdateWallpaperMeta(editingWallpaper.id, nextTitle, nextCreator);
      }
    }
    setEditingTagsId(null);
  };

  const closeTagEditorRef = useRef(closeTagEditor);
  closeTagEditorRef.current = closeTagEditor;

  useEffect(() => {
    const onSubBack = (e: Event) => {
      if (editingTagsId) {
        e.preventDefault();
        const targetId = editingTagsId;
        closeTagEditorRef.current();
        if (!actionCardId) {
          focusCardById(targetId);
        }
        return;
      }
      if (openFilterMenu) {
        e.preventDefault();
        const trigger =
          openFilterMenu === 'category'
            ? categoryBtnRef.current
            : weatherBtnRef.current;
        setOpenFilterMenu(null);
        requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
        return;
      }
      if (actionCardId) {
        e.preventDefault();
        const cardId = actionCardId;
        setActionCardId(null);
        focusCardById(cardId);
      }
    };
    window.addEventListener('tv-modal-subback', onSubBack);
    return () => window.removeEventListener('tv-modal-subback', onSubBack);
  }, [editingTagsId, openFilterMenu, actionCardId, focusCardById]);

  const visibleWallpapers = useMemo(() => {
    return allCombined.filter((item) => {
      if (browseFilter === 'local-album' && item.sourceType !== 'local-album') return false;
      if (browseFilter === 'custom-urls' && item.sourceType !== 'custom-urls') return false;
      if (
        browseFilter !== 'all' &&
        browseFilter !== 'local-album' &&
        browseFilter !== 'custom-urls' &&
        !(item.sourceType === 'curated' && item.category === browseFilter)
      ) {
        return false;
      }

      if (weatherFilter === 'all') return true;
      const tags = getEffectiveWeatherTags(item, weatherTagsMap);
      if (weatherFilter === 'matches-now') {
        if (!activeWeatherTag || activeWeatherTag === 'none') return true;
        return tags.includes(activeWeatherTag) || tags.includes('none');
      }
      return tags.includes(weatherFilter);
    });
  }, [allCombined, browseFilter, weatherFilter, weatherTagsMap, activeWeatherTag]);

  const poolCounts = useMemo(() => {
    const counts: Record<SlideshowPoolKey, number> = {
      nature: 0,
      landscape: 0,
      seascapes: 0,
      animals: 0,
      space: 0,
      satellite: 0,
      'classical-art': 0,
      'abstract-art': 0,
      'ink-art': 0,
      architecture: 0,
      geometric: 0,
      'local-album': localWallpapers.length,
      'custom-urls': customUrlWallpapers.length,
    };
    for (const item of curatedWallpapers) {
      if (item.category) counts[item.category] += 1;
    }
    return counts;
  }, [curatedWallpapers, localWallpapers.length, customUrlWallpapers.length]);

  const refreshCategory: CuratedCategory | undefined =
    browseFilter !== 'all' &&
    browseFilter !== 'local-album' &&
    browseFilter !== 'custom-urls'
      ? browseFilter
      : undefined;

  const currentCategoryLabel =
    browseFilter === 'all'
      ? `All Categories (${allCombined.length})`
      : browseFilter === 'local-album'
      ? `Local Photos (${localWallpapers.length})`
      : browseFilter === 'custom-urls'
      ? `Custom URLs (${customUrlWallpapers.length})`
      : `${CURATED_CATEGORY_LABELS[browseFilter]} (${poolCounts[browseFilter]})`;

  const currentWeatherLabel =
    weatherFilter === 'all'
      ? 'Weather: All'
      : weatherFilter === 'matches-now'
      ? activeWeatherTag
        ? `Matches Now (${WEATHER_TAG_LABELS[activeWeatherTag]})`
        : 'Matches Now'
      : `Weather: ${WEATHER_TAG_LABELS[weatherFilter]}`;

  const categoryOptions: Array<{ value: AlbumBrowseFilter; label: string; count: number }> = [
    { value: 'all', label: 'All Categories', count: allCombined.length },
    ...CURATED_CATEGORIES.map((cat) => ({
      value: cat,
      label: CURATED_CATEGORY_LABELS[cat],
      count: poolCounts[cat],
    })),
    { value: 'local-album', label: 'Local Photos', count: localWallpapers.length },
    { value: 'custom-urls', label: 'Custom URLs', count: customUrlWallpapers.length },
  ];

  const weatherOptions: Array<{
    value: 'all' | 'matches-now' | WeatherTag;
    label: string;
  }> = [
    { value: 'all', label: 'Weather: All' },
    ...(activeWeatherTag
      ? [
          {
            value: 'matches-now' as const,
            label: `Matches Now (${WEATHER_TAG_LABELS[activeWeatherTag]})`,
          },
        ]
      : []),
    ...WEATHER_TAG_OPTIONS.map((opt) => ({
      value: opt.id,
      label: `Weather: ${opt.label}`,
    })),
  ];

  const topTabs: Array<{ id: AlbumSectionTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'images', label: `Images (${visibleWallpapers.length})`, icon: ImageIcon },
    { id: 'slideshow', label: 'Slideshow & Pools', icon: SlidersHorizontal },
    { id: 'sources', label: 'Local & URLs', icon: LinkIcon },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Background Album Picker"
    >
      <div className="tv-surface flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0F121A]/95 shadow-2xl backdrop-blur-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-base font-semibold text-white sm:text-lg">
              Background Albums
            </h2>
            <p className="mt-0.5 truncate text-xs text-white/60">
              {allCombined.length} wallpapers · {activePoolCount} in active slideshow
            </p>
          </div>
          <button
            type="button"
            data-dialog-close="true"
            onClick={onClose}
            aria-label="Close Background Albums"
            className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Section Tabs (opens on Images so remote hits gallery in 1-2 clicks) */}
        <div
          role="tablist"
          aria-label="Album settings sections"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-5 py-2.5 sm:px-6"
        >
          {topTabs.map((t) => {
            const Icon = t.icon;
            const active = sectionTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActionCardId(null);
                  setOpenFilterMenu(null);
                  setSectionTab(t.id);
                }}
                className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm ${
                  active
                    ? 'bg-white font-semibold text-[#07080A]'
                    : 'bg-white/6 text-white/75 hover:bg-white/12 hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Section Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6 sm:p-5 sm:pb-6">
          {sectionTab === 'images' && (
            <div className="space-y-4">
              {/* Compact 3-stop Filter Row */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  ref={categoryBtnRef}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={openFilterMenu === 'category'}
                  aria-label="Filter by album category"
                  onClick={() => {
                    setActionCardId(null);
                    setOpenFilterMenu('category');
                  }}
                  className="inline-flex min-h-[42px] min-w-[170px] flex-1 items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#161B26] px-3.5 text-left text-xs font-medium text-white hover:border-white/30 hover:bg-[#1C2230] sm:max-w-xs sm:text-sm"
                >
                  <span className="truncate">{currentCategoryLabel}</span>
                  <ChevronDown size={15} className="shrink-0 text-white/65" />
                </button>

                <button
                  ref={weatherBtnRef}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={openFilterMenu === 'weather'}
                  aria-label="Filter by weather tag"
                  onClick={() => {
                    setActionCardId(null);
                    setOpenFilterMenu('weather');
                  }}
                  className="inline-flex min-h-[42px] min-w-[160px] flex-1 items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#161B26] px-3.5 text-left text-xs font-medium text-white hover:border-white/30 hover:bg-[#1C2230] sm:max-w-xs sm:text-sm"
                >
                  <span className="truncate">{currentWeatherLabel}</span>
                  <ChevronDown size={15} className="shrink-0 text-white/65" />
                </button>

                <button
                  type="button"
                  disabled={refreshingCatalog}
                  onClick={() => {
                    setActionCardId(null);
                    void onRefreshCatalog(refreshCategory);
                  }}
                  className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3.5 text-xs font-medium whitespace-nowrap text-white/90 hover:bg-white/15 disabled:opacity-50 sm:text-sm"
                >
                  <RefreshCw
                    size={14}
                    className={refreshingCatalog ? 'animate-spin' : ''}
                  />
                  <span>
                    {refreshingCatalog
                      ? 'Updating…'
                      : refreshCategory
                      ? `Refresh ${CURATED_CATEGORY_LABELS[refreshCategory]}`
                      : 'Refresh Catalog'}
                  </span>
                </button>
              </div>

              {/* Wallpaper 16:9 Grid (1 focus stop per card; OK opens Set Background / Edit Tags / Delete, Back returns to grid) */}
              {visibleWallpapers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center text-xs text-white/60 sm:text-sm">
                  No images match these filters. Try switching category or weather filter above.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  {visibleWallpapers.map((item) => {
                    const isSelected = item.id === activeWallpaperId;
                    const isEditing = item.id === editingTagsId;
                    const isActionOpen = item.id === actionCardId;
                    const isBroken = Boolean(brokenIds[item.id]);
                    const categoryText =
                      item.sourceType === 'curated' && item.category
                        ? CURATED_CATEGORY_LABELS[item.category]
                        : item.sourceType === 'local-album'
                        ? 'Local Album'
                        : 'Image URL';

                    const tagsText = getEffectiveWeatherTags(item, weatherTagsMap)
                      .map((t) => WEATHER_TAG_LABELS[t])
                      .join(', ');

                    return (
                      <div
                        key={item.id}
                        className={`group relative rounded-2xl border transition-all focus-within:border-white focus-within:ring-2 focus-within:ring-white/80 ${
                          isSelected
                            ? 'border-white/65 ring-1 ring-white/35'
                            : isEditing || isActionOpen
                            ? 'border-white/75'
                            : 'border-white/15 hover:border-white/35'
                        }`}
                      >
                        <button
                          type="button"
                          data-album-card={item.id}
                          tabIndex={isActionOpen ? -1 : 0}
                          onClick={() => setActionCardId(item.id)}
                          aria-label={`${item.title}. ${isSelected ? 'Currently active. ' : ''}Press OK for options`}
                          className="block w-full overflow-hidden rounded-2xl text-left"
                        >
                          <div className="relative aspect-video w-full overflow-hidden bg-black/50">
                            {!isBroken ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBrokenIds((prev) => ({
                                    ...prev,
                                    [item.id]: true,
                                  }))
                                }
                                style={
                                  item.cropScale
                                    ? { transform: `scale(${item.cropScale})` }
                                    : undefined
                                }
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#161c28] to-[#0a0d13] p-3 text-center text-white/55">
                                <ImageIcon size={20} />
                                <span className="line-clamp-1 text-[11px]">{item.title}</span>
                              </div>
                            )}

                            {isSelected && (
                              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-[10px] font-semibold text-[#07080A] shadow">
                                <Check size={11} strokeWidth={3} />
                                Active
                              </span>
                            )}
                          </div>
                          <div className="bg-black/65 px-3 py-2">
                            <p className="truncate text-xs font-medium text-white sm:text-sm">
                              {item.title}
                            </p>
                            <p className="truncate text-[11px] text-white/60">
                              {categoryText} · {item.creator}
                            </p>
                            <p className="truncate text-[11px] text-white/45">
                              Weather: {tagsText}
                            </p>
                          </div>
                        </button>

                        {isActionOpen && (
                          <div
                            role="dialog"
                            aria-modal="true"
                            aria-label={`Actions for ${item.title}`}
                            className="absolute inset-0 z-10 flex flex-col justify-center gap-1.5 overflow-hidden rounded-2xl bg-[#090C13]/92 p-2.5 backdrop-blur-sm"
                          >
                            <button
                              type="button"
                              data-autofocus="true"
                              onClick={() => {
                                onSelectWallpaper(item.id);
                                setActionCardId(null);
                                focusCardById(item.id);
                              }}
                              className={`flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
                                isSelected
                                  ? 'bg-white text-[#07080A]'
                                  : 'border border-white/20 bg-white/12 text-white hover:bg-white/20'
                              }`}
                            >
                              <Check size={13} />
                              <span>{isSelected ? 'Active' : 'Set Background'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openTagEditor(item)}
                              className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-medium text-white hover:bg-white/20"
                            >
                              <Tag size={13} />
                              <span>Edit Tags</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const curIdx = visibleWallpapers.findIndex(
                                  (w) => w.id === item.id
                                );
                                const nextNeighbor =
                                  visibleWallpapers[curIdx + 1]?.id ??
                                  visibleWallpapers[curIdx - 1]?.id ??
                                  null;
                                if (editingTagsId === item.id) setEditingTagsId(null);
                                setActionCardId(null);
                                if (item.sourceType === 'local-album') {
                                  void onDeleteLocalPhoto(item.id);
                                } else if (item.sourceType === 'custom-urls') {
                                  onRemoveCustomUrl(item.id);
                                } else {
                                  onHideCuratedWallpaper(item.id);
                                }
                                if (nextNeighbor) {
                                  focusCardById(nextNeighbor);
                                } else {
                                  requestAnimationFrame(() =>
                                    categoryBtnRef.current?.focus({ preventScroll: true })
                                  );
                                }
                              }}
                              className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/20 px-2.5 text-xs font-medium text-red-100 hover:bg-red-500/35"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {sectionTab === 'slideshow' && (
            <div className="space-y-4">
              {/* Sync Background to Weather */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white">
                    <CloudSun size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">
                      Sync Background to Weather
                    </div>
                    <p className="mt-0.5 text-xs text-white/60">
                      {syncBackgroundToWeather
                        ? activeWeatherTag
                          ? `Active (${WEATHER_TAG_LABELS[activeWeatherTag]}) · Slideshow uses ${WEATHER_TAG_LABELS[activeWeatherTag]} & None (${activePoolCount} ready${
                              usedWeatherFallback ? ', fallback active' : ''
                            })`
                          : `Enabled · Waiting for weather forecast (${activePoolCount} ready)`
                        : `Off · Rotating all ${activePoolCount} checked slideshow images`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleSyncWeather}
                  className={`min-h-[40px] shrink-0 rounded-xl px-4 text-xs font-semibold transition-colors ${
                    syncBackgroundToWeather
                      ? 'bg-white text-[#07080A]'
                      : 'border border-white/15 bg-white/8 text-white hover:bg-white/15'
                  }`}
                >
                  {syncBackgroundToWeather ? 'Synced' : 'Off'}
                </button>
              </div>

              {/* Slideshow Auto-Advance */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
                <span className="text-xs font-medium text-white/90 sm:text-sm">
                  Slideshow Auto-Advance
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { sec: 0, label: 'Off' },
                    { sec: 20, label: '20s' },
                    { sec: 45, label: '45s' },
                    { sec: 90, label: '90s' },
                    { sec: 120, label: '120s' },
                    { sec: 180, label: '180s' },
                    { sec: 240, label: '240s' },
                  ].map((opt) => (
                    <button
                      key={opt.sec}
                      type="button"
                      onClick={() => onChangeSlideshowInterval(opt.sec)}
                      className={`min-h-[38px] rounded-xl px-3 text-xs font-medium transition-colors ${
                        slideshowIntervalSec === opt.sec
                          ? 'bg-white font-semibold text-[#07080A]'
                          : 'border border-white/15 bg-white/5 text-white/75 hover:bg-white/12'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Slideshow Pools */}
              <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white sm:text-sm">
                      Include in Active Slideshow
                    </div>
                    <p className="mt-0.5 text-xs text-white/55">
                      Pick curated categories, local photos, and custom URLs
                    </p>
                  </div>
                  {removedCuratedCount > 0 && (
                    <button
                      type="button"
                      onClick={onRestoreCuratedWallpapers}
                      className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/8 px-3 text-xs font-medium text-white/90 hover:bg-white/15"
                    >
                      Restore Removed ({removedCuratedCount})
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(Object.keys(SLIDESHOW_POOL_LABELS) as SlideshowPoolKey[]).map(
                    (key) => {
                      const checked = slideshowPools[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => onToggleSlideshowPool(key)}
                          className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                            checked
                              ? 'border-white/35 bg-white/12 text-white'
                              : 'border-white/10 bg-black/25 text-white/60 hover:bg-white/5'
                          }`}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                checked
                                  ? 'border-white bg-white text-[#07080A]'
                                  : 'border-white/35 bg-transparent'
                              }`}
                            >
                              {checked && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className="truncate font-medium">
                              {SLIDESHOW_POOL_LABELS[key]}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] text-white/50 tabular-nums">
                            {poolCounts[key]}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          )}

          {sectionTab === 'sources' && (
            <div className="space-y-4">
              {/* Local Device Photos */}
              <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-white">
                      Local Device Photos ({localWallpapers.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-white/60">
                      Add photos or an album folder from this device (defaults to weather tag None).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => multiPhotoInputRef.current?.click()}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90 disabled:opacity-50"
                    >
                      <ImagePlus size={15} />
                      <span>{uploading ? 'Saving…' : 'Select Photos'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => folderInputRef.current?.click()}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-white/20 bg-white/8 px-4 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50"
                    >
                      <FolderOpen size={15} />
                      <span>Select Folder</span>
                    </button>

                    {localWallpapers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void onClearLocalAlbum()}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3.5 text-xs font-medium text-red-200 hover:bg-red-500/20"
                      >
                        <Trash2 size={14} />
                        <span>Clear Local</span>
                      </button>
                    )}
                  </div>
                </div>

                <input
                  ref={multiPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                  className="hidden"
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Custom Image URLs */}
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = urlInput.trim();
                  if (!isSafeHttpUrl(trimmed)) {
                    setUrlError('Enter a valid http:// or https:// image URL.');
                    return;
                  }
                  setUrlError(null);
                  onAddCustomUrl(
                    trimmed,
                    titleInput.trim() || 'Custom Backdrop',
                    creatorInput.trim() || 'Web Image'
                  );
                  setUrlInput('');
                  setTitleInput('');
                  setCreatorInput('');
                  setBrowseFilter('custom-urls');
                  setSectionTab('images');
                }}
                className="space-y-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4"
              >
                <div>
                  <h3 className="text-sm font-medium text-white">
                    Add Custom Image URL ({customUrlWallpapers.length} saved)
                  </h3>
                  <p className="mt-0.5 text-xs text-white/60">
                    Paste a direct landscape image link. Press Back or Left/Up arrows at the start of any field to move focus cleanly.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    type="text"
                    inputMode="url"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (urlError) setUrlError(null);
                      if (urlPasteNotice) setUrlPasteNotice(null);
                    }}
                    placeholder="https://example.com/backdrop.jpg"
                    aria-label="Image URL"
                    className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
                  />
                  <button
                    ref={customUrlQrBtnRef}
                    type="button"
                    onClick={() => setShowUrlQrModal(true)}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-white/8 px-3.5 text-xs font-medium text-white hover:bg-white/15"
                  >
                    <QrCode size={14} />
                    <span>Phone QR</span>
                  </button>
                  <button
                    ref={customUrlAddBtnRef}
                    type="submit"
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
                  >
                    <LinkIcon size={14} />
                    <span>Add Image URL</span>
                  </button>
                </div>

                {urlError && <p className="text-xs text-amber-300">{urlError}</p>}
                {urlPasteNotice && !urlError && (
                  <p className="text-xs text-emerald-300">{urlPasteNotice}</p>
                )}

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Title (optional)"
                    aria-label="Custom image title"
                    className="min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3.5 text-xs text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={creatorInput}
                    onChange={(e) => setCreatorInput(e.target.value)}
                    placeholder="Creator / Album (optional)"
                    aria-label="Custom image creator"
                    className="min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3.5 text-xs text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
                  />
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Category & Weather Filter Dropdown Sub-Dialogs (OK-openable & D-pad navigable) */}
      {openFilterMenu && (
        <div
          onClick={() => {
            const trigger =
              openFilterMenu === 'category'
                ? categoryBtnRef.current
                : weatherBtnRef.current;
            setOpenFilterMenu(null);
            requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={
            openFilterMenu === 'category'
              ? 'Select Album Category'
              : 'Select Weather Filter'
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="tv-surface flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/20 bg-[#111520]/95 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <h3 className="font-display text-sm font-semibold text-white sm:text-base">
                {openFilterMenu === 'category'
                  ? 'Filter by Category'
                  : 'Filter by Weather'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  const trigger =
                    openFilterMenu === 'category'
                      ? categoryBtnRef.current
                      : weatherBtnRef.current;
                  setOpenFilterMenu(null);
                  requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
                }}
                aria-label="Close filter dropdown"
                className="flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3.5 sm:p-4">
              {openFilterMenu === 'category'
                ? categoryOptions.map((opt) => {
                    const selected = browseFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-autofocus={selected ? 'true' : undefined}
                        onClick={() => {
                          setBrowseFilter(opt.value);
                          setActionCardId(null);
                          setOpenFilterMenu(null);
                          requestAnimationFrame(() =>
                            categoryBtnRef.current?.focus({ preventScroll: true })
                          );
                        }}
                        className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-left text-xs transition-colors sm:text-sm ${
                          selected
                            ? 'bg-white font-semibold text-[#07080A]'
                            : 'bg-white/5 text-white/85 hover:bg-white/12 hover:text-white'
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                          {selected && <Check size={14} strokeWidth={2.8} className="shrink-0" />}
                          <span className="truncate">{opt.label}</span>
                        </span>
                        <span
                          className={`shrink-0 text-xs tabular-nums ${
                            selected ? 'text-[#07080A]/75' : 'text-white/50'
                          }`}
                        >
                          {opt.count}
                        </span>
                      </button>
                    );
                  })
                : weatherOptions.map((opt) => {
                    const selected = weatherFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-autofocus={selected ? 'true' : undefined}
                        onClick={() => {
                          setWeatherFilter(opt.value);
                          setActionCardId(null);
                          setOpenFilterMenu(null);
                          requestAnimationFrame(() =>
                            weatherBtnRef.current?.focus({ preventScroll: true })
                          );
                        }}
                        className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-left text-xs transition-colors sm:text-sm ${
                          selected
                            ? 'bg-white font-semibold text-[#07080A]'
                            : 'bg-white/5 text-white/85 hover:bg-white/12 hover:text-white'
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                          {selected && <Check size={14} strokeWidth={2.8} className="shrink-0" />}
                          <span className="truncate">{opt.label}</span>
                        </span>
                      </button>
                    );
                  })}
            </div>
          </div>
        </div>
      )}

      {/* Weather Tag Editor Dialog displayed cleanly over the modal */}
      {editingWallpaper && (
        <div
          onClick={closeTagEditor}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit Weather Tags for ${editingWallpaper.title}`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="tv-surface max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/20 bg-[#111520]/95 p-5 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="w-full shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-black/50 sm:w-48">
                <div className="aspect-video w-full overflow-hidden">
                  <img
                    src={editingWallpaper.imageUrl}
                    alt={editingWallpaper.title}
                    referrerPolicy="no-referrer"
                    style={
                      editingWallpaper.cropScale
                        ? { transform: `scale(${editingWallpaper.cropScale})` }
                        : undefined
                    }
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-semibold text-white">
                    {(editingWallpaper.sourceType === 'local-album' ||
                      editingWallpaper.sourceType === 'custom-urls')
                      ? editTitle || editingWallpaper.title
                      : editingWallpaper.title}
                  </p>
                  <p className="truncate text-[11px] text-white/55">
                    {(editingWallpaper.sourceType === 'local-album' ||
                      editingWallpaper.sourceType === 'custom-urls')
                      ? editCreator || editingWallpaper.creator
                      : editingWallpaper.creator}
                  </p>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">
                      Edit Background Details & Weather Tags
                    </h3>
                    <p className="mt-0.5 text-xs text-white/55">
                      Pick multiple conditions or None to show in any weather
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeTagEditor}
                    aria-label="Close weather tag editor"
                    className="flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                {(editingWallpaper.sourceType === 'local-album' ||
                  editingWallpaper.sourceType === 'custom-urls') && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="edit-bg-title"
                        className="mb-1 block text-[11px] font-medium text-white/65"
                      >
                        Title
                      </label>
                      <input
                        id="edit-bg-title"
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title"
                        className="min-h-[38px] w-full rounded-xl border border-white/15 bg-black/45 px-3 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-bg-creator"
                        className="mb-1 block text-[11px] font-medium text-white/65"
                      >
                        Creator / Album
                      </label>
                      <input
                        id="edit-bg-creator"
                        type="text"
                        value={editCreator}
                        onChange={(e) => setEditCreator(e.target.value)}
                        placeholder="Creator / Album"
                        className="min-h-[38px] w-full rounded-xl border border-white/15 bg-black/45 px-3 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {WEATHER_TAG_OPTIONS.map((opt) => {
                    const currentTags = getEffectiveWeatherTags(
                      editingWallpaper,
                      weatherTagsMap
                    );
                    const selected = currentTags.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onToggleImageWeatherTag(editingWallpaper.id, opt.id)
                        }
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-white bg-white font-semibold text-[#07080A]'
                            : 'border-white/15 bg-white/6 text-white/80 hover:bg-white/12'
                        }`}
                      >
                        {selected && <Check size={13} strokeWidth={2.5} />}
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeTagEditor}
                    className="min-h-[38px] rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUrlQrModal && (
        <QrPasteModal
          fieldLabel="Custom Wallpaper Image URL"
          onReceiveUrl={(receivedUrl) => {
            setUrlInput(receivedUrl);
            setUrlError(null);
            setUrlPasteNotice(
              'Pasted from phone — review the URL and select Add Image URL to save.'
            );
            requestAnimationFrame(() =>
              customUrlAddBtnRef.current?.focus({ preventScroll: true })
            );
          }}
          onClose={() => {
            setShowUrlQrModal(false);
            requestAnimationFrame(() => {
              if (
                document.activeElement === document.body ||
                !document.activeElement
              ) {
                customUrlQrBtnRef.current?.focus({ preventScroll: true });
              }
            });
          }}
        />
      )}
    </div>
  );
};

interface QrDetailModalProps {
  wallpaper: WallpaperItem;
  onClose: () => void;
}

export const QrDetailModal: React.FC<QrDetailModalProps> = ({
  wallpaper,
  onClose,
}) => {
  const isHttp = isSafeHttpUrl(wallpaper.sourceUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Background Artwork Details"
    >
      <div className="tv-surface max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/15 bg-[#10131C]/95 p-6 text-center shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-white/55">Artwork Details</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close artwork details"
            className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mx-auto mt-2 flex justify-center">
          <QrCodeSvg value={wallpaper.sourceUrl} size={172} />
        </div>
        <h3 className="font-display mt-4 text-lg font-semibold text-white">
          {wallpaper.title}
        </h3>
        {wallpaper.creator && (
          <p className="mt-1 text-sm text-white/70">{wallpaper.creator}</p>
        )}
        <p className="mt-2 break-all text-xs text-white/45">{wallpaper.sourceUrl}</p>
        {isHttp && (
          <a
            href={wallpaper.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-5 text-xs font-semibold text-[#07080A] hover:bg-white/90"
          >
            <span>Open Source Page</span>
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
};
