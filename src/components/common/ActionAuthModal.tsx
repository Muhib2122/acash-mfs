import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ActionAuthInput,
  Language,
  WebAuthnCredentialRecord,
} from '../../types/acash';
import {
  authorizeSensitiveActionWithBiometrics,
  detectWebAuthnCapability,
  sanitizeBiometricDeviceLabelForDisplay,
  WebAuthnCapability,
} from '../../lib/webauthn';

export interface ActionAuthPromptRequest {
  title: string;
  subtitle?: string;
  actionName: string;
  subjectId: string;
  credentials?: WebAuthnCredentialRecord[];
  isAdmin?: boolean;
  adminHasActionPin?: boolean;
  onExecute: (auth: ActionAuthInput) => Promise<void>;
}

interface ActionAuthModalProps {
  open: boolean;
  request: ActionAuthPromptRequest | null;
  lang?: Language;
  onClose: () => void;
}

export const ActionAuthModal: React.FC<ActionAuthModalProps> = ({
  open,
  request,
  lang = 'en',
  onClose,
}) => {
  const [cap, setCap] = useState<WebAuthnCapability | null>(null);
  const [pinOrPassword, setPinOrPassword] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [busyMode, setBusyMode] = useState<'none' | 'biometric' | 'pin'>('none');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setPinOrPassword('');
      setShowSecret(false);
      setBusyMode('none');
      setError('');
      return;
    }
    setPinOrPassword('');
    setShowSecret(false);
    setBusyMode('none');
    setError('');
    detectWebAuthnCapability()
      .then(setCap)
      .catch(() => setCap(null));
  }, [open, request]);

  if (!open || !request) return null;

  const credentials = request.credentials || [];
  const biometricsReady = credentials.length > 0 && Boolean(cap?.supported);
  const primaryDeviceLabel = credentials[0]
    ? sanitizeBiometricDeviceLabelForDisplay(credentials[0].deviceLabel)
    : lang === 'bn'
      ? 'ডিভাইস বায়োমেট্রিক'
      : 'Device Biometric Passkey';

  const handleBiometricVerify = async () => {
    setError('');
    setBusyMode('biometric');
    try {
      const biometricProof = await authorizeSensitiveActionWithBiometrics({
        subjectId: request.subjectId,
        actionName: request.actionName,
        credentials,
      });
      await request.onExecute({ biometricProof });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'bn'
            ? 'বায়োমেট্রিক যাচাই ব্যর্থ হয়েছে।'
            : 'Biometric verification failed.'
      );
    } finally {
      setBusyMode('none');
    }
  };

  const handlePinOrPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = pinOrPassword.trim();
    if (!request.isAdmin && !/^\d{4,5}$/.test(trimmed)) {
      setError(
        lang === 'bn'
          ? 'পরিবর্তন নিশ্চিত করতে ৪ বা ৫ সংখ্যার সিকিউরিটি পিন দিন।'
          : 'Enter your 4 or 5-digit Security PIN to authorize this change.'
      );
      return;
    }
    if (request.isAdmin && trimmed.length < 4) {
      setError(
        request.adminHasActionPin
          ? 'Enter your 4–6 digit Admin Action PIN or Admin Login Password.'
          : 'Enter your Admin Login Password to authorize this change.'
      );
      return;
    }

    setBusyMode('pin');
    try {
      await request.onExecute({ pin: trimmed });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'bn'
            ? 'যাচাই ব্যর্থ হয়েছে।'
            : 'Verification failed.'
      );
    } finally {
      setBusyMode('none');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-slate-50/70 dark:bg-[#0B0D14]/60">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug break-words">
                {request.title}
              </h3>
              {request.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
                  {request.subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={busyMode !== 'none'}
            onClick={onClose}
            aria-label="Close security verification"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {biometricsReady && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 space-y-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Fingerprint className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'বায়োমেট্রিক যাচাইকরণ' : 'Verify with Device Biometrics'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {primaryDeviceLabel}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={busyMode !== 'none'}
                onClick={handleBiometricVerify}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {busyMode === 'biometric' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Verifying Biometrics...'}</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 shrink-0" />
                    <span>{lang === 'bn' ? 'ফেস / ফিঙ্গারপ্রিন্ট দিন' : 'Use Face ID / Fingerprint'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {biometricsReady && (
            <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span>{lang === 'bn' ? 'অথবা' : 'OR'}</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
          )}

          <form onSubmit={handlePinOrPasswordSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    {request.isAdmin
                      ? request.adminHasActionPin
                        ? 'Admin Action PIN or Login Password'
                        : 'Admin Login Password'
                      : lang === 'bn'
                        ? 'আপনার সিকিউরিটি পিন'
                        : 'Account Security PIN'}
                  </span>
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  {request.isAdmin
                    ? request.adminHasActionPin
                      ? 'PIN / Password'
                      : 'Password'
                    : lang === 'bn'
                      ? '৪–৫ সংখ্যা'
                      : '4–5 Digits'}
                </span>
              </label>

              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  autoFocus={!biometricsReady}
                  autoComplete="off"
                  maxLength={request.isAdmin ? 64 : 5}
                  inputMode={request.isAdmin ? 'text' : 'numeric'}
                  value={pinOrPassword}
                  onChange={(e) => {
                    const val = request.isAdmin ? e.target.value : e.target.value.replace(/\D/g, '');
                    setPinOrPassword(val);
                    if (error) setError('');
                  }}
                  placeholder={request.isAdmin ? '••••••••' : '••••'}
                  className={`w-full min-h-[48px] px-4 pr-11 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 ${
                    !request.isAdmin ? 'font-mono-tabular tracking-[0.25em] text-base' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label="Toggle secret visibility"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busyMode !== 'none'}
                onClick={onClose}
                className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busyMode !== 'none' || pinOrPassword.trim().length < 4}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs sm:text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {busyMode === 'pin' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Authorizing...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>
                      {request.isAdmin
                        ? 'Authorize Action'
                        : lang === 'bn'
                          ? 'পিন দিয়ে নিশ্চিত করুন'
                          : 'Confirm with PIN'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export function useActionAuthModal(lang: Language = 'en') {
  const [request, setRequest] = useState<ActionAuthPromptRequest | null>(null);
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<{ resolve: () => void; reject: (err: Error) => void } | null>(null);

  const closeModal = useCallback(() => {
    setOpen(false);
    setRequest(null);
    if (resolverRef.current) {
      resolverRef.current.reject(new Error('Verification cancelled.'));
      resolverRef.current = null;
    }
  }, []);

  const requestActionAuth = useCallback(
    (params: {
      title: string;
      subtitle?: string;
      actionName: string;
      subjectId: string;
      credentials?: WebAuthnCredentialRecord[];
      isAdmin?: boolean;
      adminHasActionPin?: boolean;
      run: (auth: ActionAuthInput) => Promise<void>;
    }): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        resolverRef.current = { resolve, reject };
        setRequest({
          title: params.title,
          subtitle: params.subtitle,
          actionName: params.actionName,
          subjectId: params.subjectId,
          credentials: params.credentials,
          isAdmin: params.isAdmin,
          adminHasActionPin: params.adminHasActionPin,
          onExecute: async (auth: ActionAuthInput) => {
            await params.run(auth);
            if (resolverRef.current) {
              resolverRef.current.resolve();
              resolverRef.current = null;
            }
          },
        });
        setOpen(true);
      });
    },
    []
  );

  const authModalElement = (
    <ActionAuthModal
      open={open}
      request={request}
      lang={lang}
      onClose={closeModal}
    />
  );

  return {
    requestActionAuth,
    authModalElement,
    isAuthModalOpen: open,
  };
}
