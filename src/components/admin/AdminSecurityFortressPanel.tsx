import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  Mail,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unlock,
  Volume2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AdminTwoFactorMethod,
  Language,
  SecurityEventRecord,
  SecurityPolicyConfig,
} from '../../types/acash';
import {
  adminResolveAndUnlockSecurityTarget,
  adminSaveTotpEnrollment,
  adminUpdateSecurityPolicy,
  getAdminTotpSecretForEmail,
} from '../../lib/acashService';
import {
  formatDurationRemaining,
  getActiveLockouts,
} from '../../lib/securityGuard';
import {
  buildTotpOtpAuthUri,
  formatTotpSecretForDisplay,
  generateTotpBase32Secret,
  verifyTotpCode,
} from '../../lib/totp';
import {
  DeviceAlertStatus,
  getDeviceAlertStatus,
  requestNativeAlertGestureAccess,
  sendTestDeviceAlert,
} from '../../lib/deviceAlerts';

interface AdminSecurityFortressPanelProps {
  lang: Language;
  adminEmail: string;
  securityEvents: SecurityEventRecord[];
  securityPolicy: SecurityPolicyConfig;
  onFeedback: (msg: string) => void;
}

export const AdminSecurityFortressPanel: React.FC<AdminSecurityFortressPanelProps> = ({
  lang,
  adminEmail,
  securityEvents,
  securityPolicy,
  onFeedback,
}) => {
  const [draftPolicy, setDraftPolicy] = useState<SecurityPolicyConfig>(securityPolicy);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [toggling2fa, setToggling2fa] = useState(false);
  const [pendingTotpSecret, setPendingTotpSecret] = useState<string | null>(null);
  const [totpVerifyInput, setTotpVerifyInput] = useState('');
  const [totpSetupBusy, setTotpSetupBusy] = useState(false);
  const [totpSetupError, setTotpSetupError] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [unlockingKey, setUnlockingKey] = useState<string | null>(null);
  const [activeLockouts, setActiveLockouts] = useState(() => getActiveLockouts());
  const [deviceStatus, setDeviceStatus] = useState<DeviceAlertStatus>(() =>
    getDeviceAlertStatus()
  );

  const enrolledTotpSecret = getAdminTotpSecretForEmail(adminEmail, securityPolicy);

  useEffect(() => {
    setDraftPolicy(securityPolicy);
  }, [securityPolicy]);

  const refreshLocalState = () => {
    setActiveLockouts(getActiveLockouts());
    setDeviceStatus(getDeviceAlertStatus());
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveLockouts(getActiveLockouts());
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      await adminUpdateSecurityPolicy(draftPolicy, adminEmail);
      onFeedback(
        lang === 'bn'
          ? '১০x সিকিউরিটি ও অ্যান্টি-স্প্যাম নীতি আপডেট করা হয়েছে।'
          : '10x Security & Anti-Spam Policy updated and synced live.'
      );
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'Failed to save security policy.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleUnlockTarget = async (params: {
    eventId?: string;
    scope?: string;
    targetIdentifier: string;
  }) => {
    const key = `${params.scope || 'ev'}:${params.targetIdentifier}`;
    setUnlockingKey(key);
    try {
      await adminResolveAndUnlockSecurityTarget({
        eventId: params.eventId,
        scope: params.scope,
        targetIdentifier: params.targetIdentifier,
        adminEmail,
      });
      refreshLocalState();
      onFeedback(
        lang === 'bn'
          ? `${params.targetIdentifier} এর লকআউট আনব্লক করা হয়েছে।`
          : `Cleared active lockouts and resolved security alert for ${params.targetIdentifier}.`
      );
    } finally {
      setUnlockingKey(null);
    }
  };

  const handleToggleAdmin2fa = async (nextEnabled: boolean) => {
    setToggling2fa(true);
    try {
      const updated = await adminUpdateSecurityPolicy(
        {
          ...draftPolicy,
          admin2faEnabled: nextEnabled,
        },
        adminEmail
      );
      setDraftPolicy(updated);
      onFeedback(
        nextEnabled
          ? lang === 'bn'
            ? `অ্যাডমিন ২FA চালু করা হয়েছে (${updated.admin2faMethod})। পরবর্তী লগইনে EmailJS বা Authenticator কোড প্রয়োজন হবে।`
            : `Admin Login 2FA ENABLED (${updated.admin2faMethod.replace(/_/g, ' ')}). Next Command Console login will require 2FA verification.`
          : lang === 'bn'
            ? 'অ্যাডমিন লগইন ২FA বন্ধ করা হয়েছে।'
            : 'Admin Login 2FA disabled.'
      );
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'Failed to toggle Admin 2FA.');
    } finally {
      setToggling2fa(false);
    }
  };

  const handleChange2faMethod = async (nextMethod: AdminTwoFactorMethod) => {
    setToggling2fa(true);
    try {
      const updated = await adminUpdateSecurityPolicy(
        {
          ...draftPolicy,
          admin2faMethod: nextMethod,
        },
        adminEmail
      );
      setDraftPolicy(updated);
      onFeedback(
        nextMethod === 'email_otp'
          ? 'Admin 2FA set to EmailJS Temporary Verification Code.'
          : nextMethod === 'authenticator_app'
            ? enrolledTotpSecret
              ? 'Admin 2FA set to Authenticator App (Google / Authy / Microsoft).'
              : 'Admin 2FA set to Authenticator App (EmailJS fallback remains active until you scan & verify your Authenticator QR below).'
            : 'Admin 2FA set to Both (sends EmailJS code and also accepts Authenticator App 6-digit TOTP).'
      );
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'Failed to update 2FA mode.');
    } finally {
      setToggling2fa(false);
    }
  };

  const handleVerifyAndSaveTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingTotpSecret) return;
    setTotpSetupError('');
    setTotpSetupBusy(true);
    try {
      const valid = await verifyTotpCode(pendingTotpSecret, totpVerifyInput, 1);
      if (!valid) {
        setTotpSetupError(
          lang === 'bn'
            ? '৬ সংখ্যার Authenticator কোডটি মেলেনি। ফোনের সময় (Automatic date/time) ও কোড আবার চেক করুন।'
            : '6-digit Authenticator code did not match. Confirm device time is automatic and enter the current code.'
        );
        return;
      }
      await adminSaveTotpEnrollment({
        targetAdminEmail: adminEmail,
        secretBase32: pendingTotpSecret,
        actorEmail: adminEmail,
      });
      setPendingTotpSecret(null);
      setTotpVerifyInput('');
      onFeedback(
        lang === 'bn'
          ? `${adminEmail} এর জন্য Google/TOTP Authenticator অ্যাপ সফলভাবে যুক্ত হয়েছে।`
          : `Authenticator App verified and bound to ${adminEmail}.`
      );
    } catch (err) {
      setTotpSetupError(err instanceof Error ? err.message : 'Failed to verify TOTP code.');
    } finally {
      setTotpSetupBusy(false);
    }
  };

  const handleRevokeTotp = async () => {
    setTotpSetupBusy(true);
    try {
      await adminSaveTotpEnrollment({
        targetAdminEmail: adminEmail,
        secretBase32: null,
        actorEmail: adminEmail,
      });
      onFeedback(`Authenticator App key revoked for ${adminEmail}. EmailJS 2FA remains available.`);
    } finally {
      setTotpSetupBusy(false);
    }
  };

  const unresolvedCount = securityEvents.filter((ev) => !ev.resolved).length;
  const criticalCount = securityEvents.filter((ev) => ev.severity === 'critical' && !ev.resolved).length;

  return (
    <div className="space-y-6">
      {/* Top Hero / Security Posture Overview */}
      <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {lang === 'bn'
                  ? '১০x সিকিউরিটি ও অ্যান্টি-স্প্যাম ফোর্ট্রেস সক্রিয়'
                  : '10x Security & Anti-Spam Fortress Active'}
              </span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'সিকিউরিটি ডিফেন্স, ব্রুট-ফোর্স লকআউট ও ডিভাইস অ্যালার্ট'
                : 'Security Defense Center, Brute-Force Lockouts & Device Alerts'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {lang === 'bn'
                ? 'সল্টেড SHA-256 হ্যাশিং, HMAC সেশন ট্যাম্পার সুরক্ষা, ব্রুট-ফোর্স লকআউট, ডুপ্লিকেট লেনদেন আইডেমপোটেন্সি, ওটিপি স্প্যাম শিল্ড এবং SVG/XSS পেলোড ব্লকার একসাথে কাজ করছে।'
                : 'Salted 512-round SHA-256 PIN/password hashing, HMAC session integrity signing, exponential brute-force lockouts, transaction replay & flood shields, OTP abuse guards, and XSS/SVG blockers.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const res = await requestNativeAlertGestureAccess(lang);
                refreshLocalState();
                onFeedback(
                  res.permission === 'granted'
                    ? 'OS Notification & Sound Gesture enabled on this device.'
                    : `Audio & Haptics unlocked. Notification permission status: ${res.permission}.`
                );
              }}
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span>
                {deviceStatus.notificationPermission === 'granted'
                  ? lang === 'bn'
                    ? 'ডিভাইস নোটিফিকেশন ও সাউন্ড সক্রিয়'
                    : 'Device Alerts & Sound Active'
                  : lang === 'bn'
                    ? 'ফোন/পিসি নোটিফিকেশন ও সাউন্ড চালু করুন'
                    : 'Enable Phone/PC Alerts & Sound'}
              </span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await sendTestDeviceAlert(lang);
                refreshLocalState();
              }}
              className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{lang === 'bn' ? 'টেস্ট সাউন্ড ও অ্যালার্ট' : 'Test Sound & Alert'}</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'ক্রিপ্টোগ্রাফিক হ্যাশ' : 'Credential Crypto'}
            </div>
            <div className="font-mono-tabular text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              SEC2 · SHA-256×512
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Auto-upgrades legacy hashes
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'সক্রিয় ডিভাইস লকআউট' : 'Active Browser Lockouts'}
            </div>
            <div className="font-mono-tabular text-xl font-bold text-slate-900 dark:text-white mt-1">
              {activeLockouts.length}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Exponential 1x→3x→6x lock
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'অমীমাংসিত থ্রেট' : 'Unresolved Incidents'}
            </div>
            <div
              className={`font-mono-tabular text-xl font-bold mt-1 ${
                unresolvedCount > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {unresolvedCount}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {criticalCount} critical alerts
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'স্প্যাম সুরক্ষা সীমা' : 'Tx Anti-Spam Limit'}
            </div>
            <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              {securityPolicy.maxTxPerMinute}/min
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              + 6s duplicate replay block
            </div>
          </div>
        </div>
      </div>

      {/* Admin 2FA Toggle + EmailJS & Google Authenticator Setup */}
      <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'bn'
                  ? 'অ্যাডমিন লগইন ২-ফ্যাক্টর অথেন্টিকেশন (2FA)'
                  : 'Admin Command Console 2-Factor Authentication (2FA)'}
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'EmailJS ভেরিফিকেশন কোড ও Google / TOTP অথেন্টিকেটর সুরক্ষা'
                : 'EmailJS Temporary Code & Authenticator App Verification'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {lang === 'bn'
                ? `চালু করলে কমান্ড কনসোলে ঢোকার আগে ${adminEmail}-এ অস্থায়ী কোড যাবে অথবা Google Authenticator / Authy / Microsoft Authenticator থেকে ৬ সংখ্যার কোড দিয়ে যাচাই করতে হবে।`
                : `When enabled, Admin login requires a temporary 6-digit verification code sent via EmailJS to ${adminEmail} and/or a live 6-digit TOTP code from Google Authenticator or any standard authenticator app before console access is granted.`}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={securityPolicy.admin2faEnabled}
            disabled={toggling2fa}
            onClick={() => void handleToggleAdmin2fa(!securityPolicy.admin2faEnabled)}
            className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
              securityPolicy.admin2faEnabled
                ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-slate-100 dark:bg-[#0B0D14] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400'
            }`}
          >
            <span
              className={`w-8 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                securityPolicy.admin2faEnabled ? 'bg-white/25 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
            </span>
            <span>
              {toggling2fa
                ? 'Updating...'
                : securityPolicy.admin2faEnabled
                  ? lang === 'bn'
                    ? 'অ্যাডমিন ২FA চালু আছে'
                    : 'Admin 2FA: ON'
                  : lang === 'bn'
                    ? 'অ্যাডমিন ২FA বন্ধ আছে'
                    : 'Admin 2FA: OFF'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Verification Channel Selection */}
          <div className="lg:col-span-5 space-y-3">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {lang === 'bn' ? '২FA ভেরিফিকেশন মাধ্যম নির্বাচন করুন' : 'Select Verification Method'}
            </div>
            <div className="space-y-2">
              {(
                [
                  {
                    id: 'both' as AdminTwoFactorMethod,
                    title:
                      lang === 'bn'
                        ? 'দুটোই চালু (EmailJS কোড + Authenticator অ্যাপ)'
                        : 'Both Enabled (EmailJS Code + Authenticator App)',
                    desc:
                      lang === 'bn'
                        ? 'লগইনে ইমেইলে অস্থায়ী কোড পাঠাবে এবং Authenticator কোডও গ্রহণ করবে।'
                        : 'Sends temporary EmailJS code on login and also accepts 6-digit Authenticator TOTP codes.',
                    icon: ShieldCheck,
                  },
                  {
                    id: 'email_otp' as AdminTwoFactorMethod,
                    title:
                      lang === 'bn'
                        ? 'শুধু EmailJS অস্থায়ী কোড'
                        : 'EmailJS Temporary Verification Code Only',
                    desc: `Sends a 10-minute 6-digit code directly to ${adminEmail} via EmailJS.`,
                    icon: Mail,
                  },
                  {
                    id: 'authenticator_app' as AdminTwoFactorMethod,
                    title:
                      lang === 'bn'
                        ? 'Google / যেকোনো Authenticator অ্যাপ (TOTP)'
                        : 'Authenticator App Only (Google, Authy, Microsoft)',
                    desc: enrolledTotpSecret
                      ? 'Requires live 6-digit rotating TOTP code from your enrolled Authenticator app.'
                      : 'Requires Authenticator TOTP (uses EmailJS code as safe fallback until QR enrolled).',
                    icon: Smartphone,
                  },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = securityPolicy.admin2faMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={toggling2fa}
                    onClick={() => void handleChange2faMethod(opt.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-colors flex items-start gap-3 ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/40'
                        : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {opt.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Authenticator App TOTP Enrollment Card */}
          <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'Google Authenticator / TOTP অ্যাপ সেটআপ'
                      : 'Google Authenticator / TOTP App Enrollment'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>{adminEmail}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      enrolledTotpSecret
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-amber-600 dark:text-amber-400 font-semibold'
                    }
                  >
                    {enrolledTotpSecret ? 'Authenticator Active' : 'Not Yet Enrolled'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingTotpSecret(generateTotpBase32Secret(20));
                    setTotpVerifyInput('');
                    setTotpSetupError('');
                    setCopiedSecret(false);
                  }}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {enrolledTotpSecret
                      ? lang === 'bn'
                        ? 'নতুন QR কী তৈরি করুন'
                        : 'Rotate Authenticator Key'
                      : lang === 'bn'
                        ? 'Authenticator QR সেটআপ করুন'
                        : 'Setup Authenticator App'}
                  </span>
                </button>

                {enrolledTotpSecret && !pendingTotpSecret && (
                  <button
                    type="button"
                    disabled={totpSetupBusy}
                    onClick={() => void handleRevokeTotp()}
                    className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{lang === 'bn' ? 'রিমুভ' : 'Revoke Key'}</span>
                  </button>
                )}
              </div>
            </div>

            {pendingTotpSecret ? (
              <form onSubmit={handleVerifyAndSaveTotp} className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 items-center">
                <div className="sm:col-span-5 flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-200">
                  <QRCodeSVG
                    value={buildTotpOtpAuthUri({
                      secret: pendingTotpSecret,
                      accountEmail: adminEmail,
                      issuer: 'Acash Admin',
                    })}
                    size={148}
                    level="M"
                    fgColor="#0f172a"
                  />
                  <span className="text-[10px] text-slate-500 mt-2 text-center">
                    Scan with Google Authenticator, Microsoft Authenticator or Authy
                  </span>
                </div>

                <div className="sm:col-span-7 space-y-3">
                  <div>
                    <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Manual Setup Key (Time-based / SHA1 / 6 digits)
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular font-bold text-slate-900 dark:text-white tracking-wider break-all">
                        {formatTotpSecretForDisplay(pendingTotpSecret)}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(pendingTotpSecret);
                          setCopiedSecret(true);
                        }}
                        className="px-2.5 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {lang === 'bn'
                        ? 'অ্যাপ থেকে ৬ সংখ্যার কোড লিখে কনফার্ম করুন'
                        : 'Enter 6-Digit Code Shown in Your Authenticator App'}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={totpVerifyInput}
                      onChange={(e) => setTotpVerifyInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-sm font-mono-tabular tracking-[0.25em] text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {totpSetupError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-[11px] text-rose-700 dark:text-rose-300">
                      {totpSetupError}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={totpSetupBusy || totpVerifyInput.length !== 6}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                    >
                      {totpSetupBusy ? 'Verifying...' : 'Verify & Bind Authenticator'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingTotpSecret(null);
                        setTotpVerifyInput('');
                        setTotpSetupError('');
                      }}
                      className="py-2.5 px-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-200 dark:border-slate-800">
                {enrolledTotpSecret ? (
                  <p>
                    {lang === 'bn'
                      ? `${adminEmail} অ্যাকাউন্টের সাথে TOTP Authenticator কী যুক্ত আছে। Google Authenticator বা অন্য কোনো Authenticator অ্যাপের ৬ সংখ্যার কোড দিয়ে লগইন যাচাই করা যাবে।`
                      : `An RFC 6238 TOTP key is active for ${adminEmail}. You can sign in using rotating 6-digit codes from Google Authenticator, Microsoft Authenticator, Authy, 1Password, or Bitwarden.`}
                  </p>
                ) : (
                  <p>
                    {lang === 'bn'
                      ? 'Google Authenticator, Microsoft Authenticator, Authy বা যেকোনো TOTP অ্যাপ যুক্ত করতে উপরের "Setup Authenticator App" বাটনে ক্লিক করে QR কোড স্ক্যান করুন।'
                      : 'Click "Setup Authenticator App" above to scan a QR code with Google Authenticator, Authy, Microsoft Authenticator, or any TOTP password manager.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Live Security Policy Form */}
        <form
          onSubmit={handleSavePolicy}
          className="xl:col-span-5 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>{lang === 'bn' ? 'লাইভ সিকিউরিটি পলিসি' : 'Live Security & Anti-Spam Policy'}</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Applies immediately across Account & Admin portals.
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'স্ট্রিক্ট অ্যান্টি-স্প্যাম মোড' : 'Strict Anti-Spam & Flood Shield'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Blocks duplicate clicks, tx bursts & registration floods
              </div>
            </div>
            <input
              type="checkbox"
              checked={draftPolicy.strictAntiSpamMode}
              onChange={(e) =>
                setDraftPolicy((p) => ({ ...p, strictAntiSpamMode: e.target.checked }))
              }
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'অ্যাডমিন লগইন বট চ্যালেঞ্জ' : 'Admin Login Anti-Bot Challenge'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Requires human verification after 2+ failed logins
              </div>
            </div>
            <input
              type="checkbox"
              checked={draftPolicy.requireChallengeOnAdminFail}
              onChange={(e) =>
                setDraftPolicy((p) => ({
                  ...p,
                  requireChallengeOnAdminFail: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Max Tx / Minute (2–30)
              </label>
              <input
                type="number"
                min={2}
                max={30}
                value={draftPolicy.maxTxPerMinute}
                onChange={(e) =>
                  setDraftPolicy((p) => ({ ...p, maxTxPerMinute: Number(e.target.value) || 6 }))
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Max Wrong PINs (3–12)
              </label>
              <input
                type="number"
                min={3}
                max={12}
                value={draftPolicy.maxLoginFailures}
                onChange={(e) =>
                  setDraftPolicy((p) => ({ ...p, maxLoginFailures: Number(e.target.value) || 5 }))
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Lockout Minutes (1–60)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={draftPolicy.lockoutMinutes}
                onChange={(e) =>
                  setDraftPolicy((p) => ({ ...p, lockoutMinutes: Number(e.target.value) || 5 }))
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Admin Idle Lock (5–120m)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={draftPolicy.adminIdleTimeoutMinutes}
                onChange={(e) =>
                  setDraftPolicy((p) => ({
                    ...p,
                    adminIdleTimeoutMinutes: Number(e.target.value) || 15,
                  }))
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Account Portal Idle Timeout Minutes (5–240m)
              </label>
              <input
                type="number"
                min={5}
                max={240}
                value={draftPolicy.accountIdleTimeoutMinutes}
                onChange={(e) =>
                  setDraftPolicy((p) => ({
                    ...p,
                    accountIdleTimeoutMinutes: Number(e.target.value) || 30,
                  }))
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPolicy}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            {savingPolicy
              ? lang === 'bn'
                ? 'সংরক্ষণ হচ্ছে...'
                : 'Saving Security Policy...'
              : lang === 'bn'
                ? 'সিকিউরিটি পলিসি সেভ করুন'
                : 'Save & Enforce Security Policy'}
          </button>

          {/* Active Lockouts on this Browser */}
          {activeLockouts.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Active Local Lockouts ({activeLockouts.length})</span>
                </span>
                <button
                  type="button"
                  onClick={refreshLocalState}
                  className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>
              {activeLockouts.map((lock) => (
                <div
                  key={`${lock.scope}:${lock.key}`}
                  className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate font-mono-tabular">
                      {lock.scope} · {lock.key}
                    </div>
                    <div className="text-[10px] text-rose-700 dark:text-rose-300">
                      {lock.attempts} failures · {formatDurationRemaining(lock.lockedUntil - Date.now())} left
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void handleUnlockTarget({
                        scope: lock.scope,
                        targetIdentifier: lock.key,
                      })
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-rose-200 dark:border-rose-500/40 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>Unlock</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>

        {/* Right: Cloud Security Incident Feed */}
        <div className="xl:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>
                  {lang === 'bn'
                    ? 'লাইভ থ্রেট, হ্যাক ও স্প্যাম ব্লক লগ'
                    : 'Live Threat, Brute-Force & Anti-Spam Incident Feed'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Real-time telemetry from Account Portal, Admin Portal & Firestore Guards
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 font-mono-tabular text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">
              {securityEvents.length} events
            </span>
          </div>

          <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {securityEvents.length === 0 ? (
              <div className="py-14 px-6 text-center space-y-2">
                <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'কোনো নিরাপত্তা হুমকি নেই' : 'Zero Security Incidents Recorded'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  All brute-force attempts, spam floods, SVG/XSS injections, and tampered session tokens will appear here automatically with one-click unlock controls.
                </p>
              </div>
            ) : (
              securityEvents.map((ev) => {
                const busy = unlockingKey?.endsWith(`:${ev.targetIdentifier}`);
                return (
                  <div
                    key={ev.id}
                    className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      ev.resolved
                        ? 'opacity-65 bg-white dark:bg-[#121622]'
                        : ev.severity === 'critical'
                          ? 'bg-rose-50/60 dark:bg-rose-500/10'
                          : 'bg-amber-50/40 dark:bg-amber-500/5'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ev.severity === 'critical'
                              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                              : ev.severity === 'warning'
                                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {ev.eventType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {ev.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {ev.details}
                      </p>
                      <div className="text-[10px] font-mono-tabular text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                        <span>Target: {ev.targetIdentifier}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(ev.createdAt).toLocaleString()}</span>
                        {ev.resolved && ev.resolvedBy && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Resolved by {ev.resolvedBy}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {!ev.resolved && (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void handleUnlockTarget({
                            eventId: ev.id,
                            targetIdentifier: ev.targetIdentifier,
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Unlock className="w-3.5 h-3.5 shrink-0" />
                        <span>{lang === 'bn' ? 'আনব্লক ও সমাধান' : 'Resolve & Unlock'}</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
