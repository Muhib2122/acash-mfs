import React, { useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Sparkles,
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
    const ry = (x - 0.5) * 9;
    const rx = (0.5 - y) * 7;
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
            ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) scale3d(1.008, 1.008, 1)`
            : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
        }}
        className={`acash-3d-card relative h-full rounded-3xl bg-gradient-to-br ${gradientClasses} border border-white/15 p-5 sm:p-6 text-white overflow-hidden flex flex-col justify-between transition-colors duration-300`}
      >
        {/* Dynamic radial specular glare following pointer */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            opacity: tilt.active ? 0.5 : 0.22,
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, ${preset.glareRgba} 0%, ${preset.glareSecondaryRgba} 32%, transparent 65%)`,
          }}
        />
        {/* Crisp architectural edge rings for hardware depth */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 w-52 h-52 rounded-full border border-white/15 bg-white/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -bottom-16 w-48 h-48 rounded-full border border-white/10 bg-white/5"
        />

        {/* Top Identity Row */}
        <div className="relative z-10 acash-3d-layer-1 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {user.profilePhotoUrl ? (
              <img
                src={user.profilePhotoUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-2xl object-cover border-2 border-white/25 shadow-lg shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                <UserIcon className="w-5 h-5 text-indigo-200" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-200">
                <span>{roleTitle}</span>
                <span aria-hidden="true" className="text-white/35">·</span>
                <span className="font-mono-tabular text-white/95">{user.accountId}</span>
                {user.kyc?.status === 'verified' && (
                  <>
                    <span aria-hidden="true" className="text-white/35">·</span>
                    <span className="inline-flex items-center gap-0.5 text-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>KYC</span>
                    </span>
                  </>
                )}
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate mt-0.5">
                {user.businessName || user.name}
              </h2>
              <div className="text-[11px] font-mono-tabular text-slate-300/90 truncate">
                {user.businessName ? `${user.name} · ${user.phone}` : user.phone}
              </div>
            </div>
          </div>

          {topRightActions && (
            <div className="flex items-center gap-1.5 shrink-0">{topRightActions}</div>
          )}
        </div>

        {/* 3D Embossed Chip + Tactile Balance Vault */}
        <div className="relative z-10 acash-3d-layer-2 mt-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-indigo-200/90 px-0.5">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="inline-flex w-6 h-4 rounded-sm bg-gradient-to-br from-amber-200 via-amber-400 to-amber-500 border border-amber-100/60 shadow-inner" />
              <span>{balanceLabel}</span>
            </span>
            {secondaryBalanceLabel && typeof secondaryBalanceValue === 'number' && !cashierMode && (
              <span className="font-mono-tabular text-[11px] text-emerald-300 font-semibold">
                {secondaryBalanceLabel}: {formatBdt(secondaryBalanceValue, lang)}
              </span>
            )}
          </div>

          {cashierMode ? (
            <div className="w-full px-4 py-3.5 rounded-2xl bg-slate-950/65 border border-amber-400/35 flex items-center gap-2.5 text-xs text-amber-200 shadow-inner">
              <Lock className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                {lang === 'bn'
                  ? 'ক্যাশিয়ার মোড সক্রিয় — মালিকের ব্যালেন্স গোপন রাখা হয়েছে'
                  : 'Cashier Staff Mode active — Owner balance protected'}
              </span>
            </div>
          ) : alwaysVisibleBalance || !onToggleBalance ? (
            <div className="w-full px-4 py-3.5 rounded-2xl bg-slate-950/55 border border-white/15 flex items-center justify-between shadow-inner">
              <span className="font-mono-tabular text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {formatBdt(user.balance, lang)}
              </span>
              <Sparkles className="w-4 h-4 text-indigo-300/80 shrink-0" />
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleBalance}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-slate-950/60 border border-white/15 hover:border-indigo-300/60 active:scale-[0.99] transition-all text-left group shadow-inner"
            >
              <span className="font-mono-tabular text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {showBalance ? formatBdt(user.balance, lang) : '৳ ••••••'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200 group-hover:text-white px-2.5 py-1 rounded-xl bg-white/10 border border-white/10">
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>
                  {showBalance
                    ? lang === 'bn'
                      ? 'লুকান'
                      : 'Hide'
                    : lang === 'bn'
                      ? 'ট্যাপ করুন'
                      : 'Tap'}
                </span>
              </span>
            </button>
          )}
        </div>

        {/* Footer Metadata + Quick Actions */}
        {(footerMeta || footerActions) && (
          <div className="relative z-10 acash-3d-layer-1 mt-5 pt-4 border-t border-white/10 space-y-3">
            {footerMeta && (
              <div className="text-xs text-slate-200/90 flex flex-wrap items-center gap-x-2.5 gap-y-1">
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
