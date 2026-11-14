import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, Check, Loader2 } from 'lucide-react';
import { Language } from '../../types/acash';
import { t } from '../../lib/i18n';

interface TapAndHoldButtonProps {
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  loading?: boolean;
  lang: Language;
  amountLabel?: string;
}

export const TapAndHoldButton: React.FC<TapAndHoldButtonProps> = ({
  onConfirm,
  disabled = false,
  loading = false,
  lang,
  amountLabel,
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const HOLD_DURATION_MS = 1350;

  const cancelHold = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsHolding(false);
    if (!completed) {
      setProgress(0);
    }
  };

  const startHold = () => {
    if (disabled || loading || completed) return;
    setIsHolding(true);
    startTimeRef.current = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setProgress(pct);

      if (pct >= 100) {
        setIsHolding(false);
        setCompleted(true);
        rafRef.current = null;
        onConfirm();
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loading && completed) {
      const timer = setTimeout(() => {
        setCompleted(false);
        setProgress(0);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loading, completed]);

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="space-y-2 select-none">
      <button
        type="button"
        disabled={disabled || loading}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startHold();
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            startHold();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            cancelHold();
          }
        }}
        className={`relative w-full h-16 rounded-2xl overflow-hidden border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          disabled
            ? 'bg-slate-200 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            : isHolding
              ? 'scale-[0.98] translate-y-[1px] border-indigo-300 bg-indigo-950 text-white shadow-inner cursor-pointer'
              : 'border-indigo-400/50 bg-gradient-to-r from-[#0e1429] via-[#211d58] to-[#0e1429] text-white hover:border-indigo-300 cursor-pointer shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]'
        }`}
      >
        {/* Animated horizontal fill bar */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 transition-none pointer-events-none"
          style={{ width: `${progress}%`, opacity: 0.94 }}
        />

        <div className="relative z-10 flex items-center justify-between px-5 h-full">
          <div className="flex items-center gap-3.5">
            <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
              <svg className="w-11 h-11 -rotate-90" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center">
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : completed ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <Fingerprint className={`w-5 h-5 ${disabled ? 'text-slate-400' : 'text-indigo-200'}`} />
                )}
              </span>
            </div>

            <div className="text-left">
              <div className={`text-sm font-semibold tracking-tight ${disabled ? 'text-slate-500 dark:text-slate-400' : 'text-white'}`}>
                {loading
                  ? lang === 'bn'
                    ? 'প্রক্রিয়াকরণ হচ্ছে...'
                    : 'Executing Settlement...'
                  : isHolding
                    ? t('holdingProgress', lang)
                    : t('tapAndHold', lang)}
              </div>
              <div className={`text-[11px] ${disabled ? 'text-slate-400 dark:text-slate-500' : 'text-indigo-200/85'}`}>
                {isHolding
                  ? `${Math.round(progress)}% · ${t('releaseCancel', lang)}`
                  : amountLabel || (lang === 'bn' ? 'নিরাপদ বায়োমেট্রিক নিশ্চিতকরণ' : 'Hold 1.4s to authorize transaction')}
              </div>
            </div>
          </div>

          <span className={`font-mono-tabular text-xs font-semibold shrink-0 ${disabled ? 'text-slate-400' : 'text-indigo-100'}`}>
            {Math.round(progress)}%
          </span>
        </div>
      </button>
    </div>
  );
};
