import React, { useMemo, useState } from 'react';
import {
  Fingerprint,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { AcashUser, Language } from '../../types/acash';
import { formatBdt } from '../../lib/i18n';
import {
  resolveBiometricPolicyForAmount,
  WebAuthnCapability,
} from '../../lib/webauthn';
import { TapAndHoldButton } from './TapAndHoldButton';

export type ConfirmAuthMode = 'biometric' | 'tap_hold';

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
  onConfirmTapHold: () => Promise<void> | void;
  onOpenBiometricSettings?: () => void;
  tapHoldButtonLabel?: string;
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
  onConfirmTapHold,
  onOpenBiometricSettings,
  tapHoldButtonLabel,
  biometricDisabledReason,
}) => {
  const [augmentPin, setAugmentPin] = useState('');
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
  const activeMode: ConfirmAuthMode = showBiometricOption ? authMode : 'tap_hold';
  const combinedError = localError || error;
  const primaryDeviceLabel = enrolledBiometrics[0]?.deviceLabel || (lang === 'bn' ? 'ডিভাইস পাসকি' : 'Device Passkey');

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

  return (
    <div className="space-y-3">
      {/* Calm segmented control only when user has enrolled biometrics */}
      {showBiometricOption && (
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setLocalError('');
              if (onClearError) onClearError();
              onAuthModeChange('biometric');
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer ${
              activeMode === 'biometric'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Fingerprint className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {lang === 'bn' ? 'ফেস / ফিঙ্গারপ্রিন্ট' : 'Biometrics'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalError('');
              if (onClearError) onClearError();
              onAuthModeChange('tap_hold');
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer ${
              activeMode === 'tap_hold'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {lang === 'bn' ? 'ট্যাপ ও হোল্ড' : 'Tap & Hold'}
            </span>
          </button>
        </div>
      )}

      {showBiometricOption && activeMode === 'biometric' ? (
        <div className="space-y-3">
          {/* Calm single-elevation biometric summary surface */}
          <div className="p-4 rounded-2xl bg-emerald-50/55 dark:bg-emerald-950/25 border border-emerald-200/90 dark:border-emerald-800/60 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-snug">
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
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
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

            {/* Dual-Lock Augment step: shown ONLY when user explicitly opted into Augment Mode on high-value transfers */}
            {policy.requireAugmentStep && (
              <div className="pt-2.5 border-t border-emerald-200/80 dark:border-emerald-800/50 space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'দ্বিতীয় ধাপ: সিকিউরিটি পিন দিন (বায়োমেট্রিকের সাথে)'
                      : 'Step 2: Security PIN (with Face ID / Fingerprint)'}
                  </span>
                </label>
                <input
                  type="password"
                  maxLength={5}
                  inputMode="numeric"
                  value={augmentPin}
                  onChange={(e) => {
                    setAugmentPin(e.target.value.replace(/\D/g, ''));
                    if (localError) setLocalError('');
                  }}
                  placeholder="••••"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#0B0D14] border border-emerald-300/80 dark:border-emerald-700/60 text-sm font-mono-tabular tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
                />
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
                  onAuthModeChange('tap_hold');
                }}
                className="font-semibold underline text-indigo-700 dark:text-indigo-300 cursor-pointer"
              >
                {lang === 'bn' ? 'পরিবর্তে ট্যাপ ও হোল্ড ব্যবহার করুন' : 'Switch to Tap & Hold instead'}
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
        <div className="space-y-3">
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
                      ? 'সহজ এক-ট্যাপ নিশ্চিতকরণের জন্য ফিঙ্গারপ্রিন্ট / ফেস আইডি চালু করুন।'
                      : 'Enable Fingerprint or Face ID for effortless one-tap confirmation.'}
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

          {combinedError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
              {combinedError}
            </div>
          )}

          <TapAndHoldButton
            lang={lang}
            loading={submitting}
            disabled={submitting}
            amountLabel={tapHoldButtonLabel || amountLabel}
            onConfirm={onConfirmTapHold}
          />
        </div>
      )}
    </div>
  );
};
