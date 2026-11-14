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
  Eye,
  EyeOff,
  Search,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ArrowDownLeft,
  MapPin,
  Volume2,
  VolumeX,
  Bell,
  Gift,
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
import { calculateFeeBreakdown, executeFinancialTransaction } from '../../lib/acashService';
import { formatGiftSignature, getGiftCardTemplate } from '../../lib/giftCards';
import { usePortalTheme } from '../../lib/portalThemes';
import { downloadAccountStatementPdf } from '../../lib/pdfGenerator';
import { getVoiceMuted, playTransactionVoiceAlert, setVoiceMuted } from '../../lib/soundbox';
import { TapAndHoldButton } from '../common/TapAndHoldButton';
import { OperatorLogo, OPERATORS, detectOperatorFromPhone } from '../common/OperatorLogo';
import { QrModal } from '../common/QrModal';
import { TransactionReceiptModal } from '../common/TransactionReceiptModal';
import { Wallet3DCard } from '../common/Wallet3DCard';
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
  unreadNotifications?: number;
  externalQrSignal?: number;
  customGiftCards?: CustomGiftCardRecord[];
  giftCardPolicy?: GiftCardCatalogPolicy;
}

type ServiceTab = 'send_money' | 'cash_out' | 'mobile_recharge' | 'bill_pay' | 'merchant_payment';

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
  unreadNotifications = 0,
  externalQrSignal = 0,
  customGiftCards,
  giftCardPolicy,
}) => {
  const { preset } = usePortalTheme();
  const [showBalance, setShowBalance] = useState(false);
  const [activeService, setActiveService] = useState<ServiceTab>('send_money');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');

  // Form inputs
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');

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
    seenTxIdsRef.current = null;
  }, [user.accountId]);

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

  const resetForm = () => {
    setStep('form');
    setPin('');
    setError('');
    setCompletedTx(null);
    setGiftDraft((prev) => ({
      ...prev,
      enabled: false,
      customMessage: '',
      signaturePrefix: lang === 'bn' ? 'bn' : 'en',
      senderDisplayName: user.name,
    }));
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

    setPin('');
    setStep('confirm');
  };

  const handleTapAndHoldConfirmed = async () => {
    setError('');
    if (!/^\d{4,5}$/.test(pin)) {
      setError(lang === 'bn' ? 'সঠিক ৪-সংখ্যার পিন দিন।' : 'Enter your 4 or 5-digit Security PIN first.');
      return;
    }

    setSubmitting(true);
    try {
      let giftCardPayload: GiftCardPayload | undefined;
      if (activeService === 'send_money' && giftDraft.enabled) {
        const tpl = getGiftCardTemplate(giftDraft.cardId, customGiftCards, giftCardPolicy);
        const rawMsg = giftDraft.customMessage.trim();
        const defaultMsg = lang === 'bn' ? tpl.defaultMessageBn : tpl.defaultMessageEn;
        giftCardPayload = {
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
      }

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
        giftCard: giftCardPayload,
      });

      setCompletedTx(tx);
      setStep('done');
      setAmount('');
      setNote('');
      setPin('');
      if (tx.giftCard) {
        setFlightTx(tx);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed.');
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

  const services: Array<{ id: ServiceTab; label: string; icon: React.ElementType }> = [
    { id: 'send_money', label: t('sendMoney', lang), icon: Send },
    { id: 'cash_out', label: t('cashOut', lang), icon: ArrowUpRight },
    { id: 'mobile_recharge', label: t('mobileRecharge', lang), icon: Smartphone },
    { id: 'bill_pay', label: t('billPay', lang), icon: Zap },
    { id: 'merchant_payment', label: t('merchantPay', lang), icon: Store },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 md:pb-10">
      {isDisabledAccount && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 px-4 py-3.5 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
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
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top 3D Wallet Hero + Action Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 flex flex-col gap-3.5">
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
                  className="min-h-[38px] px-2.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{t('myQr', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrMode('scan')}
                  className="min-h-[38px] px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/35 hover:bg-indigo-500/30 text-xs font-semibold text-indigo-100 transition-colors whitespace-nowrap"
                  >
                    <Bell className="w-3.5 h-3.5 text-indigo-300" />
                    <span>{lang === 'bn' ? 'লাইভ অ্যালার্ট' : 'Live Alerts'}</span>
                    {unreadNotifications > 0 && (
                      <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold leading-none">
                        {unreadNotifications}
                      </span>
                    )}
                  </button>
                )}
                {onOpenBoothMap && (
                  <button
                    type="button"
                    onClick={onOpenBoothMap}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 transition-colors whitespace-nowrap"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('downloadStatement', lang)}</span>
                </button>
              </>
            }
          />

          {/* 3D Quick Insights Strip */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'মোট গ্রহণ' : 'Incoming'}
              </div>
              <div className="font-mono-tabular text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                {formatBdt(walletInsights.incoming, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'মোট ব্যয়' : 'Outgoing'}
              </div>
              <div className="font-mono-tabular text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
                {formatBdt(walletInsights.outgoing, lang)}
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {lang === 'bn' ? 'লেনদেন' : 'Total Txs'}
              </div>
              <div className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {walletInsights.count}
              </div>
            </div>
          </div>
        </div>

        {/* Service Selector + Active Transaction Workbench */}
        <div className="lg:col-span-7 acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
          <div className="mb-3.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <strong className="text-emerald-600 dark:text-emerald-400">
                {lang === 'bn' ? 'ক্যাশ-ইন:' : 'Cash-In:'}
              </strong>{' '}
              {lang === 'bn' ? 'এজেন্ট ও অ্যাডমিন থেকে' : 'From Agent (A-) & Admin'}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>
              <strong className="text-indigo-600 dark:text-indigo-400">
                {lang === 'bn' ? 'ক্যাশ আউট:' : 'Cash Out:'}
              </strong>{' '}
              {lang === 'bn' ? 'শুধুমাত্র এজেন্ট (A-)' : 'Agent (A-) Only'}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>
              <strong className="text-sky-600 dark:text-sky-400">
                {lang === 'bn' ? 'পেমেন্ট:' : 'Payment:'}
              </strong>{' '}
              {lang === 'bn' ? 'শুধুমাত্র মার্চেন্ট (M-)' : 'Merchant (M-) Only'}
            </span>
          </div>

          {/* Tactile 3D Service Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-6">
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
                  className={`acash-3d-tile min-h-[54px] px-3 py-2.5 rounded-2xl border text-left flex items-center sm:flex-col sm:items-start gap-2.5 sm:gap-2 ${
                    active
                      ? preset.activeTabClass
                      : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-white/20 text-white'
                        : preset.accentIconBgClass
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold truncate w-full">{srv.label}</span>
                </button>
              );
            })}
          </div>

          {step === 'form' && (
            <form onSubmit={handleProceedToConfirm} className="space-y-4">
              {activeService === 'mobile_recharge' ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
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

                  {/* Operator Logo Selector */}
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
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
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
                            className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-colors text-left ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-slate-900 dark:text-white shadow-xs'
                                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <OperatorLogo operator={op.id} size={36} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {lang === 'bn' ? op.bnName : op.name}
                              </div>
                              <div className="text-[10px] font-mono-tabular text-slate-500 dark:text-slate-400">
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {activeService === 'cash_out'
                        ? t('agentAccount', lang)
                        : activeService === 'merchant_payment'
                          ? t('merchantAccount', lang)
                          : t('recipient', lang)}
                    </label>
                    <span className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                      {activeService === 'cash_out'
                        ? 'Sandbox: A-200001'
                        : activeService === 'merchant_payment'
                          ? 'Sandbox: M-300001'
                          : 'e.g. U-100001 or 017...'}
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
                          ? 'A-200001 or 01811000002'
                          : activeService === 'merchant_payment'
                            ? 'M-300001 or 01911000003'
                            : 'U-XXXXXX or 017XXXXXXXX'
                      }
                      className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setQrMode('scan')}
                      className={`px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 ${preset.accentBorderHoverClass} ${preset.accentTextClass} transition-colors`}
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
                  draft={giftDraft}
                  customCards={customGiftCards}
                  giftCardPolicy={giftCardPolicy}
                  onChange={setGiftDraft}
                />
              )}

              {/* Quick Amount Chips for Recharge/Transfers */}
              <div className="flex flex-wrap gap-2">
                {[100, 500, 1000, 5000, 55000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-500 text-xs font-mono-tabular text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    ৳{preset.toLocaleString()}
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
                className={`w-full py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm`}
              >
                {t('continueBtn', lang)}
              </button>
            </form>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'সেবা' : 'Service'}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {services.find((s) => s.id === activeService)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'প্রাপক' : 'Target'}
                  </span>
                  {activeService === 'mobile_recharge' ? (
                    <span className="inline-flex items-center gap-2 font-mono-tabular text-indigo-600 dark:text-indigo-400 font-medium">
                      <OperatorLogo operator={selectedOperator} size={24} />
                      <span>
                        {OPERATORS.find((o) => o.id === selectedOperator)?.name || selectedOperator.toUpperCase()} · {rechargePhone}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400 font-medium">
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

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('enterPinConfirm', lang)}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={5}
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white tracking-widest focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <TapAndHoldButton
                lang={lang}
                loading={submitting}
                disabled={pin.length < 4}
                amountLabel={`${t('totalDeduction', lang)}: ${formatBdt(totalDebit, lang)}`}
                onConfirm={handleTapAndHoldConfirmed}
              />

              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                {completedTx.giftCard && (
                  <button
                    type="button"
                    onClick={() => setViewedGiftTx(completedTx)}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 text-xs font-semibold text-rose-700 dark:text-rose-200 hover:bg-rose-100 inline-flex items-center gap-1.5"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'গিফট কার্ড দেখুন' : 'View Gift Card'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(completedTx)}
                  className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400"
                >
                  {lang === 'bn' ? 'রসিদ দেখুন' : 'View Receipt'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  {lang === 'bn' ? 'নতুন লেনদেন' : 'New Transaction'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction History Ledger */}
      <div className="acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {t('recentTransactions', lang)}
          </h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTx}
              onChange={(e) => setSearchTx(e.target.value)}
              placeholder={t('searchPlaceholder', lang)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('noTransactions', lang)}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTransactions.map((tx) => {
              const isIncoming = tx.receiverId === user.accountId;
              const rateNote =
                tx.fee > 0
                  ? tx.feeBreakdown?.chargeMode === 'flat'
                    ? 'Flat'
                    : `@৳${tx.feeBreakdown?.ratePer1000 || 0}/1k`
                  : '';
              return (
                <button
                  key={tx.txId}
                  type="button"
                  onClick={() => setSelectedReceipt(tx)}
                  className="w-full px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {tx.type === 'mobile_recharge' && tx.operator ? (
                      <OperatorLogo operator={tx.operator} size={34} />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isIncoming
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {isIncoming ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-2">
                        <span className="truncate">{isIncoming ? tx.senderName : tx.receiverName}</span>
                        {tx.giftCard && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-[10px] font-bold text-rose-700 dark:text-rose-300 shrink-0">
                            <Gift className="w-3 h-3" />
                            <span>{tx.giftCard.cardTitleBn}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                      className={`font-mono-tabular text-sm font-bold ${
                        isIncoming
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isIncoming ? '+' : '-'} {formatBdt(tx.amount, lang)}
                    </div>
                    {!isIncoming && tx.fee > 0 && (
                      <div className="font-mono-tabular text-[11px] text-amber-600 dark:text-amber-300 mt-0.5">
                        Charge: {formatBdt(tx.fee, lang)} ({rateNote}) · Total:{' '}
                        {formatBdt(tx.totalDebited, lang)}
                      </div>
                    )}
                    <div
                      className={`text-[11px] font-medium mt-0.5 ${
                        tx.status === 'completed'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : tx.status === 'pending_admin_approval'
                            ? 'text-amber-600 dark:text-amber-400'
                            : tx.status === 'rejected'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-sky-600 dark:text-sky-400'
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
