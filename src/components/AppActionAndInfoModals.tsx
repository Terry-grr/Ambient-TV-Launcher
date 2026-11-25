import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Eraser,
  Info,
  Play,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { AppItem } from '../types/launcher';
import { AppIconGlyph } from './AppIconGlyph';

interface AppActionModalProps {
  app: AppItem;
  from: 'default' | 'drawer';
  canUninstall: boolean;
  onLaunch: (app: AppItem) => void;
  onOpenInfo: (appId: string) => void;
  onStartMove: (appId: string) => void;
  onUninstall: (appId: string) => void;
  onClose: () => void;
}

export const AppActionModal: React.FC<AppActionModalProps> = ({
  app,
  from,
  canUninstall,
  onLaunch,
  onOpenInfo,
  onStartMove,
  onUninstall,
  onClose,
}) => {
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${app.name} options`}
    >
      <div className="tv-surface max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-[#10131C]/92 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <div className="flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-[#050608]">
              {app.iconDataUrl ? (
                <img
                  src={app.iconDataUrl}
                  alt=""
                  aria-hidden="true"
                  className={
                    app.iconIsBanner
                      ? 'h-full w-full object-cover'
                      : 'h-full w-full object-contain p-1'
                  }
                />
              ) : (
                <AppIconGlyph iconKey={app.iconKey} accentColor={app.accentColor} size={24} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display truncate text-lg font-semibold text-white">
                {app.name}
              </h3>
              <p className="truncate text-xs text-white/60 sm:text-sm">
                {app.category} · v{app.version}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close app menu"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {confirmUninstall ? (
          <div className="pt-4">
            <p className="text-sm text-white/85">
              Uninstall <strong>{app.name}</strong> from the launcher? You can
              restore default apps anytime in Launcher Settings.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmUninstall(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-white/8 text-sm font-medium text-white hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onUninstall(app.id)}
                className="min-h-[44px] flex-1 rounded-xl bg-red-500/90 text-sm font-semibold text-white hover:bg-red-500"
              >
                Uninstall
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => onLaunch(app)}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 text-left text-sm font-medium text-white hover:bg-white/15"
            >
              <Play size={17} className="text-white/80" />
              <span>Open {app.name}</span>
            </button>

            {from === 'drawer' && (
              <button
                type="button"
                onClick={() => onStartMove(app.id)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 text-left text-sm font-medium text-white hover:bg-white/15"
              >
                <ArrowLeftRight size={17} className="text-white/80" />
                <span>Move</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenInfo(app.id)}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 text-left text-sm font-medium text-white hover:bg-white/15"
            >
              <Info size={17} className="text-white/80" />
              <span>System App Info</span>
            </button>

            {from === 'drawer' && canUninstall && (
              <button
                type="button"
                onClick={() => setConfirmUninstall(true)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 text-left text-sm font-medium text-red-200 hover:bg-red-500/20"
              >
                <Trash2 size={17} className="text-red-300" />
                <span>Uninstall</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface SystemAppInfoModalProps {
  app: AppItem;
  canUninstall: boolean;
  onLaunch: (app: AppItem) => void;
  onClearCache: (appId: string) => void;
  onOpenNativeDetails?: (packageName: string) => void;
  onUninstall: (appId: string) => void;
  onClose: () => void;
}

export const SystemAppInfoModal: React.FC<SystemAppInfoModalProps> = ({
  app,
  canUninstall,
  onLaunch,
  onClearCache,
  onOpenNativeDetails,
  onUninstall,
  onClose,
}) => {
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const isNativePkg = app.id.startsWith('pkg:');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`System App Info for ${app.name}`}
    >
      <div className="tv-surface max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/15 bg-[#0F121A]/95 p-6 shadow-2xl backdrop-blur-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-[#050608]">
              {app.iconDataUrl ? (
                <img
                  src={app.iconDataUrl}
                  alt=""
                  aria-hidden="true"
                  className={
                    app.iconIsBanner
                      ? 'h-full w-full object-cover'
                      : 'h-full w-full object-contain p-1'
                  }
                />
              ) : (
                <AppIconGlyph iconKey={app.iconKey} accentColor={app.accentColor} size={28} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/55 sm:text-sm">System App Info</p>
              <h2 className="font-display truncate text-xl font-semibold text-white sm:text-2xl">
                {app.name}
              </h2>
              <p className="truncate text-xs text-white/60 sm:text-sm">
                {app.packageName} · Version {app.version}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close System App Info"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-white/80 sm:text-base">
          {app.description}
        </p>

        {statusNote && (
          <div className="mt-3 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs text-white sm:text-sm">
            {statusNote}
          </div>
        )}

        {/* Primary Action Bar */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onLaunch(app)}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-[#07080A] hover:bg-white/90 sm:text-sm"
          >
            <Play size={15} />
            <span>Open</span>
          </button>
          {isNativePkg && onOpenNativeDetails ? (
            <button
              type="button"
              onClick={() => onOpenNativeDetails(app.packageName)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-xs font-medium text-white hover:bg-white/15"
            >
              <Info size={14} />
              <span>Android Info</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatusNote(`${app.name} background process stopped.`)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-xs font-medium text-white hover:bg-white/15"
            >
              <Square size={14} />
              <span>Force Stop</span>
            </button>
          )}
          {canUninstall && (
            <button
              type="button"
              onClick={() => setConfirmUninstall(true)}
              className="col-span-2 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-500/12 px-3 text-xs font-medium text-red-200 hover:bg-red-500/20 sm:col-span-1"
            >
              <Trash2 size={14} />
              <span>Uninstall</span>
            </button>
          )}
        </div>

        {confirmUninstall && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
            <p className="text-xs text-red-100">
              Remove <strong>{app.name}</strong> from your launcher?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmUninstall(false)}
                className="min-h-[40px] flex-1 rounded-xl border border-white/15 bg-white/8 text-xs font-medium text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onUninstall(app.id)}
                className="min-h-[40px] flex-1 rounded-xl bg-red-500 text-xs font-semibold text-white"
              >
                Confirm Uninstall
              </button>
            </div>
          </div>
        )}

        {/* Storage & Cache */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-white">Storage Used</h3>
              <p className="mt-1 text-xs text-white/65 tabular-nums">
                App: {app.sizeMb} MB · Cache: {app.cacheMb} MB · Total:{' '}
                {app.sizeMb + app.cacheMb} MB
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearCache(app.id);
                setStatusNote(`Cleared ${app.cacheMb} MB cache for ${app.name}.`);
              }}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/8 px-3 text-xs font-medium text-white hover:bg-white/15"
            >
              <Eraser size={14} />
              <span>Clear Cache</span>
            </button>
          </div>
        </div>

        {/* Permissions */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldCheck size={15} className="text-white/75" />
            <span>Permissions</span>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-white/65">
            {app.permissions.map((perm) => (
              <li key={perm}>· {perm}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
