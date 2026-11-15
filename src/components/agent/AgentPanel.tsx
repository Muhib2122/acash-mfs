import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  Bell,
  Building2,
  CheckCircle2,
  FileText,
  Fingerprint,
  History,
  MapPin,
  QrCode,
  Search,
  Send,
  TrendingUp,
  UserPlus,
  Volume2,
  VolumeX,
  AlertTriangle,
} from 'lucide-react';
import { AcashTransaction, AcashUser, FeeConfig, Language } from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import {
  calculateFeeBreakdown,
  executeFinancialTransaction,
  findUserByIdentifier,
  UserComplianceState,
} from '../../lib/acashService';
import { downloadAccountStatementPdf } from '../../lib/pdfGenerator';
import { getVoiceMuted, playTransactionVoiceAlert, setVoiceMuted } from '../../lib/soundbox';
import { triggerHapticGesture } from '../../lib/deviceAlerts';
import {
  authorizeTransactionWithBiometrics,
  detectWebAuthnCapability,
  WebAuthnCapability,
} from '../../lib/webauthn';
import { BiometricConfirmBox } from '../common/BiometricConfirmBox';
import { QrModal } from '../common/QrModal';
import { TransactionReceiptModal } from '../common/TransactionReceiptModal';
import { Wallet3DCard } from '../common/Wallet3DCard';
import { ComplianceAlertBanner } from '../common/ComplianceAlertBanner';
import { TransactionRowItem } from '../common/TransactionRowItem';
import { usePortalTheme } from '../../lib/portalThemes';

interface AgentPanelProps {
  user: AcashUser;
  transactions: AcashTransaction[];
  feeConfig: FeeConfig;
  lang: Language;
  onOpenMapLocationPicker?: () => void;
  onOpenNotifications?: () => void;
  onOpenBiometricSettings?: () => void;
  unreadNotifications?: number;
  externalQrSignal?: number;
  homeNavSignal?: number;
  compliance?: UserComplianceState;
  complianceBannerDismissed?: boolean;
  onDismissComplianceBanner?: () => void;
  onOpenKyc?: () => void;
  onOpen2fa?: () => void;
}

type AgentTab = 'cash_in' | 'send_money' | 'cash_out' | 'agent_cash_out';
type AgentViewMode = 'home' | 'counter' | 'history';

export const AgentPanel: React.FC<AgentPanelProps> = ({
  user,
  transactions,
  feeConfig,
  lang,
  onOpenMapLocationPicker,
  onOpenNotifications,
  onOpenBiometricSettings,
  unreadNotifications = 0,
  externalQrSignal = 0,
  homeNavSignal = 0,
  compliance,
  complianceBannerDismissed = false,
  onDismissComplianceBanner,
  onOpenKyc,
  onOpen2fa,
}) => {
  const { preset } = usePortalTheme();
  const [viewMode, setViewMode] = useState<AgentViewMode>('home');
  const [counterTab, setCounterTab] = useState<AgentTab>('cash_in');
  const [customerIdentifier, setCustomerIdentifier] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completedTx, setCompletedTx] = useState<AcashTransaction | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<AcashTransaction | null>(null);
  const [searchTx, setSearchTx] = useState('');
  const [webauthnCap, setWebauthnCap] = useState<WebAuthnCapability | null>(null);
  const [confirmAuthMode, setConfirmAuthMode] = useState<'biometric' | 'tap_hold'>('tap_hold');
  const [voiceMuted, setVoiceMutedState] = useState<boolean>(getVoiceMuted);
  const [voiceBanner, setVoiceBanner] = useState<{
    amount: number;
    label: string;
    txHash: string;
  } | null>(null);
  const seenTxIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    let mounted = true;
    void detectWebAuthnCapability().then((cap) => {
      if (mounted) setWebauthnCap(cap);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const enrolledBiometrics = user.webauthnCredentials || [];
  const biometricsReady =
    enrolledBiometrics.length > 0 && Boolean(webauthnCap?.supported);

  useEffect(() => {
    seenTxIdsRef.current = null;
  }, [user.accountId]);

  useEffect(() => {
    if (homeNavSignal > 0) {
      setViewMode('home');
      setError('');
    }
  }, [homeNavSignal]);

  useEffect(() => {
    if (seenTxIdsRef.current === null) {
      seenTxIdsRef.current = new Set(transactions.map((tx) => tx.txId));
      return;
    }

    for (const tx of transactions) {
      if (!seenTxIdsRef.current.has(tx.txId)) {
        seenTxIdsRef.current.add(tx.txId);
        const isIncoming = tx.receiverId === user.accountId;
        const direction =
          tx.status === 'pending_admin_approval'
            ? 'pending'
            : isIncoming
              ? 'received'
              : 'sent';
        const counterparty = isIncoming ? tx.senderName : tx.receiverName;
        setVoiceBanner({
          amount: tx.amount,
          label: isIncoming ? `Received from ${tx.senderName}` : `Processed to ${tx.receiverName}`,
          txHash: tx.txHash,
        });
        playTransactionVoiceAlert({
          listenerGender: user.gender,
          amount: tx.amount,
          txType: tx.type,
          direction,
          counterpartyName: counterparty,
          lang,
          muted: voiceMuted,
        });
        break;
      }
    }
  }, [transactions, user.accountId, user.gender, lang, voiceMuted]);

  useEffect(() => {
    if (externalQrSignal > 0) {
      setShowQr(true);
    }
  }, [externalQrSignal]);

  const toggleVoiceMute = () => {
    setVoiceMutedState((prev) => {
      const next = !prev;
      setVoiceMuted(next);
      return next;
    });
  };

  const numericAmount = Number(amount) || 0;
  const { fee, breakdown } = useMemo(
    () =>
      calculateFeeBreakdown(counterTab, numericAmount, feeConfig, {
        targetIsAdmin: counterTab === 'agent_cash_out',
      }),
    [counterTab, numericAmount, feeConfig]
  );

  const commissionEntries = useMemo(() => {
    return transactions.filter(
      (tx) =>
        tx.status === 'completed' &&
        (tx.type === 'cash_in' || tx.type === 'cash_out' || tx.type === 'merchant_cash_out') &&
        tx.feeBreakdown.agentAmount > 0
    );
  }, [transactions]);

  const todayCommission = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return commissionEntries
      .filter((tx) => tx.createdAt >= startOfDay.getTime())
      .reduce((sum, tx) => sum + tx.feeBreakdown.agentAmount, 0);
  }, [commissionEntries]);

  const recentThreeTransactions = useMemo(
    () => transactions.slice(0, 3),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    const q = searchTx.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.txHash.toLowerCase().includes(q) ||
        tx.txId.toLowerCase().includes(q) ||
        tx.senderName.toLowerCase().includes(q) ||
        tx.receiverName.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q)
    );
  }, [transactions, searchTx]);

  const isDisabled = user.status !== 'active';

  const openCounterService = (tab: AgentTab) => {
    setCounterTab(tab);
    setStep('form');
    setError('');
    setCompletedTx(null);
    setViewMode('counter');
  };

  const handleProceed = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isDisabled) {
      setError(t('suspendedBanner', lang));
      return;
    }
    if (counterTab !== 'agent_cash_out' && !customerIdentifier.trim()) {
      setError('Enter Customer Acash ID (U-...) or mobile number.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    const totalNeeded = numericAmount + (counterTab === 'send_money' ? fee : 0);
    if (
      (counterTab === 'cash_in' || counterTab === 'send_money' || counterTab === 'agent_cash_out') &&
      totalNeeded > user.balance
    ) {
      setError(`Insufficient Agent float. Available: ${formatBdt(user.balance)}`);
      return;
    }
    setConfirmAuthMode(biometricsReady && counterTab !== 'cash_out' ? 'biometric' : 'tap_hold');
    setStep('confirm');
  };

  const executeAgentOperation = async (useBiometric: boolean, optionalAugmentPin?: string) => {
    setError('');
    setSubmitting(true);
    try {
      let biometricProof = undefined;
      if (useBiometric && biometricsReady && counterTab !== 'cash_out') {
        biometricProof = await authorizeTransactionWithBiometrics({
          accountId: user.accountId,
          txType: counterTab,
          amount: numericAmount,
          target: counterTab === 'agent_cash_out' ? 'ADMIN-TREASURY' : customerIdentifier,
          credentials: enrolledBiometrics,
        });
      }

      if (counterTab === 'cash_in') {
        const tx = await executeFinancialTransaction({
          type: 'cash_in',
          senderId: user.accountId,
          receiverIdentifier: customerIdentifier,
          amount: numericAmount,
          ...(biometricProof
            ? { biometricProof, ...(optionalAugmentPin ? { pin: optionalAugmentPin } : {}) }
            : { authorizeViaSession: true }),
          feeConfig,
          note: note || 'Agent Counter Cash-In',
        });
        setCompletedTx(tx);
      } else if (counterTab === 'send_money') {
        const tx = await executeFinancialTransaction({
          type: 'send_money',
          senderId: user.accountId,
          receiverIdentifier: customerIdentifier,
          amount: numericAmount,
          ...(biometricProof
            ? { biometricProof, ...(optionalAugmentPin ? { pin: optionalAugmentPin } : {}) }
            : { authorizeViaSession: true }),
          feeConfig,
          note: note || 'Agent Send Money to User',
        });
        setCompletedTx(tx);
      } else if (counterTab === 'agent_cash_out') {
        const tx = await executeFinancialTransaction({
          type: 'agent_cash_out',
          senderId: user.accountId,
          receiverIdentifier: 'ADMIN-TREASURY',
          amount: numericAmount,
          ...(biometricProof
            ? { biometricProof, ...(optionalAugmentPin ? { pin: optionalAugmentPin } : {}) }
            : { authorizeViaSession: true }),
          feeConfig,
          note: note || `Agent Cash-Out to Admin Treasury (${user.accountId})`,
        });
        setCompletedTx(tx);
      } else {
        const customer = await findUserByIdentifier(customerIdentifier);
        if (!customer || customer.role !== 'U') {
          throw new Error('Customer (U-) account not found.');
        }
        const tx = await executeFinancialTransaction({
          type: 'cash_out',
          senderId: customer.accountId,
          receiverIdentifier: user.accountId,
          amount: numericAmount,
          authorizeViaSession: true,
          feeConfig,
          note: note || `Counter Cash-Out via ${user.accountId}`,
        });
        setCompletedTx(tx);
      }
      triggerHapticGesture('success');
      setStep('done');
      setAmount('');
      setNote('');
    } catch (err) {
      triggerHapticGesture('warning');
      setError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const agentTabs: Array<{ id: AgentTab; label: string; icon: React.ElementType; colorClass: string }> = [
    {
      id: 'cash_in',
      label: t('processCashIn', lang),
      icon: UserPlus,
      colorClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'send_money',
      label: t('agentSendMoney', lang),
      icon: Send,
      colorClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
    },
    {
      id: 'cash_out',
      label: t('processCashOut', lang),
      icon: ArrowUpRight,
      colorClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
    },
    {
      id: 'agent_cash_out',
      label: t('agentCashOutAdmin', lang),
      icon: Building2,
      colorClass: 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-5 pb-24 md:pb-10">
      {compliance && onDismissComplianceBanner && onOpenKyc && onOpen2fa && (
        <ComplianceAlertBanner
          compliance={compliance}
          lang={lang}
          dismissed={complianceBannerDismissed}
          onDismiss={onDismissComplianceBanner}
          onOpenKyc={onOpenKyc}
          onOpen2fa={onOpen2fa}
        />
      )}

      {isDisabled && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 px-4 py-3.5 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div>{t('suspendedBanner', lang)}</div>
            {user.disableReason && (
              <div className="text-xs text-rose-700 dark:text-rose-300 mt-1 font-medium">
                {lang === 'bn' ? 'কারণ:' : 'Cause:'} {user.disableReason}
              </div>
            )}
          </div>
        </div>
      )}

      {voiceBanner && (
        <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/35 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 truncate">
                Agent Voice Notification · {voiceBanner.txHash}
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {formatBdt(voiceBanner.amount, lang)} — {voiceBanner.label}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVoiceBanner(null)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 1: Clean bKash-Style Agent Home Hub */}
      {viewMode === 'home' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-4">
            <Wallet3DCard
              user={user}
              lang={lang}
              balanceLabel={lang === 'bn' ? 'এজেন্ট ফ্লোট ব্যালেন্স' : 'Agent Float Balance'}
              alwaysVisibleBalance
              accentVariant="agent"
              secondaryBalanceLabel={t('todayCommission', lang)}
              secondaryBalanceValue={todayCommission}
              topRightActions={
                <button
                  type="button"
                  onClick={() => setShowQr(true)}
                  className="min-h-[38px] px-3 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{t('myQr', lang)}</span>
                </button>
              }
              footerActions={
                <>
                  <button
                    type="button"
                    onClick={toggleVoiceMute}
                    className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {voiceMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-300" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
                    )}
                    <span>{voiceMuted ? 'Voice Off' : 'Voice On'}</span>
                  </button>
                  {onOpenNotifications && (
                    <button
                      type="button"
                      onClick={onOpenNotifications}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/35 hover:bg-indigo-500/30 text-xs font-semibold text-indigo-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Bell className="w-3.5 h-3.5 text-indigo-300" />
                      <span>{lang === 'bn' ? 'অ্যালার্ট' : 'Alerts'}</span>
                      {unreadNotifications > 0 && (
                        <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold leading-none">
                          {unreadNotifications}
                        </span>
                      )}
                    </button>
                  )}
                  {onOpenBiometricSettings && (
                    <button
                      type="button"
                      onClick={onOpenBiometricSettings}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                        enrolledBiometrics.length > 0
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100'
                          : 'bg-white/10 border-white/15 hover:bg-white/20 text-white'
                      }`}
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      <span>{enrolledBiometrics.length > 0 ? 'Biometrics On' : 'Biometrics'}</span>
                    </button>
                  )}
                </>
              }
            />

            {/* Compact Commission & Rate Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{t('totalCommission', lang)}</span>
                  <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="font-mono-tabular text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1.5 truncate">
                  {formatBdt(user.commissionBalance || 0, lang)}
                </div>
              </div>

              <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{t('commissionRate', lang)}</span>
                  <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                  CO ৳{feeConfig.agentShare}/1k
                </div>
                <div className="text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400 mt-0.5">
                  CI +৳{feeConfig.cashInCommissionPer1000}/1k
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-5">
            {/* Organized Agent Counter Services Grid */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'এজেন্ট কাউন্টার সেবা' : 'Agent Counter Services'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'গ্রাহক সেবা বা অ্যাডমিন সেটেলমেন্ট বেছে নিন'
                      : 'Select a counter service to begin'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>PDF</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {agentTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => openCounterService(tab.id)}
                      className="acash-3d-tile min-h-[84px] px-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tab.colorClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight break-words">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}

                {onOpenMapLocationPicker && (
                  <button
                    type="button"
                    onClick={onOpenMapLocationPicker}
                    className="acash-3d-tile min-h-[84px] px-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-emerald-400 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight break-words">
                      {user.mapLocation
                        ? lang === 'bn'
                          ? 'ম্যাপ পিন আপডেট'
                          : 'Update Map Pin'
                        : lang === 'bn'
                          ? 'ম্যাপ লোকেশন'
                          : 'Set Map Pin'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewMode('history')}
                  className="acash-3d-tile min-h-[84px] px-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400">
                    <History className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight break-words">
                    {lang === 'bn' ? 'কাউন্টার ইতিহাস' : 'Counter History'}
                  </span>
                </button>
              </div>
            </div>

            {/* Minimized Recent Counter Activity (Latest 3) */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'সাম্প্রতিক ৩টি লেনদেন' : 'Recent Counter Activity'}
                </h3>
                <button
                  type="button"
                  onClick={() => setViewMode('history')}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  {lang === 'bn' ? 'সব দেখুন →' : `View All (${transactions.length}) →`}
                </button>
              </div>

              {recentThreeTransactions.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('noTransactions', lang)}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentThreeTransactions.map((tx) => (
                    <div
                      key={tx.txId}
                      onClick={() => setSelectedReceipt(tx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedReceipt(tx);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <TransactionRowItem
                        tx={tx}
                        viewerAccountId={user.accountId}
                        lang={lang}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Focused Agent Counter Form & Confirmation (NO PIN) */}
      {viewMode === 'counter' && (
        <div className="max-w-xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setViewMode('home');
                setStep('form');
                setError('');
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 hover:border-indigo-400 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
            </button>
            <div className="text-right min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {agentTabs.find((a) => a.id === counterTab)?.label}
              </div>
              <div className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                Float: {formatBdt(user.balance, lang)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            {agentTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCounterTab(tab.id);
                  setStep('form');
                  setError('');
                }}
                className={`min-h-[40px] py-2 px-2 text-xs font-semibold rounded-lg transition-colors truncate cursor-pointer ${
                  counterTab === tab.id
                    ? preset.activeTabClass
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {step === 'form' && (
            <form onSubmit={handleProceed} className="space-y-4">
              {counterTab === 'agent_cash_out' ? (
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'নির্ধারিত গন্তব্য (শুধুমাত্র অ্যাডমিন)'
                      : 'Mandatory Cash-Out Destination (Admin Only)'}
                  </div>
                  <div className="font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                    ADMIN-TREASURY — Acash Admin Treasury
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap justify-between gap-2 mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {lang === 'bn'
                        ? 'গ্রাহকের আইডি বা মোবাইল (U-)'
                        : 'Customer Acash ID or Mobile (U- Only)'}
                    </label>
                    <span className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                      U-XXXXXX
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={customerIdentifier}
                    onChange={(e) => setCustomerIdentifier(e.target.value)}
                    placeholder="U-XXXXXX or 017XXXXXXXX"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('amount', lang)}
                </label>
                <input
                  type="number"
                  required
                  min="10"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('note', lang)}
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reference note (optional)"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {numericAmount > 0 && (
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1 text-xs">
                  {(counterTab === 'cash_out' || counterTab === 'send_money') && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {counterTab === 'cash_out' ? 'Customer Cash-Out Fee' : 'Send Money Fee'}
                      </span>
                      <span className="font-mono-tabular text-slate-900 dark:text-slate-200 font-semibold">
                        {formatBdt(fee, lang)}
                      </span>
                    </div>
                  )}
                  {(counterTab === 'cash_in' || counterTab === 'cash_out') && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {lang === 'bn' ? 'অর্জিত এজেন্ট কমিশন' : 'Estimated Agent Commission'}
                      </span>
                      <span className="font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400">
                        + {formatBdt(breakdown.agentAmount, lang)}
                      </span>
                    </div>
                  )}
                  {counterTab === 'agent_cash_out' && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Admin Settlement Fee</span>
                      <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                        ৳0.00 (Free)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {numericAmount >= feeConfig.highValueThreshold && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/35 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                  {t('highValueNotice', lang)}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isDisabled}
                className={`w-full min-h-[48px] py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm cursor-pointer`}
              >
                {t('continueBtn', lang)}
              </button>
            </form>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Operation</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-right">
                    {agentTabs.find((tItem) => tItem.id === counterTab)?.label}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Target</span>
                  <span className="font-mono-tabular text-slate-900 dark:text-white font-medium text-right break-all">
                    {counterTab === 'agent_cash_out' ? 'ADMIN-TREASURY' : customerIdentifier}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Amount</span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {formatBdt(numericAmount, lang)}
                  </span>
                </div>
                {(counterTab === 'cash_in' || counterTab === 'cash_out') && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Commission Earned</span>
                    <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatBdt(breakdown.agentAmount, lang)}
                    </span>
                  </div>
                )}
              </div>

              <BiometricConfirmBox
                user={user}
                lang={lang}
                amount={numericAmount}
                amountLabel={formatBdt(numericAmount, lang)}
                platformHighValueThreshold={feeConfig.highValueThreshold}
                webauthnCap={webauthnCap}
                authMode={confirmAuthMode}
                onAuthModeChange={setConfirmAuthMode}
                submitting={submitting}
                error={error}
                onClearError={() => setError('')}
                onConfirmBiometric={(pin) => executeAgentOperation(true, pin)}
                onConfirmTapHold={() => executeAgentOperation(false)}
                onOpenBiometricSettings={onOpenBiometricSettings}
                tapHoldButtonLabel={`${agentTabs.find((tItem) => tItem.id === counterTab)?.label} · ${formatBdt(numericAmount, lang)}`}
                biometricDisabledReason={counterTab === 'cash_out' ? 'Customer counter cash-out uses Tap & Hold.' : undefined}
              />

              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {t('back', lang)}
              </button>
            </div>
          )}

          {step === 'done' && completedTx && (
            <div className="py-5 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {completedTx.status === 'pending_admin_approval'
                    ? t('txPendingApproval', lang)
                    : t('txSuccess', lang)}
                </div>
                <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                  {formatBdt(completedTx.amount, lang)}
                </div>
                <div className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 mt-1">
                  {completedTx.txHash}
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(completedTx)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  {lang === 'bn' ? 'রসিদ' : 'Receipt'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('form');
                    setCompletedTx(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                >
                  {lang === 'bn' ? 'নতুন লেনদেন' : 'New Entry'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('home');
                    setStep('form');
                    setCompletedTx(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {lang === 'bn' ? 'হোম' : 'Done'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Full Agent Counter History */}
      {viewMode === 'history' && (
        <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('home')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 hover:border-indigo-400 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
                </button>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {t('commissionTracker', lang)} & {t('recentTransactions', lang)}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('downloadStatement', lang)}</span>
              </button>
            </div>

            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTx}
                onChange={(e) => setSearchTx(e.target.value)}
                placeholder={t('searchPlaceholder', lang)}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('noTransactions', lang)}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.txId}
                  onClick={() => setSelectedReceipt(tx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedReceipt(tx);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TransactionRowItem
                    tx={tx}
                    viewerAccountId={user.accountId}
                    lang={lang}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showQr && (
        <QrModal
          mode="show"
          accountId={user.accountId}
          accountName={user.businessName || user.name}
          role="A"
          lang={lang}
          onClose={() => setShowQr(false)}
        />
      )}

      {selectedReceipt && (
        <TransactionReceiptModal
          tx={selectedReceipt}
          currentAccountId={user.accountId}
          lang={lang}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
};
