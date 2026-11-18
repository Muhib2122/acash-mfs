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
    swatchPrimary: '#4338CA',
    swatchSecondary: '#1E1B4B',
    swatchSurface: '#F3F6FC',
    headerAccentBg: 'border-slate-200/80 dark:border-slate-800/80',
    headerBtnBg: 'bg-indigo-600 hover:bg-indigo-500',
    customerCardGradient: 'from-[#1e293b] via-[#312e81] to-[#1e1b4b]',
    agentCardGradient: 'from-[#0f172a] via-[#1e3a5f] to-[#172554]',
    merchantCardGradient: 'from-[#1e1b4b] via-[#3730a3] to-[#1e293b]',
    glareRgba: 'rgba(129, 140, 248, 0.24)',
    glareSecondaryRgba: 'rgba(56, 189, 248, 0.10)',
    primaryButtonClass: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20',
    activeTabClass: 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-600/15',
    accentTextClass: 'text-indigo-600 dark:text-indigo-400',
    accentIconBgClass: 'bg-indigo-50/90 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    accentBorderHoverClass: 'hover:border-indigo-300 dark:hover:border-indigo-500/50',
    mobileQrBtnGradient: 'from-indigo-500 via-indigo-600 to-violet-600 shadow-indigo-600/25',
    pageAmbientClass: 'bg-[#F5F7FB] dark:bg-[#090C14]',
    bannerGradientClass: 'from-indigo-600 via-indigo-500 to-violet-600',
  },
  {
    id: 'bkash_crimson',
    nameEn: 'bKash Peaceful Rose',
    nameBn: 'বিকাশ প্রিমিয়াম রোজ',
    subtitleEn: 'Calm Bangladeshi mobile wallet rose-berry & soft pearl',
    subtitleBn: 'প্রশান্তিদায়ক রোজ-বেরি ও সফট পার্ল মোবাইল ওয়ালেট থিম',
    swatchPrimary: '#D81B60',
    swatchSecondary: '#880E4F',
    swatchSurface: '#FDF5F8',
    headerAccentBg: 'border-rose-200/70 dark:border-rose-900/45',
    headerBtnBg: 'bg-[#D81B60] hover:bg-[#C2185B]',
    customerCardGradient: 'from-[#880e4f] via-[#c2185b] to-[#ad1457]',
    agentCardGradient: 'from-[#6a1b4d] via-[#ad1457] to-[#4a148c]',
    merchantCardGradient: 'from-[#7a103e] via-[#be185d] to-[#881337]',
    glareRgba: 'rgba(244, 143, 177, 0.28)',
    glareSecondaryRgba: 'rgba(255, 255, 255, 0.12)',
    primaryButtonClass: 'bg-[#D81B60] hover:bg-[#C2185B] shadow-rose-600/20',
    activeTabClass: 'bg-[#D81B60] border-rose-500 text-white shadow-sm shadow-rose-600/20',
    accentTextClass: 'text-[#C2185B] dark:text-rose-400',
    accentIconBgClass: 'bg-rose-50/90 dark:bg-rose-500/15 text-[#C2185B] dark:text-rose-400',
    accentBorderHoverClass: 'hover:border-rose-300 dark:hover:border-rose-500/50',
    mobileQrBtnGradient: 'from-[#E2136E] via-[#D81B60] to-[#AD1457] shadow-rose-600/30',
    pageAmbientClass: 'bg-[#F8F5F7] dark:bg-[#0D0A0E]',
    bannerGradientClass: 'from-[#C2185B] via-[#D81B60] to-[#E2136E]',
  },
  {
    id: 'emerald_sovereign',
    nameEn: 'Calm Emerald & Sage',
    nameBn: 'সবুজ বাংলা ও শান্ত সেজ',
    subtitleEn: 'Restful botanical emerald paired with soft cream pearl',
    subtitleBn: 'চোখের জন্য আরামদায়ক সবুজ ও স্নিগ্ধ সেজ থিম',
    swatchPrimary: '#059669',
    swatchSecondary: '#064E3B',
    swatchSurface: '#F2FAF6',
    headerAccentBg: 'border-emerald-200/75 dark:border-emerald-900/45',
    headerBtnBg: 'bg-emerald-600 hover:bg-emerald-500',
    customerCardGradient: 'from-[#064e3b] via-[#047857] to-[#0f766e]',
    agentCardGradient: 'from-[#042f2e] via-[#0f766e] to-[#065f46]',
    merchantCardGradient: 'from-[#064e3b] via-[#059669] to-[#115e59]',
    glareRgba: 'rgba(52, 211, 153, 0.24)',
    glareSecondaryRgba: 'rgba(251, 191, 36, 0.10)',
    primaryButtonClass: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20',
    activeTabClass: 'bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-600/20',
    accentTextClass: 'text-emerald-700 dark:text-emerald-400',
    accentIconBgClass: 'bg-emerald-50/90 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    accentBorderHoverClass: 'hover:border-emerald-300 dark:hover:border-emerald-500/50',
    mobileQrBtnGradient: 'from-emerald-500 via-emerald-600 to-teal-700 shadow-emerald-600/25',
    pageAmbientClass: 'bg-[#F4F9F7] dark:bg-[#07100E]',
    bannerGradientClass: 'from-emerald-700 via-emerald-600 to-teal-600',
  },
  {
    id: 'boishakh_terracotta',
    nameEn: 'Warm Coral & Sand',
    nameBn: 'উষ্ণ কোরাল ও স্যান্ড',
    subtitleEn: 'Soft terracotta rose with warm pearl surfaces',
    subtitleBn: 'স্নিগ্ধ কোরাল ও প্রশান্ত উষ্ণ পার্ল থিম',
    swatchPrimary: '#E11D48',
    swatchSecondary: '#9F1239',
    swatchSurface: '#FAF6F5',
    headerAccentBg: 'border-rose-200/75 dark:border-rose-900/45',
    headerBtnBg: 'bg-rose-600 hover:bg-rose-500',
    customerCardGradient: 'from-[#7f1d1d] via-[#b91c1c] to-[#9a3412]',
    agentCardGradient: 'from-[#7c2d12] via-[#c2410c] to-[#9f1239]',
    merchantCardGradient: 'from-[#881337] via-[#be123c] to-[#9a3412]',
    glareRgba: 'rgba(251, 146, 60, 0.24)',
    glareSecondaryRgba: 'rgba(244, 63, 94, 0.12)',
    primaryButtonClass: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20',
    activeTabClass: 'bg-rose-600 border-rose-500 text-white shadow-sm shadow-rose-600/20',
    accentTextClass: 'text-rose-700 dark:text-amber-400',
    accentIconBgClass: 'bg-rose-50/90 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400',
    accentBorderHoverClass: 'hover:border-rose-300 dark:hover:border-rose-500/50',
    mobileQrBtnGradient: 'from-rose-500 via-rose-600 to-amber-600 shadow-rose-600/25',
    pageAmbientClass: 'bg-[#FAF7F5] dark:bg-[#110B0A]',
    bannerGradientClass: 'from-rose-700 via-rose-600 to-amber-600',
  },
  {
    id: 'royal_midnight',
    nameEn: 'Lavender Dusk & Slate',
    nameBn: 'ল্যাভেন্ডার ও প্রশান্ত স্লেট',
    subtitleEn: 'Calm lavender-violet balanced with cool pearl gray',
    subtitleBn: 'শান্ত ল্যাভেন্ডার-ভায়োলেট ও স্নিগ্ধ স্লেট ফিনিশ',
    swatchPrimary: '#6D28D9',
    swatchSecondary: '#2E1065',
    swatchSurface: '#F6F5FB',
    headerAccentBg: 'border-violet-200/75 dark:border-violet-900/45',
    headerBtnBg: 'bg-violet-600 hover:bg-violet-500',
    customerCardGradient: 'from-[#2e1065] via-[#4c1d95] to-[#312e81]',
    agentCardGradient: 'from-[#1e1b4b] via-[#4c1d95] to-[#1e293b]',
    merchantCardGradient: 'from-[#3b0764] via-[#6d28d9] to-[#312e81]',
    glareRgba: 'rgba(167, 139, 250, 0.25)',
    glareSecondaryRgba: 'rgba(192, 132, 252, 0.12)',
    primaryButtonClass: 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/20',
    activeTabClass: 'bg-violet-600 border-violet-500 text-white shadow-sm shadow-violet-600/20',
    accentTextClass: 'text-violet-700 dark:text-violet-400',
    accentIconBgClass: 'bg-violet-50/90 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400',
    accentBorderHoverClass: 'hover:border-violet-300 dark:hover:border-violet-500/50',
    mobileQrBtnGradient: 'from-violet-500 via-purple-600 to-indigo-700 shadow-violet-600/25',
    pageAmbientClass: 'bg-[#F6F5FA] dark:bg-[#0B0914]',
    bannerGradientClass: 'from-violet-700 via-purple-600 to-indigo-600',
  },
  {
    id: 'oceanic_teal',
    nameEn: 'Serene Ocean Teal',
    nameBn: 'শান্ত পদ্মা টিল ও নেভি',
    subtitleEn: 'Airy river cyan-teal balanced with clean slate surfaces',
    subtitleBn: 'স্নিগ্ধ সাগর-টিল ও প্রশান্ত নেভি প্রফেশনাল লুক',
    swatchPrimary: '#0D9488',
    swatchSecondary: '#134E4A',
    swatchSurface: '#F3FAFA',
    headerAccentBg: 'border-teal-200/75 dark:border-teal-900/45',
    headerBtnBg: 'bg-teal-600 hover:bg-teal-500',
    customerCardGradient: 'from-[#134e4a] via-[#0f766e] to-[#0c4a6e]',
    agentCardGradient: 'from-[#0c4a6e] via-[#0e7490] to-[#134e4a]',
    merchantCardGradient: 'from-[#134e4a] via-[#0d9488] to-[#1e293b]',
    glareRgba: 'rgba(45, 212, 191, 0.24)',
    glareSecondaryRgba: 'rgba(56, 189, 248, 0.12)',
    primaryButtonClass: 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/20',
    activeTabClass: 'bg-teal-600 border-teal-500 text-white shadow-sm shadow-teal-600/20',
    accentTextClass: 'text-teal-700 dark:text-teal-400',
    accentIconBgClass: 'bg-teal-50/90 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400',
    accentBorderHoverClass: 'hover:border-teal-300 dark:hover:border-teal-500/50',
    mobileQrBtnGradient: 'from-teal-500 via-cyan-600 to-sky-700 shadow-teal-600/25',
    pageAmbientClass: 'bg-[#F4F9F9] dark:bg-[#071014]',
    bannerGradientClass: 'from-teal-700 via-cyan-600 to-sky-600',
  },
];

export const DEFAULT_PORTAL_THEME_CONFIG: PortalThemeConfig = {
  presetId: 'bkash_crimson',
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
