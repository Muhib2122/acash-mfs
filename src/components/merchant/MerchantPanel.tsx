import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Volume2,
  Copy,
  Check,
  CheckCheck,
  Printer,
  RotateCcw,
  Building2,
  BarChart3,
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ArrowLeft,
  ArrowUpRight,
  Search,
  MapPin,
  Bell,
  Mail,
  Fingerprint,
  Loader2,
  QrCode,
  User as UserIcon,
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
  authorizeMerchantOwnerUnlock,
  calculateFeeBreakdown,
  executeFinancialTransaction,
  executeMerchantRefund,
  isAccountNotificationRead,
  UserComplianceState,
} from '../../lib/acashService';
import {
  downloadAccountStatementPdf,
  downloadMerchantQrStandeePdf,
} from '../../lib/pdfGenerator';
import { playMerchantSoundbox, playTransactionVoiceAlert } from '../../lib/soundbox';
import { triggerHapticGesture } from '../../lib/deviceAlerts';
import {
  authorizeSensitiveActionWithBiometrics,
  authorizeTransactionWithBiometrics,
  detectWebAuthnCapability,
  WebAuthnCapability,
} from '../../lib/webauthn';
import { BiometricConfirmBox } from '../common/BiometricConfirmBox';
import { TransactionReceiptModal } from '../common/TransactionReceiptModal';
import { ACASH_MAIN_LOGO_SRC } from '../common/BrandLogo';
import { Wallet3DCard } from '../common/Wallet3DCard';
import { ComplianceAlertBanner } from '../common/ComplianceAlertBanner';
import { TransactionRowItem } from '../common/TransactionRowItem';
import { ServiceCircleGrid, ServiceCircleItem } from '../common/ServiceCircleGrid';
import { usePortalTheme } from '../../lib/portalThemes';

interface MerchantPanelProps {
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

type MerchantTab =
  | 'home'
  | 'checkout'
  | 'cashout'
  | 'refunds'
  | 'b2b'
  | 'analytics'
  | 'statement'
  | 'inbox'
  | 'soundbox';

export const MerchantPanel: React.FC<MerchantPanelProps> = ({
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
  const [activeTab, setActiveTab] = useState<MerchantTab>('home');
  const [statementQuery, setStatementQuery] = useState('');
  const [inboxTab, setInboxTab] = useState<'alerts' | 'transactions'>('alerts');
  const [cashierMode, setCashierMode] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [webauthnCap, setWebauthnCap] = useState<WebAuthnCapability | null>(null);
  const [confirmAuthMode, setConfirmAuthMode] = useState<'biometric' | 'pin'>('pin');

  // Dynamic QR & Payment Link
  const [checkoutAmount, setCheckoutAmount] = useState('1250');
  const [checkoutNote, setCheckoutNote] = useState('Store Invoice');
  const [copiedLink, setCopiedLink] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Soundbox live alert state
  const [soundboxAlert, setSoundboxAlert] = useState<{
    amount: number;
    payer: string;
    txHash: string;
  } | null>(null);
  const seenTxIdsRef = useRef<Set<string> | null>(null);

  // Refund state
  const [refundHash, setRefundHash] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundStep, setRefundStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundResult, setRefundResult] = useState<AcashTransaction | null>(null);

  // B2B Supplier Transfer state
  const [b2bTarget, setB2bTarget] = useState('');
  const [b2bAmount, setB2bAmount] = useState('');
  const [b2bNote, setB2bNote] = useState('');
  const [b2bStep, setB2bStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [b2bSubmitting, setB2bSubmitting] = useState(false);
  const [b2bError, setB2bError] = useState('');
  const [b2bResult, setB2bResult] = useState<AcashTransaction | null>(null);

  // Merchant Cash-Out (Agent / Admin) state
  const [cashOutMode, setCashOutMode] = useState<'agent' | 'admin'>('agent');
  const [cashOutAgentId, setCashOutAgentId] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [cashOutNote, setCashOutNote] = useState('');
  const [cashOutStep, setCashOutStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [cashOutSubmitting, setCashOutSubmitting] = useState(false);
  const [cashOutError, setCashOutError] = useState('');
  const [cashOutResult, setCashOutResult] = useState<AcashTransaction | null>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<AcashTransaction | null>(null);

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
    if (homeNavSignal > 0 && !cashierMode) {
      setActiveTab('home');
    }
  }, [homeNavSignal, cashierMode]);

  useEffect(() => {
    if (statementNavSignal > 0 && !cashierMode) {
      setActiveTab('statement');
    }
  }, [statementNavSignal, cashierMode]);

  useEffect(() => {
    if (inboxNavSignal > 0 && !cashierMode) {
      setActiveTab('inbox');
    }
  }, [inboxNavSignal, cashierMode]);

  const numericCashOutAmt = Number(cashOutAmount) || 0;
  const { fee: cashOutFee } = useMemo(
    () =>
      calculateFeeBreakdown('merchant_cash_out', numericCashOutAmt, feeConfig, {
        targetIsAdmin: cashOutMode === 'admin',
      }),
    [numericCashOutAmt, feeConfig, cashOutMode]
  );
  const totalCashOutDebit = Number((numericCashOutAmt + cashOutFee).toFixed(2));

  // Reset seen tx tracker if account changes
  useEffect(() => {
    seenTxIdsRef.current = null;
  }, [user.accountId]);

  useEffect(() => {
    if (externalQrSignal > 0) {
      setActiveTab('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [externalQrSignal]);

  // Listen for new transactions to trigger Opposite-Gender Voice & Visual Soundbox Alert
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
        setSoundboxAlert({
          amount: tx.amount,
          payer: isIncoming ? tx.senderName : `→ ${tx.receiverName}`,
          txHash: tx.txHash,
        });
        playTransactionVoiceAlert({
          listenerGender: user.gender,
          amount: tx.amount,
          txType: tx.type,
          direction,
          counterpartyName: counterparty,
          lang,
        });
        break;
      }
    }
  }, [transactions, user.accountId, user.gender, lang]);

  const numericCheckoutAmt = Number(checkoutAmount) || 0;
  const customPaymentLink = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://acash.app';
    const params = new URLSearchParams();
    params.set('payTo', user.accountId);
    if (numericCheckoutAmt > 0) params.set('amount', String(numericCheckoutAmt));
    if (checkoutNote.trim()) params.set('note', checkoutNote.trim());
    return `${origin}/?${params.toString()}`;
  }, [user.accountId, numericCheckoutAmt, checkoutNote]);

  const qrPayload = useMemo(() => {
    return JSON.stringify({
      app: 'acash',
      accountId: user.accountId,
      role: 'M',
      amount: numericCheckoutAmt > 0 ? numericCheckoutAmt : undefined,
      note: checkoutNote.trim() || undefined,
    });
  }, [user.accountId, numericCheckoutAmt, checkoutNote]);

  const incomingPayments = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          tx.receiverId === user.accountId &&
          (tx.type === 'merchant_payment' ||
            tx.type === 'b2b_transfer' ||
            tx.type === 'admin_credit' ||
            tx.type === 'admin_transfer')
      ),
    [transactions, user.accountId]
  );

  const txMap = useMemo(() => {
    const map = new Map<string, AcashTransaction>();
    for (const tx of transactions) map.set(tx.txId, tx);
    return map;
  }, [transactions]);

  const latestStoreActivity = incomingPayments[0] || transactions[0] || null;

  const matchedTxForRefund = useMemo(() => {
    const clean = refundHash.trim().toUpperCase();
    if (!clean) return null;
    return (
      incomingPayments.find(
        (tx) =>
          (tx.type === 'merchant_payment' || tx.type === 'b2b_transfer') &&
          (tx.txHash.toUpperCase() === clean || tx.txId.toUpperCase() === clean)
      ) || null
    );
  }, [incomingPayments, refundHash]);

  // Analytics calculations
  const analytics = useMemo(() => {
    const completedIncoming = incomingPayments.filter(
      (tx) =>
        (tx.type === 'merchant_payment' || tx.type === 'b2b_transfer') &&
        (tx.status === 'completed' || tx.status === 'partially_refunded' || tx.status === 'refunded')
    );
    const grossSales = completedIncoming.reduce((acc, tx) => acc + tx.amount, 0);
    const totalRefunded = completedIncoming.reduce((acc, tx) => acc + (tx.refundedAmount || 0), 0);
    const avgTicket = completedIncoming.length > 0 ? grossSales / completedIncoming.length : 0;

    // Last 7 days bar buckets
    const days: Array<{ label: string; total: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      const dayTotal = completedIncoming
        .filter((tx) => tx.createdAt >= d.getTime() && tx.createdAt < next)
        .reduce((s, tx) => s + tx.amount, 0);
      days.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        total: dayTotal,
      });
    }

    const maxDay = Math.max(1000, ...days.map((d) => d.total));
    return {
      grossSales,
      totalRefunded,
      netSales: grossSales - totalRefunded,
      txCount: completedIncoming.length,
      avgTicket,
      days,
      maxDay,
    };
  }, [incomingPayments]);

  const handleTestSoundbox = () => {
    const sampleAmt = numericCheckoutAmt > 0 ? numericCheckoutAmt : 1450;
    setSoundboxAlert({
      amount: sampleAmt,
      payer: 'Walk-in Customer',
      txHash: '0xAC_SOUNDBOX_TEST',
    });
    playMerchantSoundbox(sampleAmt, 'Walk-in Customer', lang, user.gender);
  };

  const handleUnlockOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError('');
    setUnlockBusy(true);
    try {
      const res = await authorizeMerchantOwnerUnlock({
        accountId: user.accountId,
        auth: { pin: unlockPin },
      });
      if (!res.authorized) {
        setUnlockError(lang === 'bn' ? 'ভুল ওনার পিন!' : 'Invalid Owner PIN.');
        return;
      }
      setCashierMode(false);
      setUnlockModalOpen(false);
      setUnlockPin('');
      setUnlockError('');
    } catch (err) {
      setUnlockError(
        err instanceof Error
          ? err.message
          : lang === 'bn'
            ? 'ওনার পিন যাচাই করা যায়নি।'
            : 'Unable to verify Owner PIN.'
      );
    } finally {
      setUnlockBusy(false);
    }
  };

  const handleUnlockOwnerBiometric = async () => {
    setUnlockError('');
    setUnlockBusy(true);
    try {
      const biometricProof = await authorizeSensitiveActionWithBiometrics({
        subjectId: user.accountId,
        actionName: 'merchant_owner_unlock',
        credentials: enrolledBiometrics,
      });
      await authorizeMerchantOwnerUnlock({
        accountId: user.accountId,
        auth: { biometricProof },
      });
      setCashierMode(false);
      setUnlockModalOpen(false);
      setUnlockPin('');
      setUnlockError('');
    } catch (err) {
      setUnlockError(
        err instanceof Error
          ? err.message
          : lang === 'bn'
            ? 'বায়োমেট্রিক যাচাই ব্যর্থ হয়েছে।'
            : 'Owner biometric verification failed.'
      );
    } finally {
      setUnlockBusy(false);
    }
  };

  const handleRefundConfirm = async (mode: 'biometric' | 'pin', secretOrPin?: string) => {
    setRefundError('');
    setRefundSubmitting(true);
    try {
      const amt = Number(refundAmount);
      const biometricProof =
        mode === 'biometric' && biometricsReady
          ? await authorizeTransactionWithBiometrics({
              accountId: user.accountId,
              txType: 'refund',
              amount: amt,
              target: refundHash,
              credentials: enrolledBiometrics,
            })
          : undefined;
      if (mode === 'pin' && (!secretOrPin || !/^\d{4,5}$/.test(secretOrPin.trim()))) {
        throw new Error('Enter a valid 4 or 5-digit Security PIN.');
      }
      const res = await executeMerchantRefund({
        merchantId: user.accountId,
        txHashInput: refundHash,
        refundAmount: amt,
        ...(biometricProof
          ? { biometricProof, ...(secretOrPin ? { pin: secretOrPin.trim() } : {}) }
          : { pin: secretOrPin!.trim() }),
      });
      triggerHapticGesture('success');
      setRefundResult(res);
      setRefundStep('done');
    } catch (err) {
      triggerHapticGesture('warning');
      setRefundError(err instanceof Error ? err.message : 'Refund failed.');
    } finally {
      setRefundSubmitting(false);
    }
  };

  const handleB2bConfirm = async (mode: 'biometric' | 'pin', secretOrPin?: string) => {
    setB2bError('');
    setB2bSubmitting(true);
    try {
      const amt = Number(b2bAmount);
      const biometricProof =
        mode === 'biometric' && biometricsReady
          ? await authorizeTransactionWithBiometrics({
              accountId: user.accountId,
              txType: 'b2b_transfer',
              amount: amt,
              target: b2bTarget,
              credentials: enrolledBiometrics,
            })
          : undefined;
      if (mode === 'pin' && (!secretOrPin || !/^\d{4,5}$/.test(secretOrPin.trim()))) {
        throw new Error('Enter a valid 4 or 5-digit Security PIN.');
      }
      const res = await executeFinancialTransaction({
        type: 'b2b_transfer',
        senderId: user.accountId,
        receiverIdentifier: b2bTarget,
        amount: amt,
        ...(biometricProof
          ? { biometricProof, ...(secretOrPin ? { pin: secretOrPin.trim() } : {}) }
          : { pin: secretOrPin!.trim() }),
        feeConfig,
        note: b2bNote || 'B2B Supplier Settlement',
      });
      triggerHapticGesture('success');
      setB2bResult(res);
      setB2bStep('done');
      setB2bAmount('');
    } catch (err) {
      triggerHapticGesture('warning');
      setB2bError(err instanceof Error ? err.message : 'B2B Transfer failed.');
    } finally {
      setB2bSubmitting(false);
    }
  };

  const handleMerchantCashOutConfirm = async (mode: 'biometric' | 'pin', secretOrPin?: string) => {
    setCashOutError('');
    setCashOutSubmitting(true);
    try {
      const target = cashOutMode === 'admin' ? 'ADMIN-TREASURY' : cashOutAgentId;
      const biometricProof =
        mode === 'biometric' && biometricsReady
          ? await authorizeTransactionWithBiometrics({
              accountId: user.accountId,
              txType: 'merchant_cash_out',
              amount: numericCashOutAmt,
              target,
              credentials: enrolledBiometrics,
            })
          : undefined;
      if (mode === 'pin' && (!secretOrPin || !/^\d{4,5}$/.test(secretOrPin.trim()))) {
        throw new Error('Enter a valid 4 or 5-digit Security PIN.');
      }
      const res = await executeFinancialTransaction({
        type: 'merchant_cash_out',
        senderId: user.accountId,
        receiverIdentifier: target,
        amount: numericCashOutAmt,
        ...(biometricProof
          ? { biometricProof, ...(secretOrPin ? { pin: secretOrPin.trim() } : {}) }
          : { pin: secretOrPin!.trim() }),
        feeConfig,
        note:
          cashOutNote ||
          (cashOutMode === 'admin'
            ? 'Merchant Cash-Out to Admin Treasury'
            : `Merchant Cash-Out via Agent ${cashOutAgentId}`),
      });
      triggerHapticGesture('success');
      setCashOutResult(res);
      setCashOutStep('done');
      setCashOutAmount('');
    } catch (err) {
      triggerHapticGesture('warning');
      setCashOutError(err instanceof Error ? err.message : 'Merchant Cash-Out failed.');
    } finally {
      setCashOutSubmitting(false);
    }
  };

  const isDisabled = user.status !== 'active';

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-5 pb-24 md:pb-10">
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
          <div>
            <div>{t('suspendedBanner', lang)}</div>
            {user.disableReason && (
              <div className="text-xs text-rose-600 dark:text-rose-300 mt-1 font-medium">
                {lang === 'bn' ? 'কারণ:' : 'Cause:'} {user.disableReason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Soundbox Live Alert Banner */}
      {soundboxAlert && (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35 p-4 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
              <Volume2 className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Acash Voice Soundbox · {soundboxAlert.txHash}
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                Received{' '}
                <span className="font-mono-tabular text-emerald-600 dark:text-emerald-300">
                  {formatBdt(soundboxAlert.amount, lang)}
                </span>{' '}
                from {soundboxAlert.payer}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSoundboxAlert(null)}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#0B0D14] border border-emerald-200 dark:border-emerald-500/30 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dedicated Cashier Mode Header Card (shown only when Cashier Staff lock is engaged) */}
      {cashierMode && (
        <Wallet3DCard
          user={user}
          lang={lang}
          balanceLabel={t('cashierMode', lang)}
          alwaysVisibleBalance
          cashierMode={true}
          accentVariant="merchant"
          topRightActions={
            <button
              type="button"
              onClick={() => setUnlockModalOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock Owner</span>
            </button>
          }
          footerActions={
            <button
              type="button"
              onClick={handleTestSoundbox}
              className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-200" />
              <span>{t('soundboxTest', lang)}</span>
            </button>
          }
        />
      )}

      {/* VIEW 0: Peaceful bKash-Style Merchant Home Hub */}
      {activeTab === 'home' && !cashierMode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left column: Store Balance Hero Card + Single-Row Latest Payment Teaser */}
          <div className="lg:col-span-5 space-y-4">
            <Wallet3DCard
              user={user}
              lang={lang}
              balanceLabel={t('ownerMode', lang)}
              alwaysVisibleBalance
              accentVariant="merchant"
              topRightActions={
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('checkout');
                    setCashierMode(true);
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/15 border border-white/25 hover:bg-white/25 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'ক্যাশিয়ার মোড' : 'Cashier View'}</span>
                </button>
              }
              footerMeta={
                <>
                  <span>
                    Agent CO:{' '}
                    <strong className="font-mono-tabular text-white">
                      ৳{feeConfig.merchantCashOutFeePer1000}/1k
                    </strong>
                  </span>
                  <span aria-hidden="true" className="text-white/35">·</span>
                  <span>
                    Admin CO:{' '}
                    <strong className="font-mono-tabular text-emerald-200">
                      ৳{feeConfig.merchantCashOutToAdminFeePer1000}/1k
                    </strong>
                  </span>
                </>
              }
              footerActions={
                <>
                  <button
                    type="button"
                    onClick={handleTestSoundbox}
                    className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-200" />
                    <span>{t('soundboxTest', lang)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('soundbox')}
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

            {/* Single-Line Latest Store Activity Teaser */}
            <div className="acash-3d-surface rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {lang === 'bn' ? 'সর্বশেষ স্টোর পেমেন্ট' : 'Latest Store Activity'}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('statement')}
                  className={`text-xs font-semibold ${preset.accentTextClass} hover:underline whitespace-nowrap cursor-pointer`}
                >
                  {lang === 'bn' ? 'সব স্টেটমেন্ট →' : `Statements (${transactions.length}) →`}
                </button>
              </div>
              {latestStoreActivity ? (
                <div
                  onClick={() => setSelectedReceipt(latestStoreActivity)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedReceipt(latestStoreActivity);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TransactionRowItem
                    tx={latestStoreActivity}
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

          {/* Right column: Categorized Merchant Menu Sheets */}
          <div className="lg:col-span-7 space-y-4">
            {/* Sheet 1: Store & Settlement */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'স্টোর পেমেন্ট ও সেটেলমেন্ট' : 'Store & Settlement'}
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'তাৎক্ষণিক সেবা' : 'Merchant Desk'}
                </span>
              </div>

              <ServiceCircleGrid
                cols="4"
                items={
                  [
                    {
                      id: 'checkout',
                      label: lang === 'bn' ? 'চেকআউট QR' : 'Checkout',
                      icon: QrCode,
                      tone: 'rose',
                      onClick: () => setActiveTab('checkout'),
                    },
                    {
                      id: 'cashout',
                      label: lang === 'bn' ? 'ক্যাশ-আউট' : 'Cash Out',
                      icon: ArrowUpRight,
                      tone: 'cyan',
                      onClick: () => setActiveTab('cashout'),
                    },
                    {
                      id: 'refunds',
                      label: lang === 'bn' ? 'রিফান্ড' : 'Refunds',
                      icon: RotateCcw,
                      tone: 'amber',
                      onClick: () => setActiveTab('refunds'),
                    },
                    {
                      id: 'b2b',
                      label: lang === 'bn' ? 'বিটুবি পে' : 'B2B Pay',
                      icon: Building2,
                      tone: 'violet',
                      onClick: () => setActiveTab('b2b'),
                    },
                  ] satisfies ServiceCircleItem[]
                }
              />
            </div>

            {/* Sheet 2: Merchant Menus & Tools */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'মার্চেন্ট মেনু ও টুলস' : 'Merchant Menus & Tools'}
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
                      id: 'analytics',
                      label: lang === 'bn' ? 'বিশ্লেষণ' : 'Analytics',
                      icon: BarChart3,
                      tone: 'emerald',
                      onClick: () => setActiveTab('analytics'),
                    },
                    {
                      id: 'statement',
                      label: lang === 'bn' ? 'স্টেটমেন্ট' : 'Statements',
                      icon: FileText,
                      tone: 'indigo',
                      onClick: () => setActiveTab('statement'),
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
                      onClick: () => setActiveTab('inbox'),
                    },
                    {
                      id: 'soundbox',
                      label: lang === 'bn' ? 'সাউন্ডবক্স ও নিরাপত্তা' : 'Soundbox',
                      icon: Volume2,
                      tone: 'pink',
                      onClick: () => setActiveTab('soundbox'),
                    },
                    {
                      id: 'cashier_lock',
                      label: lang === 'bn' ? 'ক্যাশিয়ার লক' : 'Cashier Lock',
                      icon: Lock,
                      tone: 'amber',
                      onClick: () => {
                        setActiveTab('checkout');
                        setCashierMode(true);
                      },
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
                      id: 'pdf_export',
                      label: lang === 'bn' ? 'পিডিএফ' : 'PDF Export',
                      icon: FileText,
                      tone: 'cyan',
                      onClick: () => downloadAccountStatementPdf(user, transactions, feeConfig),
                    },
                  ] satisfies ServiceCircleItem[]
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub-Page Top Bar with Back-to-Home & Quick Switcher */}
      {activeTab !== 'home' && !cashierMode && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl px-3.5 py-2.5">
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preset.accentBorderHoverClass} shrink-0 cursor-pointer`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
            </button>
            {(
              [
                { id: 'checkout', label: lang === 'bn' ? 'চেকআউট' : 'Checkout' },
                { id: 'cashout', label: lang === 'bn' ? 'ক্যাশ-আউট' : 'Cash Out' },
                { id: 'refunds', label: lang === 'bn' ? 'রিফান্ড' : 'Refunds' },
                { id: 'b2b', label: lang === 'bn' ? 'বিটুবি' : 'B2B' },
                { id: 'analytics', label: lang === 'bn' ? 'বিশ্লেষণ' : 'Analytics' },
                { id: 'statement', label: lang === 'bn' ? 'স্টেটমেন্ট' : 'Statements' },
                { id: 'inbox', label: lang === 'bn' ? 'ইনবক্স' : 'Inbox' },
                { id: 'soundbox', label: lang === 'bn' ? 'সাউন্ডবক্স' : 'Soundbox' },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setActiveTab(tabItem.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                  activeTab === tabItem.id
                    ? preset.activeTabClass
                    : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
          <div className={`text-xs font-mono-tabular font-bold ${preset.accentTextClass} shrink-0`}>
            Bal: {formatBdt(user.balance, lang)}
          </div>
        </div>
      )}

      {/* TAB 1: Smart Checkout & Dynamic QR */}
      {activeTab === 'checkout' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {t('smartCheckout', lang)}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'নির্ধারিত পেমেন্ট পরিমাণ (ঐচ্ছিক)' : 'Embedded Amount (BDT, Optional)'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={checkoutAmount}
                  onChange={(e) => setCheckoutAmount(e.target.value)}
                  placeholder="0 for open amount"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'ইনভয়েস রেফারেন্স' : 'Invoice / Counter Reference'}
                </label>
                <input
                  type="text"
                  value={checkoutNote}
                  onChange={(e) => setCheckoutNote(e.target.value)}
                  placeholder="Counter #1 Order"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col items-center p-5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <img
                  src={ACASH_MAIN_LOGO_SRC}
                  alt="Acash"
                  className="w-8 h-8 object-contain"
                />
                <span className="font-display font-bold text-sm text-slate-900 dark:text-white">
                  Acash Merchant Pay
                </span>
              </div>
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 dark:border-transparent shadow-sm">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={qrPayload}
                  size={180}
                  level="H"
                  fgColor="#0f172a"
                />
              </div>
              <div className="mt-3 text-center">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {user.businessName || user.name}
                </div>
                <div className="font-mono-tabular text-xs text-indigo-600 dark:text-indigo-400">
                  {user.accountId}
                  {numericCheckoutAmt > 0 ? ` · ${formatBdt(numericCheckoutAmt, lang)}` : ''}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('paymentLink', lang)}</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={customPaymentLink}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-[11px] font-mono-tabular text-indigo-700 dark:text-indigo-300 truncate"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(customPaymentLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1800);
                  }}
                  className={`px-3.5 py-2 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0 cursor-pointer`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? t('copied', lang) : 'Copy'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                downloadMerchantQrStandeePdf(user, qrCanvasRef.current, numericCheckoutAmt)
              }
              className={`w-full min-h-[44px] py-3 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer`}
            >
              <Printer className="w-4 h-4" />
              <span>{t('downloadStandee', lang)}</span>
            </button>
          </div>

          {/* Incoming Counter Feed (Minimized to latest 5 with Statement link) */}
          <div className="lg:col-span-7 acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'প্রাপ্ত পেমেন্টসমূহ' : 'Incoming Counter Payments'}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('soundboxActive', lang)}</span>
                </span>
                {!cashierMode && incomingPayments.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('statement')}
                    className={`text-xs font-semibold ${preset.accentTextClass} hover:underline cursor-pointer`}
                  >
                    {lang === 'bn' ? 'সব দেখুন →' : `All (${incomingPayments.length}) →`}
                  </button>
                )}
              </div>
            </div>

            {incomingPayments.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('noTransactions', lang)}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {incomingPayments.slice(0, 5).map((tx) => (
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
                      showRefundAction={!cashierMode}
                      onRefundClick={(targetTx) => {
                        setRefundHash(targetTx.txHash);
                        setRefundAmount(
                          String(targetTx.amount - (targetTx.refundedAmount || 0))
                        );
                        setRefundStep('form');
                        setActiveTab('refunds');
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1B: Merchant Cash-Out (Agent A- or Admin Treasury) */}
      {activeTab === 'cashout' && !cashierMode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {t('merchantCashOut', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {lang === 'bn'
                  ? 'মার্চেন্ট ব্যালেন্স শুধুমাত্র এজেন্ট (A-) অথবা অ্যাডমিন ট্রেজারিতে ক্যাশ-আউট করা যাবে।'
                  : 'Withdraw Merchant settlement funds strictly to an Agent (A-) account or Admin Treasury.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setCashOutMode('agent');
                  setCashOutStep('form');
                  setCashOutError('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  cashOutMode === 'agent'
                    ? preset.activeTabClass
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('cashOutToAgent', lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCashOutMode('admin');
                  setCashOutStep('form');
                  setCashOutError('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  cashOutMode === 'admin'
                    ? preset.activeTabClass
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('cashOutToAdmin', lang)}
              </button>
            </div>

            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-700 dark:text-slate-300">
                {cashOutMode === 'admin'
                  ? lang === 'bn'
                    ? 'অ্যাডমিন ক্যাশ-আউট চার্জ'
                    : 'Admin Cash-Out Rate'
                  : lang === 'bn'
                    ? 'মার্চেন্ট ক্যাশ-আউট চার্জ'
                    : 'Merchant Cash-Out Rate'}
                :
              </span>
              <span className="font-mono-tabular font-semibold text-indigo-700 dark:text-indigo-300">
                {cashOutMode === 'admin'
                  ? feeConfig.merchantCashOutToAdminFeePer1000 > 0
                    ? `৳${feeConfig.merchantCashOutToAdminFeePer1000}/1,000`
                    : 'Free (৳0/1,000)'
                  : `৳${feeConfig.merchantCashOutFeePer1000}/1,000`}
              </span>
            </div>

            {cashOutStep === 'form' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setCashOutError('');
                  if (cashOutMode === 'agent' && !cashOutAgentId.trim()) {
                    setCashOutError('Enter Agent Acash ID (A-...) or mobile number.');
                    return;
                  }
                  if (!Number.isFinite(numericCashOutAmt) || numericCashOutAmt <= 0) {
                    setCashOutError('Enter a valid cash-out amount.');
                    return;
                  }
                  if (totalCashOutDebit > user.balance) {
                    setCashOutError(
                      `Insufficient balance. Required ${formatBdt(totalCashOutDebit)}, available ${formatBdt(user.balance)}.`
                    );
                    return;
                  }
                  setConfirmAuthMode(biometricsReady ? 'biometric' : 'pin');
                  setCashOutStep('confirm');
                }}
                className="space-y-4"
              >
                {cashOutMode === 'agent' ? (
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {t('agentAccount', lang)}
                      </label>
                      <span className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                        Sandbox: A-200001
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      value={cashOutAgentId}
                      onChange={(e) => setCashOutAgentId(e.target.value)}
                      placeholder="A-200001 or 01811000002"
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-1">
                    <div className="text-slate-500 dark:text-slate-400">Admin Treasury Destination</div>
                    <div className="font-mono-tabular font-bold text-indigo-600 dark:text-indigo-300 text-sm">
                      ADMIN-TREASURY — Acash Admin Treasury
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('amount', lang)}
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    step="0.01"
                    value={cashOutAmount}
                    onChange={(e) => setCashOutAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('note', lang)}
                  </label>
                  <input
                    type="text"
                    value={cashOutNote}
                    onChange={(e) => setCashOutNote(e.target.value)}
                    placeholder="Daily Merchant Cash-Out"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {numericCashOutAmt > 0 && (
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('fee', lang)}: </span>
                        <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400 font-semibold">
                          {formatBdt(cashOutFee, lang)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">{t('totalDeduction', lang)}: </span>
                        <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                          {formatBdt(totalCashOutDebit, lang)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {numericCashOutAmt >= feeConfig.highValueThreshold && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/35 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                    {t('highValueNotice', lang)}
                  </div>
                )}

                {cashOutError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                    {cashOutError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isDisabled}
                  className={`w-full py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white disabled:opacity-50 shadow-sm`}
                >
                  {t('continueBtn', lang)}
                </button>
              </form>
            )}

            {cashOutStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Cash-Out Destination</span>
                    <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400 font-semibold text-right break-all">
                      {cashOutMode === 'admin' ? 'ADMIN-TREASURY' : cashOutAgentId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Total Debit</span>
                    <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                      {formatBdt(totalCashOutDebit, lang)}
                    </span>
                  </div>
                </div>

                <BiometricConfirmBox
                  user={user}
                  lang={lang}
                  amount={numericCashOutAmt}
                  amountLabel={formatBdt(totalCashOutDebit, lang)}
                  platformHighValueThreshold={feeConfig.highValueThreshold}
                  webauthnCap={webauthnCap}
                  authMode={confirmAuthMode}
                  onAuthModeChange={setConfirmAuthMode}
                  submitting={cashOutSubmitting}
                  error={cashOutError}
                  onClearError={() => setCashOutError('')}
                  onConfirmBiometric={(pin) => handleMerchantCashOutConfirm('biometric', pin)}
                  onConfirmPin={(pin) => handleMerchantCashOutConfirm('pin', pin)}
                  onOpenBiometricSettings={onOpenBiometricSettings}
                  pinButtonLabel={`Cash-Out ${formatBdt(totalCashOutDebit, lang)}`}
                />

                <button
                  type="button"
                  onClick={() => setCashOutStep('form')}
                  className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {t('back', lang)}
                </button>
              </div>
            )}

            {cashOutStep === 'done' && cashOutResult && (
              <div className="py-5 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 dark:text-emerald-400 mx-auto" />
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {cashOutResult.status === 'pending_admin_approval'
                    ? t('txPendingApproval', lang)
                    : t('txSuccess', lang)}
                </div>
                <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatBdt(cashOutResult.amount, lang)}
                </div>
                <div className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  {cashOutResult.txHash}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCashOutStep('form');
                    setCashOutResult(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  New Cash-Out
                </button>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Recent Merchant Cash-Outs (Agent / Admin)
              </h4>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {transactions
                .filter((tx) => tx.senderId === user.accountId && tx.type === 'merchant_cash_out')
                .map((tx) => (
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
              {transactions.filter(
                (tx) => tx.senderId === user.accountId && tx.type === 'merchant_cash_out'
              ).length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No merchant cash-outs recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Refund Engine */}
      {activeTab === 'refunds' && !cashierMode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {t('refundEngine', lang)}
            </h3>

            {refundStep === 'form' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setRefundError('');
                  if (!refundHash.trim()) {
                    setRefundError('Enter a valid Tx Hash.');
                    return;
                  }
                  if (!Number(refundAmount) || Number(refundAmount) <= 0) {
                    setRefundError('Enter a valid refund amount.');
                    return;
                  }
                  setConfirmAuthMode(biometricsReady ? 'biometric' : 'pin');
                  setRefundStep('confirm');
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('enterTxHash', lang)}
                  </label>
                  <input
                    type="text"
                    required
                    value={refundHash}
                    onChange={(e) => setRefundHash(e.target.value)}
                    placeholder="0xAC..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {matchedTxForRefund && (
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Customer</span>
                      <span className="text-slate-900 dark:text-white font-semibold">
                        {matchedTxForRefund.senderName} ({matchedTxForRefund.senderId})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Original Paid</span>
                      <span className="font-mono-tabular text-slate-900 dark:text-white">
                        {formatBdt(matchedTxForRefund.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Remaining Refundable</span>
                      <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatBdt(
                          matchedTxForRefund.amount - (matchedTxForRefund.refundedAmount || 0)
                        )}
                      </span>
                    </div>
                    <div className="pt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setRefundAmount(
                            String(
                              matchedTxForRefund.amount - (matchedTxForRefund.refundedAmount || 0)
                            )
                          )
                        }
                        className="px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-200 font-semibold"
                      >
                        {t('fullRefund', lang)}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRefundAmount(
                            String(
                              Number(
                                (
                                  (matchedTxForRefund.amount -
                                    (matchedTxForRefund.refundedAmount || 0)) /
                                  2
                                ).toFixed(2)
                              )
                            )
                          )
                        }
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold"
                      >
                        50% {t('partialRefund', lang)}
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('refundAmount', lang)}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {refundError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                    {refundError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isDisabled}
                  className={`w-full py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white disabled:opacity-50 shadow-sm`}
                >
                  {t('continueBtn', lang)}
                </button>
              </form>
            )}

            {refundStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Target Tx Hash</span>
                    <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400 break-all">{refundHash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Refund Amount</span>
                    <span className="font-mono-tabular font-bold text-rose-600 dark:text-rose-300">
                      {formatBdt(Number(refundAmount), lang)}
                    </span>
                  </div>
                </div>

                <BiometricConfirmBox
                  user={user}
                  lang={lang}
                  amount={Number(refundAmount) || 0}
                  amountLabel={formatBdt(Number(refundAmount) || 0, lang)}
                  platformHighValueThreshold={feeConfig.highValueThreshold}
                  webauthnCap={webauthnCap}
                  authMode={confirmAuthMode}
                  onAuthModeChange={setConfirmAuthMode}
                  submitting={refundSubmitting}
                  error={refundError}
                  onClearError={() => setRefundError('')}
                  onConfirmBiometric={(pin) => handleRefundConfirm('biometric', pin)}
                  onConfirmPin={(pin) => handleRefundConfirm('pin', pin)}
                  onOpenBiometricSettings={onOpenBiometricSettings}
                  pinButtonLabel={`Refund ${formatBdt(Number(refundAmount) || 0, lang)}`}
                />

                <button
                  type="button"
                  onClick={() => setRefundStep('form')}
                  className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {t('back', lang)}
                </button>
              </div>
            )}

            {refundStep === 'done' && refundResult && (
              <div className="py-5 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 dark:text-emerald-400 mx-auto" />
                <div className="text-base font-bold text-slate-900 dark:text-white">Refund Settled</div>
                <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatBdt(refundResult.amount, lang)}
                </div>
                <div className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  Refund Hash: {refundResult.txHash}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRefundStep('form');
                    setRefundHash('');
                    setRefundAmount('');
                    setRefundResult(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  Process Another Refund
                </button>
              </div>
            )}
          </div>

          {/* Clickable recent incoming hashes */}
          <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Recent Customer Payments (Click to populate Tx Hash)
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {incomingPayments.map((tx) => (
                <button
                  key={tx.txId}
                  type="button"
                  onClick={() => {
                    setRefundHash(tx.txHash);
                    setRefundAmount(String(tx.amount - (tx.refundedAmount || 0)));
                    setRefundStep('form');
                  }}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 flex items-center justify-between text-left transition-colors"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{tx.senderName}</div>
                    <div className="font-mono-tabular text-[11px] text-indigo-600 dark:text-indigo-400">{tx.txHash}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-tabular text-xs font-bold text-slate-900 dark:text-white">
                      {formatBdt(tx.amount)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{tx.status}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: B2B Supplier Transfer */}
      {activeTab === 'b2b' && !cashierMode && (
        <div className="max-w-xl acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">{t('b2bTransfer', lang)}</h3>

          {b2bStep === 'form' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setB2bError('');
                if (!b2bTarget.trim() || !Number(b2bAmount)) {
                  setB2bError('Enter supplier Merchant ID and amount.');
                  return;
                }
                setConfirmAuthMode(biometricsReady ? 'biometric' : 'pin');
                setB2bStep('confirm');
              }}
              className="space-y-4"
            >
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Supplier Merchant ID (M-)
                  </label>
                  <span className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                    Sandbox: M-300002
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={b2bTarget}
                  onChange={(e) => setB2bTarget(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('amount', lang)}
                </label>
                <input
                  type="number"
                  required
                  min="10"
                  value={b2bAmount}
                  onChange={(e) => setB2bAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('note', lang)}
                </label>
                <input
                  type="text"
                  value={b2bNote}
                  onChange={(e) => setB2bNote(e.target.value)}
                  placeholder="Wholesale PO #409"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isDisabled}
                className={`w-full py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white disabled:opacity-50 shadow-sm`}
              >
                {t('continueBtn', lang)}
              </button>
            </form>
          )}

            {b2bStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Supplier Merchant</span>
                    <span className="font-mono-tabular text-slate-900 dark:text-white font-semibold">{b2bTarget}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Settlement Amount</span>
                    <span className="font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400">
                      {formatBdt(Number(b2bAmount), lang)}
                    </span>
                  </div>
                </div>

                <BiometricConfirmBox
                  user={user}
                  lang={lang}
                  amount={Number(b2bAmount) || 0}
                  amountLabel={formatBdt(Number(b2bAmount) || 0, lang)}
                  platformHighValueThreshold={feeConfig.highValueThreshold}
                  webauthnCap={webauthnCap}
                  authMode={confirmAuthMode}
                  onAuthModeChange={setConfirmAuthMode}
                  submitting={b2bSubmitting}
                  error={b2bError}
                  onClearError={() => setB2bError('')}
                  onConfirmBiometric={(pin) => handleB2bConfirm('biometric', pin)}
                  onConfirmPin={(pin) => handleB2bConfirm('pin', pin)}
                  onOpenBiometricSettings={onOpenBiometricSettings}
                  pinButtonLabel={`B2B Transfer ${formatBdt(Number(b2bAmount) || 0, lang)}`}
                />

                <button
                  type="button"
                  onClick={() => setB2bStep('form')}
                  className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {t('back', lang)}
                </button>
              </div>
            )}

          {b2bStep === 'done' && b2bResult && (
            <div className="py-5 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 dark:text-emerald-400 mx-auto" />
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {b2bResult.status === 'pending_admin_approval'
                  ? t('txPendingApproval', lang)
                  : 'B2B Transfer Settled'}
              </div>
              <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-400">
                {formatBdt(b2bResult.amount, lang)}
              </div>
              <button
                type="button"
                onClick={() => {
                  setB2bStep('form');
                  setB2bResult(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                New B2B Payment
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Live Sales Analytics */}
      {activeTab === 'analytics' && !cashierMode && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Gross Sales Volume</div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white mt-1.5">
                {formatBdt(analytics.grossSales, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Net Settled Revenue</div>
              <div className="font-mono-tabular text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                {formatBdt(analytics.netSales, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Average Ticket Size</div>
              <div className="font-mono-tabular text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1.5">
                {formatBdt(analytics.avgTicket, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Refunds Issued</div>
              <div className="font-mono-tabular text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1.5">
                {formatBdt(analytics.totalRefunded, lang)}
              </div>
            </div>
          </div>

          <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                7-Day Merchant Revenue Trend
              </h4>
              <span className="font-mono-tabular text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                {analytics.txCount} total orders
              </span>
            </div>

            <div className="grid grid-cols-7 gap-3 items-end h-52 pt-4">
              {analytics.days.map((day, idx) => {
                const heightPct = Math.max(6, Math.round((day.total / analytics.maxDay) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center h-full justify-end gap-2">
                    <div className="font-mono-tabular text-[10px] text-slate-600 dark:text-slate-300">
                      {day.total > 0 ? `৳${Math.round(day.total)}` : '৳0'}
                    </div>
                    <div className="w-full max-w-[44px] flex-1 flex items-end bg-slate-100 dark:bg-[#0B0D14] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                      <div
                        className="w-full bg-gradient-to-t from-indigo-600 via-indigo-500 to-sky-500 rounded-t-lg transition-all duration-300"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{day.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Full Merchant Statement */}
      {activeTab === 'statement' && !cashierMode && (
        <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'মার্চেন্ট অ্যাকাউন্ট স্টেটমেন্ট' : 'Merchant Account Statement'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current Cash-Out Rate: ৳{feeConfig.merchantCashOutFeePer1000}/1k (Agent) · ৳
                {feeConfig.merchantCashOutToAdminFeePer1000}/1k (Admin)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={statementQuery}
                  onChange={(e) => setStatementQuery(e.target.value)}
                  placeholder={t('searchPlaceholder', lang)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                className={`px-3.5 py-2 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('downloadStatement', lang)}</span>
              </button>
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">{t('noTransactions', lang)}</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
              {transactions
                .filter((tx) => {
                  const q = statementQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    tx.txHash.toLowerCase().includes(q) ||
                    tx.txId.toLowerCase().includes(q) ||
                    tx.senderName.toLowerCase().includes(q) ||
                    tx.receiverName.toLowerCase().includes(q) ||
                    tx.type.toLowerCase().includes(q)
                  );
                })
                .map((tx) => (
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
                      showRefundAction={!cashierMode}
                      onRefundClick={(targetTx) => {
                        setRefundHash(targetTx.txHash);
                        setRefundAmount(
                          String(targetTx.amount - (targetTx.refundedAmount || 0))
                        );
                        setRefundStep('form');
                        setActiveTab('refunds');
                      }}
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: Dedicated Merchant Inbox & Notifications Page */}
      {activeTab === 'inbox' && !cashierMode && (
        <div className="max-w-3xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'মার্চেন্ট ইনবক্স ও অ্যালার্ট' : 'Merchant Inbox & Alerts'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {unreadNotifications} {lang === 'bn' ? 'টি অপঠিত বার্তা' : 'unread messages'}
                </p>
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
                  ? `লেনদেন (${incomingPayments.length})`
                  : `Store Payments (${incomingPayments.length})`}
              </button>
            </div>
          </div>

          {inboxTab === 'alerts' ? (
            accountNotifications.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'এখনো কোনো ইনবক্স অ্যালার্ট নেই।' : 'Your Merchant Inbox is clean.'}
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
              {incomingPayments.slice(0, 20).map((tx) => (
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

      {/* TAB 7: Dedicated Merchant Soundbox & Security Hub */}
      {activeTab === 'soundbox' && !cashierMode && (
        <div className="max-w-2xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {lang === 'bn' ? 'সাউন্ডবক্স ও মার্চেন্ট নিরাপত্তা' : 'Soundbox & Merchant Security'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {lang === 'bn'
                ? 'পেমেন্ট গ্রহণ করার সাথে সাথে বাংলা ও ইংরেজি ভয়েস অ্যালার্ট ও বায়োমেট্রিক লক'
                : 'Instant transaction voice alerts, passkey approvals & cashier staff lock'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Volume2 className={`w-4 h-4 ${preset.accentTextClass}`} />
                  <span>{lang === 'bn' ? 'লাইভ সাউন্ডবক্স' : 'Live Voice Soundbox'}</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {t('soundboxActive', lang)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {user.gender === 'female'
                  ? lang === 'bn'
                    ? 'মহিলা মার্চেন্ট → পুরুষ কণ্ঠে প্রতিটি পেমেন্ট ঘোষণা করে।'
                    : 'Female profile → Announces every customer payment in a Male voice.'
                  : lang === 'bn'
                    ? 'পুরুষ মার্চেন্ট → নারী কণ্ঠে প্রতিটি পেমেন্ট ঘোষণা করে।'
                    : 'Male profile → Announces every customer payment in a Female voice.'}
              </p>
              <button
                type="button"
                onClick={handleTestSoundbox}
                className={`w-full min-h-[42px] py-2 px-3 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white cursor-pointer`}
              >
                {t('soundboxTest', lang)}
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{lang === 'bn' ? 'বায়োমেট্রিক ও ওনার লক' : 'Passkeys & Owner Lock'}</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {enrolledBiometrics.length > 0 ? `${enrolledBiometrics.length} Active` : 'PIN Only'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'bn'
                  ? 'ক্যাশিয়ার মোড আনলক, রিফান্ড ও B2B ট্রান্সফার বায়োমেট্রিক দিয়ে অনুমোদন করুন।'
                  : 'Approve refunds, cash-outs, B2B settlements & owner unlock with Biometrics.'}
              </p>
              {onOpenBiometricSettings && (
                <button
                  type="button"
                  onClick={onOpenBiometricSettings}
                  className="w-full min-h-[42px] py-2 px-3 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {lang === 'bn' ? 'বায়োমেট্রিক ম্যানেজ করুন' : 'Manage Passkeys & PIN'}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                <ShieldCheck className={`w-4 h-4 ${preset.accentTextClass}`} />
                <span>{lang === 'bn' ? 'কেওয়াইসি ও ২FA স্ট্যাটাস' : 'Merchant KYC & 2FA'}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                KYC: <strong className="text-slate-800 dark:text-slate-200">{(user.kyc?.status || 'unverified').toUpperCase()}</strong>
                {' · '}
                2FA: <strong className="text-slate-800 dark:text-slate-200">{user.totpSecret ? 'Google Auth ON' : 'EmailJS Guard'}</strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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

      {/* Owner Mode Unlock Modal */}
      {unlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleUnlockOwner}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Unlock Merchant Owner Mode
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {biometricsReady
                ? 'Verify with Owner Biometrics or enter your Merchant Owner Security PIN to exit Cashier Staff View.'
                : 'Enter your Merchant Owner Security PIN to exit Cashier Staff View.'}
            </p>
            {biometricsReady && (
              <>
                <button
                  type="button"
                  disabled={unlockBusy}
                  onClick={handleUnlockOwnerBiometric}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {unlockBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Fingerprint className="w-4 h-4 shrink-0" />
                  )}
                  <span>Unlock with Owner Biometrics</span>
                </button>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  <span>OR</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
              </>
            )}
            <input
              type="password"
              required
              maxLength={5}
              inputMode="numeric"
              value={unlockPin}
              onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Owner Security PIN"
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-widest focus:outline-none focus:border-indigo-500"
            />
            {unlockError && (
              <div className="text-xs text-rose-600 dark:text-rose-300">{unlockError}</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={unlockBusy}
                onClick={() => {
                  setUnlockModalOpen(false);
                  setUnlockPin('');
                  setUnlockError('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={unlockBusy || unlockPin.length < 4}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {unlockBusy ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
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
