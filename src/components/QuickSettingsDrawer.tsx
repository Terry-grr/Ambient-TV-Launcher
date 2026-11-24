import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Bluetooth,
  ChevronRight,
  CloudSun,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  Monitor,
  Plus,
  Radio,
  Settings,
  SlidersHorizontal,
  Wifi,
  X,
} from 'lucide-react';
import { TV_INPUTS, WIFI_NETWORKS } from '../data/defaults';
import {
  BluetoothDevice,
  FerrofluidIntensity,
  LauncherSettings,
  WeatherState,
} from '../types/launcher';
import { FerrofluidAura } from './FerrofluidAura';

export interface QuickSettingsHandle {
  moveFocus: (dir: 'up' | 'down' | 'left' | 'right') => boolean;
  activateFocused: () => void;
}

interface QuickSettingsDrawerProps {
  isOpen: boolean;
  focusedIndex: number | null;
  onFocusIndex: (index: number | null) => void;
  settings: LauncherSettings;
  weather: WeatherState;
  isNativeAndroid?: boolean;
  btPermissionRequired?: boolean;
  btLoading?: boolean;
  onExpandBluetooth?: () => void;
  onToggleBluetoothRadio: () => void;
  onToggleBluetoothDevice: (device: BluetoothDevice) => void;
  onOpenBluetoothSettings: () => void;
  onRequestBluetoothPermission?: () => void;
  onUpdateSettings: (patch: Partial<LauncherSettings>) => void;
  onToggleWeather: () => void;
  onOpenFullSettings: (tab?: 'general' | 'weather' | 'albums' | 'apps' | 'github') => void;
  onOpenSystemSettings: () => void;
  onOpenAlbumPicker: () => void;
  onNextWallpaper: () => void;
  onClose: () => void;
  liteMode?: boolean;
}

const ROW_IDS = [
  'qs-main',
  'qs-inputs',
  'qs-wifi',
  'qs-bluetooth',
  'qs-weather',
  'qs-albums',
  'qs-display',
] as const;

function renderBluetoothDeviceIcon(type: BluetoothDevice['type']) {
  if (type === 'audio') return <Headphones size={15} className="shrink-0 text-white/75" />;
  if (type === 'gamepad') return <Gamepad2 size={15} className="shrink-0 text-white/75" />;
  if (type === 'remote') return <Radio size={15} className="shrink-0 text-white/75" />;
  return <Bluetooth size={15} className="shrink-0 text-white/75" />;
}

export const QuickSettingsDrawer = forwardRef<
  QuickSettingsHandle,
  QuickSettingsDrawerProps
>(
  (
    {
      isOpen,
      focusedIndex,
      onFocusIndex,
      settings,
      weather,
      isNativeAndroid = false,
      btPermissionRequired = false,
      btLoading = false,
      onExpandBluetooth,
      onToggleBluetoothRadio,
      onToggleBluetoothDevice,
      onOpenBluetoothSettings,
      onRequestBluetoothPermission,
      onUpdateSettings,
      onToggleWeather,
      onOpenFullSettings,
      onOpenSystemSettings,
      onOpenAlbumPicker,
      onNextWallpaper,
      onClose,
      liteMode = false,
    },
    ref
  ) => {
    const asideRef = useRef<HTMLElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [expandedPanel, setExpandedPanel] = useState<
      'inputs' | 'wifi' | 'bluetooth' | 'display' | null
    >(null);
    const [focusedControlId, setFocusedControlId] = useState<string>('qs-main');
    const focusedControlIdRef = useRef<string>('qs-main');
    focusedControlIdRef.current = focusedControlId;

    const syncFocusToElement = useCallback(
      (el: HTMLElement | null, scroll = true) => {
        if (!el) return;
        const id = el.getAttribute('data-qs-id');
        if (!id) return;
        focusedControlIdRef.current = id;
        setFocusedControlId(id);
        const rowIdx = ROW_IDS.indexOf(id as (typeof ROW_IDS)[number]);
        onFocusIndex(rowIdx >= 0 ? rowIdx : null);
        el.focus({ preventScroll: true });
        if (scroll) {
          if (id === 'qs-close' || id === 'qs-main') {
            listRef.current?.scrollTo({
              top: 0,
              behavior: liteMode ? 'auto' : 'smooth',
            });
          } else {
            el.scrollIntoView({
              block: 'nearest',
              inline: 'nearest',
              behavior: liteMode ? 'auto' : 'smooth',
            });
          }
        }
      },
      [liteMode, onFocusIndex]
    );

    const getOrderedItems = useCallback((): HTMLElement[] => {
      const root = asideRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('[data-qs-id]')).filter(
        (el) => {
          if ((el as HTMLButtonElement).disabled) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
      );
    }, []);

    const onFocusIndexRef = useRef(onFocusIndex);
    onFocusIndexRef.current = onFocusIndex;

    useEffect(() => {
      if (!isOpen) return;
      focusedControlIdRef.current = 'qs-main';
      setFocusedControlId((prev) => (prev === 'qs-main' ? prev : 'qs-main'));
      onFocusIndexRef.current(0);
      const focusMain = () => {
        const mainBtn = rowRefs.current['qs-main'];
        if (mainBtn && document.activeElement !== mainBtn) {
          mainBtn.focus({ preventScroll: true });
        }
        listRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      };
      focusMain();
      const t = window.setTimeout(focusMain, 25);
      return () => window.clearTimeout(t);
    }, [isOpen]);

    useImperativeHandle(
      ref,
      () => ({
        moveFocus: (dir) => {
          const items = getOrderedItems();
          if (items.length === 0) return false;

          const curId = focusedControlIdRef.current;
          let curIdx = items.findIndex(
            (el) => el.getAttribute('data-qs-id') === curId
          );
          if (curIdx === -1) {
            const active = document.activeElement as HTMLElement | null;
            curIdx = active ? items.indexOf(active) : -1;
          }
          if (curIdx === -1) {
            curIdx = Math.max(
              0,
              items.findIndex((el) => el.getAttribute('data-qs-id') === 'qs-main')
            );
          }

          const currentEl = items[curIdx];
          if (!currentEl) return false;

          if (dir === 'up') {
            const nextEl = items[Math.max(0, curIdx - 1)];
            if (nextEl) syncFocusToElement(nextEl);
            return true;
          }

          if (dir === 'down') {
            const nextEl = items[Math.min(items.length - 1, curIdx + 1)];
            if (nextEl) syncFocusToElement(nextEl);
            return true;
          }

          if (currentEl instanceof HTMLInputElement && currentEl.type === 'range') {
            const min = Number(currentEl.min || '0');
            const max = Number(currentEl.max || '100');
            const step = Math.max(1, Number(currentEl.step || '5'));
            const cur = Number(currentEl.value);
            const next =
              dir === 'left'
                ? Math.max(min, cur - step)
                : Math.min(max, cur + step);
            if (next !== cur) {
              const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value'
              )?.set;
              setter?.call(currentEl, String(next));
              currentEl.dispatchEvent(new Event('input', { bubbles: true }));
              currentEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          }

          const currentId = currentEl.getAttribute('data-qs-id');
          if (dir === 'right' && currentId === 'qs-next-wallpaper') {
            const fullBtn = items.find(
              (el) => el.getAttribute('data-qs-id') === 'qs-full-settings'
            );
            if (fullBtn) {
              syncFocusToElement(fullBtn);
              return true;
            }
          }
          if (dir === 'left' && currentId === 'qs-full-settings') {
            const nextWpBtn = items.find(
              (el) => el.getAttribute('data-qs-id') === 'qs-next-wallpaper'
            );
            if (nextWpBtn) {
              syncFocusToElement(nextWpBtn);
              return true;
            }
          }

          if (dir === 'right') {
            return false;
          }
          return true;
        },
        activateFocused: () => {
          const items = getOrderedItems();
          const curId = focusedControlIdRef.current;
          const target =
            items.find((el) => el.getAttribute('data-qs-id') === curId) ??
            items.find((el) => el.getAttribute('data-qs-id') === 'qs-main') ??
            items[0];
          if (!target) return;
          if (target instanceof HTMLInputElement && target.type === 'range') {
            target.focus({ preventScroll: true });
          } else {
            target.click();
          }
        },
      }),
      [getOrderedItems, syncFocusToElement]
    );

    const getRowEl = useCallback((key: string) => rowRefs.current[key] ?? null, []);

    const cycleIntensity = (): FerrofluidIntensity => {
      if (settings.ferrofluidIntensity === 'subtle') return 'balanced';
      if (settings.ferrofluidIntensity === 'balanced') return 'vivid';
      return 'subtle';
    };

    const connectedBtCount = settings.bluetoothDevices.filter((d) => d.connected).length;

    const rows = [
      {
        id: 'qs-main',
        label: 'Main Settings',
        sub: 'System, clock, albums & updates',
        icon: Settings,
        action: () => onOpenFullSettings('general'),
      },
      {
        id: 'qs-inputs',
        label: 'Inputs',
        sub: settings.activeInput,
        icon: Monitor,
        action: () => setExpandedPanel((p) => (p === 'inputs' ? null : 'inputs')),
      },
      {
        id: 'qs-wifi',
        label: 'Wi-Fi Settings',
        sub: settings.wifiEnabled ? settings.wifiNetwork : 'Off',
        icon: Wifi,
        action: () => setExpandedPanel((p) => (p === 'wifi' ? null : 'wifi')),
      },
      {
        id: 'qs-bluetooth',
        label: 'Bluetooth',
        sub: settings.bluetoothEnabled
          ? connectedBtCount > 0
            ? `${connectedBtCount} connected · ${settings.bluetoothDevices.length} paired`
            : `${settings.bluetoothDevices.length} paired`
          : 'Off',
        icon: Bluetooth,
        action: () => {
          setExpandedPanel((p) => {
            const next = p === 'bluetooth' ? null : 'bluetooth';
            if (next === 'bluetooth') {
              onExpandBluetooth?.();
            }
            return next;
          });
        },
      },
      {
        id: 'qs-weather',
        label: 'Weather Forecast',
        sub: weather.enabled
          ? `On · ${weather.activeLocationLabel}${
              settings.syncBackgroundToWeather ? ' · Wallpaper sync on' : ''
            }`
          : 'Off · Hidden from top-right',
        icon: CloudSun,
        action: onToggleWeather,
      },
      {
        id: 'qs-albums',
        label: 'Background Albums',
        sub: 'Images, slideshow & custom sources',
        icon: ImageIcon,
        action: onOpenAlbumPicker,
      },
      {
        id: 'qs-display',
        label: 'Display Toggles',
        sub: `${settings.clockFormat.toUpperCase()} · Aura ${settings.ferrofluidIntensity}`,
        icon: SlidersHorizontal,
        action: () => setExpandedPanel((p) => (p === 'display' ? null : 'display')),
      },
    ];

    if (!isOpen) return null;

    const handleControlFocus = (id: string, rowIdx: number | null) => {
      if (focusedControlIdRef.current !== id) {
        focusedControlIdRef.current = id;
        setFocusedControlId((prev) => (prev === id ? prev : id));
      }
      if (focusedIndex !== rowIdx) {
        onFocusIndex(rowIdx);
      }
    };

    return (
      <div
        className="fixed inset-0 z-40 flex justify-start"
        role="dialog"
        aria-modal="true"
        aria-label="Quick Settings"
      >
        {/* Backdrop click/tap closes drawer */}
        <div
          onClick={onClose}
          className="absolute inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
        />

        {/* Compact Slide-out Quick Settings Drawer */}
        <aside
          ref={asideRef}
          className="tv-surface relative z-10 flex h-full w-[min(86vw,380px)] flex-col border-r border-white/15 bg-[#0C0F16]/88 p-4 shadow-2xl backdrop-blur-2xl sm:w-[min(42vw,400px)] sm:p-5"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display truncate text-base font-semibold text-white sm:text-lg">
                Quick Settings
              </h2>
              <p className="truncate text-[11px] text-white/60 sm:text-xs">
                Launcher controls · Arrows or tap
              </p>
            </div>
            <button
              type="button"
              data-qs-id="qs-close"
              onFocus={() => handleControlFocus('qs-close', null)}
              onClick={onClose}
              aria-label="Close Quick Settings"
              className={`flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border transition-colors focus:outline-none ${
                focusedControlId === 'qs-close'
                  ? 'border-white bg-white/20 text-white ring-2 ring-white/80'
                  : 'border-white/12 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              <X size={17} />
            </button>
          </div>

          {/* Scrollable Quick Settings List with Selection Aura */}
          <div
            ref={listRef}
            className="no-scrollbar relative -mx-2 mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-2.5"
          >
            <FerrofluidAura
              containerRef={listRef}
              activeKey={focusedIndex !== null ? rows[focusedIndex]?.id ?? null : null}
              getElementByKey={getRowEl}
              intensity={settings.ferrofluidIntensity}
              borderRadius={14}
              variant="row"
              liteMode={liteMode}
            />

            {rows.map((row, idx) => {
              const Icon = row.icon;
              const isFocused = focusedIndex === idx;
              const isWeatherRow = row.id === 'qs-weather';
              const isExpanded =
                (row.id === 'qs-inputs' && expandedPanel === 'inputs') ||
                (row.id === 'qs-wifi' && expandedPanel === 'wifi') ||
                (row.id === 'qs-bluetooth' && expandedPanel === 'bluetooth') ||
                (row.id === 'qs-display' && expandedPanel === 'display');

              return (
                <div key={row.id} className="relative z-10">
                  <button
                    ref={(el) => {
                      rowRefs.current[row.id] = el;
                    }}
                    type="button"
                    data-qs-id={row.id}
                    onMouseEnter={() => handleControlFocus(row.id, idx)}
                    onFocus={() => handleControlFocus(row.id, idx)}
                    onClick={() => {
                      handleControlFocus(row.id, idx);
                      row.action();
                    }}
                    className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none sm:min-h-[52px]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors sm:h-9 sm:w-9 ${
                          isFocused
                            ? 'border-white/30 bg-white/15 text-white'
                            : 'border-white/10 bg-white/5 text-white/75'
                        }`}
                      >
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-white sm:text-sm">
                          {row.label}
                        </div>
                        <div className="truncate text-[11px] text-white/60 sm:text-xs">
                          {row.sub}
                        </div>
                      </div>
                    </div>

                    {isWeatherRow ? (
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors ${
                          weather.enabled
                            ? 'justify-end border-white/40 bg-white/85'
                            : 'justify-start border-white/15 bg-white/10'
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full transition-colors ${
                            weather.enabled ? 'bg-[#090B10]' : 'bg-white/60'
                          }`}
                        />
                      </span>
                    ) : (
                      <ChevronRight
                        size={16}
                        className={`shrink-0 transition-transform ${
                          isExpanded
                            ? 'rotate-90 text-white'
                            : isFocused
                            ? 'translate-x-0.5 text-white'
                            : 'text-white/45'
                        }`}
                      />
                    )}
                  </button>

                  {/* Inputs Panel */}
                  {row.id === 'qs-inputs' && expandedPanel === 'inputs' && (
                    <div className="mt-1 mb-1.5 space-y-1 rounded-xl border border-white/10 bg-black/35 p-2">
                      {TV_INPUTS.map((inp, i) => {
                        const subId = `qs-input-${i}`;
                        const subFocused = focusedControlId === subId;
                        return (
                          <button
                            key={inp.id}
                            type="button"
                            data-qs-id={subId}
                            onFocus={() => handleControlFocus(subId, null)}
                            onClick={() => {
                              handleControlFocus(subId, null);
                              onUpdateSettings({ activeInput: inp.name });
                            }}
                            className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors focus:outline-none ${
                              subFocused
                                ? 'border-white bg-white/20 text-white'
                                : settings.activeInput === inp.name
                                ? 'border-transparent bg-white/15 text-white'
                                : 'border-transparent text-white/75 hover:bg-white/8'
                            }`}
                          >
                            <span className="min-w-0 truncate font-medium">{inp.name}</span>
                            <span className="shrink-0 text-[11px] text-white/55">
                              {inp.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Wi-Fi Panel */}
                  {row.id === 'qs-wifi' && expandedPanel === 'wifi' && (
                    <div className="mt-1 mb-1.5 space-y-1 rounded-xl border border-white/10 bg-black/35 p-2">
                      <button
                        type="button"
                        data-qs-id="qs-wifi-toggle"
                        onFocus={() => handleControlFocus('qs-wifi-toggle', null)}
                        onClick={() => {
                          handleControlFocus('qs-wifi-toggle', null);
                          onUpdateSettings({ wifiEnabled: !settings.wifiEnabled });
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-white focus:outline-none ${
                          focusedControlId === 'qs-wifi-toggle'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8'
                        }`}
                      >
                        <span>Wi-Fi Radio</span>
                        <span className="shrink-0">{settings.wifiEnabled ? 'On' : 'Off'}</span>
                      </button>
                      {settings.wifiEnabled &&
                        WIFI_NETWORKS.map((net, i) => {
                          const subId = `qs-wifi-${i}`;
                          const subFocused = focusedControlId === subId;
                          return (
                            <button
                              key={net.ssid}
                              type="button"
                              data-qs-id={subId}
                              onFocus={() => handleControlFocus(subId, null)}
                              onClick={() => {
                                handleControlFocus(subId, null);
                                onUpdateSettings({ wifiNetwork: net.ssid });
                              }}
                              className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors focus:outline-none ${
                                subFocused
                                  ? 'border-white bg-white/20 text-white'
                                  : settings.wifiNetwork === net.ssid
                                  ? 'border-transparent bg-white/15 text-white'
                                  : 'border-transparent text-white/75 hover:bg-white/8'
                              }`}
                            >
                              <span className="min-w-0 truncate">{net.ssid}</span>
                              <span className="shrink-0 text-[11px] text-white/55">
                                {net.signal}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {/* Expandable Bluetooth Panel: Radio + Paired/Connected Devices + Disconnect/Manage + Pair Button */}
                  {row.id === 'qs-bluetooth' && expandedPanel === 'bluetooth' && (
                    <div className="mt-1 mb-1.5 space-y-1.5 rounded-xl border border-white/10 bg-black/35 p-2">
                      <button
                        type="button"
                        data-qs-id="qs-bt-toggle"
                        onFocus={() => handleControlFocus('qs-bt-toggle', null)}
                        onClick={() => {
                          handleControlFocus('qs-bt-toggle', null);
                          onToggleBluetoothRadio();
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-white focus:outline-none ${
                          focusedControlId === 'qs-bt-toggle'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8 hover:bg-white/12'
                        }`}
                      >
                        <span>Bluetooth Radio</span>
                        <span className="shrink-0 font-semibold">
                          {settings.bluetoothEnabled ? 'On' : 'Off'}
                        </span>
                      </button>

                      {isNativeAndroid && btPermissionRequired && onRequestBluetoothPermission && (
                        <button
                          type="button"
                          data-qs-id="qs-bt-perm"
                          onFocus={() => handleControlFocus('qs-bt-perm', null)}
                          onClick={() => {
                            handleControlFocus('qs-bt-perm', null);
                            onRequestBluetoothPermission();
                          }}
                          className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs text-amber-200 focus:outline-none ${
                            focusedControlId === 'qs-bt-perm'
                              ? 'border-white bg-amber-500/25'
                              : 'border-amber-300/35 bg-amber-500/12 hover:bg-amber-500/20'
                          }`}
                        >
                          <span>Allow Bluetooth Access</span>
                          <span className="shrink-0 text-[11px] font-semibold">Grant</span>
                        </button>
                      )}

                      {settings.bluetoothEnabled && !btPermissionRequired && (
                        <>
                          {btLoading ? (
                            <div className="px-3 py-2 text-xs text-white/60">
                              Scanning paired Bluetooth devices…
                            </div>
                          ) : settings.bluetoothDevices.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-white/60">
                              No paired Bluetooth devices found.
                            </div>
                          ) : (
                            settings.bluetoothDevices.map((dev, i) => {
                              const subId = `qs-bt-dev-${i}`;
                              const subFocused = focusedControlId === subId;
                              return (
                                <button
                                  key={dev.id}
                                  type="button"
                                  data-qs-id={subId}
                                  onFocus={() => handleControlFocus(subId, null)}
                                  onClick={() => {
                                    handleControlFocus(subId, null);
                                    onToggleBluetoothDevice(dev);
                                  }}
                                  className={`flex min-h-[42px] w-full items-center justify-between gap-2.5 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors focus:outline-none ${
                                    subFocused
                                      ? 'border-white bg-white/20 text-white'
                                      : dev.connected
                                      ? 'border-transparent bg-white/12 text-white hover:bg-white/18'
                                      : 'border-transparent bg-white/[0.04] text-white/75 hover:bg-white/10'
                                  }`}
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                    {renderBluetoothDeviceIcon(dev.type)}
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium text-white">
                                        {dev.name}
                                      </div>
                                      <div className="truncate text-[11px] text-white/55 tabular-nums">
                                        {dev.connected ? 'Connected' : 'Paired'}
                                        {typeof dev.battery === 'number'
                                          ? ` · ${dev.battery}%`
                                          : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 text-[11px] font-medium ${
                                      dev.connected ? 'text-white/85' : 'text-white/60'
                                    }`}
                                  >
                                    {isNativeAndroid
                                      ? dev.connected
                                        ? 'Disconnect'
                                        : 'Manage'
                                      : dev.connected
                                      ? 'Disconnect'
                                      : 'Connect'}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        data-qs-id="qs-bt-pair"
                        onFocus={() => handleControlFocus('qs-bt-pair', null)}
                        onClick={() => {
                          handleControlFocus('qs-bt-pair', null);
                          onOpenBluetoothSettings();
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-white transition-colors focus:outline-none ${
                          focusedControlId === 'qs-bt-pair'
                            ? 'border-white bg-white/20'
                            : 'border-white/15 bg-white/8 hover:bg-white/15'
                        }`}
                      >
                        <Plus size={14} />
                        <span>Pair New Device</span>
                      </button>
                    </div>
                  )}

                  {/* Display Toggles Panel (drip toggle removed) */}
                  {row.id === 'qs-display' && expandedPanel === 'display' && (
                    <div className="mt-1 mb-1.5 space-y-1.5 rounded-xl border border-white/10 bg-black/35 p-2.5">
                      <button
                        type="button"
                        data-qs-id="qs-disp-clock"
                        onFocus={() => handleControlFocus('qs-disp-clock', null)}
                        onClick={() => {
                          handleControlFocus('qs-disp-clock', null);
                          onUpdateSettings({ showClock: !settings.showClock });
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 text-xs text-white focus:outline-none ${
                          focusedControlId === 'qs-disp-clock'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8'
                        }`}
                      >
                        <span>Show Clock</span>
                        <span className="shrink-0 font-medium">
                          {settings.showClock ? 'Shown' : 'Hidden'}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-qs-id="qs-disp-format"
                        onFocus={() => handleControlFocus('qs-disp-format', null)}
                        onClick={() => {
                          handleControlFocus('qs-disp-format', null);
                          onUpdateSettings({
                            clockFormat:
                              settings.clockFormat === '12h' ? '24h' : '12h',
                          });
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 text-xs text-white focus:outline-none ${
                          focusedControlId === 'qs-disp-format'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8'
                        }`}
                      >
                        <span>Clock Format</span>
                        <span className="shrink-0 font-medium uppercase">
                          {settings.clockFormat}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-qs-id="qs-disp-aura"
                        onFocus={() => handleControlFocus('qs-disp-aura', null)}
                        onClick={() => {
                          handleControlFocus('qs-disp-aura', null);
                          onUpdateSettings({
                            ferrofluidIntensity: cycleIntensity(),
                          });
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 text-xs text-white focus:outline-none ${
                          focusedControlId === 'qs-disp-aura'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8'
                        }`}
                      >
                        <span>Selection Aura</span>
                        <span className="shrink-0 font-medium capitalize">
                          {settings.ferrofluidIntensity}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-qs-id="qs-disp-sync"
                        onFocus={() => handleControlFocus('qs-disp-sync', null)}
                        onClick={() => {
                          handleControlFocus('qs-disp-sync', null);
                          onUpdateSettings({
                            syncBackgroundToWeather: !settings.syncBackgroundToWeather,
                          });
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 text-xs text-white focus:outline-none ${
                          focusedControlId === 'qs-disp-sync'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8'
                        }`}
                      >
                        <span>Sync Background to Weather</span>
                        <span className="shrink-0 font-medium">
                          {settings.syncBackgroundToWeather ? 'On' : 'Off'}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-qs-id="qs-disp-remote"
                        onFocus={() => handleControlFocus('qs-disp-remote', null)}
                        onClick={() => {
                          handleControlFocus('qs-disp-remote', null);
                          onUpdateSettings({
                            showTouchRemote: !settings.showTouchRemote,
                          });
                        }}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 text-xs text-white focus:outline-none ${
                          focusedControlId === 'qs-disp-remote'
                            ? 'border-white bg-white/20'
                            : 'border-transparent bg-white/8'
                        }`}
                      >
                        <span>On-Screen D-Pad Remote</span>
                        <span className="shrink-0 font-medium">
                          {settings.showTouchRemote ? 'Visible' : 'Hidden'}
                        </span>
                      </button>
                      <div className="px-1 pt-1">
                        <div className="flex items-center justify-between text-xs text-white/75">
                          <span>Backdrop Scrim</span>
                          <span className="tabular-nums">
                            {Math.round(settings.scrimOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          data-qs-id="qs-disp-scrim"
                          min={30}
                          max={85}
                          onFocus={() => handleControlFocus('qs-disp-scrim', null)}
                          value={Math.round(settings.scrimOpacity * 100)}
                          onChange={(e) =>
                            onUpdateSettings({
                              scrimOpacity: Number(e.target.value) / 100,
                            })
                          }
                          aria-label="Backdrop scrim opacity"
                          className={`mt-1.5 h-2 w-full accent-white focus:outline-none ${
                            focusedControlId === 'qs-disp-scrim'
                              ? 'rounded-lg ring-2 ring-white/85'
                              : ''
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom quick actions */}
          <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              data-qs-id="qs-next-wallpaper"
              onFocus={() => handleControlFocus('qs-next-wallpaper', null)}
              onClick={onNextWallpaper}
              className={`min-h-[42px] flex-1 rounded-xl border px-3 text-xs font-medium text-white transition-colors focus:outline-none ${
                focusedControlId === 'qs-next-wallpaper'
                  ? 'border-white bg-white/20 ring-2 ring-white/80'
                  : 'border-white/15 bg-white/8 hover:bg-white/15'
              }`}
            >
              Next Wallpaper
            </button>
            <button
              type="button"
              data-qs-id="qs-full-settings"
              onFocus={() => handleControlFocus('qs-full-settings', null)}
              onClick={onOpenSystemSettings}
              aria-label="Open Android TV System Settings"
              className={`min-h-[42px] flex-1 rounded-xl bg-white px-3 text-xs font-semibold text-[#07080A] hover:bg-white/90 focus:outline-none ${
                focusedControlId === 'qs-full-settings'
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0C0F16]'
                  : ''
              }`}
            >
              Full Settings
            </button>
          </div>
        </aside>
      </div>
    );
  }
);

QuickSettingsDrawer.displayName = 'QuickSettingsDrawer';
