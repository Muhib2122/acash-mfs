import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Command,
  Eye,
  FileBadge2,
  Gift,
  Layers,
  Search,
  ShieldCheck,
  User as UserIcon,
  X,
  XCircle,
} from 'lucide-react';
import {
  AcashTransaction,
  AcashUser,
  Language,
  ThemeMode,
} from '../../types/acash';
import { formatBdt } from '../../lib/i18n';
import { adminReviewKycSubmission } from '../../lib/acashService';

/* -------------------------------------------------------------------------- */
/*  Safe CSV Export Helpers                                                   */
/* -------------------------------------------------------------------------- */

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(filename: string, rows: Array<Array<unknown>>): void {
  const csvContent =
    '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportUsersToCsv(users: AcashUser[]): void {
  const header = [
    'Account ID',
    'Role',
    'Name',
    'Business Name',
    'Phone',
    'Email',
    'Balance (BDT)',
    'Status',
    'KYC Status',
    'NID / Reg Number',
    'TIN / Trade License',
    'Created At',
  ];
  const body = users.map((u) => [
    u.accountId,
    u.role === 'U' ? 'Customer' : u.role === 'A' ? 'Agent' : 'Merchant',
    u.name,
    u.businessName || '',
    u.phone,
    u.email,
    u.balance.toFixed(2),
    u.status,
    u.kyc?.status || 'unverified',
    u.kyc?.nidNumber || '',
    u.kyc?.taxCertificateNumber || '',
    new Date(u.createdAt).toISOString(),
  ]);
  triggerCsvDownload(`acash-users-${new Date().toISOString().slice(0, 10)}.csv`, [
    header,
    ...body,
  ]);
}

export function exportLedgerToCsv(transactions: AcashTransaction[]): void {
  const header = [
    'Tx ID',
    'Tx Hash',
    'Timestamp',
    'Type',
    'Sender ID',
    'Sender Name',
    'Receiver ID',
    'Receiver Name',
    'Amount (BDT)',
    'Fee (BDT)',
    'Total Debited (BDT)',
    'Status',
    'Gift Card',
    'Gift Message',
    'Note',
  ];
  const body = transactions.map((tx) => [
    tx.txId,
    tx.txHash,
    new Date(tx.createdAt).toISOString(),
    tx.type,
    tx.senderId,
    tx.senderName,
    tx.receiverId,
    tx.receiverName,
    tx.amount.toFixed(2),
    tx.fee.toFixed(2),
    tx.totalDebited.toFixed(2),
    tx.status,
    tx.giftCard ? `${tx.giftCard.cardTitleBn} (${tx.giftCard.cardTitleEn})` : '',
    tx.giftCard?.message || '',
    tx.note || '',
  ]);
  triggerCsvDownload(`acash-ledger-${new Date().toISOString().slice(0, 10)}.csv`, [
    header,
    ...body,
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Overview Executive Intelligence (Mix Chart, Gift Stats, Liquidity, Top 5) */
/* -------------------------------------------------------------------------- */

const MIX_PALETTE = [
  '#4f46e5',
  '#10b981',
  '#f59e0b',
  '#0ea5e9',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
];

export const AdminOverviewIntelligence: React.FC<{
  users: AcashUser[];
  transactions: AcashTransaction[];
  lang: Language;
  theme: ThemeMode;
  onInspectAccount: (accountId: string) => void;
  onOpenLedgerGifts: () => void;
}> = ({
  users,
  transactions,
  lang,
  theme,
  onInspectAccount,
  onOpenLedgerGifts,
}) => {
  const isDark = theme === 'dark';

  const mixData = useMemo(() => {
    const map = new Map<string, { type: string; label: string; volume: number; count: number; fees: number }>();
    for (const tx of transactions) {
      if (tx.status !== 'completed') continue;
      const existing = map.get(tx.type) || {
        type: tx.type,
        label: tx.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        volume: 0,
        count: 0,
        fees: 0,
      };
      existing.volume += tx.amount;
      existing.count += 1;
      existing.fees += tx.fee;
      map.set(tx.type, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 7);
  }, [transactions]);

  const roleFloat = useMemo(() => {
    const buckets = {
      U: { count: 0, balance: 0 },
      A: { count: 0, balance: 0 },
      M: { count: 0, balance: 0 },
    };
    for (const u of users) {
      buckets[u.role].count += 1;
      buckets[u.role].balance += u.balance || 0;
    }
    const total = Math.max(1, buckets.U.balance + buckets.A.balance + buckets.M.balance);
    return { buckets, total };
  }, [users]);

  const giftStats = useMemo(() => {
    const giftTxs = transactions.filter((tx) => Boolean(tx.giftCard) && tx.status !== 'rejected');
    const opened = giftTxs.filter((tx) => Boolean(tx.giftCard?.openedAt)).length;
    const skipped = giftTxs.filter((tx) => Boolean(tx.giftCard?.skippedAt) && !tx.giftCard?.openedAt).length;
    const pendingOpen = Math.max(0, giftTxs.length - opened - skipped);
    const totalGiftFees = giftTxs.reduce((sum, tx) => sum + (tx.fee || 0), 0);
    const totalGiftVolume = giftTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const cardFreq = new Map<string, { title: string; count: number }>();
    for (const tx of giftTxs) {
      if (!tx.giftCard) continue;
      const prev = cardFreq.get(tx.giftCard.cardId) || {
        title: tx.giftCard.cardTitleBn,
        count: 0,
      };
      prev.count += 1;
      cardFreq.set(tx.giftCard.cardId, prev);
    }
    const topCard = Array.from(cardFreq.values()).sort((a, b) => b.count - a.count)[0] || null;
    const openRate = giftTxs.length > 0 ? Math.round((opened / giftTxs.length) * 100) : 0;
    return {
      total: giftTxs.length,
      opened,
      pendingOpen,
      openRate,
      totalGiftFees,
      totalGiftVolume,
      topCard,
    };
  }, [transactions]);

  const topAccounts = useMemo(
    () => [...users].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 5),
    [users]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Transaction Type Volume Breakdown */}
        <div className="xl:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>
                  {lang === 'bn' ? 'সার্ভিস অনুযায়ী লেনদেন মিক্স' : 'Transaction Mix by Service'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'bn'
                  ? 'সম্পন্ন হওয়া লেনদেনের ভলিউম বিশ্লেষণ (BDT)'
                  : 'Real settled volume breakdown across payment corridors'}
              </p>
            </div>
          </div>

          {mixData.length === 0 ? (
            <div className="h-56 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'এখনো কোনো সম্পন্ন লেনদেন নেই।' : 'No settled transactions recorded yet.'}
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mixData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.28)'}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                    tickFormatter={(v) => (v >= 1000 ? `৳${(v / 1000).toFixed(0)}k` : `৳${v}`)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={118}
                    tick={{ fill: isDark ? '#e2e8f0' : '#334155', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(79,70,229,0.06)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof mixData)[number];
                      return (
                        <div className="rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 p-3 shadow-xl text-xs space-y-1">
                          <div className="font-bold text-slate-900 dark:text-white">{d.label}</div>
                          <div className="font-mono-tabular text-indigo-600 dark:text-indigo-400">
                            Volume: {formatBdt(d.volume, lang)}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            Count: {d.count} · Fees: {formatBdt(d.fees, lang)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="volume" radius={[0, 6, 6, 0]}>
                    {mixData.map((entry, idx) => (
                      <Cell key={entry.type} fill={MIX_PALETTE[idx % MIX_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Gift Cards & Role Float Intelligence */}
        <div className="xl:col-span-5 space-y-5">
          {/* Cultural Gift Card Pulse */}
          <div className="rounded-3xl bg-gradient-to-br from-rose-950 via-[#2a1228] to-slate-950 border border-rose-500/30 p-5 text-white shadow-sm space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/25 border border-rose-400/40 flex items-center justify-center">
                  <Gift className="w-4 h-4 text-rose-300" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-white">
                    {lang === 'bn' ? 'বাঙালি উপহার কার্ড পরিসংখ্যান' : 'Cultural Gift Card Pulse'}
                  </h3>
                  <p className="text-[11px] text-rose-200/80">
                    Flat ৳2.00 sender fee · Chithi & Festival Unboxing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenLedgerGifts}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white transition-colors"
              >
                {lang === 'bn' ? 'লেজার দেখুন' : 'View Ledger'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-white/10 border border-white/10 p-2.5">
                <div className="text-[10px] text-rose-200">Cards Sent</div>
                <div className="font-mono-tabular text-lg font-bold mt-0.5">{giftStats.total}</div>
              </div>
              <div className="rounded-xl bg-white/10 border border-white/10 p-2.5">
                <div className="text-[10px] text-rose-200">Open Rate</div>
                <div className="font-mono-tabular text-lg font-bold text-emerald-300 mt-0.5">
                  {giftStats.openRate}%
                </div>
              </div>
              <div className="rounded-xl bg-white/10 border border-white/10 p-2.5">
                <div className="text-[10px] text-rose-200">৳2 Gift Fees</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-300 mt-0.5">
                  {formatBdt(giftStats.totalGiftFees, lang)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-100/90 pt-1">
              <span>
                Volume: <strong className="font-mono-tabular">{formatBdt(giftStats.totalGiftVolume, lang)}</strong> · Pending Unbox:{' '}
                <strong className="font-mono-tabular">{giftStats.pendingOpen}</strong>
              </span>
              {giftStats.topCard && (
                <span>
                  Top: <strong>{giftStats.topCard.title}</strong> ({giftStats.topCard.count})
                </span>
              )}
            </div>
          </div>

          {/* Role Liquidity Distribution */}
          <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-sm">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'bn' ? 'পোর্টাল অনুযায়ী ফ্লোট বণ্টন' : 'System Liquidity by Portal Role'}
            </h3>
            <div className="space-y-2.5 text-xs">
              {(
                [
                  { role: 'U' as const, label: 'Customers (U)', bar: 'bg-indigo-600' },
                  { role: 'A' as const, label: 'Agents (A)', bar: 'bg-emerald-600' },
                  { role: 'M' as const, label: 'Merchants (M)', bar: 'bg-amber-500' },
                ]
              ).map((item) => {
                const stat = roleFloat.buckets[item.role];
                const pct = Math.round((stat.balance / roleFloat.total) * 100);
                return (
                  <div key={item.role} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.label} <span className="text-slate-400">({stat.count})</span>
                      </span>
                      <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                        {formatBdt(stat.balance, lang)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-[#0B0D14] overflow-hidden">
                      <div className={`h-full ${item.bar} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Accounts Leaderboard */}
      <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span>{lang === 'bn' ? 'শীর্ষ ৫টি অ্যাকাউন্ট (ব্যালেন্স অনুযায়ী)' : 'Top 5 Accounts by Wallet Liquidity'}</span>
          </h2>
        </div>

        {topAccounts.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
            No registered accounts found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {topAccounts.map((u, idx) => (
              <div
                key={u.accountId}
                className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono-tabular text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      #{idx + 1} · {u.accountId}
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
                      {u.businessName || u.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {u.role === 'U' ? 'Customer' : u.role === 'A' ? 'Agent' : 'Merchant'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onInspectAccount(u.accountId)}
                    className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 shrink-0 inline-flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Inspect</span>
                  </button>
                </div>
                <div className="font-mono-tabular text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatBdt(u.balance, lang)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Dedicated KYC Verification Queue Panel                                    */
/* -------------------------------------------------------------------------- */

export const AdminKycReviewQueuePanel: React.FC<{
  users: AcashUser[];
  adminEmail: string;
  lang: Language;
  onInspectAccount: (accountId: string) => void;
  onFeedback: (msg: string) => void;
}> = ({ users, adminEmail, lang, onInspectAccount, onFeedback }) => {
  const [statusFilter, setStatusFilter] = useState<'submitted' | 'unverified' | 'verified' | 'ALL'>('submitted');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReasonMap, setRejectReasonMap] = useState<Record<string, string>>({});
  const [zoomImage, setZoomImage] = useState<{ title: string; url: string } | null>(null);

  const counts = useMemo(() => {
    let submitted = 0;
    let verified = 0;
    let unverified = 0;
    for (const u of users) {
      const s = u.kyc?.status || 'unverified';
      if (s === 'submitted') submitted += 1;
      else if (s === 'verified') verified += 1;
      else unverified += 1;
    }
    return { submitted, verified, unverified, all: users.length };
  }, [users]);

  const visibleUsers = useMemo(() => {
    return users
      .filter((u) => {
        const s = u.kyc?.status || 'unverified';
        if (statusFilter === 'ALL') return true;
        return s === statusFilter;
      })
      .sort((a, b) => (b.kyc?.updatedAt || b.createdAt || 0) - (a.kyc?.updatedAt || a.createdAt || 0));
  }, [users, statusFilter]);

  const handleDecision = async (u: AcashUser, decision: 'verified' | 'unverified') => {
    setBusyId(u.accountId);
    try {
      await adminReviewKycSubmission({
        accountId: u.accountId,
        decision,
        reason: rejectReasonMap[u.accountId],
        adminEmail,
      });
      onFeedback(
        decision === 'verified'
          ? `KYC approved & verified for ${u.businessName || u.name} (${u.accountId}). Live badge notified to user.`
          : `KYC resubmission requested for ${u.businessName || u.name} (${u.accountId}).`
      );
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'KYC decision update failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileBadge2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>
                {lang === 'bn' ? 'কেওয়াইসি ভেরিফিকেশন কিউ' : 'Compliance KYC Verification Queue'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === 'bn'
                ? 'কাস্টমার, এজেন্ট ও মার্চেন্টদের এনআইডি, টিন এবং ছবি দেখে সরাসরি অনুমোদন বা সংশোধন চান।'
                : 'Inspect NID, Birth Registration, Passport, TIN, and photos across Customer, Agent & Merchant submissions.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-slate-100 dark:bg-[#0B0D14] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'submitted' as const, label: `Submitted (${counts.submitted})` },
                { id: 'unverified' as const, label: `Unverified (${counts.unverified})` },
                { id: 'verified' as const, label: `Verified (${counts.verified})` },
                { id: 'ALL' as const, label: `All (${counts.all})` },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {visibleUsers.length === 0 ? (
          <div className="p-10 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
            No accounts match this KYC status filter.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleUsers.map((u) => {
              const kycStatus = u.kyc?.status || 'unverified';
              const isBusy = busyId === u.accountId;
              return (
                <div
                  key={u.accountId}
                  className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {u.profilePhotoUrl ? (
                        <img
                          src={u.profilePhotoUrl}
                          alt={u.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-indigo-200 dark:border-indigo-500/35 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
                          <UserIcon className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {u.accountId}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {u.businessName || u.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              kycStatus === 'verified'
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : kycStatus === 'submitted'
                                  ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {kycStatus}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {u.phone} · {u.email}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            NID / ID:{' '}
                            <strong className="font-mono-tabular text-slate-800 dark:text-slate-200">
                              {u.kyc?.nidNumber || 'Not provided'}
                            </strong>
                          </span>
                          {u.kyc?.taxCertificateNumber && (
                            <span>
                              TIN/Trade:{' '}
                              <strong className="font-mono-tabular text-slate-800 dark:text-slate-200">
                                {u.kyc.taxCertificateNumber}
                              </strong>
                            </span>
                          )}
                          {u.kyc?.address && <span>Address: {u.kyc.address}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {u.kyc?.nidPhotoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setZoomImage({
                              title: `${u.accountId} — Identity Document`,
                              url: u.kyc!.nidPhotoUrl!,
                            })
                          }
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>ID Photo</span>
                        </button>
                      )}
                      {u.kyc?.taxCertificatePhotoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setZoomImage({
                              title: `${u.accountId} — TIN / Trade License`,
                              url: u.kyc!.taxCertificatePhotoUrl!,
                            })
                          }
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>TIN Photo</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onInspectAccount(u.accountId)}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400"
                      >
                        Full 360°
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <input
                      type="text"
                      value={rejectReasonMap[u.accountId] || ''}
                      onChange={(e) =>
                        setRejectReasonMap((prev) => ({ ...prev, [u.accountId]: e.target.value }))
                      }
                      placeholder={
                        lang === 'bn'
                          ? 'পুনরায় জমা দেওয়ার কারণ (ঐচ্ছিক)'
                          : 'Optional resubmission note (if rejecting)...'
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {kycStatus !== 'unverified' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(u, 'unverified')}
                          className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/35 hover:bg-amber-100 text-xs font-semibold text-amber-800 dark:text-amber-200 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Request Resubmit</span>
                        </button>
                      )}
                      {kycStatus !== 'verified' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(u, 'verified')}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verify KYC</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {zoomImage && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-900 dark:text-white">{zoomImage.title}</div>
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-[#0B0D14] flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={zoomImage.url}
                alt={zoomImage.title}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[68vh] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Ctrl/Cmd+K Admin Command Palette                                          */
/* -------------------------------------------------------------------------- */

export const AdminCommandPaletteModal: React.FC<{
  open: boolean;
  onClose: () => void;
  users: AcashUser[];
  transactions: AcashTransaction[];
  sections: Array<{ id: string; label: string }>;
  lang: Language;
  onNavigateSection: (sectionId: string) => void;
  onInspectAccount: (accountId: string) => void;
  onJumpToLedgerTx: (txHash: string) => void;
}> = ({
  open,
  onClose,
  users,
  transactions,
  sections,
  lang,
  onNavigateSection,
  onInspectAccount,
  onJumpToLedgerTx,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedSections = sections
      .filter((s) => !q || s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .slice(0, 6);
    const matchedUsers = q
      ? users
          .filter(
            (u) =>
              u.accountId.toLowerCase().includes(q) ||
              u.name.toLowerCase().includes(q) ||
              (u.businessName || '').toLowerCase().includes(q) ||
              u.phone.includes(q) ||
              u.email.toLowerCase().includes(q)
          )
          .slice(0, 6)
      : users.slice(0, 4);
    const matchedTxs = q
      ? transactions
          .filter(
            (tx) =>
              tx.txHash.toLowerCase().includes(q) ||
              tx.txId.toLowerCase().includes(q) ||
              tx.senderId.toLowerCase().includes(q) ||
              tx.receiverId.toLowerCase().includes(q) ||
              (tx.giftCard?.cardTitleEn || '').toLowerCase().includes(q) ||
              (tx.giftCard?.cardTitleBn || '').toLowerCase().includes(q)
          )
          .slice(0, 5)
      : [];
    return { matchedSections, matchedUsers, matchedTxs };
  }, [query, sections, users, transactions]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-900/65 dark:bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === 'bn'
                ? 'অ্যাকাউন্ট (U/A/M), লেনদেন হ্যাশ, বা অ্যাডমিন সেকশন খুঁজুন...'
                : 'Jump to section, account (U-/A-/M-, phone), or tx hash...'
            }
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-mono-tabular font-semibold text-slate-500 dark:text-slate-400"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3 space-y-4 text-xs">
          {results.matchedSections.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Command className="w-3 h-3" />
                <span>Console Sections</span>
              </div>
              {results.matchedSections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    onNavigateSection(sec.id);
                    onClose();
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/15 flex items-center justify-between text-left text-slate-800 dark:text-slate-100 font-medium transition-colors"
                >
                  <span>{sec.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ))}
            </div>
          )}

          {results.matchedUsers.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                <span>Accounts (360° Inspector)</span>
              </div>
              {results.matchedUsers.map((u) => (
                <button
                  key={u.accountId}
                  type="button"
                  onClick={() => {
                    onInspectAccount(u.accountId);
                    onClose();
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/15 flex items-center justify-between gap-3 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400 mr-2">
                      {u.accountId}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {u.businessName || u.name}
                    </span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">{u.phone}</span>
                  </div>
                  <span className="font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatBdt(u.balance, lang)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {results.matchedTxs.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Matching Transactions
              </div>
              {results.matchedTxs.map((tx) => (
                <button
                  key={tx.txId}
                  type="button"
                  onClick={() => {
                    onJumpToLedgerTx(tx.txHash);
                    onClose();
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/15 flex items-center justify-between gap-3 text-left transition-colors"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-400 mr-2">
                      {tx.txHash}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {tx.senderId} → {tx.receiverId}
                    </span>
                    {tx.giftCard && (
                      <span className="ml-2 text-rose-600 dark:text-rose-300 font-semibold">
                        🎁 {tx.giftCard.cardTitleBn}
                      </span>
                    )}
                  </div>
                  <span className="font-mono-tabular font-bold text-slate-900 dark:text-white shrink-0">
                    {formatBdt(tx.amount, lang)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
