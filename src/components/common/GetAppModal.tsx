import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Language } from '../../types/acash';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface GetAppModalProps {
  lang: Language;
  onClose: () => void;
}

export const GetAppModal: React.FC<GetAppModalProps> = ({ lang, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);
  const [installNote, setInstallNote] = useState('');

  const apkUrl = (import.meta.env.VITE_MOBILE_APK_URL || '').trim();
  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://acash.app';

  const handleInstallClick = async () => {
    setInstalling(true);
    setInstallNote('');
    try {
      const accepted = await install();
      if (accepted) {
        setInstallNote(
          lang === 'bn'
            ? 'Acash মোবাইল অ্যাপ ইনস্টল সম্পন্ন হয়েছে!'
            : 'Acash Mobile App installed on your device!'
        );
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Banner */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src="/assets/aistudio/a_clean_vector_style_app_logo_on_a_transparent_bac_e63513a7.png"
              alt="Acash Mobile App"
              className="w-14 h-14 object-contain shrink-0 drop-shadow-md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-white truncate">
                  {lang === 'bn' ? 'Acash মোবাইল অ্যাপ নিন' : 'Get Acash Mobile App'}
                </h2>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5 truncate">
                {lang === 'bn'
                  ? 'কাস্টমার, এজেন্ট ও মার্চেন্ট — একটিই মোবাইল অ্যাপ'
                  : 'Customer, Agent & Merchant — All-in-One Mobile App'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Status / One-Tap Install */}
          {isInstalled ? (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs text-emerald-800 dark:text-emerald-200">
                <div className="font-bold">
                  {lang === 'bn'
                    ? 'অ্যাপ ইতিমধ্যেই ইনস্টল করা আছে'
                    : 'Mobile App Already Installed'}
                </div>
                <div className="mt-0.5 opacity-90">
                  {lang === 'bn'
                    ? 'আপনি এখন Acash মোবাইল অ্যাপ মোডে ব্যবহার করছেন।'
                    : 'You are currently running Acash in standalone mobile app mode.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {isInstallable && (
                <button
                  type="button"
                  disabled={installing}
                  onClick={handleInstallClick}
                  className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>
                    {installing
                      ? lang === 'bn'
                        ? 'ইনস্টল হচ্ছে...'
                        : 'Installing App...'
                      : lang === 'bn'
                        ? 'সরাসরি মোবাইল অ্যাপ ইনস্টল করুন'
                        : 'Install Acash Mobile App'}
                  </span>
                </button>
              )}

              {apkUrl && (
                <a
                  href={apkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'Android APK ফাইল ডাউনলোড করুন'
                      : 'Download Android App File (.apk)'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
                </a>
              )}

              {installNote && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {installNote}
                </div>
              )}
            </div>
          )}

          {/* QR Code for Mobile Phone Camera Scan */}
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="p-2.5 rounded-2xl bg-white border border-slate-200 shadow-xs shrink-0">
              <QRCodeCanvas value={appOrigin} size={108} level="M" />
            </div>
            <div className="space-y-1.5 text-center sm:text-left">
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-1.5">
                <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>
                  {lang === 'bn'
                    ? 'মোবাইলে অ্যাপ ইনস্টল করতে QR স্ক্যান করুন'
                    : 'Scan QR Code on Your Phone'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'bn'
                  ? 'ফোনের ক্যামেরা দিয়ে স্ক্যান করে লিংকটি খুলুন এবং হোম স্ক্রিনে ইনস্টল করুন — Play Store ছাড়াই ফুল মোবাইল অ্যাপ হিসেবে চলবে।'
                  : 'Scan with your phone camera to open on Android or iPhone and install directly to your home screen as a full-screen mobile app.'}
              </p>
              <div className="font-mono-tabular text-[11px] text-indigo-600 dark:text-indigo-400 break-all">
                {appOrigin}
              </div>
            </div>
          </div>

          {/* Step-by-step Mobile Install Guides (Android & iOS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`rounded-2xl p-4 border ${
                !isIOS
                  ? 'bg-indigo-50/70 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30'
                  : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                Android (Chrome / Edge)
              </div>
              <ol className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside leading-relaxed">
                <li>
                  {lang === 'bn'
                    ? 'Chrome ব্রাউজারে ওপরে ডানদিকে ⋮ মেনু চাপুন'
                    : 'Tap the ⋮ menu in the top-right corner of Chrome'}
                </li>
                <li>
                  {lang === 'bn'
                    ? '"Install app" বা "Add to Home screen" সিলেক্ট করুন'
                    : 'Select "Install app" or "Add to Home screen"'}
                </li>
                <li>
                  {lang === 'bn'
                    ? 'হোম স্ক্রিন থেকে অ্যাপ হিসেবে ব্যবহার করুন'
                    : 'Launch Acash directly from your app drawer'}
                </li>
              </ol>
            </div>

            <div
              className={`rounded-2xl p-4 border ${
                isIOS
                  ? 'bg-indigo-50/70 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30'
                  : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                <Share className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>iPhone / iPad (Safari)</span>
              </div>
              <ol className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside leading-relaxed">
                <li>
                  {lang === 'bn'
                    ? 'Safari-তে নিচের Share আইকনে ট্যাপ করুন'
                    : 'Tap the Share button in Safari toolbar'}
                </li>
                <li>
                  {lang === 'bn'
                    ? 'নিচে স্ক্রল করে "Add to Home Screen" দিন'
                    : 'Scroll down and tap "Add to Home Screen"'}
                </li>
                <li>
                  {lang === 'bn'
                    ? 'ওপরে "Add" চাপলেই অ্যাপ রেডি!'
                    : 'Tap "Add" to launch Acash as a mobile app'}
                </li>
              </ol>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
