import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  CheckCircle2,
  FileText,
  Lock,
  QrCode,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Volume2,
  VolumeX,
  Bell,
} from 'lucide-react';
import { AcashTransaction, AcashUser, FeeConfig, Language } from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import {
  calculateFeeBreakdown,
  executeFinancialTransaction,
  findUserByIdentifier,
} from '../../lib/acashService';
import { downloadAccountStatementPdf } from '../../lib/pdfGenerator';
import { getVoiceMuted, playTransactionVoiceAlert, setVoiceMuted } from '../../lib/soundbox';
import { TapAndHoldButton } from '../common/TapAndHoldButton';
import { QrModal } from '../common/QrModal';
import { TransactionReceiptModal } from '../common/TransactionReceiptModal';
import { Wallet3DCard } from '../common/Wallet3DCard';
import { usePortalTheme } from '../../lib/portalThemes';

interface AgentPanelProps {
  user: AcashUser;
  transactions: AcashTransaction[];
  feeConfig: FeeConfig;
  lang: Language;
  onOpenMapLocationPicker?: () => void;
  onOpenNotifications?: () => void;
  unreadNotifications?: number;
  externalQrSignal?: number;
}

type AgentTab = 'cash_in' | 'send_money' | 'cash_out' | 'agent_cash_out';

export const AgentPanel: React.FC<AgentPanelProps> = ({
  user,
  transactions,
  feeConfig,
  lang,
  onOpenMapLocationPicker,
  onOpenNotifications,
  unreadNotifications = 0,
  externalQrSignal = 0,
}) => {
  const { preset } = usePortalTheme();
  const [counterTab, setCounterTab] = useState<AgentTab>('cash_in');
  const [customerIdentifier, setCustomerIdentifier] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [customerPin, setCustomerPin] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completedTx, setCompletedTx] = useState<AcashTransaction | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<AcashTransaction | null>(null);
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

  // Commission Ledger entries (Cash-In initiated by Agent, Customer Cash-Out & Merchant Cash-Out received by Agent)
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

  const isDisabled = user.status !== 'active';

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
    setPin('');
    setCustomerPin('');
    setStep('confirm');
  };

  const handleConfirmOperation = async () => {
    setError('');
    setSubmitting(true);
    try {
      if (counterTab === 'cash_in') {
        const tx = await executeFinancialTransaction({
          type: 'cash_in',
          senderId: user.accountId,
          receiverIdentifier: customerIdentifier,
          amount: numericAmount,
          pin,
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
          pin,
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
          pin,
          feeConfig,
          note: note || `Agent Cash-Out to Admin Treasury (${user.accountId})`,
        });
        setCompletedTx(tx);
      } else {
        // Assisted Cash-Out: Customer withdraws to Agent using Customer PIN verified at counter
        const customer = await findUserByIdentifier(customerIdentifier);
        if (!customer || customer.role !== 'U') {
          throw new Error('Customer (U-) account not found.');
        }
        const tx = await executeFinancialTransaction({
          type: 'cash_out',
          senderId: customer.accountId,
          receiverIdentifier: user.accountId,
          amount: numericAmount,
          pin: customerPin,
          feeConfig,
          note: note || `Counter Cash-Out via ${user.accountId}`,
        });
        setCompletedTx(tx);
      }
      setStep('done');
      setAmount('');
      setNote('');
      setPin('');
      setCustomerPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const usesAgentPin = counterTab !== 'cash_out';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 md:pb-10">
      {isDisabled && (
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
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3D Agent KPI Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-6">
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
                className="min-h-[38px] px-3 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{t('myQr', lang)}</span>
              </button>
            }
            footerActions={
              <>
                <button
                  type="button"
                  onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('downloadStatement', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceMute}
                  className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
                    className="px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/35 hover:bg-indigo-500/30 text-xs font-semibold text-indigo-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
                {onOpenMapLocationPicker && (
                  <button
                    type="button"
                    onClick={onOpenMapLocationPicker}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
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
              </>
            }
          />
        </div>

        <div className="lg:col-span-3 acash-3d-tile rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{t('totalCommission', lang)}</span>
              <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono-tabular text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-3">
              {formatBdt(user.commissionBalance || 0, lang)}
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            {t('todayCommission', lang)}:{' '}
            <span className="font-mono-tabular text-slate-900 dark:text-white font-semibold">
              {formatBdt(todayCommission, lang)}
            </span>
          </div>
        </div>

        <div className="lg:col-span-3 acash-3d-tile rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{t('commissionRate', lang)}</span>
              <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">User / Merch CO Share</span>
                <span className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-400">
                  ৳{feeConfig.agentShare} / ৳{feeConfig.merchantCashOutAgentShare} per 1k
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">Cash-In Bonus</span>
                <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                  ৳{feeConfig.cashInCommissionPer1000} / ৳1,000
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">Send Money Fee</span>
                <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-300">
                  {feeConfig.sendMoneyChargeMode === 'per_1000'
                    ? `৳${feeConfig.sendMoneyFeeRate}/1k`
                    : `৳${feeConfig.sendMoneyFeeRate} (>৳${feeConfig.sendMoneyFreeThreshold})`}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            {lang === 'bn'
              ? 'গ্রহণ: গ্রাহক, মার্চেন্ট ও অ্যাডমিন · ক্যাশ-আউট: শুধু অ্যাডমিন'
              : 'Receive: User, Merchant & Admin · Agent Cash-Out: Admin Only'}
          </div>
        </div>
      </div>

      {/* Main Agent Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 mb-5">
            {[
              { id: 'cash_in' as AgentTab, label: t('processCashIn', lang) },
              { id: 'send_money' as AgentTab, label: t('agentSendMoney', lang) },
              { id: 'cash_out' as AgentTab, label: t('processCashOut', lang) },
              { id: 'agent_cash_out' as AgentTab, label: t('agentCashOutAdmin', lang) },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCounterTab(tab.id);
                  setStep('form');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors truncate ${
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
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'এজেন্টের নিজস্ব ক্যাশ-আউট শুধুমাত্র অ্যাডমিন ট্রেজারিতে পাঠানো যাবে।'
                      : 'Agent self Cash-Out settles directly to Platform Admin Treasury.'}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {lang === 'bn'
                        ? 'গ্রাহকের আইডি বা মোবাইল (শুধুমাত্র U-)'
                        : 'Customer Acash ID or Mobile (U- Only)'}
                    </label>
                    <span className="text-[11px] font-mono-tabular text-indigo-600 dark:text-indigo-400">
                      Sandbox: U-100001
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={customerIdentifier}
                    onChange={(e) => setCustomerIdentifier(e.target.value)}
                    placeholder="U-100001 or 01711000001"
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
                  placeholder={
                    counterTab === 'agent_cash_out'
                      ? 'Agent Float Settlement'
                      : counterTab === 'send_money'
                        ? 'Transfer to Customer'
                        : counterTab === 'cash_in'
                          ? 'Counter Deposit'
                          : 'Counter Withdrawal'
                  }
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
                className={`w-full py-3.5 rounded-xl ${preset.primaryButtonClass} text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm`}
              >
                {t('continueBtn', lang)}
              </button>
            </form>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Operation</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {counterTab === 'cash_in'
                      ? 'Agent Cash-In (to User)'
                      : counterTab === 'send_money'
                        ? 'Agent Send Money (to User)'
                        : counterTab === 'agent_cash_out'
                          ? 'Agent Cash-Out (to Admin)'
                          : 'Assisted Cash-Out'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Target</span>
                  <span className="font-mono-tabular text-slate-900 dark:text-white font-medium">
                    {counterTab === 'agent_cash_out' ? 'ADMIN-TREASURY' : customerIdentifier}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Amount</span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {formatBdt(numericAmount, lang)}
                  </span>
                </div>
                {(counterTab === 'cash_in' || counterTab === 'cash_out') && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Commission Earned</span>
                    <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatBdt(breakdown.agentAmount, lang)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {usesAgentPin
                    ? t('enterPinConfirm', lang)
                    : 'Customer Authorization PIN (at Counter)'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={5}
                    inputMode="numeric"
                    value={usesAgentPin ? pin : customerPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (usesAgentPin) setPin(val);
                      else setCustomerPin(val);
                    }}
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
                disabled={(usesAgentPin ? pin.length : customerPin.length) < 4}
                amountLabel={`${
                  counterTab === 'agent_cash_out'
                    ? 'Cash-Out to Admin'
                    : counterTab === 'send_money'
                      ? 'Send to User'
                      : counterTab === 'cash_in'
                        ? 'Cash-In'
                        : 'Cash-Out'
                } ${formatBdt(numericAmount, lang)}`}
                onConfirm={handleConfirmOperation}
              />

              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setCompletedTx(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
              >
                {lang === 'bn' ? 'নতুন লেনদেন' : 'New Counter Entry'}
              </button>
            </div>
          )}
        </div>

        {/* Commission & Counter Activity Ledger */}
        <div className="lg:col-span-7 acash-3d-surface rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {t('commissionTracker', lang)} & {t('recentTransactions', lang)}
            </h3>
            <span className="font-mono-tabular text-xs text-indigo-600 dark:text-indigo-400">
              {transactions.length} records
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('noTransactions', lang)}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[520px] overflow-y-auto">
              {transactions.map((tx) => {
                const isIncoming = tx.receiverId === user.accountId;
                const comm = tx.feeBreakdown?.agentAmount || 0;
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
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
                      <div className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white">
                        {formatBdt(tx.amount, lang)}
                      </div>
                      {!isIncoming && tx.fee > 0 && (
                        <div className="font-mono-tabular text-[11px] text-amber-600 dark:text-amber-300">
                          Charge: {formatBdt(tx.fee, lang)} ({rateNote}) · Total:{' '}
                          {formatBdt(tx.totalDebited, lang)}
                        </div>
                      )}
                      {comm > 0 && tx.status === 'completed' && (
                        <div className="font-mono-tabular text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          + {formatBdt(comm, lang)} comm
                        </div>
                      )}
                      {tx.status !== 'completed' && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400">
                          {tx.status.replace(/_/g, ' ')}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
