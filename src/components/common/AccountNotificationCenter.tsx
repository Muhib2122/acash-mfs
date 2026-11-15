import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  FileText,
  Megaphone,
  ShieldAlert,
  Sparkles,
  Vibrate,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AccountNotification,
  AcashTransaction,
  Language,
} from '../../types/acash';
import { isAccountNotificationRead } from '../../lib/acashService';
import {
  DeviceAlertStatus,
  getDeviceAlertStatus,
  requestNativeAlertGestureAccess,
  sendTestDeviceAlert,
  setHapticsEnabled,
  setOsNotificationEnabled,
  triggerHapticGesture,
} from '../../lib/deviceAlerts';
import { setVoiceMuted } from '../../lib/soundbox';

export interface LiveToastItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  txId?: string;
  notifId?: string;
  createdAt: number;
}

interface LiveAccountToastStackProps {
  toasts: LiveToastItem[];
  lang: Language;
  onDismiss: (id: string) => void;
  onOpenDetails: (toast: LiveToastItem) => void;
}

export const LiveAccountToastStack: React.FC<LiveAccountToastStackProps> = ({
  toasts,
  lang,
  onDismiss,
  onOpenDetails,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-18 right-3 left-3 sm:left-auto sm:right-5 sm:w-96 z-50 space-y-2.5 pointer-events-none"
    >
      {toasts.slice(0, 3).map((toast) => {
        const tone =
          toast.severity === 'success'
            ? 'border-emerald-300 dark:border-emerald-500/45 bg-white/95 dark:bg-[#121927]/95'
            : toast.severity === 'warning'
              ? 'border-amber-300 dark:border-amber-500/45 bg-white/95 dark:bg-[#1a1612]/95'
              : toast.severity === 'critical'
                ? 'border-rose-300 dark:border-rose-500/45 bg-white/95 dark:bg-[#1f1318]/95'
                : 'border-indigo-300 dark:border-indigo-500/45 bg-white/95 dark:bg-[#121622]/95';

        const iconTone =
          toast.severity === 'success'
            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : toast.severity === 'warning'
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
              : toast.severity === 'critical'
                ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto acash-toast-enter acash-3d-surface rounded-2xl border backdrop-blur-md p-3.5 flex items-start gap-3 ${tone}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}>
              {toast.severity === 'success' ? (
                <ArrowDownLeft className="w-4 h-4" />
              ) : toast.severity === 'critical' || toast.severity === 'warning' ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenDetails(toast)}
              className="flex-1 min-w-0 text-left"
            >
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {toast.title}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                {toast.message}
              </p>
              <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                {lang === 'bn' ? 'বিস্তারিত দেখুন' : 'Tap to inspect'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss alert"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

interface AccountNotificationModalProps {
  accountId: string;
  notifications: AccountNotification[];
  transactions: AcashTransaction[];
  lang: Language;
  onClose: () => void;
  onMarkRead: (notifId: string) => void;
  onMarkAllRead: () => void;
  onOpenReceipt: (tx: AcashTransaction) => void;
}

export const AccountNotificationModal: React.FC<AccountNotificationModalProps> = ({
  accountId,
  notifications,
  transactions,
  lang,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onOpenReceipt,
}) => {
  const [filter, setFilter] = useState<'all' | 'transaction' | 'admin_alert'>('all');
  const [deviceStatus, setDeviceStatus] = useState<DeviceAlertStatus>(() =>
    getDeviceAlertStatus()
  );
  const [testNotice, setTestNotice] = useState('');

  const refreshDeviceStatus = () => setDeviceStatus(getDeviceAlertStatus());

  const handleEnableDeviceGesture = async () => {
    const res = await requestNativeAlertGestureAccess(lang);
    refreshDeviceStatus();
    setTestNotice(
      res.permission === 'granted'
        ? lang === 'bn'
          ? 'ফোন/পিসি নোটিফিকেশন, সাউন্ড ও ভাইব্রেশন চালু হয়েছে!'
          : 'Phone/PC Notification, Sound & Vibration gestures enabled!'
        : res.permission === 'denied'
          ? lang === 'bn'
            ? 'সাউন্ড চালু হয়েছে। ব্রাউজার সেটিংস থেকে Notifications Allow করুন।'
            : 'Sound & haptics enabled. Allow Notifications in browser settings for OS banners.'
          : lang === 'bn'
            ? 'অ্যাপ সাউন্ড ও জেসচার চালু হয়েছে।'
            : 'In-app sound & haptic alerts unlocked.'
    );
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !isAccountNotificationRead(n, accountId)).length,
    [notifications, accountId]
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'transaction') {
      return notifications.filter((n) => n.category === 'transaction');
    }
    return notifications.filter((n) => n.category !== 'transaction');
  }, [notifications, filter]);

  const txMap = useMemo(() => {
    const map = new Map<string, AcashTransaction>();
    for (const tx of transactions) {
      map.set(tx.txId, tx);
    }
    return map;
  }, [transactions]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Grab bar on mobile */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'লাইভ নোটিফিকেশন ও অ্যালার্ট' : 'Live Notifications & Alerts'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono-tabular">
              {accountId} · {unreadCount}{' '}
              {lang === 'bn' ? 'টি অপঠিত' : 'unread'} ·{' '}
              {lang === 'bn' ? 'অটো-সিঙ্ক চালু' : 'Zero-refresh live sync'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="min-h-[36px] px-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'সব পড়া হয়েছে' : 'Mark all'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800/70 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Device Notification, Sound & Haptic Gesture Control Bar */}
        <div className="px-5 py-3 bg-indigo-50/70 dark:bg-indigo-500/10 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                  {lang === 'bn'
                    ? 'ডিভাইস নোটিফিকেশন ও সাউন্ড জেসচার'
                    : 'Phone / PC Alert & Sound Gestures'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {deviceStatus.notificationPermission === 'granted'
                    ? lang === 'bn'
                      ? 'OS নোটিফিকেশন অনুমতি সক্রিয়'
                      : 'OS notifications granted · Sound ready'
                    : lang === 'bn'
                      ? 'লাইভ ব্যানার ও সাউন্ডের জন্য অনুমতি দিন'
                      : 'Tap Enable to unlock native OS alerts & audio'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleEnableDeviceGesture}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
              >
                {deviceStatus.notificationPermission === 'granted' && deviceStatus.audioUnlocked
                  ? lang === 'bn'
                    ? 'সক্রিয় ✓'
                    : 'Enabled ✓'
                  : lang === 'bn'
                    ? 'অনুমতি দিন'
                    : 'Enable Alerts'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await sendTestDeviceAlert(lang);
                  refreshDeviceStatus();
                  setTestNotice(
                    ok
                      ? lang === 'bn'
                        ? 'টেস্ট সাউন্ড ও নোটিফিকেশন পাঠানো হয়েছে!'
                        : 'Test sound & OS notification sent!'
                      : lang === 'bn'
                        ? 'টেস্ট সাউন্ড বাজানো হয়েছে।'
                        : 'Test sound played. Tap Enable Alerts for OS banner.'
                  );
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 transition-colors"
              >
                {lang === 'bn' ? 'টেস্ট সাউন্ড' : 'Test Sound'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextMuted = !deviceStatus.voiceMuted;
                setVoiceMuted(nextMuted);
                if (!nextMuted) void requestNativeAlertGestureAccess(lang);
                refreshDeviceStatus();
              }}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                !deviceStatus.voiceMuted
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              {deviceStatus.voiceMuted ? (
                <VolumeX className="w-3 h-3" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
              <span>{deviceStatus.voiceMuted ? 'Voice Muted' : 'Sound & Voice ON'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !deviceStatus.osNotifEnabled;
                setOsNotificationEnabled(next);
                refreshDeviceStatus();
              }}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                deviceStatus.osNotifEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Bell className="w-3 h-3" />
              <span>{deviceStatus.osNotifEnabled ? 'OS Push ON' : 'OS Push OFF'}</span>
            </button>

            {deviceStatus.hapticsSupported && (
              <button
                type="button"
                onClick={() => {
                  const next = !deviceStatus.hapticsEnabled;
                  setHapticsEnabled(next);
                  if (next) triggerHapticGesture('tap');
                  refreshDeviceStatus();
                }}
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
                  deviceStatus.hapticsEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Vibrate className="w-3 h-3" />
                <span>{deviceStatus.hapticsEnabled ? 'Vibration ON' : 'Vibration OFF'}</span>
              </button>
            )}
          </div>

          {testNotice && (
            <div className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
              {testNotice}
            </div>
          )}
        </div>

        {/* Interactive Filter Segmented Tabs */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-[#0B0D14] border-b border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
            {[
              { id: 'all' as const, label: lang === 'bn' ? 'সবগুলো' : 'All Alerts' },
              { id: 'transaction' as const, label: lang === 'bn' ? 'লেনদেন' : 'Transactions' },
              { id: 'admin_alert' as const, label: lang === 'bn' ? 'অ্যাডমিন বার্তা' : 'Admin & Security' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[36px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                  filter === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notification Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <div className="py-14 px-6 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto opacity-80" />
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'bn' ? 'এখনো কোনো নোটিফিকেশন নেই' : 'No notifications yet'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                {lang === 'bn'
                  ? 'নতুন লেনদেন, অ্যাডমিন ক্রেডিট, কেওয়াইসি এবং অ্যাডমিন অ্যালার্ট এখানে রিয়েল-টাইমে দেখা যাবে।'
                  : 'Incoming transactions, Admin alerts, fee changes, and security updates appear here live without refreshing.'}
              </p>
            </div>
          ) : (
            filtered.map((n) => {
              const isRead = isAccountNotificationRead(n, accountId);
              const linkedTx = n.txId ? txMap.get(n.txId) : undefined;
              const categoryLabel =
                n.category === 'transaction'
                  ? lang === 'bn'
                    ? 'লেনদেন'
                    : 'Transaction'
                  : n.category === 'admin_alert'
                    ? lang === 'bn'
                      ? 'অ্যাডমিন অ্যালার্ট'
                      : 'Admin Alert'
                    : n.category === 'security'
                      ? lang === 'bn'
                        ? 'নিরাপত্তা'
                        : 'Security'
                      : n.category === 'kyc'
                        ? 'KYC'
                        : lang === 'bn'
                          ? 'ফি আপডেট'
                          : 'Fee Update';

              return (
                <div
                  key={n.id}
                  className={`px-5 py-4 transition-colors ${
                    isRead
                      ? 'bg-white dark:bg-[#121622]'
                      : 'bg-indigo-50/60 dark:bg-indigo-500/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        n.severity === 'success'
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : n.severity === 'critical'
                            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                            : n.severity === 'warning'
                              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                              : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {n.category === 'admin_alert' ? (
                        <Megaphone className="w-4 h-4" />
                      ) : n.category === 'security' ? (
                        <ShieldAlert className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                          {new Date(n.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 mt-0.5">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {categoryLabel}
                        </span>
                        {n.recipientId === 'ALL' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{lang === 'bn' ? 'সর্বজনীন ঘোষণা' : 'Platform Broadcast'}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                        {n.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        {linkedTx && (
                          <button
                            type="button"
                            onClick={() => {
                              onMarkRead(n.id);
                              onOpenReceipt(linkedTx);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white inline-flex items-center gap-1 transition-colors"
                          >
                            <FileText className="w-3 h-3" />
                            <span>{lang === 'bn' ? 'রসিদ দেখুন' : 'View Receipt'}</span>
                          </button>
                        )}
                        {!isRead && (
                          <button
                            type="button"
                            onClick={() => onMarkRead(n.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            <span>{lang === 'bn' ? 'পড়া হয়েছে' : 'Mark Read'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
