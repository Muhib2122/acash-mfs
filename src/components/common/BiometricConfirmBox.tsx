import React, { useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { AcashUser, Language } from '../../types/acash';
import { formatBdt } from '../../lib/i18n';
import {
  resolveBiometricPolicyForAmount,
  sanitizeBiometricDeviceLabelForDisplay,
  WebAuthnCapability,
} from '../../lib/webauthn';

export type ConfirmAuthMode = 'biometric' | 'pin';

interface BiometricConfirmBoxProps {
  user: AcashUser;
  lang: Language;
  amount: number;
  amountLabel: string;
  platformHighValueThreshold: number;
  webauthnCap: WebAuthnCapability | null;
  authMode: ConfirmAuthMode;
  onAuthModeChange: (mode: ConfirmAuthMode) => void;
  submitting: boolean;
  error?: string;
  onClearError?: () => void;
  onConfirmBiometric: (optionalAugmentPin?: string) => Promise<void> | void;
  onConfirmPin: (pin: string) => Promise<void> | void;
  onOpenBiometricSettings?: () => void;
  pinButtonLabel?: string;
  pinLabel?: string;
  pinPlaceholder?: string;
  pinHint?: string;
  biometricDisabledReason?: string;
}

export const BiometricConfirmBox: React.FC<BiometricConfirmBoxProps> = ({
  user,
  lang,
  amount,
  amountLabel,
  platformHighValueThreshold,
  webauthnCap,
  authMode,
  onAuthModeChange,
  submitting,
  error,
  onClearError,
  onConfirmBiometric,
  onConfirmPin,
  onOpenBiometricSettings,
  pinButtonLabel,
  pinLabel,
  pinPlaceholder,
  pinHint,
  biometricDisabledReason,
}) => {
  const [augmentPin, setAugmentPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showAugmentPin, setShowAugmentPin] = useState(false);
  const [localError, setLocalError] = useState('');

  const enrolledBiometrics = user.webauthnCredentials || [];
  const biometricsReady =
    !biometricDisabledReason &&
    enrolledBiometrics.length > 0 &&
    Boolean(webauthnCap?.supported);

  const policy = useMemo(
    () =>
      resolveBiometricPolicyForAmount({
        user,
        amount,
        platformHighValueThreshold,
        biometricsReady,
      }),
    [user, amount, platformHighValueThreshold, biometricsReady]
  );

  const showBiometricOption = biometricsReady && policy.prefs.enabled;
  const activeMode: ConfirmAuthMode = showBiometricOption ? authMode : 'pin';
  const combinedError = localError || error;
  const primaryDeviceLabel = enrolledBiometrics[0]
    ? sanitizeBiometricDeviceLabelForDisplay(enrolledBiometrics[0].deviceLabel)
    : lang === 'bn'
      ? 'ডিভাইস পাসকি'
      : 'Device Biometric Passkey';

  const handleBiometricSubmit = async () => {
    setLocalError('');
    if (onClearError) onClearError();

    if (policy.requireAugmentStep && !/^\d{4,5}$/.test(augmentPin.trim())) {
      setLocalError(
        lang === 'bn'
          ? 'ডুয়াল-লক উচ্চমূল্যের লেনদেন নিশ্চিত করতে ৪ বা ৫ সংখ্যার পিন দিন।'
          : 'Enter your 4 or 5-digit Security PIN alongside biometrics to authorize this high-value transfer.'
      );
      return;
    }

    await onConfirmBiometric(policy.requireAugmentStep ? augmentPin.trim() : undefined);
  };

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalError('');
    if (onClearError) onClearError();

    const cleaned = pinInput.trim();
    if (!/^\d{4,5}$/.test(cleaned)) {
      setLocalError(
        lang === 'bn'
          ? 'লেনদেন নিশ্চিত করতে ৪ বা ৫ সংখ্যার সিকিউরিটি পিন দিন।'
          : 'Enter a valid 4 or 5-digit Security PIN to authorize this transaction.'
      );
      return;
    }

    await onConfirmPin(cleaned);
  };

  return (
    <div className="space-y-3 min-w-0">
      {/* Segmented selector only when device biometrics are enrolled and permitted */}
      {showBiometricOption && (
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setLocalError('');
              if (onClearError) onClearError();
              onAuthModeChange('biometric');
            }}
            className={`min-h-[44px] px-2.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer min-w-0 ${
              activeMode === 'biometric'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Fingerprint className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {lang === 'bn' ? 'বায়োমেট্রিক' : 'Biometrics'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalError('');
              if (onClearError) onClearError();
              onAuthModeChange('pin');
            }}
            className={`min-h-[44px] px-2.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer min-w-0 ${
              activeMode === 'pin'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {lang === 'bn' ? 'সিকিউরিটি পিন' : 'Security PIN'}
            </span>
          </button>
        </div>
      )}

      {showBiometricOption && activeMode === 'biometric' ? (
        <div className="space-y-3">
          {/* Calm single-elevation biometric summary surface with strict min-w-0 wrapping */}
          <div className="p-4 rounded-2xl bg-emerald-50/55 dark:bg-emerald-950/25 border border-emerald-200/90 dark:border-emerald-800/60 space-y-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-snug break-words">
                  {policy.isHighValueForBio
                    ? policy.requireAugmentStep
                      ? lang === 'bn'
                        ? 'উচ্চ-মূল্য ডুয়াল-লক সুরক্ষা সক্রিয়'
                        : 'High-Value Dual-Lock Active'
                      : lang === 'bn'
                        ? 'উচ্চ-মূল্য বায়োমেট্রিক সুরক্ষা প্রস্তুত'
                        : 'High-Value Biometric Shield'
                    : lang === 'bn'
                      ? 'বায়োমেট্রিক নিশ্চিতকরণ প্রস্তুত'
                      : 'Biometric Confirmation Ready'}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-normal break-words">
                  {primaryDeviceLabel}
                  {policy.isHighValueForBio && (
                    <>
                      {' · '}
                      {lang === 'bn'
                        ? `সুরক্ষা সীমা ≥ ${formatBdt(policy.effectiveThreshold, lang)}`
                        : `Threshold ≥ ${formatBdt(policy.effectiveThreshold, lang)}`}
                    </>
                  )}
                </p>
              </div>
            </div>

            {policy.requireAugmentStep && (
              <div className="pt-3 border-t border-emerald-200/80 dark:border-emerald-800/50 space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'দ্বিতীয় ধাপ: সিকিউরিটি পিন দিন (বায়োমেট্রিকের সাথে)'
                      : 'Step 2: Security PIN (required with Biometrics)'}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showAugmentPin ? 'text' : 'password'}
                    maxLength={5}
                    inputMode="numeric"
                    autoComplete="off"
                    value={augmentPin}
                    onChange={(e) => {
                      setAugmentPin(e.target.value.replace(/\D/g, ''));
                      if (localError) setLocalError('');
                    }}
                    placeholder="••••"
                    className="w-full min-h-[44px] px-3.5 pr-11 py-2 rounded-xl bg-white dark:bg-[#0B0D14] border border-emerald-300/80 dark:border-emerald-700/60 text-sm font-mono-tabular tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAugmentPin((v) => !v)}
                    aria-label="Toggle PIN visibility"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showAugmentPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {combinedError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
              <div>{combinedError}</div>
              <button
                type="button"
                onClick={() => {
                  setLocalError('');
                  if (onClearError) onClearError();
                  onAuthModeChange('pin');
                }}
                className="font-semibold underline text-indigo-700 dark:text-indigo-300 cursor-pointer"
              >
                {lang === 'bn' ? 'পরিবর্তে সিকিউরিটি পিন ব্যবহার করুন' : 'Use Security PIN instead'}
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={handleBiometricSubmit}
            className="w-full min-h-[52px] px-4 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all duration-150 disabled:opacity-60 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <span>
                  {lang === 'bn' ? 'বায়োমেট্রিক যাচাই হচ্ছে...' : 'Verifying Device Biometrics...'}
                </span>
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5 shrink-0" />
                <span className="truncate">
                  {policy.requireAugmentStep
                    ? lang === 'bn'
                      ? `পিন ও বায়োমেট্রিক দিয়ে নিশ্চিত (${amountLabel})`
                      : `Verify Biometrics + PIN (${amountLabel})`
                    : lang === 'bn'
                      ? `ফেস / ফিঙ্গারপ্রিন্ট দিয়ে নিশ্চিত (${amountLabel})`
                      : `Confirm with Biometrics (${amountLabel})`}
                </span>
              </>
            )}
          </button>
        </div>
      ) : (
        <form onSubmit={handlePinSubmit} className="space-y-3">
          {!biometricDisabledReason && !biometricsReady && webauthnCap?.supported && onOpenBiometricSettings && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300 min-w-0 flex-1">
                <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="leading-snug">
                  {amount >= platformHighValueThreshold
                    ? lang === 'bn'
                      ? 'উচ্চ-মূল্যের লেনদেন সুরক্ষায় ফিঙ্গারপ্রিন্ট / ফেস আইডি চালু করুন।'
                      : 'Protect high-value transfers with Fingerprint or Face ID.'
                    : lang === 'bn'
                      ? 'দ্রুত নিশ্চিতকরণের জন্য ফিঙ্গারপ্রিন্ট / ফেস আইডি চালু করুন।'
                      : 'Enable Fingerprint or Face ID for one-tap biometric confirmation.'}
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenBiometricSettings}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {lang === 'bn' ? 'চালু করুন' : 'Enable'}
              </button>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 space-y-2.5">
            <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>
                  {pinLabel ||
                    (lang === 'bn'
                      ? 'সিকিউরিটি পিন দিয়ে নিশ্চিত করুন'
                      : 'Authorize with Security PIN')}
                </span>
              </span>
              <span className="text-[11px] font-medium text-slate-400 shrink-0">
                {lang === 'bn' ? '৪–৫ সংখ্যা' : '4–5 Digits'}
              </span>
            </label>

            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                maxLength={5}
                inputMode="numeric"
                autoComplete="off"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value.replace(/\D/g, ''));
                  if (localError) setLocalError('');
                  if (onClearError && error) onClearError();
                }}
                placeholder={pinPlaceholder || '••••'}
                className="w-full min-h-[48px] px-4 pr-12 py-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-300 dark:border-slate-700 text-base font-mono-tabular tracking-[0.28em] text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label="Toggle PIN visibility"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {pinHint ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {pinHint}
              </p>
            ) : biometricDisabledReason ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                {biometricDisabledReason}
              </p>
            ) : null}
          </div>

          {combinedError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
              {combinedError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !/^\d{4,5}$/.test(pinInput.trim())}
            className="w-full min-h-[52px] px-4 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all duration-150 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <span>
                  {lang === 'bn' ? 'পিন যাচাই হচ্ছে...' : 'Verifying Security PIN...'}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span className="truncate">
                  {pinButtonLabel ||
                    (lang === 'bn'
                      ? `পিন দিয়ে নিশ্চিত করুন (${amountLabel})`
                      : `Confirm with PIN (${amountLabel})`)}
                </span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
