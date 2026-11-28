import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Smartphone, Wifi, X } from 'lucide-react';
import { isNativeAndroidPlatform } from '../services/nativeApps';
import {
  addAndroidQrPasteListener,
  QrPasteSessionInfo,
  startAndroidQrPasteSession,
  stopAndroidQrPasteSession,
} from '../services/systemSettings';
import { isSafeHttpUrl, normalizeSafeHttpsFeedUrl } from '../utils/urlValidation';
import { QrCodeSvg } from './QrCodeSvg';

interface QrPasteModalProps {
  fieldLabel: string;
  requireHttpsOnly?: boolean;
  onReceiveUrl: (url: string) => void;
  onClose: () => void;
}

export const QrPasteModal: React.FC<QrPasteModalProps> = ({
  fieldLabel,
  requireHttpsOnly = false,
  onReceiveUrl,
  onClose,
}) => {
  const isNative = isNativeAndroidPlatform();
  const [session, setSession] = useState<QrPasteSessionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(isNative);
  const [error, setError] = useState<string | null>(null);

  const activeTokenRef = useRef<string | null>(null);
  const onReceiveRef = useRef(onReceiveUrl);
  onReceiveRef.current = onReceiveUrl;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const startSession = useCallback(async () => {
    if (!isNative) return;
    setLoading(true);
    setError(null);
    activeTokenRef.current = null;
    try {
      const next = await startAndroidQrPasteSession(fieldLabel);
      activeTokenRef.current = next.token;
      setSession(next);
    } catch (err) {
      setSession(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start the local Wi-Fi QR receiver on this TV.'
      );
    } finally {
      setLoading(false);
    }
  }, [fieldLabel, isNative]);

  useEffect(() => {
    const onSubBack = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('tv-modal-subback', onSubBack);
    return () => window.removeEventListener('tv-modal-subback', onSubBack);
  }, []);

  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let removeListener: (() => void) | null = null;

    void addAndroidQrPasteListener((payload) => {
      if (disposed) return;
      if (!activeTokenRef.current || payload.token !== activeTokenRef.current) return;

      const rawUrl = (payload.url || '').trim();
      const validated = requireHttpsOnly
        ? normalizeSafeHttpsFeedUrl(rawUrl)
        : isSafeHttpUrl(rawUrl)
        ? rawUrl
        : null;

      if (!validated) {
        setSession(null);
        activeTokenRef.current = null;
        setError(
          requireHttpsOnly
            ? 'Received link must start with https://. Generate a new QR code and try again.'
            : 'Received link must be a valid http:// or https:// URL.'
        );
        return;
      }

      onReceiveRef.current(validated);
      onCloseRef.current();
    }).then((unsub) => {
      if (disposed) {
        unsub();
      } else {
        removeListener = unsub;
      }
    });

    void startSession();

    return () => {
      disposed = true;
      if (removeListener) removeListener();
      activeTokenRef.current = null;
      void stopAndroidQrPasteSession();
    };
  }, [isNative, requireHttpsOnly, startSession]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Paste ${fieldLabel} from Phone`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tv-surface w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-[#10141E]/96 p-5 shadow-2xl backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              <Smartphone size={14} className="shrink-0 text-white/80" />
              <span>Phone QR Paste</span>
            </div>
            <h3 className="font-display mt-1 truncate text-base font-semibold text-white">
              {fieldLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Phone QR Paste"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {!isNative ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Wifi size={16} className="shrink-0 text-sky-300" />
              <span>Available on Android TV</span>
            </div>
            <p className="text-xs leading-relaxed text-white/70">
              When running on your TV, scanning this QR code opens a temporary one-time page over
              your home Wi-Fi so you can paste long links from your phone straight into this box.
            </p>
            <p className="text-xs text-white/55">
              In this browser preview, you can paste directly into the URL field.
            </p>
          </div>
        ) : loading ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-10 text-center">
            <RefreshCw size={22} className="animate-spin text-white/80" />
            <p className="mt-3 text-xs text-white/70">Starting local Wi-Fi QR receiver…</p>
          </div>
        ) : error ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/12 p-4">
            <p className="text-xs leading-relaxed text-amber-200">{error}</p>
            <button
              type="button"
              onClick={() => void startSession()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-[#07080A] hover:bg-white/90"
            >
              <RefreshCw size={14} />
              <span>Generate New QR</span>
            </button>
          </div>
        ) : session ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-white/12 bg-white/[0.04] p-4 text-center">
            <QrCodeSvg value={session.url} size={184} />
            <p className="mt-3 text-xs leading-relaxed text-white/80">
              Scan with your phone&apos;s camera on the same Wi-Fi, paste the URL, and tap{' '}
              <span className="font-semibold text-white">Send to TV</span>. It will fill the box so
              you can review before saving.
            </p>
            <p className="mt-2 break-all text-[11px] text-white/45">{session.url}</p>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {isNative && session && !loading && !error && (
            <button
              type="button"
              onClick={() => void startSession()}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-white/8 px-3.5 text-xs font-medium text-white hover:bg-white/15"
            >
              <RefreshCw size={14} />
              <span>New QR</span>
            </button>
          )}
          <button
            type="button"
            data-autofocus="true"
            onClick={onClose}
            className="min-h-[44px] shrink-0 whitespace-nowrap rounded-xl bg-white px-5 text-xs font-semibold text-[#07080A] hover:bg-white/90"
          >
            {isNative ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
