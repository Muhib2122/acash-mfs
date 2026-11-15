import React from 'react';
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Language } from '../../types/acash';
import { UserComplianceState, UNVERIFIED_MAX_TX_VOLUME } from '../../lib/acashService';

interface ComplianceAlertBannerProps {
  compliance: UserComplianceState;
  lang: Language;
  dismissed: boolean;
  onDismiss: () => void;
  onOpenKyc: () => void;
  onOpen2fa: () => void;
}

export const ComplianceAlertBanner: React.FC<ComplianceAlertBannerProps> = ({
  compliance,
  lang,
  dismissed,
  onDismiss,
  onOpenKyc,
  onOpen2fa,
}) => {
  if (compliance.isFullyVerified || dismissed) {
    return null;
  }

  const volumePct = Math.min(
    100,
    Math.round((compliance.totalOutgoingUsed / UNVERIFIED_MAX_TX_VOLUME) * 100)
  );
  const isCritical = compliance.graceExpired || compliance.volumeCapReached;
  const kycLabel =
    compliance.kycStatus === 'verified'
      ? lang === 'bn'
        ? 'KYC সম্পন্ন'
        : 'KYC Verified'
      : compliance.kycStatus === 'submitted'
        ? lang === 'bn'
          ? 'KYC পর্যালোচনাধীন'
          : 'KYC Pending Review'
        : lang === 'bn'
          ? 'KYC বাকি'
          : 'KYC Required';

  return (
    <div
      role="region"
      aria-label={lang === 'bn' ? 'একাউন্ট ভেরিফিকেশন সতর্কতা' : 'Account verification alert'}
      className={`acash-compliance-enter relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 shadow-sm ${
        isCritical
          ? 'bg-rose-50/95 dark:bg-rose-950/45 border-rose-300 dark:border-rose-700/70'
          : 'bg-amber-50/95 dark:bg-amber-950/35 border-amber-300 dark:border-amber-700/70'
      }`}
    >
      {/* Subtle animated shimmer sweep across banner */}
      <div
        aria-hidden="true"
        className={`acash-compliance-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent ${
          isCritical
            ? 'via-rose-400/15 dark:via-rose-400/10'
            : 'via-amber-400/20 dark:via-amber-300/10'
        } to-transparent`}
      />

      <div className="relative z-10 flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              isCritical
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-amber-500 text-white shadow-sm'
            }`}
          >
            {isCritical ? (
              <AlertTriangle className="w-4.5 h-4.5" />
            ) : (
              <Clock className="w-4.5 h-4.5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className={`text-xs sm:text-sm font-bold leading-snug ${
                isCritical
                  ? 'text-rose-950 dark:text-rose-100'
                  : 'text-amber-950 dark:text-amber-100'
              }`}
            >
              {isCritical
                ? compliance.graceExpired
                  ? lang === 'bn'
                    ? '৭ দিনের আনভেরিফায়েড সময় শেষ — KYC ও 2FA চালু করুন'
                    : '7-Day Unverified Access Expired — Verify KYC & 2FA'
                  : lang === 'bn'
                    ? '৳১,০০,০০০ আনভেরিফায়েড সীমা শেষ'
                    : '৳1,00,000 Unverified Transaction Cap Reached'
                : lang === 'bn'
                  ? `KYC ও 2FA সম্পূর্ণ করুন (বাকি ${compliance.daysRemaining} দিন)`
                  : `Complete KYC & 2FA (${compliance.daysRemaining}d of 7d remaining)`}
            </p>
            <p
              className={`text-[11px] sm:text-xs mt-0.5 leading-relaxed ${
                isCritical
                  ? 'text-rose-800 dark:text-rose-200/90'
                  : 'text-amber-800 dark:text-amber-200/90'
              }`}
            >
              {compliance.graceExpired
                ? lang === 'bn'
                  ? 'এডমিনের কাছে নোটিফিকেশন পাঠানো হয়েছে। লেনদেন চালু রাখতে KYC + 2FA অন করুন অথবা +৭ দিন এক্সটেনশন নিন।'
                  : 'Compliance Admin has been notified. Enable KYC & 2FA or wait for Admin +7 day access extension.'
                : lang === 'bn'
                  ? 'KYC ও 2FA ছাড়া সর্বোচ্চ ৭ দিন ও মোট ৳১,০০,০০০ পর্যন্ত লেনদেন করা যাবে।'
                  : 'Without KYC & 2FA ON, usage is capped at 7 days and ৳1,00,000 total outgoing volume.'}
            </p>
          </div>
        </div>

        {/* Small dismiss cross button */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Dismiss banner'}
          title={lang === 'bn' ? 'বন্ধ করুন' : 'Dismiss for now'}
          className={`w-8 h-8 min-w-[32px] min-h-[32px] rounded-lg flex items-center justify-center shrink-0 transition cursor-pointer ${
            isCritical
              ? 'text-rose-700 dark:text-rose-300 hover:bg-rose-200/70 dark:hover:bg-rose-900/60'
              : 'text-amber-700 dark:text-amber-300 hover:bg-amber-200/70 dark:hover:bg-amber-900/60'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ৳1,00,000 usage meter + status checklist */}
      <div className="relative z-10 mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium">
          <span
            className={`font-mono-tabular ${
              isCritical
                ? 'text-rose-900 dark:text-rose-200'
                : 'text-amber-900 dark:text-amber-200'
            }`}
          >
            {lang === 'bn' ? 'ব্যবহৃত সীমা:' : 'Used Cap:'}{' '}
            <strong className="font-bold">৳{compliance.totalOutgoingUsed.toLocaleString()}</strong> / ৳1,00,000
          </span>
          <span
            className={`font-mono-tabular ${
              isCritical
                ? 'text-rose-800 dark:text-rose-300'
                : 'text-amber-800 dark:text-amber-300'
            }`}
          >
            {lang === 'bn' ? 'বাকি:' : 'Left:'} ৳{compliance.remainingVolume.toLocaleString()}
          </span>
        </div>

        <div
          className={`h-1.5 w-full rounded-full overflow-hidden ${
            isCritical
              ? 'bg-rose-200/80 dark:bg-rose-900/60'
              : 'bg-amber-200/80 dark:bg-amber-900/60'
          }`}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isCritical
                ? 'bg-rose-600 dark:bg-rose-400'
                : volumePct >= 75
                  ? 'bg-orange-500'
                  : 'bg-amber-600 dark:bg-amber-400'
            }`}
            style={{ width: `${volumePct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onOpenKyc}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              compliance.kycVerified
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 hover:border-indigo-400 shadow-xs'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
            <span>{kycLabel}</span>
          </button>

          <button
            type="button"
            onClick={onOpen2fa}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              compliance.twoFactorEnabled
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              {compliance.twoFactorEnabled
                ? lang === 'bn'
                  ? '2FA চালু'
                  : '2FA Active'
                : lang === 'bn'
                  ? '2FA চালু করুন'
                  : 'Enable 2FA'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
