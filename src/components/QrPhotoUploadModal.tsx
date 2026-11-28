import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, RefreshCw, Smartphone, Wifi, X } from 'lucide-react';
import { isNativeAndroidPlatform } from '../services/nativeApps';
import {
  addAndroidQrPhotoUploadListener,
  consumeAndroidQrUploadedFile,
  QrPasteSessionInfo,
  startAndroidQrPhotoUploadSession,
  stopAndroidQrPhotoUploadSession,
} from '../services/systemSettings';
import { QrCodeSvg } from './QrCodeSvg';

interface QrPhotoUploadModalProps {
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onClose: (receivedCount: number) => void;
}

export const QrPhotoUploadModal: React.FC<QrPhotoUploadModalProps> = ({
  onUploadFiles,
  onClose,
}) => {
  const isNative = isNativeAndroidPlatform();
  const [session, setSession] = useState<QrPasteSessionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(isNative);
  const [error, setError] = useState<string | null>(null);
  const [receivedCount, setReceivedCount] = useState<number>(0);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);

  const activeTokenRef = useRef<string | null>(null);
  const receivedCountRef = useRef<number>(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onUploadRef = useRef(onUploadFiles);
  onUploadRef.current = onUploadFiles;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    onCloseRef.current(receivedCountRef.current);
  }, []);

  const startSession = useCallback(async () => {
    if (!isNative) return;
    setLoading(true);
    setError(null);
    activeTokenRef.current = null;
    try {
      const next = await startAndroidQrPhotoUploadSession();
      activeTokenRef.current = next.token;
      setSession(next);
    } catch (err) {
      setSession(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start the local Wi-Fi photo upload receiver on this TV.'
      );
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  useEffect(() => {
    const onSubBack = (e: Event) => {
      e.preventDefault();
      handleClose();
    };
    window.addEventListener('tv-modal-subback', onSubBack);
    return () => window.removeEventListener('tv-modal-subback', onSubBack);
  }, [handleClose]);

  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let removeListener: (() => void) | null = null;

    void addAndroidQrPhotoUploadListener((payload) => {
      if (disposed) return;
      if (!activeTokenRef.current || payload.token !== activeTokenRef.current) return;

      queueRef.current = queueRef.current.then(async () => {
        if (disposed) return;
        setImporting(true);
        try {
          const srcUrl = Capacitor.convertFileSrc(payload.filePath);
          const response = await fetch(srcUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();
          const file = new File([blob], payload.fileName || 'Phone Photo.jpg', {
            type: payload.mimeType || blob.type || 'image/jpeg',
          });
          await onUploadRef.current([file]);
          receivedCountRef.current += 1;
          if (!disposed) {
            setReceivedCount(receivedCountRef.current);
            setLastFileName(payload.fileName || 'Phone Photo');
          }
        } catch {
          if (!disposed) {
            setError('Failed to save an uploaded photo to the local album.');
          }
        } finally {
          await consumeAndroidQrUploadedFile(payload.filePath);
          if (!disposed) {
            setImporting(false);
          }
        }
      });
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
      void stopAndroidQrPhotoUploadSession();
    };
  }, [isNative, startSession]);

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Upload Local Photos from Phone"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tv-surface w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-[#10141E]/96 p-5 shadow-2xl backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              <Smartphone size={14} className="shrink-0 text-white/80" />
              <span>Phone QR Upload</span>
            </div>
            <h3 className="font-display mt-1 truncate text-base font-semibold text-white">
              Local Device Photos
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Phone QR Upload"
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
              When running on your TV, scanning this QR code opens a temporary upload page on your
              phone over home Wi-Fi so you can send photos directly to your TV&apos;s Local Album.
            </p>
            <p className="text-xs text-white/55">
              In this browser preview, use Select Photos or Select Folder directly.
            </p>
          </div>
        ) : loading ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-10 text-center">
            <RefreshCw size={22} className="animate-spin text-white/80" />
            <p className="mt-3 text-xs text-white/70">Starting local Wi-Fi photo receiver…</p>
          </div>
        ) : error && !session ? (
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
              Scan with your phone&apos;s camera on the same Wi-Fi, choose photos, and tap{' '}
              <span className="font-semibold text-white">Upload to TV</span>.
            </p>
            <p className="mt-2 break-all text-[11px] text-white/45">{session.url}</p>

            {(receivedCount > 0 || importing || error) && (
              <div className="mt-3 w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2 text-left text-xs">
                {importing ? (
                  <span className="text-sky-200">Saving uploaded photo to TV album…</span>
                ) : error ? (
                  <span className="text-amber-300">{error}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 size={14} className="shrink-0" />
                    <span>
                      Added {receivedCount} {receivedCount === 1 ? 'photo' : 'photos'}
                      {lastFileName ? ` (latest: ${lastFileName})` : ''}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {isNative && session && !loading && (
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
            onClick={handleClose}
            className="min-h-[44px] shrink-0 whitespace-nowrap rounded-xl bg-white px-5 text-xs font-semibold text-[#07080A] hover:bg-white/90"
          >
            {receivedCount > 0 ? 'Done' : isNative ? 'Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
