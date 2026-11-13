import React, { useState } from 'react';

export const ACASH_MAIN_LOGO_SRC =
  '/assets/aistudio/a_clean_vector_style_app_logo_on_a_transparent_bac_e63513a7.png';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  subtitle?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showWordmark = true,
  subtitle,
}) => {
  const [imgError, setImgError] = useState(false);

  const dim =
    size === 'sm'
      ? 'w-9 h-9'
      : size === 'lg'
        ? 'w-14 h-14'
        : 'w-11 h-11';

  return (
    <div className="flex items-center gap-2.5 shrink-0 min-w-0">
      {!imgError ? (
        <img
          src={ACASH_MAIN_LOGO_SRC}
          alt="Acash Logo"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${dim} object-contain shrink-0 drop-shadow-sm`}
        />
      ) : (
        <div
          className={`${dim} rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-display font-bold text-white shadow-sm shrink-0`}
        >
          A
        </div>
      )}
      {showWordmark && (
        <div className="flex flex-col min-w-0">
          <span className="font-display font-bold tracking-tight text-slate-900 dark:text-white leading-none text-lg whitespace-nowrap">
            Acash
          </span>
          {subtitle && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 whitespace-nowrap truncate max-w-[180px] sm:max-w-none">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
