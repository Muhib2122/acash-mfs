import React from 'react';
import { Bell, Home, MapPin, QrCode, ScanLine, User as UserIcon } from 'lucide-react';
import { Language, UserRole } from '../../types/acash';

interface MobileBottomNavProps {
  role: UserRole;
  lang: Language;
  unreadNotifications: number;
  onHome: () => void;
  onOpenBoothMap: () => void;
  onPrimaryQr: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  role,
  lang,
  unreadNotifications,
  onHome,
  onOpenBoothMap,
  onPrimaryQr,
  onOpenNotifications,
  onOpenProfile,
}) => {
  return (
    <nav
      aria-label="Account Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[62px] bg-white/95 dark:bg-[#0B0D14]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2"
    >
      <div className="max-w-md mx-auto h-full grid grid-cols-5 items-center">
        <button
          type="button"
          onClick={onHome}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-indigo-600 dark:text-indigo-400 active:scale-95 transition-transform"
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight">
            {lang === 'bn' ? 'হোম' : 'Home'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenBoothMap}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 active:scale-95 transition-transform"
        >
          <MapPin className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">
            {lang === 'bn' ? 'বুথ ম্যাপ' : 'Booths'}
          </span>
        </button>

        {/* Elevated Center 3D QR Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onPrimaryQr}
            aria-label={role === 'U' ? 'Scan QR' : 'Show QR'}
            className="-mt-4 w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-600/35 border border-white/25 flex flex-col items-center justify-center active:scale-95 transition-transform"
          >
            {role === 'U' ? <ScanLine className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
            <span className="text-[9px] font-bold mt-0.5">
              {role === 'U' ? 'SCAN' : 'MY QR'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 active:scale-95 transition-transform"
        >
          <div className="relative">
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-[9px] font-bold text-white flex items-center justify-center font-mono-tabular">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-tight">
            {lang === 'bn' ? 'অ্যালার্ট' : 'Alerts'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenProfile}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 active:scale-95 transition-transform"
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">
            {lang === 'bn' ? 'প্রোফাইল' : 'Profile'}
          </span>
        </button>
      </div>
    </nav>
  );
};
