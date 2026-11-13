import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import jsQR from 'jsqr';
import {
  Camera,
  Copy,
  Check,
  QrCode,
  ScanLine,
  X,
  ArrowRight,
  Flashlight,
  RefreshCw,
  ImageUp,
} from 'lucide-react';
import { Language } from '../../types/acash';
import { t } from '../../lib/i18n';
import { playNotificationChime } from '../../lib/soundbox';
import { ACASH_MAIN_LOGO_SRC } from './BrandLogo';

export interface QrPayload {
  accountId: string;
  amount?: number;
  note?: string;
  role?: 'U' | 'A' | 'M';
}

export function parseAcashQrPayload(raw: string): QrPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Check URL or custom URI: acash://pay?to=M-300001&amount=500 or ?payTo=M-300001
  if (trimmed.includes('payTo=') || trimmed.includes('to=')) {
    try {
      const queryPart = trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
      const params = new URLSearchParams(queryPart);
      const to = params.get('payTo') || params.get('to');
      if (to) {
        const amt = Number(params.get('amount') || 0);
        const note = params.get('note') || undefined;
        return {
          accountId: to.toUpperCase(),
          amount: amt > 0 ? amt : undefined,
          note,
        };
      }
    } catch {
      // fall through
    }
  }

  // Check JSON payload
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.accountId) {
        return {
          accountId: String(parsed.accountId).toUpperCase(),
          amount: parsed.amount ? Number(parsed.amount) : undefined,
          note: parsed.note,
          role: parsed.role,
        };
      }
    } catch {
      // fall through
    }
  }

  // Direct Acash ID or phone
  if (/^[UAM]-\d{6}$/i.test(trimmed) || /^01\d{9}$/.test(trimmed)) {
    return { accountId: trimmed.toUpperCase() };
  }

  return null;
}

interface QrModalProps {
  mode: 'show' | 'scan';
  accountId: string;
  accountName: string;
  role: 'U' | 'A' | 'M';
  lang: Language;
  onClose: () => void;
  onScanned?: (payload: QrPayload) => void;
}

export const QrModal: React.FC<QrModalProps> = ({
  mode,
  accountId,
  accountName,
  role,
  lang,
  onClose,
  onScanned,
}) => {
  const [activeTab, setActiveTab] = useState<'show' | 'scan'>(mode);
  const [copied, setCopied] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [scanError, setScanError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedLockRef = useRef(false);

  const qrString = JSON.stringify({
    app: 'acash',
    accountId,
    role,
    name: accountName,
  });

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStarting(false);
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const completeScan = useCallback(
    (payload: QrPayload) => {
      if (scannedLockRef.current) return;
      scannedLockRef.current = true;
      playNotificationChime('credit');
      try {
        if ('vibrate' in navigator) navigator.vibrate(60);
      } catch {
        // ignore vibration unsupported
      }
      stopCamera();
      if (onScanned) onScanned(payload);
    },
    [onScanned, stopCamera]
  );

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setScanError('');
      setCameraStarting(true);
      scannedLockRef.current = false;

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API unavailable on this browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        setCameraActive(true);
        setCameraStarting(false);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            const caps = videoTrack.getCapabilities?.() as { torch?: boolean } | undefined;
            setTorchSupported(Boolean(caps?.torch));
          } catch {
            setTorchSupported(false);
          }
        }

        // Wait a tick for video element to mount if switching from inactive
        window.setTimeout(() => {
          const video = videoRef.current;
          if (!video || !streamRef.current) return;
          video.srcObject = stream;
          void video.play().catch(() => {});

          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
          }
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
          let nativeDetector: NativeDetector | null = null;
          if ('BarcodeDetector' in window) {
            try {
              const Detector = (
                window as unknown as {
                  BarcodeDetector: new (opts: { formats: string[] }) => NativeDetector;
                }
              ).BarcodeDetector;
              nativeDetector = new Detector({ formats: ['qr_code'] });
            } catch {
              nativeDetector = null;
            }
          }

          let lastScanAt = 0;
          let frameCounter = 0;
          let nativeBusy = false;

          const scanLoop = (ts: number) => {
            if (!streamRef.current || scannedLockRef.current) return;

            const v = videoRef.current;
            if (v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0 && ts - lastScanAt >= 65) {
              lastScanAt = ts;
              frameCounter += 1;

              // Fast path 1: Hardware-accelerated BarcodeDetector when available
              if (nativeDetector && !nativeBusy) {
                nativeBusy = true;
                void nativeDetector
                  .detect(v)
                  .then((codes) => {
                    if (codes.length > 0 && codes[0].rawValue) {
                      const parsed = parseAcashQrPayload(codes[0].rawValue);
                      if (parsed) {
                        completeScan(parsed);
                      }
                    }
                  })
                  .catch(() => {})
                  .finally(() => {
                    nativeBusy = false;
                  });
              }

              // Universal Path 2: Pure-JS jsQR (works on iOS Safari, Firefox, Edge, Android WebView & Desktop)
              if (ctx && !scannedLockRef.current) {
                const maxSide = 640;
                const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
                const w = Math.max(1, Math.round(v.videoWidth * scale));
                const h = Math.max(1, Math.round(v.videoHeight * scale));
                if (canvas.width !== w || canvas.height !== h) {
                  canvas.width = w;
                  canvas.height = h;
                }
                ctx.drawImage(v, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const qr = jsQR(imgData.data, w, h, {
                  inversionAttempts: frameCounter % 5 === 0 ? 'attemptBoth' : 'dontInvert',
                });
                if (qr?.data) {
                  const parsed = parseAcashQrPayload(qr.data);
                  if (parsed) {
                    completeScan(parsed);
                    return;
                  }
                }
              }
            }

            if (!scannedLockRef.current && streamRef.current) {
              rafRef.current = requestAnimationFrame(scanLoop);
            }
          };

          rafRef.current = requestAnimationFrame(scanLoop);
        }, 50);
      } catch {
        setCameraActive(false);
        setCameraStarting(false);
        setScanError(
          lang === 'bn'
            ? 'ক্যামেরা অ্যাক্সেস পাওয়া যায়নি। নিচে কিউআর ছবি আপলোড করুন অথবা আইডি পেস্ট করুন।'
            : 'Camera unavailable or permission denied. Upload a QR screenshot/photo or paste an Acash ID below.'
        );
      }
    },
    [completeScan, facingMode, lang, stopCamera]
  );

  // Auto-open live camera scanner when modal opens on scan tab
  useEffect(() => {
    if (activeTab === 'scan' && !cameraActive && !cameraStarting) {
      void startCamera(facingMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // torch toggle unsupported on this device
    }
  };

  const switchCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    void startCamera(nextFacing);
  };

  const handleImageFileScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanError('');

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const qr = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (!qr?.data) {
          setScanError(
            lang === 'bn'
              ? 'ছবিতে কোনো স্পষ্ট আক্যাশ কিউআর কোড পাওয়া যায়নি।'
              : 'No readable QR code detected in the selected image.'
          );
          return;
        }
        const parsed = parseAcashQrPayload(qr.data);
        if (!parsed) {
          setScanError(
            lang === 'bn'
              ? 'এই কিউআর কোডটি আক্যাশ পেমেন্ট কোড নয়।'
              : 'Decoded QR is not a valid Acash payment payload.'
          );
          return;
        }
        completeScan(parsed);
      };
      img.onerror = () => setScanError('Could not load selected image.');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualScan = (raw: string) => {
    setScanError('');
    const parsed = parseAcashQrPayload(raw);
    if (!parsed) {
      setScanError(
        lang === 'bn'
          ? 'অবৈধ আক্যাশ কিউআর কোড। সঠিক অ্যাকাউন্ট আইডি বা পেমেন্ট লিংক দিন।'
          : 'Invalid Acash QR payload. Enter a valid Acash ID (e.g. M-300001) or payment link.'
      );
      return;
    }
    completeScan(parsed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-[#121622] z-10">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-display font-semibold text-slate-900 dark:text-white">
              {activeTab === 'show' ? t('myQr', lang) : t('scanQr', lang)}
            </h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch */}
        <div className="p-4 pb-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveTab('show');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'show'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('myQr', lang)}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'scan'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('scanQr', lang)}
            </button>
          </div>
        </div>

        {activeTab === 'show' ? (
          <div className="p-6 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-3">
              <img
                src={ACASH_MAIN_LOGO_SRC}
                alt="Acash"
                className="w-8 h-8 object-contain"
              />
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Acash Pay QR
              </span>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <QRCodeSVG value={qrString} size={184} level="H" fgColor="#0f172a" />
            </div>
            <div className="mt-4">
              <div className="text-base font-semibold text-slate-900 dark:text-white">{accountName}</div>
              <div className="font-mono-tabular text-sm text-indigo-600 dark:text-indigo-400 mt-0.5">{accountId}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(accountId);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? t('copied', lang) : `Copy ID (${accountId})`}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="relative rounded-2xl bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden aspect-[4/3] flex flex-col items-center justify-center">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Corner targeting overlay */}
                  <div className="pointer-events-none absolute inset-6 border-2 border-indigo-400/75 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
                    <div className="w-full h-0.5 bg-indigo-400/90 animate-pulse mt-1/2" />
                  </div>
                  {/* Camera Toolbar */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="px-2.5 py-1.5 rounded-lg bg-black/65 hover:bg-black/80 text-white text-[11px] font-semibold inline-flex items-center gap-1 backdrop-blur-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'ক্যামেরা ঘোরান' : 'Flip'}</span>
                    </button>
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 backdrop-blur-sm ${
                          torchOn
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-black/65 hover:bg-black/80 text-white'
                        }`}
                      >
                        <Flashlight className="w-3.5 h-3.5" />
                        <span>{torchOn ? 'Flash On' : 'Flash'}</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-center space-y-3 bg-slate-100 dark:bg-[#0B0D14] w-full h-full flex flex-col items-center justify-center">
                  <ScanLine className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mx-auto" />
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs">
                    {lang === 'bn'
                      ? 'যেকোনো আক্যাশ মার্চেন্ট বা গ্রাহকের কিউআর দ্রুত স্ক্যান করতে ক্যামেরা চালু করুন'
                      : 'High-speed QR engine (jsQR + Hardware Detector) for Customers, Agents & Merchants'}
                  </p>
                  <button
                    type="button"
                    disabled={cameraStarting}
                    onClick={() => startCamera(facingMode)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>
                      {cameraStarting
                        ? lang === 'bn'
                          ? 'ক্যামেরা চালু হচ্ছে...'
                          : 'Starting Camera...'
                        : lang === 'bn'
                          ? 'ক্যামেরা চালু করুন'
                          : 'Enable Camera Scanner'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Gallery / Screenshot QR Upload */}
            <label className="w-full py-2.5 px-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-2 cursor-pointer transition-colors">
              <ImageUp className="w-4 h-4" />
              <span>
                {lang === 'bn'
                  ? 'গ্যালারি থেকে কিউআর ছবি আপলোড করে স্ক্যান করুন'
                  : 'Upload QR Photo / Screenshot from Device'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileScan}
                className="hidden"
              />
            </label>

            {scanError && (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-3 py-2">
                {scanError}
              </p>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {lang === 'bn' ? 'অথবা কিউআর লিংক / আইডি পেস্ট করুন' : 'Or paste QR payload / Payment Link'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="M-300001 or ?payTo=M-300001&amount=500"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleManualScan(qrInput)}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  Go <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                {lang === 'bn' ? 'টেস্ট কিউআর স্ক্যান (স্যান্ডবক্স)' : 'Quick Sandbox QR Targets'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleManualScan(
                      JSON.stringify({ accountId: 'M-300001', amount: 1450, role: 'M', note: 'Store Purchase' })
                    )
                  }
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-left transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">Aarong Store</div>
                  <div className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">M-300001 · ৳1,450</div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleManualScan(JSON.stringify({ accountId: 'A-200001', role: 'A' }))
                  }
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-left transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">Dhaka Agent</div>
                  <div className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">A-200001 · Cash Out</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
