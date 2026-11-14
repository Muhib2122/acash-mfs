import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Gift,
  ImagePlus,
  Megaphone,
  Palette,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AcashTransaction,
  CustomGiftCardRecord,
  GiftCardParticleType,
  GiftCardThemeCategory,
  Language,
  PortalThemeConfig,
  PortalThemePresetId,
  PortalThemeSurfacePreference,
} from '../../types/acash';
import { formatBdt } from '../../lib/i18n';
import {
  GIFT_CARD_FEE_BDT,
  GIFT_CARD_MAX_WORDS,
  GiftCardTemplate,
  clampToMaxWords,
  countWords,
  getAllGiftCardTemplates,
  getGiftCardTemplate,
} from '../../lib/giftCards';
import {
  PORTAL_THEME_PRESETS,
  getPortalThemeDefinition,
} from '../../lib/portalThemes';
import {
  adminDeleteCustomGiftCard,
  adminSaveCustomGiftCard,
  adminToggleCustomGiftCardStatus,
  adminUpdatePortalThemeConfig,
} from '../../lib/acashService';
import { GiftCardArtFrame } from '../common/GiftCardExperience';

interface AdminSocialEngagementPanelProps {
  lang: Language;
  adminEmail: string;
  transactions: AcashTransaction[];
  customGiftCards: CustomGiftCardRecord[];
  portalTheme: PortalThemeConfig;
  onInspectAccount: (accountId: string) => void;
  onFeedback: (msg: string) => void;
}

type SocialSubTab = 'accounting' | 'upload_cards' | 'portal_theme';

const CARD_CATEGORIES: Array<{ id: GiftCardThemeCategory; labelEn: string; labelBn: string }> = [
  { id: 'eid', labelEn: 'Eid & Islamic', labelBn: 'ঈদ ও ধর্মীয়' },
  { id: 'boishakh', labelEn: 'Pohela Boishakh', labelBn: 'পহেলা বৈশাখ' },
  { id: 'heritage', labelEn: 'National Heritage', labelBn: 'জাতীয় ঐতিহ্য' },
  { id: 'love', labelEn: 'Love & Romance', labelBn: 'ভালোবাসা' },
  { id: 'wishes', labelEn: 'Friendship & Wishes', labelBn: 'বন্ধু ও শুভেচ্ছা' },
  { id: 'celebration', labelEn: 'Celebration & Events', labelBn: 'উৎসব ও অনুষ্ঠান' },
];

const PARTICLE_OPTIONS: Array<{ id: GiftCardParticleType; label: string }> = [
  { id: 'crescent_lantern', label: 'Crescent & Lanterns (ঈদ)' },
  { id: 'coins', label: 'Golden Salami Coins (সালামি)' },
  { id: 'alpana_marigold', label: 'Alpana & Marigold (বৈশাখ)' },
  { id: 'doves_palash', label: 'Doves & Palash (একুশে)' },
  { id: 'flag_fireworks', label: 'Red-Green Fireworks (বিজয়)' },
  { id: 'sunbeams', label: 'Golden Sunbeams (৭ই মার্চ)' },
  { id: 'roses_hearts', label: 'Roses & Hearts (ভালোবাসা)' },
  { id: 'fairy_tea', label: 'Warm Lights & Adda (বন্ধু)' },
  { id: 'royal_mandala', label: 'Royal Mandala (শুভেচ্ছা)' },
  { id: 'festive_confetti', label: 'Festive Confetti (উৎসব)' },
];

const GRADIENT_OPTIONS: Array<{ id: string; label: string; gradientBg: string; accentHex: string }> = [
  { id: 'emerald_gold', label: 'Emerald Gold', gradientBg: 'from-emerald-950 via-teal-900 to-amber-800', accentHex: '#F59E0B' },
  { id: 'boishakh_red', label: 'Boishakh Crimson', gradientBg: 'from-rose-800 via-red-700 to-amber-600', accentHex: '#DC2626' },
  { id: 'royal_indigo', label: 'Royal Indigo', gradientBg: 'from-indigo-950 via-violet-800 to-amber-700', accentHex: '#6366F1' },
  { id: 'valentine_rose', label: 'Rose Pink', gradientBg: 'from-rose-900 via-pink-800 to-red-800', accentHex: '#F43F5E' },
  { id: 'heritage_obsidian', label: 'Heritage Slate', gradientBg: 'from-zinc-950 via-neutral-900 to-red-950', accentHex: '#EF4444' },
  { id: 'padma_teal', label: 'Padma Teal', gradientBg: 'from-teal-950 via-cyan-900 to-emerald-800', accentHex: '#14B8A6' },
];

async function compressCardArtworkFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 720;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas compression context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (dataUrl.length > 620000) {
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportGiftCardAccountingToCsv(
  giftTxs: AcashTransaction[],
  customCards: CustomGiftCardRecord[]
): void {
  const header = [
    'Tx ID',
    'Tx Hash',
    'Timestamp',
    'Sender ID',
    'Sender KYC Name',
    'Card Signature Name',
    'Receiver ID',
    'Receiver Name',
    'Card ID',
    'Card Title (BN)',
    'Card Title (EN)',
    'Gift Amount (BDT)',
    'Card Fee Collected (BDT)',
    'Govt VAT Share (BDT)',
    'Admin Revenue Share (BDT)',
    'Unbox Status',
    'Letter / Chithi',
  ];

  const body = giftTxs.map((tx) => {
    const tpl = getGiftCardTemplate(tx.giftCard?.cardId, customCards);
    const statusLabel = tx.giftCard?.openedAt
      ? 'Opened'
      : tx.giftCard?.skippedAt
        ? 'Skipped'
        : 'Pending Unbox';
    const fee = tx.fee > 0 ? tx.fee : GIFT_CARD_FEE_BDT;
    const vat = tx.feeBreakdown?.govtAmount ?? Number((fee * 0.15).toFixed(2));
    const adm = tx.feeBreakdown?.adminAmount ?? Number((fee - vat).toFixed(2));
    return [
      tx.txId,
      tx.txHash,
      new Date(tx.createdAt).toISOString(),
      tx.senderId,
      tx.senderName,
      tx.giftCard?.senderDisplayName || tx.senderName,
      tx.receiverId,
      tx.receiverName,
      tx.giftCard?.cardId || '',
      tpl.titleBn,
      tpl.titleEn,
      tx.amount.toFixed(2),
      fee.toFixed(2),
      vat.toFixed(2),
      adm.toFixed(2),
      statusLabel,
      tx.giftCard?.message || '',
    ];
  });

  const csvContent = '\uFEFF' + [header, ...body].map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `acash-giftcard-accounting-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const AdminSocialEngagementPanel: React.FC<AdminSocialEngagementPanelProps> = ({
  lang,
  adminEmail,
  transactions,
  customGiftCards,
  portalTheme,
  onInspectAccount,
  onFeedback,
}) => {
  const [subTab, setSubTab] = useState<SocialSubTab>('accounting');
  const [cardLedgerSearch, setCardLedgerSearch] = useState('');
  const [cardStatusFilter, setCardStatusFilter] = useState<'ALL' | 'OPENED' | 'PENDING' | 'SKIPPED'>('ALL');

  // Card Upload Studio state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [titleBn, setTitleBn] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [subtitleBn, setSubtitleBn] = useState('');
  const [subtitleEn, setSubtitleEn] = useState('');
  const [themeCategory, setThemeCategory] = useState<GiftCardThemeCategory>('celebration');
  const [particleType, setParticleType] = useState<GiftCardParticleType>('festive_confetti');
  const [gradientOptionId, setGradientOptionId] = useState<string>(GRADIENT_OPTIONS[0].id);
  const [imageUrl, setImageUrl] = useState('');
  const [defaultMessageBn, setDefaultMessageBn] = useState('');
  const [defaultMessageEn, setDefaultMessageEn] = useState('');
  const [cardFeatured, setCardFeatured] = useState(true);
  const [cardActive, setCardActive] = useState(true);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Account Portal Theme Controller state
  const [draftPresetId, setDraftPresetId] = useState<PortalThemePresetId>(portalTheme.presetId);
  const [draftSurface, setDraftSurface] = useState<PortalThemeSurfacePreference>(
    portalTheme.surfacePreference
  );
  const [draftBannerEnabled, setDraftBannerEnabled] = useState<boolean>(portalTheme.bannerEnabled);
  const [draftBannerBn, setDraftBannerBn] = useState<string>(portalTheme.customBannerBn || '');
  const [draftBannerEn, setDraftBannerEn] = useState<string>(portalTheme.customBannerEn || '');
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState('');

  const selectedGradient =
    GRADIENT_OPTIONS.find((g) => g.id === gradientOptionId) || GRADIENT_OPTIONS[0];

  const draftPreviewTemplate: GiftCardTemplate = useMemo(
    () => ({
      id: editingCardId || 'preview_card',
      titleBn: titleBn.trim() || (lang === 'bn' ? 'নতুন উৎসব কার্ড' : 'New Festive Card'),
      titleEn: titleEn.trim() || 'New Cultural Card',
      subtitleBn: subtitleBn.trim() || 'বিশেষ সাংস্কৃতিক উপহার',
      subtitleEn: subtitleEn.trim() || 'Special Cultural Gift',
      themeCategory,
      imageUrl: imageUrl.trim() || undefined,
      gradientBg: selectedGradient.gradientBg,
      accentHex: selectedGradient.accentHex,
      particleType,
      defaultMessageBn:
        defaultMessageBn.trim() || 'আন্তরিক শুভেচ্ছা ও ভালোবাসা রইল আপনার জন্য।',
      defaultMessageEn:
        defaultMessageEn.trim() || 'Warm festive greetings and joy from Acash.',
      featured: cardFeatured,
      isCustomUploaded: true,
      active: cardActive,
    }),
    [
      editingCardId,
      titleBn,
      titleEn,
      subtitleBn,
      subtitleEn,
      themeCategory,
      imageUrl,
      selectedGradient,
      particleType,
      defaultMessageBn,
      defaultMessageEn,
      cardFeatured,
      cardActive,
      lang,
    ]
  );

  // Accounting computations across all gift card transactions
  const giftTransactions = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === 'send_money' && Boolean(tx.giftCard?.cardId))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [transactions]);

  const accounting = useMemo(() => {
    let totalAmount = 0;
    let totalFee = 0;
    let govtVat = 0;
    let adminRevenue = 0;
    let openedCount = 0;
    let skippedCount = 0;
    let pendingCount = 0;

    const perCardMap = new Map<
      string,
      {
        cardId: string;
        count: number;
        opened: number;
        skipped: number;
        pending: number;
        totalVolume: number;
        totalFee: number;
      }
    >();

    for (const tx of giftTransactions) {
      totalAmount += tx.amount;
      const fee = tx.fee > 0 ? tx.fee : GIFT_CARD_FEE_BDT;
      totalFee += fee;
      const vat = tx.feeBreakdown?.govtAmount ?? Number((fee * 0.15).toFixed(2));
      const adm = tx.feeBreakdown?.adminAmount ?? Number((fee - vat).toFixed(2));
      govtVat += vat;
      adminRevenue += adm;

      const isOpened = Boolean(tx.giftCard?.openedAt);
      const isSkipped = !isOpened && Boolean(tx.giftCard?.skippedAt);
      if (isOpened) openedCount += 1;
      else if (isSkipped) skippedCount += 1;
      else pendingCount += 1;

      const cId = tx.giftCard?.cardId || 'eid_mubarak';
      const existing = perCardMap.get(cId) || {
        cardId: cId,
        count: 0,
        opened: 0,
        skipped: 0,
        pending: 0,
        totalVolume: 0,
        totalFee: 0,
      };
      existing.count += 1;
      if (isOpened) existing.opened += 1;
      else if (isSkipped) existing.skipped += 1;
      else existing.pending += 1;
      existing.totalVolume += tx.amount;
      existing.totalFee += fee;
      perCardMap.set(cId, existing);
    }

    const catalog = getAllGiftCardTemplates(customGiftCards);
    const catalogIds = new Set(catalog.map((c) => c.id));
    // Include inactive custom cards in accounting breakdown as well
    for (const c of customGiftCards) {
      if (!catalogIds.has(c.cardId)) {
        catalogIds.add(c.cardId);
      }
    }

    const perCardRows = Array.from(catalogIds).map((id) => {
      const tpl = getGiftCardTemplate(id, customGiftCards);
      const stats = perCardMap.get(id) || {
        cardId: id,
        count: 0,
        opened: 0,
        skipped: 0,
        pending: 0,
        totalVolume: 0,
        totalFee: 0,
      };
      return {
        template: tpl,
        ...stats,
      };
    });
    // Include any historical cardId not currently in catalog
    for (const [id, stats] of perCardMap.entries()) {
      if (!catalogIds.has(id)) {
        perCardRows.push({
          template: getGiftCardTemplate(id, customGiftCards),
          ...stats,
        });
      }
    }
    perCardRows.sort((a, b) => b.count - a.count || b.totalVolume - a.totalVolume);

    const openRate =
      giftTransactions.length > 0
        ? Math.round((openedCount / giftTransactions.length) * 100)
        : 0;

    return {
      totalCount: giftTransactions.length,
      totalAmount,
      totalFee,
      govtVat: Number(govtVat.toFixed(2)),
      adminRevenue: Number(adminRevenue.toFixed(2)),
      openedCount,
      skippedCount,
      pendingCount,
      openRate,
      perCardRows,
    };
  }, [giftTransactions, customGiftCards]);

  const filteredGiftTransactions = useMemo(() => {
    const q = cardLedgerSearch.trim().toLowerCase();
    return giftTransactions.filter((tx) => {
      const isOpened = Boolean(tx.giftCard?.openedAt);
      const isSkipped = !isOpened && Boolean(tx.giftCard?.skippedAt);
      if (cardStatusFilter === 'OPENED' && !isOpened) return false;
      if (cardStatusFilter === 'SKIPPED' && !isSkipped) return false;
      if (cardStatusFilter === 'PENDING' && (isOpened || isSkipped)) return false;

      if (!q) return true;
      const tpl = getGiftCardTemplate(tx.giftCard?.cardId, customGiftCards);
      return (
        tx.txHash.toLowerCase().includes(q) ||
        tx.senderId.toLowerCase().includes(q) ||
        tx.senderName.toLowerCase().includes(q) ||
        tx.receiverId.toLowerCase().includes(q) ||
        tx.receiverName.toLowerCase().includes(q) ||
        tpl.titleBn.toLowerCase().includes(q) ||
        tpl.titleEn.toLowerCase().includes(q) ||
        (tx.giftCard?.message || '').toLowerCase().includes(q)
      );
    });
  }, [giftTransactions, cardLedgerSearch, cardStatusFilter, customGiftCards]);

  const activeDraftPreset = getPortalThemeDefinition(draftPresetId);
  const currentlyLivePreset = getPortalThemeDefinition(portalTheme.presetId);

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCardError('');
    try {
      const compressed = await compressCardArtworkFile(file);
      setImageUrl(compressed);
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Failed to process image file.');
    }
  };

  const resetCardForm = () => {
    setEditingCardId(null);
    setTitleBn('');
    setTitleEn('');
    setSubtitleBn('');
    setSubtitleEn('');
    setThemeCategory('celebration');
    setParticleType('festive_confetti');
    setGradientOptionId(GRADIENT_OPTIONS[0].id);
    setImageUrl('');
    setDefaultMessageBn('');
    setDefaultMessageEn('');
    setCardFeatured(true);
    setCardActive(true);
    setCardError('');
  };

  const handleSaveGiftCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError('');
    if (!titleBn.trim() || !titleEn.trim()) {
      setCardError(
        lang === 'bn'
          ? 'বাংলা এবং ইংরেজি উভয় শিরোনাম আবশ্যক।'
          : 'Both Bangla and English card titles are required.'
      );
      return;
    }
    if (!imageUrl.trim()) {
      setCardError(
        lang === 'bn'
          ? 'অনুগ্রহ করে ডিভাইস থেকে একটি কার্ড ছবি আপলোড করুন অথবা ছবির URL দিন।'
          : 'Please upload a card image from your device or paste an image URL.'
      );
      return;
    }
    setCardSaving(true);
    try {
      const saved = await adminSaveCustomGiftCard({
        cardId: editingCardId || undefined,
        titleBn,
        titleEn,
        subtitleBn,
        subtitleEn,
        themeCategory,
        imageUrl,
        gradientBg: selectedGradient.gradientBg,
        accentHex: selectedGradient.accentHex,
        particleType,
        defaultMessageBn,
        defaultMessageEn,
        featured: cardFeatured,
        active: cardActive,
        adminEmail,
      });
      onFeedback(
        lang === 'bn'
          ? `কার্ড "${saved.titleBn}" সফলভাবে যুক্ত ও লাইভ করা হয়েছে!`
          : `Cultural card "${saved.titleEn}" published live to Send Money!`
      );
      resetCardForm();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Failed to save custom gift card.');
    } finally {
      setCardSaving(false);
    }
  };

  const handleSavePortalTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setThemeError('');
    setThemeSaving(true);
    try {
      const saved = await adminUpdatePortalThemeConfig({
        presetId: draftPresetId,
        bannerEnabled: draftBannerEnabled,
        customBannerBn: draftBannerBn,
        customBannerEn: draftBannerEn,
        surfacePreference: draftSurface,
        adminEmail,
      });
      const def = getPortalThemeDefinition(saved.presetId);
      onFeedback(
        lang === 'bn'
          ? `অ্যাকাউন্ট পোর্টাল থিম "${def.nameBn}" লাইভ আপডেট হয়েছে!`
          : `Account Portal theme "${def.nameEn}" is now live across Customer, Agent & Merchant portals!`
      );
    } catch (err) {
      setThemeError(err instanceof Error ? err.message : 'Failed to update portal theme.');
    } finally {
      setThemeSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Sub-Navigation Tabs */}
      <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'সোশ্যাল এনগেজমেন্ট ম্যানেজমেন্ট'
                  : 'Social Engagement Management'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'গিফট কার্ডের সম্পূর্ণ হিসাব, নতুন সাংস্কৃতিক কার্ড আপলোড ও অ্যাকাউন্ট পোর্টালের লাইভ থিম নিয়ন্ত্রণ'
                  : 'Gift Card accounting ledger · Custom cultural card studio · Live Account Portal theming'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: currentlyLivePreset.swatchPrimary }}
              />
              <span>
                {lang === 'bn' ? 'লাইভ থিম:' : 'Live Theme:'}{' '}
                <strong className="text-slate-900 dark:text-white">
                  {lang === 'bn' ? currentlyLivePreset.nameBn : currentlyLivePreset.nameEn}
                </strong>
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => setSubTab('accounting')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'accounting'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>
              {lang === 'bn'
                ? `গিফট কার্ড হিসাব (${accounting.totalCount})`
                : `Gift Card Accounting (${accounting.totalCount})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('upload_cards')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'upload_cards'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
            }`}
          >
            <ImagePlus className="w-4 h-4" />
            <span>
              {lang === 'bn'
                ? `নতুন কার্ড আপলোড (${customGiftCards.length})`
                : `New Card Upload (${customGiftCards.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('portal_theme')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'portal_theme'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>
              {lang === 'bn'
                ? 'অ্যাকাউন্ট পোর্টাল থিম'
                : 'Account Portal Theme'}
            </span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TAB 1: GIFT CARD ACCOUNTING (গিফট কার্ডের হিসাব)                 */}
      {/* ================================================================== */}
      {subTab === 'accounting' && (
        <div className="space-y-6">
          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'মোট প্রেরিত গিফট কার্ড' : 'Total Gift Cards Sent'}
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white mt-1.5">
                {accounting.totalCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono-tabular">
                {accounting.openedCount} Opened · {accounting.pendingCount} Pending · {accounting.skippedCount} Skipped
              </div>
            </div>

            <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'গিফট কার্ডের মাধ্যমে প্রেরিত অর্থ' : 'Total Gift Money Volume'}
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1.5">
                {formatBdt(accounting.totalAmount, lang)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                {lang === 'bn' ? '১০০% প্রেরক-বহনযোগ্য গিফট ফি' : 'Receiver gets 100% of gift principal'}
              </div>
            </div>

            <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'মোট ৳২ কার্ড ফি আদায়' : 'Total ৳2 Card Fees Collected'}
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                {formatBdt(accounting.totalFee, lang)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono-tabular">
                Admin ৳{accounting.adminRevenue.toFixed(2)} · Govt VAT ৳{accounting.govtVat.toFixed(2)}
              </div>
            </div>

            <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'প্রাপকের কার্ড খোলার হার' : 'Receiver Unbox Rate'}
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1.5">
                {accounting.openRate}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                {lang === 'bn'
                  ? `${accounting.openedCount} টি কার্ড উৎসব অ্যানিমেশনে খোলা হয়েছে`
                  : `${accounting.openedCount} cards unboxed with celebration`}
              </div>
            </div>
          </div>

          {/* Per-Card Revenue & Usage Breakdown */}
          <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'কার্ডভিত্তিক ব্যবহার ও আয় বিবরণী'
                    : 'Per-Card Usage & Fee Accounting'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'প্রতিটি সাংস্কৃতিক ও আপলোডকৃত কার্ডের মোট ব্যবহার, ভলিউম এবং ৳২ চার্জ হিসাব'
                    : 'Breakdown across built-in Bengali heritage & admin-uploaded cultural cards'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportGiftCardAccountingToCsv(giftTransactions, customGiftCards)}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'হিসাব CSV ডাউনলোড' : 'Export Accounting CSV'}</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#0B0D14] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Card</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-right">Sent</th>
                    <th className="py-3 px-3 text-right">Opened</th>
                    <th className="py-3 px-3 text-right">Pending / Skipped</th>
                    <th className="py-3 px-3 text-right">Principal Volume</th>
                    <th className="py-3 px-4 text-right">৳2 Fee Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accounting.perCardRows.map((row) => (
                    <tr
                      key={row.template.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <GiftCardArtFrame
                            template={row.template}
                            lang={lang}
                            compact
                            className="w-10 h-12 rounded-lg shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {row.template.titleBn}
                              {row.template.isCustomUploaded && (
                                <span className="ml-1.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                  · Custom
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {row.template.titleEn}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 capitalize text-slate-600 dark:text-slate-300">
                        {row.template.themeCategory}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-bold text-slate-900 dark:text-white">
                        {row.count}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-emerald-600 dark:text-emerald-400 font-semibold">
                        {row.opened}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-slate-500 dark:text-slate-400">
                        {row.pending} / {row.skipped}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatBdt(row.totalVolume, lang)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400">
                        {formatBdt(row.totalFee, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gift Card Transaction Ledger */}
          <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'সাম্প্রতিক গিফট কার্ড লেনদেন' : 'Gift Card Transaction Ledger'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'প্রেরক, প্রাপক, চিঠির বার্তা ও কার্ড খোলার লাইভ অবস্থা'
                    : 'Live record of every Gift Card transfer, chithi letter, and unbox status'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={cardLedgerSearch}
                  onChange={(e) => setCardLedgerSearch(e.target.value)}
                  placeholder={lang === 'bn' ? 'হ্যাশ, নাম বা কার্ড খুঁজুন...' : 'Search hash, ID, card...'}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
                {(['ALL', 'OPENED', 'PENDING', 'SKIPPED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCardStatusFilter(f)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      cardStatusFilter === f
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f === 'ALL'
                      ? 'All'
                      : f === 'OPENED'
                        ? 'Opened'
                        : f === 'PENDING'
                          ? 'Pending'
                          : 'Skipped'}
                  </button>
                ))}
              </div>
            </div>

            {filteredGiftTransactions.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'এই ফিল্টারে কোনো গিফট কার্ড লেনদেন পাওয়া যায়নি।'
                  : 'No Gift Card transactions match your current filter.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
                {filteredGiftTransactions.map((tx) => {
                  const tpl = getGiftCardTemplate(tx.giftCard?.cardId, customGiftCards);
                  const isOpened = Boolean(tx.giftCard?.openedAt);
                  const isSkipped = !isOpened && Boolean(tx.giftCard?.skippedAt);
                  return (
                    <div
                      key={tx.txId}
                      className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/35 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <GiftCardArtFrame
                          template={tpl}
                          lang={lang}
                          compact
                          className="w-11 h-14 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {tpl.titleBn} ({tpl.titleEn})
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                isOpened
                                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                                  : isSkipped
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                    : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                              }`}
                            >
                              {isOpened ? 'Opened' : isSkipped ? 'Skipped' : 'Pending Unbox'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            <strong className="text-slate-900 dark:text-white">{tx.senderName}</strong> ({tx.senderId})
                            {' → '}
                            <strong className="text-slate-900 dark:text-white">{tx.receiverName}</strong> ({tx.receiverId})
                          </div>
                          {tx.giftCard?.message && (
                            <p className="text-[11px] italic text-slate-500 dark:text-slate-400 line-clamp-1">
                              “{tx.giftCard.message}”
                            </p>
                          )}
                          <div className="text-[10px] font-mono-tabular text-slate-400">
                            {tx.txHash} · {new Date(tx.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white">
                            {formatBdt(tx.amount, lang)}
                          </div>
                          <div className="font-mono-tabular text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                            Fee: ৳{(tx.fee > 0 ? tx.fee : GIFT_CARD_FEE_BDT).toFixed(2)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onInspectAccount(tx.senderId)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{lang === 'bn' ? 'প্রেরক দেখুন' : 'Inspect'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: NEW CARD UPLOAD STUDIO & LIBRARY (নতুন কার্ড আপলোড)        */}
      {/* ================================================================== */}
      {subTab === 'upload_cards' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Upload Form */}
            <form
              onSubmit={handleSaveGiftCard}
              className="xl:col-span-8 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {editingCardId
                      ? lang === 'bn'
                        ? 'আপলোডকৃত কার্ড এডিট করুন'
                        : 'Edit Custom Cultural Card'
                      : lang === 'bn'
                        ? 'নতুন উৎসব / সাংস্কৃতিক কার্ড আপলোড'
                        : 'Upload New Cultural Gift Card'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'আপলোড করার সাথে সাথেই কাস্টমারদের সেন্ড মানি কার্ড গ্যালারিতে লাইভ হয়ে যাবে (ফ্ল্যাট চার্জ ৳২)।'
                      : 'Published cards appear immediately inside Customer Send Money carousel with ৳2 flat charge.'}
                  </p>
                </div>
                {editingCardId && (
                  <button
                    type="button"
                    onClick={resetCardForm}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'নতুন কার্ড' : 'New Card'}</span>
                  </button>
                )}
              </div>

              {/* Artwork Upload Box */}
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {lang === 'bn' ? 'কার্ড আর্টওয়ার্ক ছবি আপলোড (ডিভাইস থেকে)' : 'Card Artwork Upload (From Device)'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {lang === 'bn'
                        ? 'স্বয়ংক্রিয়ভাবে অপ্টিমাইজ ও কম্প্রেস হবে (৩:৪ পোর্ট্রেট অনুপাত সবচেয়ে ভালো)'
                        : 'Auto-compressed for fast delivery (3:4 portrait artwork recommended)'}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'ছবি নির্বাচন করুন' : 'Upload Image'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {lang === 'bn' ? 'অথবা সরাসরি ছবির URL দিন' : 'Or paste direct Image URL'}
                  </label>
                  <input
                    type="text"
                    value={imageUrl.startsWith('data:') ? '' : imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder={
                      imageUrl.startsWith('data:')
                        ? 'Compressed image uploaded from device ✓'
                        : 'https://example.com/eid-card.jpg'
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'বাংলা শিরোনাম *' : 'Card Title (Bangla) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={titleBn}
                    onChange={(e) => setTitleBn(e.target.value)}
                    placeholder="যেমন: শুভ মহালয়া / বসন্ত উৎসব"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'ইংরেজি শিরোনাম *' : 'Card Title (English) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="e.g. Bosonto Utshob"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'বাংলা সাবটাইটেল' : 'Subtitle (Bangla)'}
                  </label>
                  <input
                    type="text"
                    value={subtitleBn}
                    onChange={(e) => setSubtitleBn(e.target.value)}
                    placeholder="ফাগুনের রঙিন শুভেচ্ছা"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'ইংরেজি সাবটাইটেল' : 'Subtitle (English)'}
                  </label>
                  <input
                    type="text"
                    value={subtitleEn}
                    onChange={(e) => setSubtitleEn(e.target.value)}
                    placeholder="Spring Festival Joy"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                  </label>
                  <select
                    value={themeCategory}
                    onChange={(e) => setThemeCategory(e.target.value as GiftCardThemeCategory)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    {CARD_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {lang === 'bn' ? c.labelBn : c.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'উৎসব অ্যানিমেশন' : 'Animation Effect'}
                  </label>
                  <select
                    value={particleType}
                    onChange={(e) => setParticleType(e.target.value as GiftCardParticleType)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    {PARTICLE_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'ফ্রেম গ্রেডিয়েন্ট' : 'Frame Backdrop'}
                  </label>
                  <select
                    value={gradientOptionId}
                    onChange={(e) => setGradientOptionId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    {GRADIENT_OPTIONS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {lang === 'bn' ? 'ডিফল্ট বাংলা চিঠি (সর্বোচ্চ ৫০ শব্দ)' : 'Default Bangla Chithi (<= 50 words)'}
                    </label>
                    <span className="font-mono-tabular text-[10px] text-slate-400">
                      {countWords(defaultMessageBn)} / {GIFT_CARD_MAX_WORDS}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={defaultMessageBn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDefaultMessageBn(
                        countWords(val) > GIFT_CARD_MAX_WORDS
                          ? clampToMaxWords(val, GIFT_CARD_MAX_WORDS)
                          : val
                      );
                    }}
                    placeholder="উৎসবের আনন্দ ও ভালোবাসায় ভরে উঠুক আপনার প্রতিটি দিন..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {lang === 'bn' ? 'ডিফল্ট ইংরেজি চিঠি (সর্বোচ্চ ৫০ শব্দ)' : 'Default English Chithi (<= 50 words)'}
                    </label>
                    <span className="font-mono-tabular text-[10px] text-slate-400">
                      {countWords(defaultMessageEn)} / {GIFT_CARD_MAX_WORDS}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={defaultMessageEn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDefaultMessageEn(
                        countWords(val) > GIFT_CARD_MAX_WORDS
                          ? clampToMaxWords(val, GIFT_CARD_MAX_WORDS)
                          : val
                      );
                    }}
                    placeholder="Wishing you radiant celebrations, peace, and prosperity!"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cardFeatured}
                    onChange={(e) => setCardFeatured(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{lang === 'bn' ? 'ফিচার্ড কার্ড হিসেবে দেখান' : 'Featured in Carousel'}</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cardActive}
                    onChange={(e) => setCardActive(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{lang === 'bn' ? 'গ্রাহকদের জন্য সক্রিয় রাখুন' : 'Active for Customers'}</span>
                </label>
              </div>

              {cardError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  {cardError}
                </div>
              )}

              <button
                type="submit"
                disabled={cardSaving}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {cardSaving
                    ? lang === 'bn'
                      ? 'প্রকাশ হচ্ছে...'
                      : 'Publishing...'
                    : editingCardId
                      ? lang === 'bn'
                        ? 'কার্ড আপডেট করুন'
                        : 'Save Card Changes'
                      : lang === 'bn'
                        ? 'নতুন কার্ড লাইভ প্রকাশ করুন'
                        : 'Publish New Gift Card Live'}
                </span>
              </button>
            </form>

            {/* Live Card Preview */}
            <div className="xl:col-span-4 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'লাইভ কার্ড প্রিভিউ' : 'Live Card Preview'}
                </h3>
                <span className="text-[11px] font-mono-tabular text-rose-600 dark:text-rose-400 font-semibold">
                  ৳{GIFT_CARD_FEE_BDT} Flat Fee
                </span>
              </div>

              <div className="max-w-[230px] mx-auto">
                <GiftCardArtFrame
                  template={draftPreviewTemplate}
                  lang={lang}
                  className="aspect-[3/4] w-full rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg"
                />
              </div>

              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {draftPreviewTemplate.titleBn} · {draftPreviewTemplate.titleEn}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                  “{lang === 'bn' ? draftPreviewTemplate.defaultMessageBn : draftPreviewTemplate.defaultMessageEn}”
                </p>
              </div>
            </div>
          </div>

          {/* Custom Uploaded Cards Library */}
          <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? `অ্যাডমিন আপলোডকৃত কার্ডসমূহ (${customGiftCards.length})`
                  : `Admin Uploaded Gift Cards (${customGiftCards.length})`}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'এখান থেকে আপলোডকৃত কার্ড চালু/বন্ধ, এডিট বা মুছে ফেলতে পারবেন'
                  : 'Toggle customer visibility, feature status, edit, or delete custom uploaded cards'}
              </p>
            </div>

            {customGiftCards.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'এখনো কোনো কাস্টম কার্ড আপলোড করা হয়নি। উপরের ফর্ম থেকে নতুন উৎসব কার্ড যুক্ত করুন!'
                  : 'No custom cards uploaded yet. Use the form above to upload your first cultural card.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5 sm:p-6">
                {customGiftCards.map((rec) => {
                  const tpl: GiftCardTemplate = {
                    id: rec.cardId,
                    titleBn: rec.titleBn,
                    titleEn: rec.titleEn,
                    subtitleBn: rec.subtitleBn,
                    subtitleEn: rec.subtitleEn,
                    themeCategory: rec.themeCategory,
                    imageUrl: rec.imageUrl,
                    gradientBg: rec.gradientBg,
                    accentHex: rec.accentHex,
                    particleType: rec.particleType,
                    defaultMessageBn: rec.defaultMessageBn,
                    defaultMessageEn: rec.defaultMessageEn,
                    featured: rec.featured,
                    isCustomUploaded: true,
                    active: rec.active,
                  };
                  return (
                    <div
                      key={rec.cardId}
                      className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 flex gap-3.5 items-start"
                    >
                      <GiftCardArtFrame
                        template={tpl}
                        lang={lang}
                        compact
                        className="w-20 aspect-[3/4] rounded-xl shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {rec.titleBn}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {rec.titleEn} · {rec.themeCategory}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-md border ${
                              rec.active
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {rec.active ? 'Live Active' : 'Hidden'}
                          </span>
                          {rec.featured && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300">
                              Featured
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await adminToggleCustomGiftCardStatus(
                                rec.cardId,
                                { active: !rec.active },
                                adminEmail
                              );
                              onFeedback(
                                `${rec.titleEn} is now ${!rec.active ? 'Live Active' : 'Hidden'}.`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1"
                          >
                            {rec.active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{rec.active ? 'Hide' : 'Show'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await adminToggleCustomGiftCardStatus(
                                rec.cardId,
                                { featured: !rec.featured },
                                adminEmail
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-amber-400 inline-flex items-center gap-1"
                          >
                            <Star className={`w-3 h-3 ${rec.featured ? 'text-amber-500 fill-amber-500' : ''}`} />
                            <span>{rec.featured ? 'Unstar' : 'Star'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCardId(rec.cardId);
                              setTitleBn(rec.titleBn);
                              setTitleEn(rec.titleEn);
                              setSubtitleBn(rec.subtitleBn);
                              setSubtitleEn(rec.subtitleEn);
                              setThemeCategory(rec.themeCategory);
                              setParticleType(rec.particleType);
                              setImageUrl(rec.imageUrl);
                              setDefaultMessageBn(rec.defaultMessageBn);
                              setDefaultMessageEn(rec.defaultMessageEn);
                              setCardFeatured(rec.featured);
                              setCardActive(rec.active);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await adminDeleteCustomGiftCard(rec.cardId, adminEmail);
                              onFeedback(`Deleted custom card "${rec.titleEn}".`);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                            title="Delete Card"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3: ACCOUNT PORTAL LIVE THEME CONTROLLER                        */}
      {/* ================================================================== */}
      {subTab === 'portal_theme' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSavePortalTheme}
            className="xl:col-span-8 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6 shadow-sm"
          >
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'অ্যাকাউন্ট পোর্টাল থিম পরিবর্তন (Customer, Agent & Merchant)'
                  : 'Account Portal Theme Controller (Live Sync)'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'bn'
                  ? 'এখান থেকে থিম নির্বাচন করলে রিফ্রেশ ছাড়াই সব ইউজার, এজেন্ট ও মার্চেন্ট অ্যাকাউন্ট পোর্টালের রঙ, ৩ডি কার্ড ও বাটন পরিবর্তন হয়ে যাবে।'
                  : 'Changes apply instantaneously across Customer, Agent, and Merchant Web & Mobile portals without refresh.'}
              </p>
            </div>

            {/* 6 Curated Theme Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PORTAL_THEME_PRESETS.map((preset) => {
                const selected = draftPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDraftPresetId(preset.id)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start justify-between gap-3 ${
                      selected
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D14] hover:border-slate-400'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-md border border-white/20 shadow-xs shrink-0"
                          style={{ backgroundColor: preset.swatchPrimary }}
                        />
                        <span
                          className="w-4 h-4 rounded-md border border-white/20 shadow-xs shrink-0"
                          style={{ backgroundColor: preset.swatchSecondary }}
                        />
                        <span className="font-display text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {lang === 'bn' ? preset.nameBn : preset.nameEn}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lang === 'bn' ? preset.subtitleBn : preset.subtitleEn}
                      </p>
                    </div>
                    {selected && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Surface Mode Preference */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'অ্যাকাউন্ট পোর্টাল ব্রাইটনেস মোড' : 'Portal Surface Brightness Policy'}
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'user_choice', labelBn: 'ইউজার পছন্দমতো', labelEn: 'User Choice' },
                    { id: 'light', labelBn: 'ফোর্স লাইট মোড', labelEn: 'Force Light' },
                    { id: 'dark', labelBn: 'ফোর্স ডার্ক মোড', labelEn: 'Force Dark' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraftSurface(opt.id)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                      draftSurface === opt.id
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lang === 'bn' ? opt.labelBn : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Cultural Ribbon Announcement */}
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {lang === 'bn' ? 'উৎসব লাইভ রিবন ব্যানার' : 'Live Festival Announcement Ribbon'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {lang === 'bn'
                        ? 'সক্রিয় করলে সকল অ্যাকাউন্ট পোর্টালের উপরে উৎসবের বিশেষ বার্তা দেখা যাবে'
                        : 'Displayed at the top of Customer, Agent & Merchant portals'}
                    </div>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftBannerEnabled}
                    onChange={(e) => setDraftBannerEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{draftBannerEnabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              {draftBannerEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <input
                    type="text"
                    maxLength={140}
                    value={draftBannerBn}
                    onChange={(e) => setDraftBannerBn(e.target.value)}
                    placeholder="বাংলা উৎসব বার্তা (যেমন: ঈদ সালামি পাঠান মাত্র ৳২ চার্জে!)"
                    className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    maxLength={140}
                    value={draftBannerEn}
                    onChange={(e) => setDraftBannerEn(e.target.value)}
                    placeholder="English Festival Ribbon (e.g. Send Eid Salami Cards for ৳2!)"
                    className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            {themeError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {themeError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={themeSaving}
                className="flex-1 min-w-[200px] py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {themeSaving
                    ? lang === 'bn'
                      ? 'প্রয়োগ হচ্ছে...'
                      : 'Applying Live...'
                    : lang === 'bn'
                      ? 'সব অ্যাকাউন্ট পোর্টালে থিম লাইভ করুন'
                      : 'Apply Theme Live to All Portals'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftPresetId('classic_indigo');
                  setDraftSurface('user_choice');
                  setDraftBannerEnabled(false);
                }}
                className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-slate-400 whitespace-nowrap"
              >
                {lang === 'bn' ? 'ডিফল্ট রিসেট' : 'Reset Draft'}
              </button>
            </div>
          </form>

          {/* Interactive Live Theme Mini-Preview */}
          <div className="xl:col-span-4 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'bn' ? 'অ্যাকাউন্ট পোর্টাল প্রিভিউ' : 'Live Account Portal Preview'}
            </h3>

            {draftBannerEnabled && (
              <div
                className={`rounded-xl bg-gradient-to-r ${activeDraftPreset.bannerGradientClass} px-3.5 py-2 text-[11px] font-semibold text-white text-center shadow-xs`}
              >
                {lang === 'bn'
                  ? draftBannerBn || 'উৎসবের বিশেষ গিফট কার্ড পাঠান মাত্র ৳২ চার্জে!'
                  : draftBannerEn || 'Celebrate together with Bengali Cultural Gift Cards!'}
              </div>
            )}

            {/* Simulated 3D Wallet Card */}
            <div
              className={`rounded-2xl bg-gradient-to-br ${activeDraftPreset.customerCardGradient} p-5 text-white shadow-lg border border-white/10 space-y-4`}
            >
              <div className="flex items-center justify-between text-[11px] text-white/75">
                <span className="font-mono-tabular uppercase tracking-wider">Acash Wallet 3D</span>
                <span className="font-mono-tabular font-semibold">U-100001</span>
              </div>
              <div>
                <div className="text-[11px] text-white/70">Available Balance</div>
                <div className="font-mono-tabular text-2xl font-bold mt-0.5">৳ 24,580.00</div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <div className={`py-1.5 rounded-lg text-center text-[10px] font-semibold border ${activeDraftPreset.activeTabClass}`}>
                  Send Money
                </div>
                <div className="py-1.5 rounded-lg bg-white/10 text-center text-[10px] font-semibold text-white/90">
                  Cash Out
                </div>
                <div className="py-1.5 rounded-lg bg-white/10 text-center text-[10px] font-semibold text-white/90">
                  Bill Pay
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className={`w-full py-2.5 rounded-xl text-center text-xs font-semibold text-white shadow-sm ${activeDraftPreset.primaryButtonClass}`}>
                {lang === 'bn' ? 'প্রাথমিক অ্যাকশন বাটন' : 'Primary Action CTA'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'সর্বশেষ আপডেট:' : 'Last Updated:'}{' '}
                <strong className="text-slate-700 dark:text-slate-200">{portalTheme.updatedBy}</strong>{' '}
                · {new Date(portalTheme.updatedAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
