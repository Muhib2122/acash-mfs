import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  Bell,
  Building2,
  CheckCheck,
  CheckCircle2,
  FileText,
  Fingerprint,
  Lock,
  Mail,
  MapPin,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  User as UserIcon,
  UserPlus,
  Volume2,
  VolumeX,
  AlertTriangle,
} from 'lucide-react';
import {
  AccountNotification,
  AcashTransaction,
  AcashUser,
  FeeConfig,
  Language,
} from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import {
  calculateFeeBreakdown,
  executeFinancialTransaction,
  findUserByIdentifier,
  isAccountNotificationRead,
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
import { ServiceCircleGrid, ServiceCircleItem } from '../common/ServiceCircleGrid';
import { usePortalTheme } from '../../lib/portalThemes';

interface AgentPanelProps {
  user: AcashUser;
  transactions: AcashTransaction[];
  feeConfig: FeeConfig;
  lang: Language;
  onOpenMapLocationPicker?: () => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  onOpenBiometricSettings?: () => void;
  unreadNotifications?: number;
  accountNotifications?: AccountNotification[];
  onMarkNotifRead?: (notifId: string) => void;
  onMarkAllNotifRead?: () => void;
  externalQrSignal?: number;
  homeNavSignal?: number;
  statementNavSignal?: number;
  inboxNavSignal?: number;
  compliance?: UserComplianceState;
  complianceBannerDismissed?: boolean;
  onDismissComplianceBanner?: () => void;
  onOpenKyc?: () => void;
  onOpen2fa?: () => void;
}

type AgentTab = 'cash_in' | 'send_money' | 'cash_out' | 'agent_cash_out';
type AgentViewMode =
  | 'home'
  | 'counter'
  | 'commission'
  | 'statements'
  | 'inbox'
  | 'security';

export const AgentPanel: React.FC<AgentPanelProps> = ({
  user,
  transactions,
  feeConfig,
  lang,
  onOpenMapLocationPicker,
  onOpenNotifications,
  onOpenProfile,
  onOpenBiometricSettings,
  unreadNotifications = 0,
  accountNotifications = [],
  onMarkNotifRead,
  onMarkAllNotifRead,
  externalQrSignal = 0,
  homeNavSignal = 0,
  statementNavSignal = 0,
  inboxNavSignal = 0,
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
  const [statementFilter, setStatementFilter] = useState<'all' | 'counter' | 'settlement'>('all');
  const [inboxTab, setInboxTab] = useState<'alerts' | 'transactions'>('alerts');
  const [webauthnCap, setWebauthnCap] = useState<WebAuthnCapability | null>(null);
  const [confirmAuthMode, setConfirmAuthMode] = useState<'biometric' | 'pin'>('pin');
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
    if (statementNavSignal > 0) {
      setViewMode('statements');
      setError('');
    }
  }, [statementNavSignal]);

  useEffect(() => {
    if (inboxNavSignal > 0) {
      setViewMode('inbox');
      setError('');
    }
  }, [inboxNavSignal]);

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

  const latestTransaction = transactions[0] || null;

  const statementInsights = useMemo(() => {
    let cashInVolume = 0;
    let cashOutVolume = 0;
    for (const tx of transactions) {
      if (tx.status === 'rejected') continue;
      if (tx.type === 'cash_in') cashInVolume += tx.amount;
      if (tx.type === 'cash_out' || tx.type === 'merchant_cash_out') cashOutVolume += tx.amount;
    }
    return {
      cashInVolume,
      cashOutVolume,
      count: transactions.length,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const q = searchTx.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (
        statementFilter === 'counter' &&
        tx.type !== 'cash_in' &&
        tx.type !== 'cash_out' &&
        tx.type !== 'send_money'
      ) {
        return false;
      }
      if (
        statementFilter === 'settlement' &&
        tx.type !== 'agent_cash_out' &&
        tx.type !== 'merchant_cash_out' &&
        tx.type !== 'admin_credit'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        tx.txHash.toLowerCase().includes(q) ||
        tx.txId.toLowerCase().includes(q) ||
        tx.senderName.toLowerCase().includes(q) ||
        tx.receiverName.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q)
      );
    });
  }, [transactions, searchTx, statementFilter]);

  const txMap = useMemo(() => {
    const map = new Map<string, AcashTransaction>();
    for (const tx of transactions) map.set(tx.txId, tx);
    return map;
  }, [transactions]);

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
    setConfirmAuthMode(biometricsReady && counterTab !== 'cash_out' ? 'biometric' : 'pin');
    setStep('confirm');
  };

  const executeAgentOperation = async (mode: 'biometric' | 'pin', secretOrPin?: string) => {
    setError('');
    setSubmitting(true);
    try {
      let biometricProof = undefined;
      if (mode === 'biometric' && biometricsReady && counterTab !== 'cash_out') {
        biometricProof = await authorizeTransactionWithBiometrics({
          accountId: user.accountId,
          txType: counterTab,
          amount: numericAmount,
          target: counterTab === 'agent_cash_out' ? 'ADMIN-TREASURY' : customerIdentifier,
          credentials: enrolledBiometrics,
        });
      }

      if (mode === 'pin' && (!secretOrPin || !/^\d{4,5}$/.test(secretOrPin.trim()))) {
        throw new Error('Enter a valid 4 or 5-digit Security PIN.');
      }

      const authPayload = biometricProof
        ? { biometricProof, ...(secretOrPin ? { pin: secretOrPin.trim() } : {}) }
        : { pin: secretOrPin!.trim() };

      if (counterTab === 'cash_in') {
        const tx = await executeFinancialTransaction({
          type: 'cash_in',
          senderId: user.accountId,
          receiverIdentifier: customerIdentifier,
          amount: numericAmount,
          ...authPayload,
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
          ...authPayload,
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
          ...authPayload,
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
          pin: secretOrPin!.trim(),
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

  const agentTabs: Array<{ id: AgentTab; label: string; icon: React.ElementType }> = [
    {
      id: 'cash_in',
      label: t('processCashIn', lang),
      icon: UserPlus,
    },
    {
      id: 'send_money',
      label: t('agentSendMoney', lang),
      icon: Send,
    },
    {
      id: 'cash_out',
      label: t('processCashOut', lang),
      icon: ArrowUpRight,
    },
    {
      id: 'agent_cash_out',
      label: t('agentCashOutAdmin', lang),
      icon: Building2,
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
        <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl ${preset.primaryButtonClass} text-white flex items-center justify-center shrink-0`}>
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className={`text-[11px] font-semibold ${preset.accentTextClass} truncate`}>
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
            className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 1: Peaceful bKash-Style Agent Home Hub */}
      {viewMode === 'home' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left column: Float Hero + Single-Row Latest Activity Teaser */}
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
              footerMeta={
                <>
                  <span>
                    CI: <strong className="font-mono-tabular text-white">+৳{feeConfig.cashInCommissionPer1000}/1k</strong>
                  </span>
                  <span aria-hidden="true" className="text-white/35">·</span>
                  <span>
                    CO: <strong className="font-mono-tabular text-emerald-200">+৳{feeConfig.agentShare}/1k</strong>
                  </span>
                </>
              }
              footerActions={
                <>
                  <button
                    type="button"
                    onClick={toggleVoiceMute}
                    className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {voiceMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-200" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-200" />
                    )}
                    <span>{voiceMuted ? 'Voice Off' : 'Voice On'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('security')}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                      enrolledBiometrics.length > 0
                        ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'
                        : 'bg-white/10 border-white/15 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>
                      {enrolledBiometrics.length > 0
                        ? lang === 'bn'
                          ? 'বায়োমেট্রিক চালু'
                          : 'Biometrics On'
                        : lang === 'bn'
                          ? 'নিরাপত্তা'
                          : 'Security'}
                    </span>
                  </button>
                </>
              }
            />

            {/* Single-Line Latest Counter Activity Teaser */}
            <div className="acash-3d-surface rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {lang === 'bn' ? 'সর্বশেষ কাউন্টার লেনদেন' : 'Latest Counter Activity'}
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode('statements')}
                  className={`text-xs font-semibold ${preset.accentTextClass} hover:underline whitespace-nowrap cursor-pointer`}
                >
                  {lang === 'bn' ? 'সব স্টেটমেন্ট →' : `Statements (${transactions.length}) →`}
                </button>
              </div>
              {latestTransaction ? (
                <div
                  onClick={() => setSelectedReceipt(latestTransaction)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedReceipt(latestTransaction);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TransactionRowItem
                    tx={latestTransaction}
                    viewerAccountId={user.accountId}
                    lang={lang}
                  />
                </div>
              ) : (
                <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('noTransactions', lang)}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Structured bKash-Style Categorized Agent Menu Sheets */}
          <div className="lg:col-span-7 space-y-4">
            {/* Sheet 1: Counter Operations */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'কাউন্টার অপারেশন' : 'Counter Operations'}
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'তাৎক্ষণিক সেবা' : 'Instant Desk'}
                </span>
              </div>

              <ServiceCircleGrid
                cols="4"
                items={
                  [
                    {
                      id: 'cash_in',
                      label: t('cashIn', lang),
                      icon: UserPlus,
                      tone: 'emerald',
                      onClick: () => openCounterService('cash_in'),
                    },
                    {
                      id: 'send_money',
                      label: t('sendMoney', lang),
                      icon: Send,
                      tone: 'rose',
                      onClick: () => openCounterService('send_money'),
                    },
                    {
                      id: 'cash_out',
                      label: t('cashOut', lang),
                      icon: ArrowUpRight,
                      tone: 'amber',
                      onClick: () => openCounterService('cash_out'),
                    },
                    {
                      id: 'agent_cash_out',
                      label: lang === 'bn' ? 'অ্যাডমিনে ক্যাশ-আউট' : 'To Admin',
                      icon: Building2,
                      tone: 'sky',
                      onClick: () => openCounterService('agent_cash_out'),
                    },
                  ] satisfies ServiceCircleItem[]
                }
              />
            </div>

            {/* Sheet 2: Agent Menus & Tools */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'এজেন্ট মেনু ও টুলস' : 'Agent Menus & Tools'}
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'আলাদা পেজ' : 'Dedicated Pages'}
                </span>
              </div>

              <ServiceCircleGrid
                cols="4"
                items={
                  [
                    {
                      id: 'commission',
                      label: lang === 'bn' ? 'কমিশন' : 'Commission',
                      icon: Award,
                      tone: 'emerald',
                      onClick: () => setViewMode('commission'),
                    },
                    {
                      id: 'statements',
                      label: lang === 'bn' ? 'স্টেটমেন্ট' : 'Statements',
                      icon: FileText,
                      tone: 'indigo',
                      onClick: () => setViewMode('statements'),
                    },
                    {
                      id: 'inbox',
                      label: lang === 'bn' ? 'ইনবক্স' : 'Inbox',
                      icon: Mail,
                      tone: 'rose',
                      badge:
                        unreadNotifications > 0
                          ? unreadNotifications > 9
                            ? '9+'
                            : String(unreadNotifications)
                          : undefined,
                      onClick: () => setViewMode('inbox'),
                    },
                    {
                      id: 'security_hub',
                      label: lang === 'bn' ? 'নিরাপত্তা ও ২FA' : 'Security Hub',
                      icon: ShieldCheck,
                      tone: 'cyan',
                      onClick: () => setViewMode('security'),
                    },
                    {
                      id: 'my_qr',
                      label: t('myQr', lang),
                      icon: QrCode,
                      tone: 'violet',
                      onClick: () => setShowQr(true),
                    },
                    ...(onOpenMapLocationPicker
                      ? [
                          {
                            id: 'map_pin',
                            label: user.mapLocation
                              ? lang === 'bn'
                                ? 'ম্যাপ আপডেট'
                                : 'Update Pin'
                              : lang === 'bn'
                                ? 'ম্যাপ পিন'
                                : 'Map Pin',
                            icon: MapPin,
                            tone: 'emerald' as const,
                            onClick: onOpenMapLocationPicker,
                          },
                        ]
                      : ([] as ServiceCircleItem[])),
                    ...(onOpenProfile
                      ? [
                          {
                            id: 'profile',
                            label: lang === 'bn' ? 'প্রোফাইল' : 'Profile',
                            icon: UserIcon,
                            tone: 'sky' as const,
                            onClick: onOpenProfile,
                          },
                        ]
                      : ([] as ServiceCircleItem[])),
                    {
                      id: 'pdf_statement',
                      label: lang === 'bn' ? 'পিডিএফ' : 'PDF Export',
                      icon: FileText,
                      tone: 'pink',
                      onClick: () => downloadAccountStatementPdf(user, transactions, feeConfig),
                    },
                  ] satisfies ServiceCircleItem[]
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Dedicated Counter Form & Confirmation */}
      {viewMode === 'counter' && (
        <div className="max-w-xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setViewMode('home');
                setStep('form');
                setError('');
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preset.accentBorderHoverClass} cursor-pointer`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
            </button>
            <div className="text-right min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {agentTabs.find((a) => a.id === counterTab)?.label}
              </div>
              <div className={`text-[11px] font-mono-tabular ${preset.accentTextClass}`}>
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
                  <div className={`font-mono-tabular font-bold ${preset.accentTextClass} text-sm`}>
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
                    <span className={`text-[11px] font-mono-tabular ${preset.accentTextClass}`}>
                      U-XXXXXX
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={customerIdentifier}
                    onChange={(e) => setCustomerIdentifier(e.target.value)}
                    placeholder="U-XXXXXX or 017XXXXXXXX"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
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
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-base font-mono-tabular font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[500, 1000, 2000, 5000, 10000].map((presetAmt) => (
                    <button
                      key={presetAmt}
                      type="button"
                      onClick={() => setAmount(String(presetAmt))}
                      className={`px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-[11px] font-mono-tabular text-slate-700 dark:text-slate-300 ${preset.accentBorderHoverClass} cursor-pointer`}
                    >
                      ৳{presetAmt.toLocaleString()}
                    </button>
                  ))}
                </div>
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
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
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
                  <span className={`font-semibold ${preset.accentTextClass} text-right`}>
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
                onConfirmBiometric={(pin) => executeAgentOperation('biometric', pin)}
                onConfirmPin={(pin) => executeAgentOperation('pin', pin)}
                onOpenBiometricSettings={onOpenBiometricSettings}
                pinButtonLabel={`${agentTabs.find((tItem) => tItem.id === counterTab)?.label} · ${formatBdt(numericAmount, lang)}`}
                pinLabel={
                  counterTab === 'cash_out'
                    ? lang === 'bn'
                      ? 'গ্রাহকের সিকিউরিটি পিন'
                      : 'Customer Security PIN'
                    : undefined
                }
                pinHint={
                  counterTab === 'cash_out'
                    ? lang === 'bn'
                      ? 'কাউন্টার ক্যাশ-আউট নিশ্চিত করতে গ্রাহককে তাঁর ৪–৫ সংখ্যার সিকিউরিটি পিন দিতে বলুন।'
                      : "Ask the customer to enter their 4–5 digit Security PIN to authorize this counter cash-out."
                    : undefined
                }
                biometricDisabledReason={
                  counterTab === 'cash_out'
                    ? lang === 'bn'
                      ? 'কাউন্টার ক্যাশ-আউট অনুমোদনের জন্য গ্রাহকের সিকিউরিটি পিন বাধ্যতামূলক।'
                      : "Customer verification required: enter Customer's Security PIN."
                    : undefined
                }
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
                <div className={`font-mono-tabular text-xl font-bold ${preset.accentTextClass} mt-1`}>
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
                  className={`px-5 py-2.5 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white cursor-pointer`}
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

      {/* VIEW 3: Dedicated Commission & Earnings Tracker Page */}
      {viewMode === 'commission' && (
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t('todayCommission', lang)}</span>
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="font-mono-tabular text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                {formatBdt(todayCommission, lang)}
              </div>
            </div>

            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t('totalCommission', lang)}</span>
                <Award className={`w-4 h-4 ${preset.accentTextClass}`} />
              </div>
              <div className={`font-mono-tabular text-xl font-bold ${preset.accentTextClass} mt-1.5`}>
                {formatBdt(user.commissionBalance || 0, lang)}
              </div>
            </div>

            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('commissionRate', lang)}
              </div>
              <div className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                CO: +৳{feeConfig.agentShare}/1k · CI: +৳{feeConfig.cashInCommissionPer1000}/1k
              </div>
            </div>
          </div>

          <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('home')}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preset.accentBorderHoverClass} cursor-pointer`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
                </button>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {t('commissionTracker', lang)}
                </h3>
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {commissionEntries.length} {lang === 'bn' ? 'টি এন্ট্রি' : 'entries'}
              </span>
            </div>

            {commissionEntries.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'এখনো কোনো কমিশন অর্জিত হয়নি।' : 'No commissions earned yet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {commissionEntries.map((tx) => (
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
                    className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {tx.type === 'cash_in' ? 'Cash-In' : 'Cash-Out'} · {tx.senderName} → {tx.receiverName}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                        {tx.txHash} · {new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono-tabular text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatBdt(tx.feeBreakdown.agentAmount, lang)}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-400">
                        Vol {formatBdt(tx.amount, lang)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 4: Dedicated Statements & Full Ledger */}
      {viewMode === 'statements' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'ক্যাশ-ইন ভলিউম' : 'Cash-In Vol'}
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                {formatBdt(statementInsights.cashInVolume, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'ক্যাশ-আউট ভলিউম' : 'Cash-Out Vol'}
              </div>
              <div className={`font-mono-tabular text-sm sm:text-lg font-bold ${preset.accentTextClass} mt-1 truncate`}>
                {formatBdt(statementInsights.cashOutVolume, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'মোট এন্ট্রি' : 'Entries'}
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                {statementInsights.count}
              </div>
            </div>
          </div>

          <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('home')}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preset.accentBorderHoverClass} cursor-pointer`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
                  </button>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'এজেন্ট স্টেটমেন্ট' : 'Agent Statements'}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('downloadStatement', lang)}</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-1 shrink-0">
                  {(
                    [
                      { id: 'all', en: 'All', bn: 'সব' },
                      { id: 'counter', en: 'Counter', bn: 'কাউন্টার' },
                      { id: 'settlement', en: 'Settlement', bn: 'সেটেলমেন্ট' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatementFilter(f.id)}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        statementFilter === f.id
                          ? preset.activeTabClass
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {lang === 'bn' ? f.bn : f.en}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTx}
                    onChange={(e) => setSearchTx(e.target.value)}
                    placeholder={t('searchPlaceholder', lang)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
                  />
                </div>
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
        </div>
      )}

      {/* VIEW 5: Dedicated Agent Inbox & Alerts Page */}
      {viewMode === 'inbox' && (
        <div className="max-w-3xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('home')}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preset.accentBorderHoverClass} cursor-pointer`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
                </button>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'এজেন্ট ইনবক্স ও অ্যালার্ট' : 'Agent Inbox & Alerts'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {unreadNotifications} {lang === 'bn' ? 'টি অপঠিত বার্তা' : 'unread messages'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {unreadNotifications > 0 && onMarkAllNotifRead && (
                  <button
                    type="button"
                    onClick={onMarkAllNotifRead}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'সব পড়া হয়েছে' : 'Mark all read'}</span>
                  </button>
                )}
                {onOpenNotifications && (
                  <button
                    type="button"
                    onClick={onOpenNotifications}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'ডিভাইস সাউন্ড' : 'Alert Settings'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInboxTab('alerts')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  inboxTab === 'alerts' ? preset.activeTabClass : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'bn'
                  ? `অ্যালার্ট (${accountNotifications.length})`
                  : `Notifications (${accountNotifications.length})`}
              </button>
              <button
                type="button"
                onClick={() => setInboxTab('transactions')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  inboxTab === 'transactions' ? preset.activeTabClass : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'bn'
                  ? `লেনদেন (${transactions.length})`
                  : `Transactions (${transactions.length})`}
              </button>
            </div>
          </div>

          {inboxTab === 'alerts' ? (
            accountNotifications.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'এখনো কোনো ইনবক্স অ্যালার্ট নেই।' : 'Your Inbox is clean and quiet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {accountNotifications.map((notif) => {
                  const read = isAccountNotificationRead(notif, user.accountId);
                  const linkedTx = notif.txId ? txMap.get(notif.txId) : undefined;
                  return (
                    <div
                      key={notif.id}
                      className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        read ? 'opacity-70' : 'bg-rose-50/40 dark:bg-rose-500/5'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                          <span>{notif.title}</span>
                          {!read && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-[10px] text-white font-semibold">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {notif.message}
                        </p>
                        <div className="text-[11px] font-mono-tabular text-slate-400">
                          {new Date(notif.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {linkedTx && (
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(linkedTx)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            {lang === 'bn' ? 'রসিদ' : 'Receipt'}
                          </button>
                        )}
                        {!read && onMarkNotifRead && (
                          <button
                            type="button"
                            onClick={() => onMarkNotifRead(notif.id)}
                            className={`min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold ${preset.accentTextClass} cursor-pointer`}
                          >
                            {lang === 'bn' ? 'পড়া হয়েছে' : 'Mark Read'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.slice(0, 20).map((tx) => (
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

      {/* VIEW 6: Dedicated Agent Security, Biometrics & Voice Page */}
      {viewMode === 'security' && (
        <div className="max-w-2xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setViewMode('home')}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preset.accentBorderHoverClass} cursor-pointer`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
            </button>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'নিরাপত্তা, বায়োমেট্রিক ও ভয়েস' : 'Agent Security, Biometrics & Voice'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'প্রতিটি কাউন্টার লেনদেনে পিন বা বায়োমেট্রিক বাধ্যতামূলক'
                  : 'Every counter operation requires Biometric or Security PIN'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{lang === 'bn' ? 'ডিভাইস বায়োমেট্রিক' : 'Device Biometrics'}</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {enrolledBiometrics.length > 0 ? `${enrolledBiometrics.length} Active` : 'Off'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'bn'
                  ? 'ফিঙ্গারপ্রিন্ট বা ফেস-আইডি যুক্ত করে দ্রুত ও নিরাপদে ক্যাশ-ইন ও ট্রান্সফার অনুমোদন করুন।'
                  : 'Approve counter Cash-In & Agent transfers with hardware Fingerprint or FaceID.'}
              </p>
              {onOpenBiometricSettings && (
                <button
                  type="button"
                  onClick={onOpenBiometricSettings}
                  className={`w-full min-h-[42px] py-2 px-3 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white cursor-pointer`}
                >
                  {lang === 'bn' ? 'বায়োমেট্রিক ম্যানেজ করুন' : 'Manage Passkeys & PIN'}
                </button>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Volume2 className={`w-4 h-4 ${preset.accentTextClass}`} />
                  <span>{lang === 'bn' ? 'ভয়েস সাউন্ডবক্স' : 'Counter Voice Alert'}</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {voiceMuted ? 'Muted' : 'Active'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {user.gender === 'female'
                  ? lang === 'bn'
                    ? 'প্রোফাইল: মহিলা → পুরুষ কণ্ঠে লেনদেন ভয়েস অ্যালার্ট।'
                    : 'Profile: Female → Announces transactions in a Male voice.'
                  : lang === 'bn'
                    ? 'প্রোফাইল: পুরুষ → নারী কণ্ঠে লেনদেন ভয়েস অ্যালার্ট।'
                    : 'Profile: Male → Announces transactions in a Female voice.'}
              </p>
              <button
                type="button"
                onClick={toggleVoiceMute}
                className="w-full min-h-[42px] py-2 px-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                {voiceMuted
                  ? lang === 'bn'
                    ? 'ভয়েস সাউন্ড চালু করুন'
                    : 'Unmute Voice Soundbox'
                  : lang === 'bn'
                    ? 'ভয়েস সাউন্ড মিউট করুন'
                    : 'Mute Voice Soundbox'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                <Lock className={`w-4 h-4 ${preset.accentTextClass}`} />
                <span>{lang === 'bn' ? 'কেওয়াইসি ও ২FA স্ট্যাটাস' : 'KYC & 2FA Compliance Status'}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                KYC: <strong className="text-slate-800 dark:text-slate-200">{(user.kyc?.status || 'unverified').toUpperCase()}</strong>
                {' · '}
                2FA: <strong className="text-slate-800 dark:text-slate-200">{user.totpSecret ? 'Google Auth ON' : 'EmailJS Guard'}</strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {onOpenMapLocationPicker && (
                <button
                  type="button"
                  onClick={onOpenMapLocationPicker}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {lang === 'bn' ? 'ম্যাপ পিন' : 'Booth Pin'}
                </button>
              )}
              {onOpenKyc && (
                <button
                  type="button"
                  onClick={onOpenKyc}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {lang === 'bn' ? 'কেওয়াইসি আপডেট' : 'Update KYC'}
                </button>
              )}
              {onOpen2fa && (
                <button
                  type="button"
                  onClick={onOpen2fa}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white cursor-pointer`}
                >
                  {lang === 'bn' ? '২FA ও পিন' : '2FA & PIN'}
                </button>
              )}
            </div>
          </div>
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
