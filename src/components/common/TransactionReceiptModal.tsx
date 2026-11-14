import React, { useState } from 'react';
import { CheckCircle2, Clock, Copy, Check, Gift, XCircle, X } from 'lucide-react';
import { AcashTransaction, Language } from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import { formatGiftSignature } from '../../lib/giftCards';
import { ACASH_MAIN_LOGO_SRC } from './BrandLogo';
import { OperatorLogo } from './OperatorLogo';

interface TransactionReceiptModalProps {
  tx: AcashTransaction;
  currentAccountId: string;
  lang: Language;
  onClose: () => void;
  onOpenGiftCard?: (tx: AcashTransaction) => void;
}

export const TransactionReceiptModal: React.FC<TransactionReceiptModalProps> = ({
  tx,
  currentAccountId,
  lang,
  onClose,
  onOpenGiftCard,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const isIncoming = tx.receiverId === currentAccountId;

  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30',
      label: t('statusCompleted', lang),
    },
    pending_admin_approval: {
      icon: Clock,
      color: 'text-amber-700 dark:text-amber-300',
      bg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30',
      label: t('statusPending', lang),
    },
    rejected: {
      icon: XCircle,
      color: 'text-rose-700 dark:text-rose-300',
      bg: 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30',
      label: t('statusRejected', lang),
    },
    refunded: {
      icon: CheckCircle2,
      color: 'text-sky-700 dark:text-sky-300',
      bg: 'bg-sky-50 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/30',
      label: t('statusRefunded', lang),
    },
    partially_refunded: {
      icon: CheckCircle2,
      color: 'text-sky-700 dark:text-sky-300',
      bg: 'bg-sky-50 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/30',
      label: t('statusPartialRefund', lang),
    },
  }[tx.status];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <img
              src={ACASH_MAIN_LOGO_SRC}
              alt="Acash"
              className="w-8 h-8 object-contain shrink-0"
            />
            <h3 className="font-display font-semibold text-slate-900 dark:text-white">
              {lang === 'bn' ? 'লেনদেনের রসিদ' : 'Transaction Receipt'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
              <StatusIcon className="w-4 h-4" />
              <span>{statusConfig.label}</span>
            </div>

            <div className="font-mono-tabular text-3xl font-bold text-slate-900 dark:text-white">
              {isIncoming ? '+' : '-'} {formatBdt(tx.amount, lang)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(tx.createdAt).toLocaleString()}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="flex items-center justify-between px-4 py-3 gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('txHash', lang)}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tx.txHash);
                  setCopiedHash(true);
                  setTimeout(() => setCopiedHash(false), 1800);
                }}
                className="inline-flex items-center gap-1.5 font-mono-tabular text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white"
              >
                <span>{tx.txHash}</span>
                {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3 gap-2">
              <span className="text-slate-500 dark:text-slate-400">Tx ID</span>
              <span className="font-mono-tabular text-slate-800 dark:text-slate-200">{tx.txId}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'bn' ? 'প্রেরক' : 'Sender'}</span>
              <span className="text-slate-900 dark:text-white font-medium text-right">
                {tx.senderName} ({tx.senderId})
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 gap-2">
              <span className="text-slate-500 dark:text-slate-400">{lang === 'bn' ? 'প্রাপক' : 'Recipient'}</span>
              <span className="inline-flex items-center gap-2 text-slate-900 dark:text-white font-medium text-right">
                {tx.type === 'mobile_recharge' && tx.operator && (
                  <OperatorLogo operator={tx.operator} size={24} />
                )}
                <span>
                  {tx.receiverName} ({tx.receiverId})
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('fee', lang)}</span>
              <span className="font-mono-tabular text-slate-800 dark:text-slate-200">
                {formatBdt(tx.fee, lang)}
                {tx.fee > 0 && (
                  <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    (
                    {tx.giftCard
                      ? lang === 'bn'
                        ? 'গিফট কার্ড ফ্ল্যাট ৳২'
                        : 'Gift Card Flat ৳2'
                      : tx.feeBreakdown.chargeMode === 'flat'
                        ? `Flat ৳${tx.feeBreakdown.ratePer1000}`
                        : `৳${tx.feeBreakdown.ratePer1000}/1k`}
                    )
                  </span>
                )}
              </span>
            </div>
            {!isIncoming && tx.fee > 0 && (
              <div className="flex items-center justify-between px-4 py-3 gap-2">
                <span className="text-slate-500 dark:text-slate-400">{t('totalDeduction', lang)}</span>
                <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                  {formatBdt(tx.totalDebited, lang)}
                </span>
              </div>
            )}
            {tx.note && (
              <div className="flex items-center justify-between px-4 py-3 gap-2">
                <span className="text-slate-500 dark:text-slate-400">{lang === 'bn' ? 'নোট' : 'Reference'}</span>
                <span className="text-slate-800 dark:text-slate-200 text-right">{tx.note}</span>
              </div>
            )}
          </div>

          {tx.giftCard && (
            <div className="rounded-2xl bg-gradient-to-br from-rose-50 via-amber-50/60 to-white dark:from-[#1b1423] dark:via-[#141724] dark:to-[#0B0D14] border border-rose-200 dark:border-rose-500/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                  <Gift className="w-4 h-4 shrink-0" />
                  <span>
                    {tx.giftCard.cardTitleBn} · {tx.giftCard.cardTitleEn}
                  </span>
                </div>
                {onOpenGiftCard && (
                  <button
                    type="button"
                    onClick={() => onOpenGiftCard(tx)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-semibold text-white transition-colors"
                  >
                    {lang === 'bn' ? 'কার্ড খুলুন' : 'Open Card'}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                “{tx.giftCard.message}”
              </p>
              <div className="text-right font-display text-xs font-bold text-rose-700 dark:text-rose-300">
                {formatGiftSignature(tx.giftCard.signaturePrefix, tx.giftCard.senderDisplayName)}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
          >
            {t('close', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
