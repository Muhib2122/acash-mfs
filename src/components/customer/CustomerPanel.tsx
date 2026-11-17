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
  History,
} from 'lucide-react';
import {
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
  UserComplianceState,
} from '../../lib/acashService';
import { formatGiftSignature, getGiftCardTemplate } from '../../lib/giftCards';
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
  onOpenBiometricSettings?: () => void;
  unreadNotifications?: number;
  externalQrSignal?: number;
  homeNavSignal?: number;
  customGiftCards?: CustomGiftCardRecord[];
  giftCardPolicy?: GiftCardCatalogPolicy;
  compliance?: UserComplianceState;
  complianceBannerDismissed?: boolean;
  onDismissComplianceBanner?: () => void;
  onOpenKyc?: () => void;
  onOpen2fa?: () => void;
}

type ServiceTab = 'send_money' | 'cash_out' | 'mobile_recharge' | 'bill_pay' | 'merchant_payment';
type CustomerViewMode = 'home' | 'service' | 'history';

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
  onOpenBiometricSettings,
  unreadNotifications = 0,
  externalQrSignal = 0,
  homeNavSignal = 0,
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

  // Modals & Ledger filters
  const [qrMode, setQrMode] = useState<'show' | 'scan' | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<AcashTransaction | null>(null);
  const [searchTx, setSearchTx] = useState('');
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

      {/* VIEW 1: Clean bKash-Style Home Hub */}
      {viewMode === 'home' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left column on desktop: 3D Wallet + Quick Insights */}
          <div className="lg:col-span-5 space-y-3.5">
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
                    className="min-h-[38px] px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm cursor-pointer"
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
                    <span className="font-mono-tabular font-semibold text-indigo-200">
                      ৳{feeConfig.feePer1000}/1k
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <span>
                    {lang === 'bn' ? 'সেন্ড মানি' : 'Send Money'}:{' '}
                    <span className="font-mono-tabular font-semibold text-amber-300">
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/35 hover:bg-indigo-500/30 text-xs font-semibold text-indigo-100 transition-colors whitespace-nowrap cursor-pointer"
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
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        enrolledBiometrics.length > 0
                          ? 'bg-emerald-500/20 border-emerald-400/40 hover:bg-emerald-500/30 text-emerald-100'
                          : 'bg-white/10 border-white/15 hover:bg-white/20 text-white'
                      }`}
                    >
                      <Fingerprint
                        className={`w-3.5 h-3.5 ${
                          enrolledBiometrics.length > 0 ? 'text-emerald-300' : 'text-indigo-200'
                        }`}
                      />
                      <span>
                        {enrolledBiometrics.length > 0
                          ? lang === 'bn'
                            ? 'বায়োমেট্রিক চালু'
                            : 'Biometrics On'
                          : lang === 'bn'
                            ? 'বায়োমেট্রিক'
                            : 'Biometrics'}
                      </span>
                    </button>
                  )}
                </>
              }
            />

            {/* Compact 3D Quick Insights */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {lang === 'bn' ? 'মোট গ্রহণ' : 'Incoming'}
                </div>
                <div className="font-mono-tabular text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  {formatBdt(walletInsights.incoming, lang)}
                </div>
              </div>
              <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {lang === 'bn' ? 'মোট ব্যয়' : 'Outgoing'}
                </div>
                <div className="font-mono-tabular text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
                  {formatBdt(walletInsights.outgoing, lang)}
                </div>
              </div>
              <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {lang === 'bn' ? 'লেনদেন' : 'Total Txs'}
                </div>
                <div className="font-mono-tabular text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {walletInsights.count}
                </div>
              </div>
            </div>
          </div>

          {/* Right column on desktop: Clean Services Grid + Minimized Recent Activity */}
          <div className="lg:col-span-7 space-y-5">
            {/* Clean bKash-Style Circular Pastel Services Sheet */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'আক্যাশ সার্ভিস সমূহ' : 'Acash Services'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'যেকোনো সেবায় ট্যাপ করে দ্রুত লেনদেন শুরু করুন'
                      : 'Tap a service to start a focused transaction'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden sm:inline">{t('downloadStatement', lang)}</span>
                  <span className="sm:hidden">PDF</span>
                </button>
              </div>

              <ServiceCircleGrid
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
                      id: 'gift_card',
                      label: lang === 'bn' ? 'গিফট কার্ড' : 'Gift Money',
                      icon: Gift,
                      tone: 'pink',
                      onClick: () => openServiceView('send_money', true),
                    },
                    ...(onOpenBoothMap
                      ? [
                          {
                            id: 'booth_map',
                            label: lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map',
                            icon: MapPin,
                            tone: 'emerald',
                            onClick: onOpenBoothMap,
                          } satisfies ServiceCircleItem,
                        ]
                      : []),
                    {
                      id: 'history',
                      label: lang === 'bn' ? 'ইতিহাস' : 'History',
                      icon: History,
                      tone: 'indigo',
                      onClick: () => setViewMode('history'),
                    },
                  ] satisfies ServiceCircleItem[]
                }
              />
            </div>

            {/* Minimized Recent Activity (Latest 3 Transactions Only) */}
            <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'সাম্প্রতিক ৩টি লেনদেন' : 'Recent Activity'}
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
                        onOpenGiftCard={(giftTx) => setViewedGiftTx(giftTx)}
                      />
                    </div>
                  ))}
                </div>
              )}
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
              <div className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
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
                                ? 'bg-indigo-600 text-white'
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
                {[100, 500, 1000, 5000, 55000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(String(val))}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-500 text-xs font-mono-tabular text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
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
                      <span className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-400">
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
                <p className="font-mono-tabular text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
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
                  className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 cursor-pointer"
                >
                  {lang === 'bn' ? 'রসিদ দেখুন' : 'View Receipt'}
                </button>
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
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

      {/* VIEW 3: Full Searchable History Ledger (Screenshot 1 fixed with TransactionRowItem) */}
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
                  {t('recentTransactions', lang)}
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
                    onOpenGiftCard={(giftTx) => setViewedGiftTx(giftTx)}
                  />
                </div>
              ))}
            </div>
          )}
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
