import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Volume2,
  Copy,
  Check,
  Printer,
  RotateCcw,
  Building2,
  BarChart3,
  Shield,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  MapPin,
} from 'lucide-react';
import { AcashTransaction, AcashUser, FeeConfig, Language } from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import {
  calculateFeeBreakdown,
  executeFinancialTransaction,
  executeMerchantRefund,
  hashPin,
} from '../../lib/acashService';
import {
  downloadAccountStatementPdf,
  downloadMerchantQrStandeePdf,
} from '../../lib/pdfGenerator';
import { playMerchantSoundbox, playTransactionVoiceAlert } from '../../lib/soundbox';
import { TapAndHoldButton } from '../common/TapAndHoldButton';
import { TransactionReceiptModal } from '../common/TransactionReceiptModal';
import { ACASH_MAIN_LOGO_SRC } from '../common/BrandLogo';

interface MerchantPanelProps {
  user: AcashUser;
  transactions: AcashTransaction[];
  feeConfig: FeeConfig;
  lang: Language;
  onOpenMapLocationPicker?: () => void;
}

type MerchantTab = 'checkout' | 'cashout' | 'refunds' | 'b2b' | 'analytics' | 'statement';

export const MerchantPanel: React.FC<MerchantPanelProps> = ({
  user,
  transactions,
  feeConfig,
  lang,
  onOpenMapLocationPicker,
}) => {
  const [activeTab, setActiveTab] = useState<MerchantTab>('checkout');
  const [statementQuery, setStatementQuery] = useState('');
  const [cashierMode, setCashierMode] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState('');

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
  const [refundPin, setRefundPin] = useState('');
  const [refundStep, setRefundStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundResult, setRefundResult] = useState<AcashTransaction | null>(null);

  // B2B Supplier Transfer state
  const [b2bTarget, setB2bTarget] = useState('M-300002');
  const [b2bAmount, setB2bAmount] = useState('');
  const [b2bNote, setB2bNote] = useState('');
  const [b2bPin, setB2bPin] = useState('');
  const [b2bStep, setB2bStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [b2bSubmitting, setB2bSubmitting] = useState(false);
  const [b2bError, setB2bError] = useState('');
  const [b2bResult, setB2bResult] = useState<AcashTransaction | null>(null);

  // Merchant Cash-Out (Agent / Admin) state
  const [cashOutMode, setCashOutMode] = useState<'agent' | 'admin'>('agent');
  const [cashOutAgentId, setCashOutAgentId] = useState('A-200001');
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [cashOutNote, setCashOutNote] = useState('');
  const [cashOutPin, setCashOutPin] = useState('');
  const [cashOutStep, setCashOutStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [cashOutSubmitting, setCashOutSubmitting] = useState(false);
  const [cashOutError, setCashOutError] = useState('');
  const [cashOutResult, setCashOutResult] = useState<AcashTransaction | null>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<AcashTransaction | null>(null);

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

  const handleUnlockOwner = (e: React.FormEvent) => {
    e.preventDefault();
    if (hashPin(unlockPin) !== user.pinHash) {
      setUnlockError(lang === 'bn' ? 'ভুল ওনার পিন!' : 'Invalid Owner PIN.');
      return;
    }
    setCashierMode(false);
    setUnlockModalOpen(false);
    setUnlockPin('');
    setUnlockError('');
  };

  const handleRefundConfirm = async () => {
    setRefundError('');
    setRefundSubmitting(true);
    try {
      const res = await executeMerchantRefund({
        merchantId: user.accountId,
        txHashInput: refundHash,
        refundAmount: Number(refundAmount),
        pin: refundPin,
      });
      setRefundResult(res);
      setRefundStep('done');
      setRefundPin('');
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Refund failed.');
    } finally {
      setRefundSubmitting(false);
    }
  };

  const handleB2bConfirm = async () => {
    setB2bError('');
    setB2bSubmitting(true);
    try {
      const res = await executeFinancialTransaction({
        type: 'b2b_transfer',
        senderId: user.accountId,
        receiverIdentifier: b2bTarget,
        amount: Number(b2bAmount),
        pin: b2bPin,
        feeConfig,
        note: b2bNote || 'B2B Supplier Settlement',
      });
      setB2bResult(res);
      setB2bStep('done');
      setB2bPin('');
      setB2bAmount('');
    } catch (err) {
      setB2bError(err instanceof Error ? err.message : 'B2B Transfer failed.');
    } finally {
      setB2bSubmitting(false);
    }
  };

  const handleMerchantCashOutConfirm = async () => {
    setCashOutError('');
    setCashOutSubmitting(true);
    try {
      const target = cashOutMode === 'admin' ? 'ADMIN-TREASURY' : cashOutAgentId;
      const res = await executeFinancialTransaction({
        type: 'merchant_cash_out',
        senderId: user.accountId,
        receiverIdentifier: target,
        amount: numericCashOutAmt,
        pin: cashOutPin,
        feeConfig,
        note:
          cashOutNote ||
          (cashOutMode === 'admin'
            ? 'Merchant Cash-Out to Admin Treasury'
            : `Merchant Cash-Out via Agent ${cashOutAgentId}`),
      });
      setCashOutResult(res);
      setCashOutStep('done');
      setCashOutPin('');
      setCashOutAmount('');
    } catch (err) {
      setCashOutError(err instanceof Error ? err.message : 'Merchant Cash-Out failed.');
    } finally {
      setCashOutSubmitting(false);
    }
  };

  const isDisabled = user.status !== 'active';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 md:pb-10">
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

      {/* Merchant Header Summary & Cashier Mode Toggle */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 text-white shadow-lg">
        <div className="space-y-1">
          <div className="text-xs font-medium text-indigo-300 flex items-center gap-2">
            <span>{t('roleMerchant', lang)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{user.accountId}</span>
            <span aria-hidden="true">·</span>
            <span>{cashierMode ? t('cashierMode', lang) : t('ownerMode', lang)}</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-white">
            {user.businessName || user.name}
          </h2>
          {!cashierMode ? (
            <div className="font-mono-tabular text-3xl font-bold text-emerald-400 pt-1">
              {formatBdt(user.balance, lang)}
            </div>
          ) : (
            <div className="text-xs text-amber-300 pt-1 inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>
                {lang === 'bn'
                  ? 'ক্যাশিয়ার মোড সক্রিয় — মোট ব্যালেন্স, রিফান্ড ও বিটুবি লক করা আছে'
                  : 'Cashier Staff Mode active — Owner balance, Refunds & B2B transfers restricted'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleTestSoundbox}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 text-xs font-semibold text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Volume2 className="w-4 h-4 text-indigo-300" />
            <span>{t('soundboxTest', lang)}</span>
          </button>

          {!cashierMode && onOpenMapLocationPicker && (
            <button
              type="button"
              onClick={onOpenMapLocationPicker}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>
                {user.mapLocation
                  ? lang === 'bn'
                    ? 'ম্যাপ লোকেশন আপডেট'
                    : 'Update Map Pin'
                  : lang === 'bn'
                    ? 'ম্যাপে লোকেশন দিন'
                    : 'Set Map Location'}
              </span>
            </button>
          )}

          {!cashierMode && (
            <button
              type="button"
              onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 text-xs font-semibold text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <FileText className="w-4 h-4 text-indigo-300" />
              <span>{t('downloadStatement', lang)}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (cashierMode) {
                setUnlockModalOpen(true);
              } else {
                setActiveTab('checkout');
                setCashierMode(true);
              }
            }}
            className={`min-h-[40px] px-4 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
              cashierMode
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white'
            }`}
          >
            {cashierMode ? <Unlock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            <span>{cashierMode ? 'Unlock Owner Mode' : 'Switch to Cashier View'}</span>
          </button>
        </div>
      </div>

      {/* Merchant Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('checkout')}
          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            activeTab === 'checkout'
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
              : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {t('smartCheckout', lang)}
        </button>

        {!cashierMode && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('cashout')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'cashout'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{t('merchantCashOut', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('refunds')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'refunds'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('refundEngine', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('b2b')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'b2b'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{t('b2bTransfer', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{t('salesAnalytics', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                activeTab === 'statement'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'স্টেটমেন্ট' : 'Statement'}</span>
            </button>
          </>
        )}
      </div>

      {/* TAB 1: Smart Checkout & Dynamic QR */}
      {activeTab === 'checkout' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
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
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0"
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
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>{t('downloadStandee', lang)}</span>
            </button>
          </div>

          {/* Incoming Counter Feed */}
          <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'প্রাপ্ত পেমেন্টসমূহ' : 'Incoming Counter Payments'}
              </h3>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('soundboxActive', lang)}</span>
              </span>
            </div>

            {incomingPayments.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('noTransactions', lang)}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
                {incomingPayments.map((tx) => (
                  <div
                    key={tx.txId}
                    className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(tx)}
                      className="text-left min-w-0 flex-1"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {tx.senderName} ({tx.senderId})
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 truncate">
                        <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400">{tx.txHash}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(tx.createdAt).toLocaleString()}</span>
                      </div>
                    </button>

                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div>
                        <div className="font-mono-tabular text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          + {formatBdt(tx.amount, lang)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tx.status.replace(/_/g, ' ')}
                        </div>
                      </div>
                      {!cashierMode && tx.status !== 'refunded' && tx.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRefundHash(tx.txHash);
                            setRefundAmount(String(tx.amount - (tx.refundedAmount || 0)));
                            setRefundStep('form');
                            setActiveTab('refunds');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-[11px] font-semibold text-rose-700 dark:text-rose-200"
                        >
                          Refund
                        </button>
                      )}
                    </div>
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
          <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
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
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  cashOutMode === 'agent'
                    ? 'bg-indigo-600 text-white shadow-sm'
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
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  cashOutMode === 'admin'
                    ? 'bg-indigo-600 text-white shadow-sm'
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
                  setCashOutPin('');
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
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
                >
                  {t('continueBtn', lang)}
                </button>
              </form>
            )}

            {cashOutStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Cash-Out Destination</span>
                    <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400 font-semibold">
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

                <input
                  type="password"
                  maxLength={5}
                  inputMode="numeric"
                  value={cashOutPin}
                  onChange={(e) => setCashOutPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter Merchant PIN"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-widest focus:outline-none focus:border-indigo-500"
                />

                {cashOutError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                    {cashOutError}
                  </div>
                )}

                <TapAndHoldButton
                  lang={lang}
                  loading={cashOutSubmitting}
                  disabled={cashOutPin.length < 4}
                  amountLabel={`Cash-Out ${formatBdt(totalCashOutDebit, lang)}`}
                  onConfirm={handleMerchantCashOutConfirm}
                />

                <button
                  type="button"
                  onClick={() => setCashOutStep('form')}
                  className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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

          <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-3 shadow-sm">
            <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Recent Merchant Cash-Outs (Agent / Admin)
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions
                .filter((tx) => tx.senderId === user.accountId && tx.type === 'merchant_cash_out')
                .map((tx) => (
                  <button
                    key={tx.txId}
                    type="button"
                    onClick={() => setSelectedReceipt(tx)}
                    className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 flex items-center justify-between text-left transition-colors"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        To {tx.receiverName} ({tx.receiverId})
                      </div>
                      <div className="font-mono-tabular text-[11px] text-indigo-600 dark:text-indigo-400">
                        {tx.txHash} · {new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-tabular text-xs font-bold text-slate-900 dark:text-white">
                        - {formatBdt(tx.amount, lang)}
                      </div>
                      {tx.fee > 0 && (
                        <div className="font-mono-tabular text-[11px] text-amber-600 dark:text-amber-300">
                          Fee: {formatBdt(tx.fee, lang)} (@৳{tx.feeBreakdown?.ratePer1000 || 0}/1k) · Total:{' '}
                          {formatBdt(tx.totalDebited, lang)}
                        </div>
                      )}
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">{tx.status.replace(/_/g, ' ')}</div>
                    </div>
                  </button>
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
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
                >
                  {t('continueBtn', lang)}
                </button>
              </form>
            )}

            {refundStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Target Tx Hash</span>
                    <span className="font-mono-tabular text-indigo-600 dark:text-indigo-400">{refundHash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Refund Amount</span>
                    <span className="font-mono-tabular font-bold text-rose-600 dark:text-rose-300">
                      {formatBdt(Number(refundAmount), lang)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('enterPinConfirm', lang)}
                  </label>
                  <input
                    type="password"
                    maxLength={5}
                    inputMode="numeric"
                    value={refundPin}
                    onChange={(e) => setRefundPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-widest focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {refundError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                    {refundError}
                  </div>
                )}

                <TapAndHoldButton
                  lang={lang}
                  loading={refundSubmitting}
                  disabled={refundPin.length < 4}
                  amountLabel={`Refund ${formatBdt(Number(refundAmount), lang)}`}
                  onConfirm={handleRefundConfirm}
                />

                <button
                  type="button"
                  onClick={() => setRefundStep('form')}
                  className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
        <div className="max-w-xl rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
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
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white disabled:opacity-50 shadow-sm"
              >
                {t('continueBtn', lang)}
              </button>
            </form>
          )}

          {b2bStep === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-1.5">
                <div className="flex justify-between">
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

              <input
                type="password"
                maxLength={5}
                inputMode="numeric"
                value={b2bPin}
                onChange={(e) => setB2bPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter Merchant PIN"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-widest focus:outline-none focus:border-indigo-500"
              />

              {b2bError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  {b2bError}
                </div>
              )}

              <TapAndHoldButton
                lang={lang}
                loading={b2bSubmitting}
                disabled={b2bPin.length < 4}
                amountLabel={`B2B Transfer ${formatBdt(Number(b2bAmount), lang)}`}
                onConfirm={handleB2bConfirm}
              />

              <button
                type="button"
                onClick={() => setB2bStep('form')}
                className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
            <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400">Gross Sales Volume</div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white mt-1.5">
                {formatBdt(analytics.grossSales, lang)}
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400">Net Settled Revenue</div>
              <div className="font-mono-tabular text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                {formatBdt(analytics.netSales, lang)}
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400">Average Ticket Size</div>
              <div className="font-mono-tabular text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1.5">
                {formatBdt(analytics.avgTicket, lang)}
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400">Refunds Issued</div>
              <div className="font-mono-tabular text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1.5">
                {formatBdt(analytics.totalRefunded, lang)}
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
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
        <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
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
                className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5"
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
                .map((tx) => {
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
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isIncoming
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {isIncoming ? tx.senderName : tx.receiverName}
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
                            isIncoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
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
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {tx.status.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
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
              Enter your Merchant Owner PIN to exit Cashier Staff View.
            </p>
            <input
              type="password"
              required
              maxLength={5}
              inputMode="numeric"
              value={unlockPin}
              onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Owner PIN"
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-widest focus:outline-none focus:border-indigo-500"
            />
            {unlockError && (
              <div className="text-xs text-rose-600 dark:text-rose-300">{unlockError}</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUnlockModalOpen(false);
                  setUnlockPin('');
                  setUnlockError('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Unlock
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
