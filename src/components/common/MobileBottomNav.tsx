import React from 'react';
import { FileText, Home, Mail, QrCode, ScanLine, User as UserIcon } from 'lucide-react';
import { Language, UserRole } from '../../types/acash';
import { usePortalTheme } from '../../lib/portalThemes';

export type MobileNavTab = 'home' | 'statements' | 'inbox' | 'profile';

interface MobileBottomNavProps {
  role: UserRole;
  lang: Language;
  activeTab?: MobileNavTab;
  unreadNotifications: number;
  onHome: () => void;
  onOpenStatements: () => void;
  onPrimaryQr: () => void;
  onOpenInbox: () => void;
  onOpenProfile: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  role,
  lang,
  activeTab = 'home',
  unreadNotifications,
  onHome,
  onOpenStatements,
  onPrimaryQr,
  onOpenInbox,
  onOpenProfile,
}) => {
  const { preset } = usePortalTheme();

  return (
    <nav
      aria-label="Account Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[calc(58px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white/95 dark:bg-[#090C14]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 px-1.5"
    >
      <div className="max-w-md mx-auto h-[58px] grid grid-cols-5 items-center">
        <button
          type="button"
          onClick={onHome}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer ${
            activeTab === 'home'
              ? preset.accentTextClass
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
            {lang === 'bn' ? 'হোম' : 'Home'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenStatements}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer ${
            activeTab === 'statements'
              ? preset.accentTextClass
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
            {lang === 'bn' ? 'স্টেটমেন্ট' : 'Statements'}
          </span>
        </button>

        {/* Elevated Center bKash-Style Scan / My QR Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onPrimaryQr}
            aria-label={role === 'U' ? 'Scan QR' : 'Show QR'}
            className={`-mt-3.5 w-13 h-13 rounded-full bg-gradient-to-br ${preset.mobileQrBtnGradient} text-white shadow-md border-2 border-white dark:border-[#090C14] flex flex-col items-center justify-center active:scale-95 transition-transform cursor-pointer`}
          >
            {role === 'U' ? <ScanLine className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
            <span className="text-[8.5px] font-bold leading-none mt-0.5">
              {role === 'U' ? 'SCAN' : 'MY QR'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenInbox}
          className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer ${
            activeTab === 'inbox'
              ? preset.accentTextClass
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <div className="relative">
            <Mail className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-[9px] font-bold text-white flex items-center justify-center font-mono-tabular">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
            {lang === 'bn' ? 'ইনবক্স' : 'Inbox'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenProfile}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer ${
            activeTab === 'profile'
              ? preset.accentTextClass
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
            {lang === 'bn' ? 'প্রোফাইল' : 'Profile'}
          </span>
        </button>
      </div>
    </nav>
  );
};
