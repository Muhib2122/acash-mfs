import React, { useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { AcashUser, Language } from '../../types/acash';
import { formatBdt, t } from '../../lib/i18n';
import { usePortalTheme } from '../../lib/portalThemes';

interface Wallet3DCardProps {
  user: AcashUser;
  lang: Language;
  balanceLabel: string;
  showBalance?: boolean;
  onToggleBalance?: () => void;
  alwaysVisibleBalance?: boolean;
  cashierMode?: boolean;
  accentVariant?: 'customer' | 'agent' | 'merchant';
  topRightActions?: React.ReactNode;
  footerMeta?: React.ReactNode;
  footerActions?: React.ReactNode;
  secondaryBalanceLabel?: string;
  secondaryBalanceValue?: number;
}

export const Wallet3DCard: React.FC<Wallet3DCardProps> = ({
  user,
  lang,
  balanceLabel,
  showBalance = true,
  onToggleBalance,
  alwaysVisibleBalance = false,
  cashierMode = false,
  accentVariant = 'customer',
  topRightActions,
  footerMeta,
  footerActions,
  secondaryBalanceLabel,
  secondaryBalanceValue,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 25, active: false });
  const { preset } = usePortalTheme();

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const ry = (x - 0.5) * 6;
    const rx = (0.5 - y) * 5;
    setTilt({ rx, ry, gx: x * 100, gy: y * 100, active: true });
  };

  const resetTilt = () => {
    setTilt((prev) => ({ ...prev, rx: 0, ry: 0, active: false }));
  };

  const gradientClasses =
    accentVariant === 'agent'
      ? preset.agentCardGradient
      : accentVariant === 'merchant'
        ? preset.merchantCardGradient
        : preset.customerCardGradient;

  const roleTitle =
    user.role === 'U'
      ? t('roleCustomer', lang)
      : user.role === 'A'
        ? t('roleAgent', lang)
        : t('roleMerchant', lang);

  return (
    <div className="acash-3d-stage h-full">
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        style={{
          transform: tilt.active
            ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`
            : 'rotateX(0deg) rotateY(0deg)',
        }}
        className={`acash-3d-card relative h-full rounded-3xl bg-gradient-to-br ${gradientClasses} border border-white/15 p-4 sm:p-5 text-white overflow-hidden flex flex-col justify-between transition-colors duration-200`}
      >
        {/* Subtle specular highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            opacity: tilt.active ? 0.45 : 0.2,
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, ${preset.glareRgba} 0%, ${preset.glareSecondaryRgba} 35%, transparent 68%)`,
          }}
        />
        {/* Soft architectural rings */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 w-48 h-48 rounded-full border border-white/12 bg-white/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -bottom-16 w-44 h-44 rounded-full border border-white/10 bg-white/5"
        />

        {/* Identity Row */}
        <div className="relative z-10 acash-3d-layer-1 flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {user.profilePhotoUrl ? (
              <img
                src={user.profilePhotoUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-white/35 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5 text-white" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-white/80">
                <span>{roleTitle}</span>
                <span aria-hidden="true" className="text-white/35">·</span>
                <span className="font-mono-tabular text-white">{user.accountId}</span>
                {user.kyc?.status === 'verified' && (
                  <>
                    <span aria-hidden="true" className="text-white/35">·</span>
                    <span className="inline-flex items-center gap-0.5 text-emerald-200 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>KYC</span>
                    </span>
                  </>
                )}
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white truncate mt-0.5">
                {user.businessName || user.name}
              </h2>
              <div className="text-[11px] font-mono-tabular text-white/75 truncate">
                {user.businessName ? `${user.name} · ${user.phone}` : user.phone}
              </div>
            </div>
          </div>

          {topRightActions && (
            <div className="flex items-center gap-1.5 shrink-0">{topRightActions}</div>
          )}
        </div>

        {/* bKash-Inspired Tap-for-Balance Capsule */}
        <div className="relative z-10 acash-3d-layer-2 mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/85 px-0.5">
            <span className="font-medium">{balanceLabel}</span>
            {secondaryBalanceLabel && typeof secondaryBalanceValue === 'number' && !cashierMode && (
              <span className="font-mono-tabular text-emerald-200 font-semibold">
                {secondaryBalanceLabel}: {formatBdt(secondaryBalanceValue, lang)}
              </span>
            )}
          </div>

          {cashierMode ? (
            <div className="w-full px-4 py-3 rounded-2xl bg-black/25 border border-amber-300/35 flex items-center gap-2.5 text-xs text-amber-100">
              <Lock className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                {lang === 'bn'
                  ? 'ক্যাশিয়ার মোড সক্রিয় — মালিকের ব্যালেন্স গোপন রাখা হয়েছে'
                  : 'Cashier Staff Mode active — Owner balance protected'}
              </span>
            </div>
          ) : alwaysVisibleBalance || !onToggleBalance ? (
            <div className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-white/15 flex items-center justify-between gap-2">
              <span className="font-mono-tabular text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
                {formatBdt(user.balance, lang)}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleBalance}
              className="w-full min-h-[52px] flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/20 border border-white/20 active:scale-[0.99] transition-all text-left group cursor-pointer"
            >
              <span className="font-mono-tabular text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                {showBalance
                  ? formatBdt(user.balance, lang)
                  : lang === 'bn'
                    ? '৳ ব্যালেন্স দেখুন'
                    : '৳ Tap for Balance'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-black/20 group-hover:bg-black/30 px-2.5 py-1.5 rounded-full shrink-0">
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>
                  {showBalance
                    ? lang === 'bn'
                      ? 'লুকান'
                      : 'Hide'
                    : lang === 'bn'
                      ? 'দেখুন'
                      : 'Tap'}
                </span>
              </span>
            </button>
          )}
        </div>

        {/* Footer Metadata + Quick Actions */}
        {(footerMeta || footerActions) && (
          <div className="relative z-10 acash-3d-layer-1 mt-4 pt-3 border-t border-white/15 space-y-2.5">
            {footerMeta && (
              <div className="text-[11px] text-white/85 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {footerMeta}
              </div>
            )}
            {footerActions && (
              <div className="flex flex-wrap items-center gap-2">{footerActions}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
