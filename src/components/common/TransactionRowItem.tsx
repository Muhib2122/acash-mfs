import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Gift,
  RotateCcw,
} from 'lucide-react';
import { AcashTransaction, Language } from '../../types/acash';

interface TransactionRowItemProps {
  tx: AcashTransaction;
  viewerAccountId: string;
  lang: Language;
  onOpenGiftCard?: (tx: AcashTransaction) => void;
  onRefundClick?: (tx: AcashTransaction) => void;
  showRefundAction?: boolean;
}

export const TransactionRowItem: React.FC<TransactionRowItemProps> = ({
  tx,
  viewerAccountId,
  lang,
  onOpenGiftCard,
  onRefundClick,
  showRefundAction = false,
}) => {
  const isSender = tx.senderId === viewerAccountId;
  const counterpartyName = isSender ? tx.receiverName : tx.senderName;
  const counterpartyId = isSender ? tx.receiverId : tx.senderId;

  const txTypeLabel = tx.type.replace(/_/g, ' ').toUpperCase();
  const isPending = tx.status === 'pending_admin_approval';
  const isRejected = tx.status === 'rejected';
  const isGiftEligible = Boolean(tx.giftCard && onOpenGiftCard);

  const directionBg = isPending
    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
    : isSender
      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
      : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400';

  const statusColor = isPending
    ? 'text-amber-600 dark:text-amber-400'
    : isRejected
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-emerald-600 dark:text-emerald-400';

  const amountPrefix = isSender ? '-' : '+';
  const amountColor = isSender
    ? 'text-slate-900 dark:text-white'
    : 'text-emerald-600 dark:text-emerald-400';

  const remainingRefundable = Number((tx.amount - (tx.refundedAmount || 0)).toFixed(2));
  const canRefund =
    showRefundAction &&
    !isSender &&
    tx.type === 'merchant_payment' &&
    tx.status === 'completed' &&
    remainingRefundable > 0 &&
    Boolean(onRefundClick);

  return (
    <div className="px-3.5 sm:px-4 py-3.5 hover:bg-slate-50/75 dark:hover:bg-slate-800/35 transition">
      <div className="flex items-start gap-3 min-w-0">
        {/* Direction icon */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${directionBg}`}
        >
          {isPending ? (
            <Clock className="w-4 h-4" />
          ) : isSender ? (
            <ArrowUpRight className="w-4 h-4" />
          ) : (
            <ArrowDownLeft className="w-4 h-4" />
          )}
        </div>

        {/* Main responsive body — never squashed */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Top row: Counterparty + Amount */}
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white break-words leading-snug">
                {counterpartyName}
              </p>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                {counterpartyId} · {txTypeLabel}
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className={`text-sm font-bold font-mono-tabular whitespace-nowrap ${amountColor}`}>
                {amountPrefix} ৳{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] font-semibold capitalize whitespace-nowrap ${statusColor}`}>
                {tx.status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          {/* Secondary metadata row: Hash, Biometric mark, Timestamp — wraps cleanly on 320px+ */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono-tabular break-all">
              {tx.txHash}
              {tx.authMethod === 'biometric' && (
                <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-sans font-medium">
                  · {lang === 'bn' ? 'বায়োমেট্রিক' : 'Biometrics'}
                </span>
              )}
            </span>
            <span className="tabular-nums">
              {new Date(tx.createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Fee / Gift / Refund footer — clean non-overlapping strip */}
          {(isSender && tx.fee > 0) || isGiftEligible || canRefund ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              {isSender && tx.fee > 0 ? (
                <p className="text-[11px] font-mono-tabular text-amber-600 dark:text-amber-400 leading-snug">
                  Charge: ৳{tx.fee.toFixed(2)}
                  {tx.giftCard ? ' (Gift Card)' : ''} · Total: ৳{tx.totalDebited.toFixed(2)}
                </p>
              ) : (
                <span />
              )}

              <div className="flex flex-wrap items-center gap-2">
                {isGiftEligible && tx.giftCard && onOpenGiftCard && (
                  <button
                    type="button"
                    onClick={() => onOpenGiftCard(tx)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition cursor-pointer"
                  >
                    <Gift className="w-3.5 h-3.5 shrink-0" />
                    <span>{lang === 'bn' ? tx.giftCard.cardTitleBn : tx.giftCard.cardTitleEn}</span>
                  </button>
                )}

                {canRefund && onRefundClick && (
                  <button
                    type="button"
                    onClick={() => onRefundClick(tx)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    <span>{lang === 'bn' ? 'রিফান্ড' : 'Refund'}</span>
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
