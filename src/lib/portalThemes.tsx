import React, { createContext, useContext, useMemo } from 'react';
import { PortalThemeConfig, PortalThemePresetId } from '../types/acash';

export interface PortalThemeDefinition {
  id: PortalThemePresetId;
  nameEn: string;
  nameBn: string;
  subtitleEn: string;
  subtitleBn: string;
  swatchPrimary: string;
  swatchSecondary: string;
  swatchSurface: string;
  headerAccentBg: string;
  headerBtnBg: string;
  customerCardGradient: string;
  agentCardGradient: string;
  merchantCardGradient: string;
  glareRgba: string;
  glareSecondaryRgba: string;
  primaryButtonClass: string;
  activeTabClass: string;
  accentTextClass: string;
  accentIconBgClass: string;
  accentBorderHoverClass: string;
  mobileQrBtnGradient: string;
  pageAmbientClass: string;
  bannerGradientClass: string;
}

export const PORTAL_THEME_PRESETS: PortalThemeDefinition[] = [
  {
    id: 'classic_indigo',
    nameEn: 'Acash Classic Indigo',
    nameBn: 'এ-ক্যাশ ক্লাসিক ইন্ডিগো',
    subtitleEn: 'Signature deep sapphire & indigo FinTech palette',
    subtitleBn: 'স্বাক্ষর স্যাফায়ার ও ইন্ডিগো ফিনটেক থিম',
    swatchPrimary: '#4F46E5',
    swatchSecondary: '#1E1B4B',
    swatchSurface: '#EEF2FF',
    headerAccentBg: 'border-slate-200/80 dark:border-slate-800/80',
    headerBtnBg: 'bg-indigo-600 hover:bg-indigo-500',
    customerCardGradient: 'from-[#0d1226] via-[#1c1b4d] to-[#0f172a]',
    agentCardGradient: 'from-slate-950 via-[#131d47] to-[#0b2738]',
    merchantCardGradient: 'from-slate-950 via-[#1f1647] to-[#132145]',
    glareRgba: 'rgba(129, 140, 248, 0.38)',
    glareSecondaryRgba: 'rgba(56, 189, 248, 0.14)',
    primaryButtonClass: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25',
    activeTabClass: 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20',
    accentTextClass: 'text-indigo-600 dark:text-indigo-400',
    accentIconBgClass: 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    accentBorderHoverClass: 'hover:border-indigo-400 dark:hover:border-indigo-500/50',
    mobileQrBtnGradient: 'from-indigo-500 via-indigo-600 to-violet-700 shadow-indigo-600/35',
    pageAmbientClass: 'bg-slate-50 dark:bg-[#0B0D14]',
    bannerGradientClass: 'from-indigo-600 via-violet-600 to-indigo-700',
  },
  {
    id: 'bkash_crimson',
    nameEn: 'Crimson Magenta Rose',
    nameBn: 'ক্রিমসন ম্যাজেন্টা উৎসব',
    subtitleEn: 'Vibrant magenta-rose inspired by Bangladeshi mobile wallets',
    subtitleBn: 'জনপ্রিয় মোবাইল ওয়ালেটের উজ্জ্বল ম্যাজেন্টা-রোজ লুক',
    swatchPrimary: '#E2136E',
    swatchSecondary: '#881337',
    swatchSurface: '#FFF1F2',
    headerAccentBg: 'border-rose-200/80 dark:border-rose-900/50',
    headerBtnBg: 'bg-rose-600 hover:bg-rose-500',
    customerCardGradient: 'from-[#4c0519] via-[#9d174d] to-[#3b0764]',
    agentCardGradient: 'from-[#3b071e] via-[#be185d] to-[#1e1b4b]',
    merchantCardGradient: 'from-[#450a24] via-[#9f1239] to-[#7c2d12]',
    glareRgba: 'rgba(251, 113, 133, 0.42)',
    glareSecondaryRgba: 'rgba(244, 63, 94, 0.16)',
    primaryButtonClass: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/25',
    activeTabClass: 'bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/25',
    accentTextClass: 'text-rose-600 dark:text-rose-400',
    accentIconBgClass: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400',
    accentBorderHoverClass: 'hover:border-rose-400 dark:hover:border-rose-500/50',
    mobileQrBtnGradient: 'from-rose-500 via-pink-600 to-rose-700 shadow-rose-600/35',
    pageAmbientClass: 'bg-rose-50/35 dark:bg-[#0E090F]',
    bannerGradientClass: 'from-rose-600 via-pink-600 to-red-600',
  },
  {
    id: 'emerald_sovereign',
    nameEn: 'Bengal Emerald & Gold',
    nameBn: 'সবুজ বাংলা ও সোনালী ঐতিহ্য',
    subtitleEn: 'Festive Eid & national emerald green paired with warm gold',
    subtitleBn: 'ঈদ ও জাতীয় উৎসবের চিরসবুজ এবং সোনালী আভা',
    swatchPrimary: '#059669',
    swatchSecondary: '#064E3B',
    swatchSurface: '#ECFDF5',
    headerAccentBg: 'border-emerald-200/80 dark:border-emerald-900/50',
    headerBtnBg: 'bg-emerald-600 hover:bg-emerald-500',
    customerCardGradient: 'from-[#022c22] via-[#065f46] to-[#0f172a]',
    agentCardGradient: 'from-[#042f2e] via-[#115e59] to-[#064e3b]',
    merchantCardGradient: 'from-[#052e16] via-[#065f46] to-[#422006]',
    glareRgba: 'rgba(52, 211, 153, 0.36)',
    glareSecondaryRgba: 'rgba(251, 191, 36, 0.16)',
    primaryButtonClass: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25',
    activeTabClass: 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/25',
    accentTextClass: 'text-emerald-600 dark:text-emerald-400',
    accentIconBgClass: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    accentBorderHoverClass: 'hover:border-emerald-400 dark:hover:border-emerald-500/50',
    mobileQrBtnGradient: 'from-emerald-500 via-emerald-600 to-teal-700 shadow-emerald-600/35',
    pageAmbientClass: 'bg-emerald-50/30 dark:bg-[#07100E]',
    bannerGradientClass: 'from-emerald-700 via-teal-600 to-amber-600',
  },
  {
    id: 'boishakh_terracotta',
    nameEn: 'Boishakh Alpona Red',
    nameBn: 'পহেলা বৈশাখ ও আলপনা লাল',
    subtitleEn: 'Pohela Boishakh vermilion crimson with marigold amber accents',
    subtitleBn: 'পহেলা বৈশাখের গাঁদা ফুল ও আলপনা রঙের থিম',
    swatchPrimary: '#DC2626',
    swatchSecondary: '#B45309',
    swatchSurface: '#FEF2F2',
    headerAccentBg: 'border-red-200/80 dark:border-red-900/50',
    headerBtnBg: 'bg-red-600 hover:bg-red-500',
    customerCardGradient: 'from-[#450a0a] via-[#991b1b] to-[#78350f]',
    agentCardGradient: 'from-[#431407] via-[#9a3412] to-[#7f1d1d]',
    merchantCardGradient: 'from-[#450a0a] via-[#b91c1c] to-[#92400e]',
    glareRgba: 'rgba(248, 113, 113, 0.40)',
    glareSecondaryRgba: 'rgba(245, 158, 11, 0.22)',
    primaryButtonClass: 'bg-red-600 hover:bg-red-500 shadow-red-600/25',
    activeTabClass: 'bg-red-600 border-red-500 text-white shadow-md shadow-red-600/25',
    accentTextClass: 'text-red-600 dark:text-amber-400',
    accentIconBgClass: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400',
    accentBorderHoverClass: 'hover:border-red-400 dark:hover:border-red-500/50',
    mobileQrBtnGradient: 'from-red-500 via-rose-600 to-amber-600 shadow-red-600/35',
    pageAmbientClass: 'bg-amber-50/35 dark:bg-[#120A0A]',
    bannerGradientClass: 'from-red-600 via-rose-600 to-amber-600',
  },
  {
    id: 'royal_midnight',
    nameEn: 'Royal Violet & Obsidian',
    nameBn: 'রয়্যাল ভায়োলেট ও অবসিডিয়ান',
    subtitleEn: 'High-contrast executive violet & deep carbon slate',
    subtitleBn: 'প্রিমিয়াম ভায়োলেট ও ডার্ক কার্বন ফিনিশ',
    swatchPrimary: '#7C3AED',
    swatchSecondary: '#1E1B4B',
    swatchSurface: '#F5F3FF',
    headerAccentBg: 'border-violet-200/80 dark:border-violet-900/50',
    headerBtnBg: 'bg-violet-600 hover:bg-violet-500',
    customerCardGradient: 'from-[#0f0720] via-[#4c1d95] to-[#1e1b4b]',
    agentCardGradient: 'from-[#170936] via-[#5b21b6] to-[#0f172a]',
    merchantCardGradient: 'from-[#1e0a3c] via-[#6d28d9] to-[#311042]',
    glareRgba: 'rgba(167, 139, 250, 0.42)',
    glareSecondaryRgba: 'rgba(232, 121, 249, 0.14)',
    primaryButtonClass: 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/25',
    activeTabClass: 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-600/25',
    accentTextClass: 'text-violet-600 dark:text-violet-400',
    accentIconBgClass: 'bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400',
    accentBorderHoverClass: 'hover:border-violet-400 dark:hover:border-violet-500/50',
    mobileQrBtnGradient: 'from-violet-500 via-purple-600 to-indigo-700 shadow-violet-600/35',
    pageAmbientClass: 'bg-violet-50/25 dark:bg-[#0B0914]',
    bannerGradientClass: 'from-violet-600 via-purple-600 to-indigo-700',
  },
  {
    id: 'oceanic_teal',
    nameEn: 'Padma Oceanic Teal',
    nameBn: 'পদ্মা ওশানিক টিল ও নেভি',
    subtitleEn: 'Crisp river cyan-teal balanced with deep navy slate',
    subtitleBn: 'স্বচ্ছ সাগর-টিল ও ডিপ নেভি প্রফেশনাল লুক',
    swatchPrimary: '#0D9488',
    swatchSecondary: '#0F172A',
    swatchSurface: '#F0FDFA',
    headerAccentBg: 'border-teal-200/80 dark:border-teal-900/50',
    headerBtnBg: 'bg-teal-600 hover:bg-teal-500',
    customerCardGradient: 'from-[#042f2e] via-[#0f766e] to-[#0c4a6e]',
    agentCardGradient: 'from-[#082f49] via-[#0e7490] to-[#134e4a]',
    merchantCardGradient: 'from-[#042f2e] via-[#115e59] to-[#1e293b]',
    glareRgba: 'rgba(45, 212, 191, 0.38)',
    glareSecondaryRgba: 'rgba(56, 189, 248, 0.16)',
    primaryButtonClass: 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/25',
    activeTabClass: 'bg-teal-600 border-teal-500 text-white shadow-md shadow-teal-600/25',
    accentTextClass: 'text-teal-600 dark:text-teal-400',
    accentIconBgClass: 'bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400',
    accentBorderHoverClass: 'hover:border-teal-400 dark:hover:border-teal-500/50',
    mobileQrBtnGradient: 'from-teal-500 via-cyan-600 to-sky-700 shadow-teal-600/35',
    pageAmbientClass: 'bg-teal-50/25 dark:bg-[#071014]',
    bannerGradientClass: 'from-teal-600 via-cyan-600 to-sky-700',
  },
];

export const DEFAULT_PORTAL_THEME_CONFIG: PortalThemeConfig = {
  presetId: 'classic_indigo',
  bannerEnabled: false,
  customBannerBn: '',
  customBannerEn: '',
  surfacePreference: 'user_choice',
  updatedAt: Date.now(),
  updatedBy: 'System Default',
};

export function getPortalThemeDefinition(presetId?: PortalThemePresetId): PortalThemeDefinition {
  return PORTAL_THEME_PRESETS.find((p) => p.id === presetId) || PORTAL_THEME_PRESETS[0];
}

interface PortalThemeContextValue {
  config: PortalThemeConfig;
  preset: PortalThemeDefinition;
}

const PortalThemeContext = createContext<PortalThemeContextValue>({
  config: DEFAULT_PORTAL_THEME_CONFIG,
  preset: PORTAL_THEME_PRESETS[0],
});

export const PortalThemeProvider: React.FC<{
  config: PortalThemeConfig;
  children: React.ReactNode;
}> = ({ config, children }) => {
  const value = useMemo<PortalThemeContextValue>(
    () => ({
      config,
      preset: getPortalThemeDefinition(config.presetId),
    }),
    [config]
  );

  return <PortalThemeContext.Provider value={value}>{children}</PortalThemeContext.Provider>;
};

export function usePortalTheme(): PortalThemeContextValue {
  return useContext(PortalThemeContext);
}
