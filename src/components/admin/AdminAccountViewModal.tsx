import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Eye,
  FileBadge2,
  FileText,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  User as UserIcon,
  X,
  ZoomIn,
} from 'lucide-react';
import { AcashTransaction, AcashUser, FeeConfig, Language } from '../../types/acash';
import { formatBdt } from '../../lib/i18n';
import { adminSendAccountNotification, formatUserReferralSource } from '../../lib/acashService';
import {
  downloadAccountStatementPdf,
  downloadCreatorKycProfilePdf,
} from '../../lib/pdfGenerator';

interface AdminAccountViewModalProps {
  user: AcashUser;
  allTransactions: AcashTransaction[];
  feeConfig: FeeConfig;
  lang: Language;
  adminEmail: string;
  actionBusy?: boolean;
  onClose: () => void;
  onCreditAccount: (accountId: string) => void;
  onToggleStatus: (user: AcashUser) => void;
}

export const AdminAccountViewModal: React.FC<AdminAccountViewModalProps> = ({
  user,
  allTransactions,
  feeConfig,
  lang,
  adminEmail,
  actionBusy = false,
  onClose,
  onCreditAccount,
  onToggleStatus,
}) => {
  const [txFilter, setTxFilter] = useState<'all' | 'incoming' | 'outgoing' | 'pending'>('all');
  const [txQuery, setTxQuery] = useState('');
  const [inspectedTx, setInspectedTx] = useState<AcashTransaction | null>(null);
  const [zoomImage, setZoomImage] = useState<{ src: string; label: string } | null>(null);

  // Inline Live Alert Composer state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState<'info' | 'success' | 'warning' | 'critical'>(
    'info'
  );
  const [alertSending, setAlertSending] = useState(false);
  const [alertStatusMsg, setAlertStatusMsg] = useState('');

  const accountTransactions = useMemo(
    () =>
      allTransactions
        .filter((tx) => tx.senderId === user.accountId || tx.receiverId === user.accountId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [allTransactions, user.accountId]
  );

  const txStats = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    let pendingCount = 0;
    for (const tx of accountTransactions) {
      if (tx.status === 'pending_admin_approval') pendingCount += 1;
      if (tx.status === 'rejected') continue;
      if (tx.receiverId === user.accountId) incoming += tx.amount;
      if (tx.senderId === user.accountId) outgoing += tx.totalDebited;
    }
    return {
      total: accountTransactions.length,
      incoming,
      outgoing,
      pendingCount,
    };
  }, [accountTransactions, user.accountId]);

  const filteredTxs = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    return accountTransactions.filter((tx) => {
      if (txFilter === 'incoming' && tx.receiverId !== user.accountId) return false;
      if (txFilter === 'outgoing' && tx.senderId !== user.accountId) return false;
      if (txFilter === 'pending' && tx.status !== 'pending_admin_approval') return false;
      if (!q) return true;
      return (
        tx.txHash.toLowerCase().includes(q) ||
        tx.txId.toLowerCase().includes(q) ||
        tx.senderName.toLowerCase().includes(q) ||
        tx.senderId.toLowerCase().includes(q) ||
        tx.receiverName.toLowerCase().includes(q) ||
        tx.receiverId.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q) ||
        (tx.note || '').toLowerCase().includes(q)
      );
    });
  }, [accountTransactions, txFilter, txQuery, user.accountId]);

  const roleLabel =
    user.role === 'U'
      ? lang === 'bn'
        ? 'গ্রাহক (Customer · U)'
        : 'Customer (U)'
      : user.role === 'A'
        ? lang === 'bn'
          ? 'এজেন্ট (Agent · A)'
          : 'Agent (A)'
        : lang === 'bn'
          ? 'মার্চেন্ট (Merchant · M)'
          : 'Merchant (M)';

  const handleSendDirectAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle.trim() || !alertMessage.trim()) return;
    setAlertSending(true);
    setAlertStatusMsg('');
    try {
      await adminSendAccountNotification({
        recipientIdentifier: user.accountId,
        title: alertTitle,
        message: alertMessage,
        severity: alertSeverity,
        adminEmail,
      });
      setAlertStatusMsg(
        lang === 'bn'
          ? `${user.accountId}-এ লাইভ নোটিফিকেশন সফলভাবে পাঠানো হয়েছে!`
          : `Live popup alert pushed to ${user.accountId} without refresh.`
      );
      setAlertTitle('');
      setAlertMessage('');
      setAlertOpen(false);
    } catch (err) {
      setAlertStatusMsg(err instanceof Error ? err.message : 'Failed to push alert.');
    } finally {
      setAlertSending(false);
    }
  };

  const documentCards = [
    {
      key: 'profile',
      label: lang === 'bn' ? 'প্রোফাইল ছবি' : 'Profile Photo',
      src: user.profilePhotoUrl,
    },
    {
      key: 'nid',
      label: lang === 'bn' ? 'এনআইডি / পাসপোর্ট ছবি' : 'NID / Passport Document',
      src: user.kyc?.nidPhotoUrl,
    },
    ...(user.role === 'M' || user.kyc?.taxCertificatePhotoUrl
      ? [
          {
            key: 'tax',
            label: lang === 'bn' ? 'ট্যাক্স / ট্রেড সার্টিফিকেট' : 'TIN / Tax Certificate',
            src: user.kyc?.taxCertificatePhotoUrl,
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 dark:bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Executive Header */}
        <div className="bg-gradient-to-br from-slate-950 via-[#191d46] to-slate-900 text-white px-5 py-5 sm:px-7 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {user.profilePhotoUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setZoomImage({ src: user.profilePhotoUrl as string, label: user.name })
                  }
                  className="relative group shrink-0"
                  title="Click to zoom profile photo"
                >
                  <img
                    src={user.profilePhotoUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-indigo-400 shadow-lg"
                  />
                  <span className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="w-5 h-5 text-white" />
                  </span>
                </button>
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                  <UserIcon className="w-8 h-8 text-indigo-200" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-mono-tabular font-bold text-indigo-300">
                    {user.accountId}
                  </span>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <span className="text-slate-200 font-medium">{roleLabel}</span>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <span
                    className={`font-semibold ${
                      user.status === 'active' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {user.status === 'active' ? 'ACTIVE' : 'DISABLED'}
                  </span>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <span
                    className={`font-semibold ${
                      user.kyc?.status === 'verified' ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    KYC: {(user.kyc?.status || 'unverified').toUpperCase()}
                  </span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white truncate mt-1">
                  {user.businessName || user.name}
                </h2>
                <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  {user.businessName && <span>Owner: {user.name}</span>}
                  <span className="font-mono-tabular">{user.phone}</span>
                  <span>{user.email}</span>
                </div>
              </div>
            </div>

            <div className="flex items-start md:items-end justify-between md:flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Account View"
                className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-colors md:order-1"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="md:order-2 md:text-right">
                <div className="text-[11px] text-indigo-200 uppercase tracking-wider">
                  {lang === 'bn' ? 'বর্তমান ব্যালেন্স' : 'Live Wallet Balance'}
                </div>
                <div className="font-mono-tabular text-2xl sm:text-3xl font-bold text-emerald-300">
                  {formatBdt(user.balance, lang)}
                </div>
                {(user.role === 'A' || (user.commissionBalance || 0) > 0) && (
                  <div className="text-[11px] font-mono-tabular text-amber-300">
                    Commission: {formatBdt(user.commissionBalance || 0, lang)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Inline Admin Action Toolbar */}
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAlertOpen((prev) => !prev)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'লাইভ অ্যালার্ট পাঠান' : 'Send Live Alert'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onCreditAccount(user.accountId);
                onClose();
              }}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>+ Credit Account</span>
            </button>

            <button
              type="button"
              disabled={actionBusy}
              onClick={() => onToggleStatus(user)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                user.status === 'active'
                  ? 'bg-rose-500/20 border-rose-400/45 text-rose-100 hover:bg-rose-500/35'
                  : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-100 hover:bg-emerald-500/35'
              }`}
            >
              {user.status === 'active' ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
              <span>{user.status === 'active' ? 'Disable Account' : 'Enable Account'}</span>
            </button>

            <button
              type="button"
              onClick={() => downloadAccountStatementPdf(user, accountTransactions, feeConfig)}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Statement PDF</span>
            </button>

            <button
              type="button"
              onClick={() => downloadCreatorKycProfilePdf(user, adminEmail)}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <FileBadge2 className="w-3.5 h-3.5" />
              <span>KYC &amp; Pic PDF</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {alertStatusMsg && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35 px-4 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{alertStatusMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setAlertStatusMsg('')}
                className="text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Expandable Direct Live Alert Composer */}
          {alertOpen && (
            <form
              onSubmit={handleSendDirectAlert}
              className="rounded-2xl bg-indigo-50/80 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/35 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    Push Instant Popup Notification to {user.accountId} ({user.name})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAlertOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    required
                    value={alertTitle}
                    onChange={(e) => setAlertTitle(e.target.value)}
                    placeholder={
                      lang === 'bn'
                        ? 'নোটিফিকেশন শিরোনাম (যেমন: KYC আপডেট অনুমোদিত)'
                        : 'Alert Title (e.g. Verification Priority Notice)'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <select
                    value={alertSeverity}
                    onChange={(e) =>
                      setAlertSeverity(e.target.value as 'info' | 'success' | 'warning' | 'critical')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="info">Info Notice</option>
                    <option value="success">Success / Approved</option>
                    <option value="warning">Warning Alert</option>
                    <option value="critical">Critical Security</option>
                  </select>
                </div>
              </div>

              <textarea
                required
                rows={2}
                value={alertMessage}
                onChange={(e) => setAlertMessage(e.target.value)}
                placeholder={
                  lang === 'bn'
                    ? 'অ্যাকাউন্ট হোল্ডারের স্ক্রিনে রিয়েল-টাইম পপআপ বার্তা লিখুন...'
                    : 'Write the instant popup message that will appear live in their Account Portal...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAlertOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={alertSending}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{alertSending ? 'Sending...' : 'Push Live Popup'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Account Status Cause Banner (If Disabled) */}
          {user.status === 'disabled' && (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 p-4 flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">Account Disabled</div>
                <div>Reason: {user.disableReason || 'Suspended by Administration'}</div>
                {(user.disabledAt || user.disabledBy) && (
                  <div className="text-[11px] opacity-80">
                    {user.disabledBy ? `By ${user.disabledBy}` : ''}
                    {user.disabledAt ? ` · ${new Date(user.disabledAt).toLocaleString()}` : ''}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'মোট ইনকামিং' : 'Total Incoming'}
              </div>
              <div className="font-mono-tabular text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatBdt(txStats.incoming, lang)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'মোট আউটগোয়িং' : 'Total Outgoing'}
              </div>
              <div className="font-mono-tabular text-base font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {formatBdt(txStats.outgoing, lang)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'কমিশন ব্যালেন্স' : 'Commission Pool'}
              </div>
              <div className="font-mono-tabular text-base font-bold text-slate-900 dark:text-white mt-1">
                {formatBdt(user.commissionBalance || 0, lang)}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'মোট লেনদেন' : 'Ledger Entries'}
              </div>
              <div className="font-mono-tabular text-base font-bold text-slate-900 dark:text-white mt-1">
                {txStats.total}{' '}
                {txStats.pendingCount > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ({txStats.pendingCount} pending)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Identity, KYC & Map Pin Details */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    {lang === 'bn'
                      ? 'অ্যাকাউন্ট প্রোফাইল ও সম্পূর্ণ কেওয়াইসি তথ্য'
                      : 'Complete Profile & KYC Verification Dossier'}
                  </span>
                </h3>
                {user.kyc?.updatedAt && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    KYC Updated: {new Date(user.kyc.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <UserIcon className="w-3 h-3" />
                    <span>Account Holder Name</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {user.name} {user.gender ? `(${user.gender.toUpperCase()})` : ''}
                  </div>
                </div>

                {user.businessName && (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      <span>Business / Booth Name</span>
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {user.businessName}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>Mobile Number</span>
                  </div>
                  <div className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                    {user.phone}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    <span>Gmail / Email</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5 break-all">
                    {user.email}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    <span>Referral Source (Security)</span>
                  </div>
                  <div className="font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {formatUserReferralSource(user)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Opened / Last Active</span>
                  </div>
                  <div className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5 text-[11px]">
                    {new Date(user.createdAt).toLocaleString()}
                    <div className="text-slate-500 dark:text-slate-400 font-normal">
                      Active: {new Date(user.lastActiveAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    NID / Passport Number
                  </div>
                  <div className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                    {user.kyc?.nidNumber || 'Not submitted'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Date of Birth &amp; Occupation
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {user.kyc?.dateOfBirth || '—'} · {user.kyc?.occupation || '—'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Present Address
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {user.kyc?.address || 'Not submitted'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Nominee Name &amp; Contact
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {user.kyc?.nomineeName
                      ? `${user.kyc.nomineeName} (${user.kyc.nomineePhone || '—'})`
                      : 'Not submitted'}
                  </div>
                </div>

                {(user.role === 'M' || user.kyc?.taxCertificateNumber) && (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-white dark:bg-[#121622] border border-indigo-200 dark:border-indigo-500/30">
                    <div className="text-[11px] text-indigo-600 dark:text-indigo-300 font-semibold">
                      Merchant TIN / BIN / Tax Certificate Number
                    </div>
                    <div className="font-mono-tabular font-bold text-slate-900 dark:text-white mt-0.5">
                      {user.kyc?.taxCertificateNumber || 'Not submitted'}
                    </div>
                  </div>
                )}

                {user.mapLocation && (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-white dark:bg-[#121622] border border-emerald-200 dark:border-emerald-500/30 flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Live Map Location ({user.mapLocation.isVisible ? 'Public on Map' : 'Hidden'})
                      </div>
                      <div className="text-xs text-slate-900 dark:text-white mt-0.5">
                        {user.mapLocation.address} · {user.mapLocation.area}, {user.mapLocation.city}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Coordinates: {user.mapLocation.lat.toFixed(5)}, {user.mapLocation.lng.toFixed(5)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Live Clickable KYC & Profile Photos Gallery */}
            <div className="lg:col-span-5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>
                  {lang === 'bn'
                    ? 'ছবি ও কেওয়াইসি ডকুমেন্ট গ্যালারি'
                    : 'Profile & KYC Document Viewer'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'বড় করে দেখার জন্য যেকোনো ডকুমেন্টে ক্লিক করুন (PDF ছাড়াই সম্পূর্ণ স্পষ্ট দেখুন)।'
                  : 'Click any attached photo or KYC document below to inspect full resolution inline.'}
              </p>

              <div className="space-y-3">
                {documentCards.map((docItem) => (
                  <div
                    key={docItem.key}
                    className="rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {docItem.label}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          docItem.src
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {docItem.src ? 'Attached' : 'Not uploaded'}
                      </span>
                    </div>

                    {docItem.src ? (
                      <button
                        type="button"
                        onClick={() =>
                          setZoomImage({ src: docItem.src as string, label: docItem.label })
                        }
                        className="relative group w-full h-36 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-[#0B0D14] block"
                      >
                        <img
                          src={docItem.src}
                          alt={docItem.label}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-semibold text-white">
                          <ZoomIn className="w-4 h-4" />
                          <span>Zoom Inspect</span>
                        </div>
                      </button>
                    ) : (
                      <div className="w-full h-20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-[11px] text-slate-400">
                        No image submitted yet
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Complete Inline Account Transaction History Ledger */}
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? `সম্পূর্ণ লেনদেন ইতিহাস (${filteredTxs.length})`
                    : `Full Account Transaction History (${filteredTxs.length})`}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'বিস্তারিত দেখতে যেকোনো লেনদেনে ক্লিক করুন।'
                    : 'Click any row to inspect hash, fee split, and audit notes inline.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'incoming', label: 'Incoming' },
                      { id: 'outgoing', label: 'Outgoing' },
                      { id: 'pending', label: 'Pending' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setTxFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        txFilter === f.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={txQuery}
                    onChange={(e) => setTxQuery(e.target.value)}
                    placeholder="Search hash, ID, note..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {inspectedTx && (
              <div className="px-4 py-3 bg-indigo-50/70 dark:bg-indigo-500/10 border-b border-indigo-200 dark:border-indigo-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="font-mono-tabular font-bold text-indigo-700 dark:text-indigo-300">
                    {inspectedTx.txHash} · {inspectedTx.type.replace(/_/g, ' ').toUpperCase()} ·{' '}
                    {inspectedTx.status.toUpperCase()}
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">
                    {inspectedTx.senderName} ({inspectedTx.senderId}) → {inspectedTx.receiverName} (
                    {inspectedTx.receiverId})
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                    Amount: {formatBdt(inspectedTx.amount, lang)} · Fee:{' '}
                    {formatBdt(inspectedTx.fee, lang)} · Debited:{' '}
                    {formatBdt(inspectedTx.totalDebited, lang)}
                    {inspectedTx.note ? ` · Note: ${inspectedTx.note}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedTx(null)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                >
                  Close Detail
                </button>
              </div>
            )}

            {filteredTxs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No transactions recorded for this filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-80 overflow-y-auto bg-white dark:bg-[#121622]">
                {filteredTxs.map((tx) => {
                  const isIncoming = tx.receiverId === user.accountId;
                  return (
                    <button
                      key={tx.txId}
                      type="button"
                      onClick={() => setInspectedTx(tx)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isIncoming
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {isIncoming
                              ? `From ${tx.senderName} (${tx.senderId})`
                              : `To ${tx.receiverName} (${tx.receiverId})`}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                            <span>{tx.type.replace(/_/g, ' ').toUpperCase()}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">{tx.txHash}</span>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(tx.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono-tabular text-xs font-bold ${
                            isIncoming
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {isIncoming ? '+' : '-'} {formatBdt(tx.amount, lang)}
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            tx.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tx.status === 'pending_admin_approval'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {tx.status.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Lightbox for Profile & KYC Document Images */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setZoomImage(null)}
        >
          <div
            className="relative max-w-3xl w-full rounded-3xl bg-[#0B0D14] border border-white/15 p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-white">
              <div className="text-sm font-bold">{zoomImage.label}</div>
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={zoomImage.src}
              alt={zoomImage.label}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-2xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};
