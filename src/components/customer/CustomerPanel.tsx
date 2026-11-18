import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  ArrowUpRight,
  Smartphone,
  Zap,
  Store,
  QrCode,
  ScanLine,
  FileText,
  Search,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Volume2,
  VolumeX,
  Bell,
  Gift,
  Fingerprint,
  ArrowLeft,
  Calculator,
  CheckCheck,
  Mail,
  ShieldCheck,
  User as UserIcon,
  Lock,
} from 'lucide-react';
import {
  AccountNotification,
  AcashTransaction,
  AcashUser,
  BillerId,
  CustomGiftCardRecord,
  FeeConfig,
  GiftCardCatalogPolicy,
  GiftCardPayload,
  Language,
  OperatorId,
} from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import {
  calculateFeeBreakdown,
  executeFinancialTransaction,
  isAccountNotificationRead,
  UNVERIFIED_MAX_TX_VOLUME,
  UserComplianceState,
} from '../../lib/acashService';
import {
  formatGiftSignature,
  getAllGiftCardTemplates,
  getGiftCardTemplate,
} from '../../lib/giftCards';
import { usePortalTheme } from '../../lib/portalThemes';
import { downloadAccountStatementPdf } from '../../lib/pdfGenerator';
import { getVoiceMuted, playTransactionVoiceAlert, setVoiceMuted } from '../../lib/soundbox';
import { triggerHapticGesture } from '../../lib/deviceAlerts';
import {
  authorizeTransactionWithBiometrics,
  detectWebAuthnCapability,
  WebAuthnCapability,
} from '../../lib/webauthn';
import { BiometricConfirmBox } from '../common/BiometricConfirmBox';
import { OperatorLogo, OPERATORS, detectOperatorFromPhone } from '../common/OperatorLogo';
import { QrModal } from '../common/QrModal';
import { TransactionReceiptModal } from '../common/TransactionReceiptModal';
import { Wallet3DCard } from '../common/Wallet3DCard';
import { ComplianceAlertBanner } from '../common/ComplianceAlertBanner';
import { TransactionRowItem } from '../common/TransactionRowItem';
import { ServiceCircleGrid, ServiceCircleItem } from '../common/ServiceCircleGrid';
import {
  GiftCardDraftState,
  GiftCardFlightOverlay,
  GiftCardReceiverOverlay,
  GiftCardSelectorStrip,
} from '../common/GiftCardExperience';

interface CustomerPanelProps {
  user: AcashUser;
  transactions: AcashTransaction[];
  feeConfig: FeeConfig;
  lang: Language;
  initialPaymentIntent?: { to: string; amount?: number; note?: string } | null;
  onClearPaymentIntent?: () => void;
  onOpenBoothMap?: () => void;
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
  customGiftCards?: CustomGiftCardRecord[];
  giftCardPolicy?: GiftCardCatalogPolicy;
  compliance?: UserComplianceState;
  complianceBannerDismissed?: boolean;
  onDismissComplianceBanner?: () => void;
  onOpenKyc?: () => void;
  onOpen2fa?: () => void;
}

type ServiceTab = 'send_money' | 'cash_out' | 'mobile_recharge' | 'bill_pay' | 'merchant_payment';
type CustomerViewMode =
  | 'home'
  | 'service'
  | 'gift_cards'
  | 'statements'
  | 'inbox'
  | 'fee_calc'
  | 'security';

const BILLERS: Array<{ id: BillerId; name: string; category: string }> = [
  { id: 'desco', name: 'DESCO (Dhaka Electric)', category: 'Electricity' },
  { id: 'dpdc', name: 'DPDC Postpaid / Prepaid', category: 'Electricity' },
  { id: 'reb', name: 'Palli Bidyut (REB)', category: 'Electricity' },
  { id: 'wasa', name: 'Dhaka WASA', category: 'Water' },
  { id: 'titas', name: 'Titas Gas T&D', category: 'Gas' },
  { id: 'link3', name: 'Link3 Broadband', category: 'Internet' },
];

export const CustomerPanel: React.FC<CustomerPanelProps> = ({
  user,
  transactions,
  feeConfig,
  lang,
  initialPaymentIntent,
  onClearPaymentIntent,
  onOpenBoothMap,
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
  customGiftCards,
  giftCardPolicy,
  compliance,
  complianceBannerDismissed = false,
  onDismissComplianceBanner,
  onOpenKyc,
  onOpen2fa,
}) => {
  const { preset } = usePortalTheme();
  const [showBalance, setShowBalance] = useState(false);
  const [viewMode, setViewMode] = useState<CustomerViewMode>('home');
  const [activeService, setActiveService] = useState<ServiceTab>('send_money');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');

  // Form inputs
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Recharge inputs
  const [rechargePhone, setRechargePhone] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<OperatorId>('gp');
  const [autoDetectedOp, setAutoDetectedOp] = useState(false);
  const [rechargeType, setRechargeType] = useState<'prepaid' | 'postpaid'>('prepaid');

  // Bill Pay inputs
  const [selectedBiller, setSelectedBiller] = useState<BillerId>('desco');
  const [billAccount, setBillAccount] = useState('');
  const [billMonth, setBillMonth] = useState('November 2026');

  // Execution state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completedTx, setCompletedTx] = useState<AcashTransaction | null>(null);
  const [webauthnCap, setWebauthnCap] = useState<WebAuthnCapability | null>(null);
  const [confirmAuthMode, setConfirmAuthMode] = useState<'biometric' | 'pin'>('pin');

  // Modals & Multi-Page filters
  const [qrMode, setQrMode] = useState<'show' | 'scan' | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<AcashTransaction | null>(null);
  const [searchTx, setSearchTx] = useState('');
  const [statementFilter, setStatementFilter] = useState<'all' | 'sent' | 'received'>('all');
  const [inboxTab, setInboxTab] = useState<'alerts' | 'transactions'>('alerts');
  const [giftFilter, setGiftFilter] = useState<string>('all');
  const [calcService, setCalcService] = useState<
    'cash_out' | 'send_money' | 'merchant_payment' | 'mobile_recharge'
  >('cash_out');
  const [calcAmount, setCalcAmount] = useState('5000');
  const [calcGiftCard, setCalcGiftCard] = useState(false);

  const [giftDraft, setGiftDraft] = useState<GiftCardDraftState>(() => ({
    enabled: false,
    cardId: 'eid_mubarak',
    customMessage: '',
    signaturePrefix: lang === 'bn' ? 'bn' : 'en',
    senderDisplayName: user.name,
  }));
  const [flightTx, setFlightTx] = useState<AcashTransaction | null>(null);
  const [viewedGiftTx, setViewedGiftTx] = useState<AcashTransaction | null>(null);
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
          label: isIncoming ? `Received from ${tx.senderName}` : `Sent to ${tx.receiverName}`,
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

  const toggleVoiceMute = () => {
    setVoiceMutedState((prev) => {
      const next = !prev;
      setVoiceMuted(next);
      return next;
    });
  };

  useEffect(() => {
    if (externalQrSignal > 0) {
      setQrMode('scan');
    }
  }, [externalQrSignal]);

  useEffect(() => {
    if (initialPaymentIntent?.to) {
      setActiveService(initialPaymentIntent.to.startsWith('A-') ? 'cash_out' : 'merchant_payment');
      setRecipient(initialPaymentIntent.to);
      if (initialPaymentIntent.amount) setAmount(String(initialPaymentIntent.amount));
      if (initialPaymentIntent.note) setNote(initialPaymentIntent.note);
      setStep('form');
      setViewMode('service');
      if (onClearPaymentIntent) onClearPaymentIntent();
    }
  }, [initialPaymentIntent, onClearPaymentIntent]);

  // Auto-detect operator prefix
  const handleRechargePhoneChange = (val: string) => {
    const cleaned = val.replace(/[^\d+]/g, '');
    setRechargePhone(cleaned);
    const detected = detectOperatorFromPhone(cleaned);
    if (detected) {
      setSelectedOperator(detected);
      setAutoDetectedOp(true);
    } else {
      setAutoDetectedOp(false);
    }
  };

  const numericAmount = Number(amount) || 0;
  const hasGiftCardActive = activeService === 'send_money' && giftDraft.enabled;
  const { fee, breakdown } = useMemo(
    () =>
      calculateFeeBreakdown(activeService, numericAmount, feeConfig, {
        hasGiftCard: hasGiftCardActive,
      }),
    [activeService, numericAmount, feeConfig, hasGiftCardActive]
  );
  const totalDebit = Number((numericAmount + fee).toFixed(2));
  const isHighValue = numericAmount >= feeConfig.highValueThreshold;
  const isDisabledAccount = user.status !== 'active';

  const resetForm = (preserveGift = false) => {
    setStep('form');
    setError('');
    setCompletedTx(null);
    if (!preserveGift) {
      setGiftDraft((prev) => ({
        ...prev,
        enabled: false,
        customMessage: '',
        signaturePrefix: lang === 'bn' ? 'bn' : 'en',
        senderDisplayName: user.name,
      }));
    }
  };

  const openServiceView = (service: ServiceTab, enableGiftCard = false) => {
    setActiveService(service);
    resetForm(enableGiftCard);
    if (enableGiftCard) {
      setGiftDraft((prev) => ({
        ...prev,
        enabled: true,
        signaturePrefix: lang === 'bn' ? 'bn' : 'en',
        senderDisplayName: prev.senderDisplayName || user.name,
      }));
    }
    setViewMode('service');
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isDisabledAccount) {
      setError(t('suspendedBanner', lang));
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(lang === 'bn' ? 'সঠিক টাকার পরিমাণ লিখুন।' : 'Enter a valid amount greater than 0 BDT.');
      return;
    }
    if (totalDebit > user.balance) {
      setError(
        lang === 'bn'
          ? `পর্যাপ্ত ব্যালেন্স নেই। প্রয়োজন ${formatBdt(totalDebit)}।`
          : `Insufficient balance. Required ${formatBdt(totalDebit)}, available ${formatBdt(user.balance)}.`
      );
      return;
    }

    if (activeService === 'mobile_recharge') {
      if (!/^01\d{9}$/.test(rechargePhone.replace(/\D/g, ''))) {
        setError('Enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).');
        return;
      }
    } else if (activeService === 'bill_pay') {
      if (!billAccount.trim()) {
        setError('Enter your meter or subscriber account number.');
        return;
      }
    } else {
      if (!recipient.trim()) {
        setError('Enter recipient Acash ID or mobile number.');
        return;
      }
    }

    setConfirmAuthMode(biometricsReady ? 'biometric' : 'pin');
    setStep('confirm');
  };

  const buildGiftCardPayload = (): GiftCardPayload | undefined => {
    if (activeService !== 'send_money' || !giftDraft.enabled) return undefined;
    const tpl = getGiftCardTemplate(giftDraft.cardId, customGiftCards, giftCardPolicy);
    const rawMsg = giftDraft.customMessage.trim();
    const defaultMsg = lang === 'bn' ? tpl.defaultMessageBn : tpl.defaultMessageEn;
    return {
      cardId: tpl.id,
      cardTitleBn: tpl.titleBn,
      cardTitleEn: tpl.titleEn,
      themeCategory: tpl.themeCategory,
      message: rawMsg || defaultMsg,
      signaturePrefix: giftDraft.signaturePrefix,
      senderDisplayName: (giftDraft.senderDisplayName.trim() || user.name).slice(0, 60),
      isCustomEdited: Boolean(rawMsg),
      ...(tpl.isCustomUploaded && tpl.imageUrl && tpl.imageUrl.length <= 420000
        ? {
            customImageUrl: tpl.imageUrl,
            customGradientBg: tpl.gradientBg,
            customAccentHex: tpl.accentHex,
          }
        : {}),
    };
  };

  const handleBiometricConfirmTransaction = async (optionalAugmentPin?: string) => {
    setError('');
    if (!biometricsReady) {
      setConfirmAuthMode('pin');
      return;
    }

    setSubmitting(true);
    try {
      const targetStr =
        activeService === 'mobile_recharge'
          ? rechargePhone
          : activeService === 'bill_pay'
            ? `${selectedBiller}:${billAccount}`
            : recipient;

      const biometricProof = await authorizeTransactionWithBiometrics({
        accountId: user.accountId,
        txType: activeService,
        amount: numericAmount,
        target: targetStr,
        credentials: enrolledBiometrics,
      });

      const tx = await executeFinancialTransaction({
        type: activeService,
        senderId: user.accountId,
        receiverIdentifier: recipient,
        amount: numericAmount,
        biometricProof,
        ...(optionalAugmentPin ? { pin: optionalAugmentPin } : {}),
        feeConfig,
        operator: activeService === 'mobile_recharge' ? selectedOperator : undefined,
        rechargeNumber: activeService === 'mobile_recharge' ? rechargePhone : undefined,
        rechargeType: activeService === 'mobile_recharge' ? rechargeType : undefined,
        biller: activeService === 'bill_pay' ? selectedBiller : undefined,
        billAccountNumber: activeService === 'bill_pay' ? billAccount : undefined,
        billMonth: activeService === 'bill_pay' ? billMonth : undefined,
        note,
        giftCard: buildGiftCardPayload(),
      });

      triggerHapticGesture('success');
      setCompletedTx(tx);
      setStep('done');
      setAmount('');
      setNote('');
      if (tx.giftCard) {
        setFlightTx(tx);
      }
    } catch (err) {
      triggerHapticGesture('warning');
      setError(err instanceof Error ? err.message : 'Biometric confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinConfirmTransaction = async (pin: string) => {
    setError('');
    setSubmitting(true);
    try {
      const tx = await executeFinancialTransaction({
        type: activeService,
        senderId: user.accountId,
        receiverIdentifier: recipient,
        amount: numericAmount,
        pin,
        feeConfig,
        operator: activeService === 'mobile_recharge' ? selectedOperator : undefined,
        rechargeNumber: activeService === 'mobile_recharge' ? rechargePhone : undefined,
        rechargeType: activeService === 'mobile_recharge' ? rechargeType : undefined,
        biller: activeService === 'bill_pay' ? selectedBiller : undefined,
        billAccountNumber: activeService === 'bill_pay' ? billAccount : undefined,
        billMonth: activeService === 'bill_pay' ? billMonth : undefined,
        note,
        giftCard: buildGiftCardPayload(),
      });

      triggerHapticGesture('success');
      setCompletedTx(tx);
      setStep('done');
      setAmount('');
      setNote('');
      if (tx.giftCard) {
        setFlightTx(tx);
      }
    } catch (err) {
      triggerHapticGesture('warning');
      setError(err instanceof Error ? err.message : 'PIN verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const walletInsights = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    for (const tx of transactions) {
      if (tx.status === 'rejected') continue;
      if (tx.receiverId === user.accountId) {
        incoming += tx.amount;
      } else if (tx.senderId === user.accountId) {
        outgoing += tx.totalDebited;
      }
    }
    return {
      incoming,
      outgoing,
      count: transactions.length,
    };
  }, [transactions, user.accountId]);

  const latestTransaction = transactions[0] || null;

  const filteredTransactions = useMemo(() => {
    const q = searchTx.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statementFilter === 'sent' && tx.senderId !== user.accountId) return false;
      if (statementFilter === 'received' && tx.receiverId !== user.accountId) return false;
      if (!q) return true;
      return (
        tx.txHash.toLowerCase().includes(q) ||
        tx.txId.toLowerCase().includes(q) ||
        tx.senderName.toLowerCase().includes(q) ||
        tx.receiverName.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q)
      );
    });
  }, [transactions, searchTx, statementFilter, user.accountId]);

  const giftCardCatalog = useMemo(
    () => getAllGiftCardTemplates(customGiftCards, giftCardPolicy, user.accountId),
    [customGiftCards, giftCardPolicy, user.accountId]
  );

  const filteredGiftCatalog = useMemo(() => {
    if (giftFilter === 'all') return giftCardCatalog;
    return giftCardCatalog.filter((c) => c.themeCategory === giftFilter);
  }, [giftCardCatalog, giftFilter]);

  const txMap = useMemo(() => {
    const map = new Map<string, AcashTransaction>();
    for (const tx of transactions) map.set(tx.txId, tx);
    return map;
  }, [transactions]);

  const calcNumericAmount = Math.max(0, Number(calcAmount) || 0);
  const calcBreakdown = useMemo(
    () =>
      calculateFeeBreakdown(calcService, calcNumericAmount, feeConfig, {
        hasGiftCard: calcService === 'send_money' && calcGiftCard,
      }),
    [calcService, calcNumericAmount, feeConfig, calcGiftCard]
  );

  const services: Array<{ id: ServiceTab; label: string; icon: React.ElementType; colorClass: string }> = [
    {
      id: 'send_money',
      label: t('sendMoney', lang),
      icon: Send,
      colorClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
    },
    {
      id: 'cash_out',
      label: t('cashOut', lang),
      icon: ArrowUpRight,
      colorClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
    },
    {
      id: 'mobile_recharge',
      label: t('mobileRecharge', lang),
      icon: Smartphone,
      colorClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'bill_pay',
      label: t('billPay', lang),
      icon: Zap,
      colorClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
    },
    {
      id: 'merchant_payment',
      label: t('merchantPay', lang),
      icon: Store,
      colorClass: 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-5 pb-24 md:pb-10">
      {/* Animated Compliance Alert Bar on Home Open / Login if KYC or 2FA missing */}
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

      {isDisabledAccount && (
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
                Voice Notification · {voiceBanner.txHash}
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

      {/* VIEW 1: Peaceful bKash-Style Multi-Menu Home Hub */}
      {viewMode === 'home' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left column: Peaceful Balance Hero Card (no crowded metric walls) */}
          <div className="lg:col-span-5 space-y-4">
            <Wallet3DCard
              user={user}
              lang={lang}
              balanceLabel={t('balance', lang)}
              showBalance={showBalance}
              onToggleBalance={() => setShowBalance((prev) => !prev)}
              accentVariant="customer"
              topRightActions={
                <>
                  <button
                    type="button"
                    onClick={() => setQrMode('show')}
                    className="min-h-[38px] px-2.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{t('myQr', lang)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrMode('scan')}
                    className="min-h-[38px] px-2.5 rounded-xl bg-white/20 border border-white/25 hover:bg-white/30 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    <span>{t('scanQr', lang)}</span>
                  </button>
                </>
              }
              footerMeta={
                <>
                  <span>
                    {lang === 'bn' ? 'ক্যাশ আউট' : 'Cash Out'}:{' '}
                    <span className="font-mono-tabular font-semibold text-white">
                      ৳{feeConfig.feePer1000}/1k
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-white/35">·</span>
                  <span>
                    {lang === 'bn' ? 'সেন্ড মানি' : 'Send Money'}:{' '}
                    <span className="font-mono-tabular font-semibold text-amber-200">
                      {feeConfig.sendMoneyChargeMode === 'per_1000'
                        ? `৳${feeConfig.sendMoneyFeeRate}/1k`
                        : feeConfig.sendMoneyFeeRate > 0
                          ? `৳${feeConfig.sendMoneyFeeRate} (>৳${feeConfig.sendMoneyFreeThreshold})`
                          : 'Free'}
                    </span>
                  </span>
                </>
              }
              footerActions={
                <>
                  <button
                    type="button"
                    onClick={toggleVoiceMute}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      enrolledBiometrics.length > 0
                        ? 'bg-emerald-500/20 border-emerald-300/40 hover:bg-emerald-500/30 text-emerald-100'
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

            {/* Single-Line Latest Activity Teaser (All details reside on Statements page) */}
            <div className="acash-3d-surface rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {lang === 'bn' ? 'সর্বশেষ লেনদেন' : 'Latest Activity'}
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
                    onOpenGiftCard={(giftTx) => setViewedGiftTx(giftTx)}
                  />
                </div>
              ) : (
                <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('noTransactions', lang)}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Structured bKash-Style Categorized Menu Sheets */}
          <div className="lg:col-span-7 space-y-4">
            {/* Sheet 1: Core Financial Payments */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'লেনদেন ও পেমেন্ট' : 'Money & Payments'}
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'তাৎক্ষণিক সেবা' : 'Instant Services'}
                </span>
              </div>

              <ServiceCircleGrid
                cols="4"
                items={
                  [
                    {
                      id: 'send_money',
                      label: t('sendMoney', lang),
                      icon: Send,
                      tone: 'rose',
                      onClick: () => openServiceView('send_money', false),
                    },
                    {
                      id: 'mobile_recharge',
                      label: lang === 'bn' ? 'রিচার্জ' : 'Recharge',
                      icon: Smartphone,
                      tone: 'emerald',
                      onClick: () => openServiceView('mobile_recharge', false),
                    },
                    {
                      id: 'cash_out',
                      label: t('cashOut', lang),
                      icon: ArrowUpRight,
                      tone: 'cyan',
                      onClick: () => openServiceView('cash_out', false),
                    },
                    {
                      id: 'merchant_payment',
                      label: t('merchantPay', lang),
                      icon: Store,
                      tone: 'amber',
                      onClick: () => openServiceView('merchant_payment', false),
                    },
                    {
                      id: 'bill_pay',
                      label: t('billPay', lang),
                      icon: Zap,
                      tone: 'violet',
                      onClick: () => openServiceView('bill_pay', false),
                    },
                    {
                      id: 'gift_cards',
                      label: lang === 'bn' ? 'গিফট কার্ড' : 'Gift Cards',
                      icon: Gift,
                      tone: 'pink',
                      badge: '৳2',
                      onClick: () => setViewMode('gift_cards'),
                    },
                    {
                      id: 'scan_qr',
                      label: t('scanQr', lang),
                      icon: ScanLine,
                      tone: 'indigo',
                      onClick: () => setQrMode('scan'),
                    },
                    {
                      id: 'my_qr',
                      label: t('myQr', lang),
                      icon: QrCode,
                      tone: 'sky',
                      onClick: () => setQrMode('show'),
                    },
                  ] satisfies ServiceCircleItem[]
                }
              />
            </div>

            {/* Sheet 2: Dedicated Feature Menus & Account Tools */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'অ্যাকাউন্ট ও আরও সেবা' : 'Account Menus & Tools'}
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
                      id: 'fee_calc',
                      label: lang === 'bn' ? 'ফি ও লিমিট' : 'Fee & Limit',
                      icon: Calculator,
                      tone: 'amber',
                      onClick: () => setViewMode('fee_calc'),
                    },
                    ...(onOpenBoothMap
                      ? [
                          {
                            id: 'booth_map',
                            label: lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map',
                            icon: MapPin,
                            tone: 'emerald' as const,
                            onClick: onOpenBoothMap,
                          },
                        ]
                      : ([] as ServiceCircleItem[])),
                    {
                      id: 'security_hub',
                      label: lang === 'bn' ? 'নিরাপত্তা ও ২FA' : 'Security Hub',
                      icon: ShieldCheck,
                      tone: 'cyan',
                      onClick: () => setViewMode('security'),
                    },
                    {
                      id: 'voice_alerts',
                      label: lang === 'bn' ? 'ভয়েস সাউন্ড' : 'Voice Sound',
                      icon: Volume2,
                      tone: 'violet',
                      onClick: () => setViewMode('security'),
                    },
                    ...(onOpenProfile
                      ? [
                          {
                            id: 'profile_kyc',
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

      {/* VIEW 2: Focused Service Screen */}
      {viewMode === 'service' && (
        <div className="max-w-2xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          {/* Header with Back to Home */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setViewMode('home');
                resetForm();
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 hover:border-indigo-400 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{lang === 'bn' ? 'হোম' : 'Home'}</span>
            </button>

            <div className="text-right min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {services.find((s) => s.id === activeService)?.label}
              </div>
              <div className={`text-[11px] font-mono-tabular ${preset.accentTextClass}`}>
                {lang === 'bn' ? 'ব্যালেন্স:' : 'Bal:'} {formatBdt(user.balance, lang)}
              </div>
            </div>
          </div>

          {/* Quick Service Switcher */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {services.map((srv) => {
              const Icon = srv.icon;
              const active = activeService === srv.id;
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => {
                    setActiveService(srv.id);
                    resetForm();
                  }}
                  className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                    active
                      ? preset.activeTabClass
                      : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] font-semibold truncate">{srv.label}</span>
                </button>
              );
            })}
          </div>

          {step === 'form' && (
            <form onSubmit={handleProceedToConfirm} className="space-y-4">
              {activeService === 'mobile_recharge' ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('phone', lang)}
                      </label>
                      {autoDetectedOp && (
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          {t('autoDetected', lang)}: {OPERATORS.find((o) => o.id === selectedOperator)?.name}
                        </span>
                      )}
                    </div>
                    <input
                      type="tel"
                      required
                      value={rechargePhone}
                      onChange={(e) => handleRechargePhoneChange(e.target.value)}
                      placeholder="017 / 018 / 019 / 016 / 015..."
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white font-mono-tabular placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('selectOperator', lang)}
                      </label>
                      <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-0.5">
                        {(['prepaid', 'postpaid'] as const).map((rt) => (
                          <button
                            key={rt}
                            type="button"
                            onClick={() => setRechargeType(rt)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                              rechargeType === rt
                                ? preset.activeTabClass
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {t(rt, lang)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {OPERATORS.map((op) => {
                        const isSelected = selectedOperator === op.id;
                        return (
                          <button
                            key={op.id}
                            type="button"
                            onClick={() => {
                              setSelectedOperator(op.id);
                              setAutoDetectedOp(false);
                            }}
                            className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-colors text-left cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-slate-900 dark:text-white shadow-xs'
                                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <OperatorLogo operator={op.id} size={34} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {lang === 'bn' ? op.bnName : op.name}
                              </div>
                              <div className="text-[10px] font-mono-tabular text-slate-500 dark:text-slate-400 truncate">
                                {op.prefixes.join(', ')}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : activeService === 'bill_pay' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('selectBiller', lang)}
                    </label>
                    <select
                      value={selectedBiller}
                      onChange={(e) => setSelectedBiller(e.target.value as BillerId)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      {BILLERS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} · {b.category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('meterNumber', lang)}
                    </label>
                    <input
                      type="text"
                      required
                      value={billAccount}
                      onChange={(e) => setBillAccount(e.target.value)}
                      placeholder="e.g. 440192837"
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white font-mono-tabular placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('billingMonth', lang)}
                    </label>
                    <input
                      type="text"
                      required
                      value={billMonth}
                      onChange={(e) => setBillMonth(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {activeService === 'cash_out'
                        ? t('agentAccount', lang)
                        : activeService === 'merchant_payment'
                          ? t('merchantAccount', lang)
                          : t('recipient', lang)}
                    </label>
                    <span className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                      {activeService === 'cash_out'
                        ? 'Agent (A-) Only'
                        : activeService === 'merchant_payment'
                          ? 'Merchant (M-) Only'
                          : 'U-XXXXXX or 017...'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder={
                        activeService === 'cash_out'
                          ? 'A-XXXXXX or 018...'
                          : activeService === 'merchant_payment'
                            ? 'M-XXXXXX or 019...'
                            : 'U-XXXXXX or 017XXXXXXXX'
                      }
                      className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setQrMode('scan')}
                      className={`px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 ${preset.accentBorderHoverClass} ${preset.accentTextClass} transition-colors shrink-0 cursor-pointer`}
                      title={t('scanQr', lang)}
                    >
                      <ScanLine className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('amount', lang)}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
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
                    placeholder={lang === 'bn' ? 'ঐচ্ছিক নোট' : 'Invoice or reference'}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {activeService === 'send_money' && (
                <GiftCardSelectorStrip
                  lang={lang}
                  senderKycName={user.name}
                  currentUserAccountId={user.accountId}
                  currentUser={user}
                  draft={giftDraft}
                  customCards={customGiftCards}
                  giftCardPolicy={giftCardPolicy}
                  onChange={setGiftDraft}
                />
              )}

              <div className="flex flex-wrap gap-2">
                {[100, 500, 1000, 2000, 5000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(String(val))}
                    className={`px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 ${preset.accentBorderHoverClass} text-xs font-mono-tabular text-slate-700 dark:text-slate-300 transition-colors cursor-pointer`}
                  >
                    ৳{val.toLocaleString()}
                  </button>
                ))}
              </div>

              {numericAmount > 0 && (
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">{t('fee', lang)}: </span>
                      <span className={`font-mono-tabular font-semibold ${preset.accentTextClass}`}>
                        {formatBdt(fee, lang)}
                      </span>
                      {fee > 0 && (
                        <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                          (
                          {hasGiftCardActive
                            ? lang === 'bn'
                              ? 'গিফট কার্ড ফ্ল্যাট ৳২ · শুধুমাত্র প্রেরকের'
                              : 'Gift Card Flat ৳2 · Sender Only'
                            : breakdown.chargeMode === 'flat'
                              ? `Flat ৳${breakdown.ratePer1000}`
                              : `৳${breakdown.ratePer1000}/1k`}
                          )
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        {t('totalDeduction', lang)}:{' '}
                      </span>
                      <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                        {formatBdt(totalDebit, lang)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isHighValue && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/35 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>{t('highValueNotice', lang)}</span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isDisabledAccount}
                className={`w-full min-h-[48px] py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm cursor-pointer`}
              >
                {t('continueBtn', lang)}
              </button>
            </form>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'সেবা' : 'Service'}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white text-right">
                    {services.find((s) => s.id === activeService)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">
                    {lang === 'bn' ? 'প্রাপক' : 'Target'}
                  </span>
                  {activeService === 'mobile_recharge' ? (
                    <span className="inline-flex items-center gap-2 font-mono-tabular text-indigo-600 dark:text-indigo-400 font-medium text-right break-all">
                      <OperatorLogo operator={selectedOperator} size={22} />
                      <span>
                        {OPERATORS.find((o) => o.id === selectedOperator)?.name || selectedOperator.toUpperCase()} · {rechargePhone}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400 font-medium text-right break-all">
                      {activeService === 'bill_pay'
                        ? `${selectedBiller.toUpperCase()} · ${billAccount}`
                        : recipient}
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">{t('amount', lang)}</span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {formatBdt(numericAmount, lang)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">{t('fee', lang)}</span>
                  <span className="font-mono-tabular text-slate-700 dark:text-slate-300">
                    {formatBdt(fee, lang)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {t('totalDeduction', lang)}
                  </span>
                  <span className="font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400">
                    {formatBdt(totalDebit, lang)}
                  </span>
                </div>
                {hasGiftCardActive && (() => {
                  const confirmTpl = getGiftCardTemplate(giftDraft.cardId, customGiftCards, giftCardPolicy);
                  return (
                    <div className="pt-2.5 border-t border-rose-200/70 dark:border-rose-500/20 space-y-1">
                      <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <Gift className="w-3.5 h-3.5" />
                          <span>{confirmTpl.titleBn}</span>
                        </span>
                        <span>
                          {formatGiftSignature(
                            giftDraft.signaturePrefix,
                            giftDraft.senderDisplayName.trim() || user.name
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                        “
                        {giftDraft.customMessage.trim() ||
                          (lang === 'bn'
                            ? confirmTpl.defaultMessageBn
                            : confirmTpl.defaultMessageEn)}
                        ”
                      </p>
                    </div>
                  );
                })()}
              </div>

              <BiometricConfirmBox
                user={user}
                lang={lang}
                amount={numericAmount}
                amountLabel={formatBdt(totalDebit, lang)}
                platformHighValueThreshold={feeConfig.highValueThreshold}
                webauthnCap={webauthnCap}
                authMode={confirmAuthMode}
                onAuthModeChange={setConfirmAuthMode}
                submitting={submitting}
                error={error}
                onClearError={() => setError('')}
                onConfirmBiometric={handleBiometricConfirmTransaction}
                onConfirmPin={handlePinConfirmTransaction}
                onOpenBiometricSettings={onOpenBiometricSettings}
                pinButtonLabel={`${lang === 'bn' ? 'পিন দিয়ে নিশ্চিত করুন' : 'Confirm with PIN'} · ${formatBdt(totalDebit, lang)}`}
              />

              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {t('back', lang)}
              </button>
            </div>
          )}

          {step === 'done' && completedTx && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {completedTx.status === 'pending_admin_approval'
                    ? t('txPendingApproval', lang)
                    : t('txSuccess', lang)}
                </h3>
                <p className={`font-mono-tabular text-2xl font-bold ${preset.accentTextClass} mt-1`}>
                  {formatBdt(completedTx.amount, lang)}
                </p>
                <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 mt-1">
                  {t('txHash', lang)}: {completedTx.txHash}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                {completedTx.giftCard && (
                  <button
                    type="button"
                    onClick={() => setViewedGiftTx(completedTx)}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 text-xs font-semibold text-rose-700 dark:text-rose-200 hover:bg-rose-100 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'গিফট কার্ড দেখুন' : 'View Gift Card'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(completedTx)}
                  className={`px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 ${preset.accentBorderHoverClass} cursor-pointer`}
                >
                  {lang === 'bn' ? 'রসিদ দেখুন' : 'View Receipt'}
                </button>
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className={`px-4 py-2.5 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white cursor-pointer`}
                >
                  {lang === 'bn' ? 'নতুন লেনদেন' : 'New Transaction'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('home');
                    resetForm();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {lang === 'bn' ? 'হোমে ফিরুন' : 'Done'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Dedicated Gift Card Studio & Gallery */}
      {viewMode === 'gift_cards' && (
        <div className="max-w-4xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                  {lang === 'bn' ? 'উৎসব গিফট কার্ড গ্যালারি' : 'Festive Gift Card Gallery'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'একটি কার্ড বেছে নিন — প্রেরকের জন্য ফ্ল্যাট মাত্র ৳২ ফি'
                    : 'Choose a card design — flat ৳2 sender-only festive fee'}
                </p>
              </div>
            </div>
            <div className={`text-xs font-mono-tabular font-semibold ${preset.accentTextClass}`}>
              {giftCardCatalog.length} {lang === 'bn' ? 'টি ডিজাইন' : 'Designs'}
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'all', en: 'All Occasions', bn: 'সব উপলক্ষ' },
              { id: 'eid', en: 'Eid & Faith', bn: 'ঈদ ও ধর্মীয়' },
              { id: 'boishakh', en: 'Boishakh', bn: 'বৈশাখ' },
              { id: 'heritage', en: 'Heritage', bn: 'ঐতিহ্য' },
              { id: 'celebration', en: 'Celebration', bn: 'উদযাপন' },
              { id: 'love', en: 'Love', bn: 'ভালোবাসা' },
              { id: 'wishes', en: 'Wishes', bn: 'শুভেচ্ছা' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setGiftFilter(cat.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors cursor-pointer ${
                  giftFilter === cat.id
                    ? preset.activeTabClass
                    : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'bn' ? cat.bn : cat.en}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredGiftCatalog.map((card) => (
              <div
                key={card.id}
                className="acash-3d-tile rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0D14] overflow-hidden flex flex-col justify-between"
              >
                <div className={`relative h-32 bg-gradient-to-br ${card.gradientBg} p-4 flex flex-col justify-end text-white`}>
                  {card.imageUrl && (
                    <img
                      src={card.imageUrl}
                      alt={lang === 'bn' ? card.titleBn : card.titleEn}
                      className="absolute inset-0 w-full h-full object-cover opacity-55"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                  <div className="relative z-10">
                    <div className="text-sm font-bold leading-snug">
                      {lang === 'bn' ? card.titleBn : card.titleEn}
                    </div>
                    <div className="text-[11px] text-white/80 truncate">
                      {lang === 'bn' ? card.subtitleBn : card.subtitleEn}
                    </div>
                  </div>
                </div>
                <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {lang === 'bn' ? card.defaultMessageBn : card.defaultMessageEn}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGiftDraft((prev) => ({
                        ...prev,
                        enabled: true,
                        cardId: card.id,
                        signaturePrefix: lang === 'bn' ? 'bn' : 'en',
                        senderDisplayName: prev.senderDisplayName || user.name,
                      }));
                      openServiceView('send_money', true);
                    }}
                    className={`w-full min-h-[42px] py-2 px-3 rounded-xl ${preset.primaryButtonClass} text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer`}
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'এই কার্ডে সালামি/উপহার পাঠান' : 'Send Gift with Card'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 4: Dedicated Full Statements & Analytics Page */}
      {viewMode === 'statements' && (
        <div className="space-y-4">
          {/* Statement Financial Summary (moved cleanly off Home) */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'মোট গ্রহণ' : 'Total Incoming'}
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                {formatBdt(walletInsights.incoming, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'মোট ব্যয়' : 'Total Outgoing'}
              </div>
              <div className={`font-mono-tabular text-sm sm:text-lg font-bold ${preset.accentTextClass} mt-1 truncate`}>
                {formatBdt(walletInsights.outgoing, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'মোট লেনদেন' : 'Entries'}
              </div>
              <div className="font-mono-tabular text-sm sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                {walletInsights.count}
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
                    {lang === 'bn' ? 'অ্যাকাউন্ট স্টেটমেন্ট' : 'Account Statements'}
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
                      { id: 'sent', en: 'Sent', bn: 'প্রেরিত' },
                      { id: 'received', en: 'Received', bn: 'প্রাপ্ত' },
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
                      onOpenGiftCard={(giftTx) => setViewedGiftTx(giftTx)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 5: Dedicated Inbox & Notifications Page */}
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
                    {lang === 'bn' ? 'ইনবক্স ও অ্যালার্ট' : 'Inbox & Alerts'}
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
                {lang === 'bn' ? `অ্যালার্ট (${accountNotifications.length})` : `Notifications (${accountNotifications.length})`}
              </button>
              <button
                type="button"
                onClick={() => setInboxTab('transactions')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  inboxTab === 'transactions' ? preset.activeTabClass : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'bn' ? `লেনদেন (${transactions.length})` : `Transactions (${transactions.length})`}
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
                    onOpenGiftCard={(giftTx) => setViewedGiftTx(giftTx)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 6: Interactive Fee & Unverified Limit Calculator */}
      {viewMode === 'fee_calc' && (
        <div className="max-w-2xl mx-auto acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
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
                  {lang === 'bn' ? 'চার্জ ও লিমিট ক্যালকুলেটর' : 'Fee & Limit Calculator'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'লাইভ অ্যাডমিন রেট অনুযায়ী তাৎক্ষণিক চার্জ হিসাব'
                    : 'Live calculation from active platform fee engine'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'cash_out', en: 'Cash Out', bn: 'ক্যাশ আউট' },
                { id: 'send_money', en: 'Send Money', bn: 'সেন্ড মানি' },
                { id: 'merchant_payment', en: 'Merchant Pay', bn: 'মার্চেন্ট পে' },
                { id: 'mobile_recharge', en: 'Recharge', bn: 'রিচার্জ' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCalcService(opt.id)}
                className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  calcService === opt.id
                    ? preset.activeTabClass
                    : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {lang === 'bn' ? opt.bn : opt.en}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('amount', lang)}
            </label>
            <input
              type="number"
              min="1"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-base font-mono-tabular font-bold text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
            />
            <div className="flex flex-wrap gap-2">
              {[500, 1000, 5000, 25000, 50000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCalcAmount(String(v))}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-mono-tabular text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  ৳{v.toLocaleString()}
                </button>
              ))}
            </div>
            {calcService === 'send_money' && (
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={calcGiftCard}
                  onChange={(e) => setCalcGiftCard(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>{lang === 'bn' ? 'গিফট কার্ড যুক্ত (ফ্ল্যাট ৳২ ফি)' : 'Include Festive Gift Card (Flat ৳2 fee)'}</span>
              </label>
            )}
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'bn' ? 'মূল টাকা' : 'Principal'}</span>
              <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                {formatBdt(calcNumericAmount, lang)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'bn' ? 'সার্ভিস চার্জ' : 'Calculated Fee'}</span>
              <span className={`font-mono-tabular font-bold ${preset.accentTextClass}`}>
                {formatBdt(calcBreakdown.fee, lang)}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{t('totalDeduction', lang)}</span>
              <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                {formatBdt(calcNumericAmount + calcBreakdown.fee, lang)}
              </span>
            </div>
          </div>

          {compliance && !compliance.isFullyVerified && (
            <div className="rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/35 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-200">
                <span>
                  {lang === 'bn'
                    ? 'আনভেরিফায়েড ৭-দিন / ৳১ লক্ষ লিমিট'
                    : 'Unverified 7-Day & ৳1,00,000 Cap'}
                </span>
                <span className="font-mono-tabular">
                  {compliance.daysRemaining}d {lang === 'bn' ? 'বাকি' : 'left'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-amber-200/60 dark:bg-amber-900/40 overflow-hidden">
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${Math.min(100, Math.round((compliance.totalOutgoingUsed / UNVERIFIED_MAX_TX_VOLUME) * 100))}%`,
                  }}
                />
              </div>
              <div className="text-[11px] font-mono-tabular text-amber-800 dark:text-amber-300">
                {formatBdt(compliance.totalOutgoingUsed, lang)} / {formatBdt(UNVERIFIED_MAX_TX_VOLUME, lang)} {lang === 'bn' ? 'ব্যবহৃত' : 'used'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 7: Dedicated Security, Biometrics & Voice Sound Hub */}
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
                {lang === 'bn' ? 'নিরাপত্তা, বায়োমেট্রিক ও ভয়েস' : 'Security, Biometrics & Voice'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'প্রতিটি লেনদেনে পিন বা বায়োমেট্রিক বাধ্যতামূলক'
                  : 'Every transaction requires Biometric or Security PIN approval'}
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
                  ? 'ফিঙ্গারপ্রিন্ট বা ফেস-আইডি যুক্ত করে দ্রুত ও নিরাপদে পেমেন্ট নিশ্চিত করুন।'
                  : 'Approve transactions and quick logins using hardware Fingerprint or FaceID.'}
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
                  <span>{lang === 'bn' ? 'ভয়েস নোটিফিকেশন' : 'Voice Soundbox'}</span>
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

      {qrMode && (
        <QrModal
          mode={qrMode}
          accountId={user.accountId}
          accountName={user.name}
          role="U"
          lang={lang}
          onClose={() => setQrMode(null)}
          onScanned={(payload) => {
            setQrMode(null);
            setActiveService(
              payload.accountId.startsWith('A-')
                ? 'cash_out'
                : payload.accountId.startsWith('M-')
                  ? 'merchant_payment'
                  : 'send_money'
            );
            setRecipient(payload.accountId);
            if (payload.amount) setAmount(String(payload.amount));
            if (payload.note) setNote(payload.note);
            setStep('form');
            setViewMode('service');
          }}
        />
      )}

      {selectedReceipt && (
        <TransactionReceiptModal
          tx={selectedReceipt}
          currentAccountId={user.accountId}
          lang={lang}
          onClose={() => setSelectedReceipt(null)}
          onOpenGiftCard={(giftTx) => {
            setSelectedReceipt(null);
            setViewedGiftTx(giftTx);
          }}
        />
      )}

      {flightTx && flightTx.giftCard && (
        <GiftCardFlightOverlay
          open={true}
          cardTitleBn={flightTx.giftCard.cardTitleBn}
          cardTitleEn={flightTx.giftCard.cardTitleEn}
          themeCategory={flightTx.giftCard.themeCategory}
          receiverName={flightTx.receiverName}
          amount={flightTx.amount}
          lang={lang}
          onComplete={() => setFlightTx(null)}
        />
      )}

      {viewedGiftTx && viewedGiftTx.giftCard && (
        <GiftCardReceiverOverlay
          tx={viewedGiftTx}
          lang={lang}
          customCards={customGiftCards}
          giftCardPolicy={giftCardPolicy}
          initialOpened
          onOpened={() => {}}
          onSkip={() => setViewedGiftTx(null)}
          onViewReceipt={(receiptTx) => {
            setViewedGiftTx(null);
            setSelectedReceipt(receiptTx);
          }}
        />
      )}
    </div>
  );
};
