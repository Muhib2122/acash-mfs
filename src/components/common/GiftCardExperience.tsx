import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  Clock,
  Eye,
  Feather,
  Gift,
  Heart,
  ImagePlus,
  MailOpen,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react';
import {
  AcashTransaction,
  CustomGiftCardRecord,
  GiftCardCatalogPolicy,
  GiftCardPayload,
  GiftCardThemeCategory,
  Language,
} from '../../types/acash';
import {
  GIFT_CARD_FEE_BDT,
  GIFT_CARD_MAX_WORDS,
  GiftCardTemplate,
  clampToMaxWords,
  countWords,
  formatGiftSignature,
  formatRemaining24h,
  getAllGiftCardTemplates,
  getGiftCardTemplate,
} from '../../lib/giftCards';
import { userSubmitCustomGiftCard } from '../../lib/acashService';
import { formatBdt } from '../../lib/i18n';

/* -------------------------------------------------------------------------- */
/*  Dynamic Festival Particle Backdrop (Compositor-Only Transforms & Opacity) */
/* -------------------------------------------------------------------------- */

const PARTICLE_PRESETS = [
  { x: 8, y: 12, d: 3.4, delay: 0.0, s: 1.0, rot: 14 },
  { x: 18, y: 78, d: 4.1, delay: 0.4, s: 0.85, rot: -18 },
  { x: 28, y: 24, d: 3.8, delay: 0.2, s: 1.15, rot: 22 },
  { x: 38, y: 84, d: 4.5, delay: 0.7, s: 0.9, rot: -12 },
  { x: 48, y: 14, d: 3.2, delay: 0.3, s: 1.05, rot: 16 },
  { x: 60, y: 80, d: 4.2, delay: 0.5, s: 0.95, rot: -20 },
  { x: 72, y: 20, d: 3.6, delay: 0.1, s: 1.2, rot: 12 },
  { x: 82, y: 72, d: 4.4, delay: 0.6, s: 0.88, rot: -24 },
  { x: 90, y: 30, d: 3.9, delay: 0.8, s: 1.1, rot: 19 },
  { x: 14, y: 48, d: 4.0, delay: 0.25, s: 0.92, rot: -15 },
  { x: 86, y: 52, d: 3.7, delay: 0.55, s: 1.08, rot: 25 },
  { x: 52, y: 90, d: 4.3, delay: 0.15, s: 0.96, rot: -10 },
];

const FestivalParticles: React.FC<{ category: GiftCardThemeCategory }> = ({ category }) => {
  const palette = useMemo(() => {
    switch (category) {
      case 'eid':
        return {
          symbols: ['☾', '✦', '✧', '✦'],
          colors: ['text-amber-300', 'text-emerald-300', 'text-yellow-200', 'text-teal-200'],
          glow: 'radial-gradient(circle at 50% 35%, rgba(16, 185, 129, 0.28), rgba(6, 78, 59, 0.08) 55%, transparent)',
        };
      case 'boishakh':
        return {
          symbols: ['✿', '❀', '✦', '❁'],
          colors: ['text-amber-300', 'text-rose-400', 'text-orange-300', 'text-yellow-200'],
          glow: 'radial-gradient(circle at 50% 35%, rgba(244, 63, 94, 0.26), rgba(245, 158, 11, 0.12) 55%, transparent)',
        };
      case 'heritage':
        return {
          symbols: ['🕊', '✦', '❀', '★'],
          colors: ['text-emerald-400', 'text-rose-400', 'text-white', 'text-amber-300'],
          glow: 'radial-gradient(circle at 50% 35%, rgba(22, 163, 74, 0.26), rgba(220, 38, 38, 0.14) 55%, transparent)',
        };
      case 'love':
        return {
          symbols: ['♥', '✿', '✦', '♡'],
          colors: ['text-rose-400', 'text-pink-300', 'text-red-300', 'text-amber-200'],
          glow: 'radial-gradient(circle at 50% 35%, rgba(244, 63, 94, 0.30), rgba(190, 24, 93, 0.1) 55%, transparent)',
        };
      default:
        return {
          symbols: ['✦', '✿', '✧', '★'],
          colors: ['text-amber-300', 'text-sky-300', 'text-indigo-300', 'text-emerald-300'],
          glow: 'radial-gradient(circle at 50% 35%, rgba(99, 102, 241, 0.28), rgba(245, 158, 11, 0.12) 55%, transparent)',
        };
    }
  }, [category]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: palette.glow }} />
      {PARTICLE_PRESETS.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute text-xl sm:text-2xl ${palette.colors[i % palette.colors.length]} drop-shadow-sm`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: [0.25, 0.95, 0.35],
            y: [0, -28, 0],
            rotate: [0, p.rot, 0],
            scale: [p.s * 0.85, p.s * 1.15, p.s * 0.85],
          }}
          transition={{
            duration: p.d,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        >
          {palette.symbols[i % palette.symbols.length]}
        </motion.span>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Reusable Card Thumbnail & Full Artwork Frame (Zero-Broken-Image Policy)   */
/* -------------------------------------------------------------------------- */

export const GiftCardArtFrame: React.FC<{
  template: GiftCardTemplate;
  lang: Language;
  compact?: boolean;
  className?: string;
}> = ({ template, lang, compact = false, className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [template.imageUrl]);

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${template.gradientBg} ${className}`}
    >
      {template.imageUrl && !imgFailed ? (
        <img
          src={template.imageUrl}
          alt={`${template.titleBn} · ${template.titleEn}`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-4">
          <Gift className="w-10 h-10 text-white/80" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2.5 sm:p-3 text-left">
        <div
          className={`font-display font-bold text-white leading-tight ${
            compact ? 'text-xs line-clamp-1' : 'text-base sm:text-lg'
          }`}
        >
          {template.titleBn}
        </div>
        <div
          className={`text-white/80 font-medium ${
            compact ? 'text-[10px] line-clamp-1' : 'text-xs mt-0.5'
          }`}
        >
          {lang === 'bn' ? template.subtitleBn : template.titleEn}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Send Money Gift Card Selector & 50-Word Letter / Chithi Editor            */
/* -------------------------------------------------------------------------- */

async function compressUserGiftCardImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 640;
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
        const primary = canvas.toDataURL('image/jpeg', 0.78);
        resolve(primary.length > 350000 ? canvas.toDataURL('image/jpeg', 0.62) : primary);
      };
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export interface GiftCardDraftState {
  enabled: boolean;
  cardId: string;
  customMessage: string;
  signaturePrefix: 'bn' | 'en';
  senderDisplayName: string;
}

interface GiftCardSelectorStripProps {
  lang: Language;
  senderKycName: string;
  currentUserAccountId?: string;
  draft: GiftCardDraftState;
  customCards?: CustomGiftCardRecord[];
  giftCardPolicy?: GiftCardCatalogPolicy;
  onChange: (next: GiftCardDraftState) => void;
}

export const GiftCardSelectorStrip: React.FC<GiftCardSelectorStripProps> = ({
  lang,
  senderKycName,
  currentUserAccountId,
  draft,
  customCards,
  giftCardPolicy,
  onChange,
}) => {
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addOwnOpen, setAddOwnOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | GiftCardThemeCategory>('ALL');

  const [ownTitleBn, setOwnTitleBn] = useState('');
  const [ownTitleEn, setOwnTitleEn] = useState('');
  const [ownDefaultMsg, setOwnDefaultMsg] = useState('');
  const [ownImageUrl, setOwnImageUrl] = useState('');
  const [ownSaving, setOwnSaving] = useState(false);
  const [ownError, setOwnError] = useState('');

  const catalog = useMemo(
    () => getAllGiftCardTemplates(customCards, giftCardPolicy, currentUserAccountId),
    [customCards, giftCardPolicy, currentUserAccountId]
  );
  const selectedTemplate = useMemo(
    () => getGiftCardTemplate(draft.cardId, customCards, giftCardPolicy),
    [draft.cardId, customCards, giftCardPolicy]
  );
  const wordCount = useMemo(() => countWords(draft.customMessage), [draft.customMessage]);

  const effectiveMessage = draft.customMessage.trim()
    ? draft.customMessage.trim()
    : lang === 'bn'
      ? selectedTemplate.defaultMessageBn
      : selectedTemplate.defaultMessageEn;

  const effectiveSignOff = formatGiftSignature(
    draft.signaturePrefix,
    draft.senderDisplayName.trim() || senderKycName
  );

  const filteredGallery = useMemo(() => {
    if (categoryFilter === 'ALL') return catalog;
    return catalog.filter((c) => c.themeCategory === categoryFilter);
  }, [categoryFilter, catalog]);

  const selectCard = (cardId: string) => {
    onChange({
      ...draft,
      enabled: true,
      cardId,
      senderDisplayName: draft.senderDisplayName || senderKycName,
    });
  };

  const handleUserCardFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOwnError('');
    try {
      const compressed = await compressUserGiftCardImage(file);
      setOwnImageUrl(compressed);
    } catch (err) {
      setOwnError(err instanceof Error ? err.message : 'Could not read image.');
    }
  };

  const handleSubmitOwnCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserAccountId) return;
    setOwnError('');
    if (!ownTitleBn.trim()) {
      setOwnError(lang === 'bn' ? 'কার্ডের নাম লিখুন।' : 'Enter a title for your card.');
      return;
    }
    if (!ownImageUrl.trim()) {
      setOwnError(lang === 'bn' ? 'একটি ছবি আপলোড করুন।' : 'Please upload a card photo.');
      return;
    }
    setOwnSaving(true);
    try {
      const created = await userSubmitCustomGiftCard({
        accountId: currentUserAccountId,
        accountName: senderKycName,
        titleBn: ownTitleBn.trim(),
        titleEn: ownTitleEn.trim() || ownTitleBn.trim(),
        imageUrl: ownImageUrl.trim(),
        defaultMessageBn: ownDefaultMsg.trim() || undefined,
        defaultMessageEn: ownDefaultMsg.trim() || undefined,
      });
      selectCard(created.cardId);
      setOwnTitleBn('');
      setOwnTitleEn('');
      setOwnDefaultMsg('');
      setOwnImageUrl('');
      setAddOwnOpen(false);
    } catch (err) {
      setOwnError(err instanceof Error ? err.message : 'Failed to create 24h card.');
    } finally {
      setOwnSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-50/75 via-white to-amber-50/60 dark:from-[#161928] dark:via-[#121622] dark:to-[#1a1523] border border-rose-200/80 dark:border-rose-500/25 p-3.5 sm:p-4 space-y-3.5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Gift className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
              <span>
                {lang === 'bn'
                  ? 'উপহার কার্ড নির্বাচন করুন (সাংস্কৃতিক ও উৎসব)'
                  : 'Send with Bengali Gift Card'}
              </span>
              <span className="font-mono-tabular text-[11px] font-bold text-rose-700 dark:text-rose-300">
                · {lang === 'bn' ? `মোট চার্জ মাত্র ৳${GIFT_CARD_FEE_BDT}` : `Total Charge ৳${GIFT_CARD_FEE_BDT} Only`}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {lang === 'bn'
                ? 'ঈদ, নববর্ষ, একুশে সহ নিজের কাস্টম কার্ডও (২৪ ঘণ্টা মেয়াদ) তৈরি করে পাঠান'
                : 'Pick Eid, Noboborsho, Heritage or add your own custom 24h card'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {currentUserAccountId && (
            <button
              type="button"
              onClick={() => {
                setOwnError('');
                setAddOwnOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[11px] font-semibold text-slate-950 inline-flex items-center gap-1 transition-colors whitespace-nowrap shadow-xs"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? '+ নিজের কার্ড (২৪ঘ.)' : '+ Add Card (24h)'}</span>
            </button>
          )}
          {draft.enabled && (
            <button
              type="button"
              onClick={() => onChange({ ...draft, enabled: false })}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-400 transition-colors"
            >
              {lang === 'bn' ? 'কার্ড ছাড়া পাঠান' : 'No Card'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewAllOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-semibold text-white transition-colors whitespace-nowrap shadow-xs"
          >
            {lang === 'bn' ? `সব দেখুন (${catalog.length})` : `View all (${catalog.length})`}
          </button>
        </div>
      </div>

      {/* Horizontal Portrait Card Carousel */}
      <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 snap-x">
        {catalog.slice(0, 14).map((card) => {
          const isSelected = draft.enabled && draft.cardId === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                if (isSelected) {
                  onChange({ ...draft, enabled: false });
                } else {
                  selectCard(card.id);
                }
              }}
              className={`snap-start shrink-0 w-24 sm:w-28 rounded-2xl overflow-hidden border-2 transition-all text-left relative group ${
                isSelected
                  ? 'border-rose-600 ring-2 ring-rose-500/30 scale-[1.02] shadow-md'
                  : 'border-slate-200 dark:border-slate-700/80 hover:border-rose-400 opacity-90 hover:opacity-100'
              }`}
            >
              <GiftCardArtFrame template={card} lang={lang} compact className="aspect-[3/4] w-full" />
              {card.featuredFirst && !isSelected && (
                <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow" title="Featured First">
                  <Star className="w-3 h-3 fill-current" />
                </span>
              )}
              {card.isUserSubmitted && card.expiresAt && (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-slate-950/80 text-[9px] font-mono-tabular font-bold text-amber-300">
                  24h
                </span>
              )}
              {isSelected && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Optional 50-Word Chithi + Sign-off Name Editor when a Gift Card is selected */}
      {draft.enabled && (
        <div className="pt-2 border-t border-rose-200/70 dark:border-rose-500/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
              <Feather className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>
                {lang === 'bn'
                  ? `চিঠি লিখুন (${selectedTemplate.titleBn}) — ঐচ্ছিক`
                  : `Personal Letter for ${selectedTemplate.titleEn} (Optional)`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono-tabular text-[11px] font-semibold ${
                  wordCount >= GIFT_CARD_MAX_WORDS
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {wordCount} / {GIFT_CARD_MAX_WORDS} {lang === 'bn' ? 'শব্দ' : 'words'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#0B0D14] border border-rose-200 dark:border-rose-500/35 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 inline-flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>{lang === 'bn' ? 'প্রিভিউ' : 'Preview'}</span>
              </button>
            </div>
          </div>

          <textarea
            rows={2}
            value={draft.customMessage}
            onChange={(e) => {
              const raw = e.target.value;
              const nextMsg =
                countWords(raw) > GIFT_CARD_MAX_WORDS
                  ? clampToMaxWords(raw, GIFT_CARD_MAX_WORDS)
                  : raw;
              onChange({ ...draft, customMessage: nextMsg });
            }}
            placeholder={
              lang === 'bn'
                ? `খালি রাখলে ডিফল্ট বার্তা যাবে: "${selectedTemplate.defaultMessageBn}"`
                : `Leave empty to send default card wish: "${selectedTemplate.defaultMessageEn}"`
            }
            className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500 resize-none"
          />

          {/* Signature Footer Row ("ইতি, তোমার {KYC/Edited Name}") */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                {lang === 'bn' ? 'স্বাক্ষরের ধরন (কার্ডের নিচে)' : 'Sign-Off Language Style'}
              </label>
              <div className="grid grid-cols-2 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 p-0.5">
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, signaturePrefix: 'bn' })}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                    draft.signaturePrefix === 'bn'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  ইতি, তোমার ...
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, signaturePrefix: 'en' })}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                    draft.signaturePrefix === 'en'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Yours, ...
                </button>
              </div>
            </div>

            <div className="sm:col-span-7">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  {lang === 'bn' ? 'প্রেরকের নাম (KYC বা এডিটেড নাম)' : 'Sender Name on Card (KYC or Custom)'}
                </label>
                {draft.senderDisplayName !== senderKycName && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...draft, senderDisplayName: senderKycName })}
                    className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>KYC Name</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                maxLength={60}
                value={draft.senderDisplayName}
                onChange={(e) => onChange({ ...draft, senderDisplayName: e.target.value })}
                placeholder={senderKycName}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-[#0B0D14]/80 border border-rose-200/60 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'কার্ডের নিচের স্বাক্ষর:' : 'Card Footer Signature:'}
            </span>
            <span className="font-display font-bold text-rose-700 dark:text-rose-300">
              {effectiveSignOff}
            </span>
          </div>
        </div>
      )}

      {/* View All Cultural Cards Modal */}
      {viewAllOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? `সাংস্কৃতিক উপহার কার্ড গ্যালারি (${catalog.length}টি কার্ড)`
                    : `Bengali Cultural Heritage Gift Cards (${catalog.length})`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'যেকোনো কার্ড সিলেক্ট করে সেন্ড মানি করুন — মোট চার্জ মাত্র ৳২ (প্রেরকের)'
                    : 'Select any card to send money with festive unboxing — Total sender fee ৳2.00 flat'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewAllOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D14] flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: lang === 'bn' ? 'সব কার্ড' : 'All Cards' },
                  { id: 'eid', label: lang === 'bn' ? 'ঈদ ও ধর্মীয়' : 'Eid & Sacred' },
                  { id: 'boishakh', label: lang === 'bn' ? 'নববর্ষ' : 'Noboborsho' },
                  { id: 'heritage', label: lang === 'bn' ? 'জাতীয় ঐতিহ্য' : 'National Heritage' },
                  { id: 'love', label: lang === 'bn' ? 'ভালোবাসা' : 'Love' },
                  { id: 'wishes', label: lang === 'bn' ? 'বন্ধুত্ব ও শুভেচ্ছা' : 'Friends & Wishes' },
                  { id: 'celebration', label: lang === 'bn' ? 'উৎসব ও অনুষ্ঠান' : 'Celebrations' },
                  { id: 'others', label: lang === 'bn' ? 'অন্যান্য (২৪ঘ.)' : 'Others (24h)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    categoryFilter === tab.id
                      ? 'bg-rose-600 text-white'
                      : 'bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {filteredGallery.map((card) => {
                const isSelected = draft.enabled && draft.cardId === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      selectCard(card.id);
                      setViewAllOpen(false);
                    }}
                    className={`rounded-2xl overflow-hidden border-2 transition-all text-left relative ${
                      isSelected
                        ? 'border-rose-600 ring-2 ring-rose-500/30 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 hover:border-rose-400'
                    }`}
                  >
                    <GiftCardArtFrame template={card} lang={lang} className="aspect-[3/4] w-full" />
                    {card.isUserSubmitted && card.expiresAt && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 text-[10px] font-mono-tabular font-bold text-amber-300 inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatRemaining24h(card.expiresAt)}</span>
                      </span>
                    )}
                    {card.featuredFirst && !card.isUserSubmitted && (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-amber-500 text-[10px] font-bold text-slate-950 inline-flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span>Top</span>
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* User Add Custom 24h Card Modal ("Others" Category -> Auto-Deletes after 24h) */}
      {addOwnOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmitOwnCard}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl p-5 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'নিজের গিফট কার্ড যুক্ত করুন' : 'Create Your Own Gift Card'}
                </h3>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {lang === 'bn'
                    ? 'অ্যাডমিন প্যানেলে Others হিসেবে যুক্ত হবে এবং ২৪ ঘণ্টা পর স্বয়ংক্রিয়ভাবে ডিলিট হবে।'
                    : 'Saved under Others in Social Engagement & auto-deletes after 24 hours.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddOwnOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-dashed border-slate-300 dark:border-slate-700 p-3.5 space-y-2.5 text-center">
              {ownImageUrl ? (
                <div className="relative mx-auto w-28 aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={ownImageUrl} alt="Card Preview" className="w-full h-full object-cover" />
                </div>
              ) : null}
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'ডিভাইস থেকে ছবি আপলোড' : 'Upload Card Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUserCardFile}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'কার্ডের নাম (বাংলা) *' : 'Card Title *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={ownTitleBn}
                  onChange={(e) => setOwnTitleBn(e.target.value)}
                  placeholder={lang === 'bn' ? 'যেমন: মায়ের জন্য উপহার' : 'e.g. Surprise Gift'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'ইংরেজি নাম (ঐচ্ছিক)' : 'English Title (Optional)'}
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={ownTitleEn}
                  onChange={(e) => setOwnTitleEn(e.target.value)}
                  placeholder="Optional English label"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                {lang === 'bn' ? 'ডিফল্ট শুভেচ্ছা বার্তা (ঐচ্ছিক)' : 'Default Wish Message (Optional)'}
              </label>
              <textarea
                rows={2}
                value={ownDefaultMsg}
                onChange={(e) => setOwnDefaultMsg(clampToMaxWords(e.target.value, GIFT_CARD_MAX_WORDS))}
                placeholder={lang === 'bn' ? 'আপনার জন্য ছোট্ট ভালোবাসা...' : 'Warm wishes for you...'}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            {ownError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {ownError}
              </div>
            )}

            <button
              type="submit"
              disabled={ownSaving}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors disabled:opacity-50"
            >
              {ownSaving
                ? lang === 'bn'
                  ? 'সংরক্ষণ হচ্ছে...'
                  : 'Creating 24h Card...'
                : lang === 'bn'
                  ? '২৪ ঘণ্টার জন্য কার্ড তৈরি ও সিলেক্ট করুন'
                  : 'Create 24h Card & Select'}
            </button>
          </form>
        </div>
      )}

      {/* Sender Card Live Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            <div className="relative h-64">
              <GiftCardArtFrame template={selectedTemplate} lang={lang} className="w-full h-full" />
              <FestivalParticles category={selectedTemplate.themeCategory} />
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 bg-gradient-to-b from-amber-50/50 to-white dark:from-[#121622] dark:to-[#0B0D14]">
              <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                “{effectiveMessage}”
              </p>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-right font-display font-bold text-sm text-rose-700 dark:text-rose-300">
                {effectiveSignOff}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Sender Flying Letter Animation ("চিট্ঠি উড়ে যাচ্ছে...")                   */
/* -------------------------------------------------------------------------- */

export const GiftCardFlightOverlay: React.FC<{
  open: boolean;
  cardTitleBn: string;
  cardTitleEn: string;
  themeCategory: GiftCardThemeCategory;
  receiverName: string;
  amount: number;
  lang: Language;
  onComplete: () => void;
}> = ({
  open,
  cardTitleBn,
  cardTitleEn,
  themeCategory,
  receiverName,
  amount,
  lang,
  onComplete,
}) => {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onComplete, 2700);
    return () => window.clearTimeout(timer);
  }, [open, onComplete]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <FestivalParticles category={themeCategory} />

          <div className="relative w-full max-w-md flex flex-col items-center text-center space-y-6 z-10">
            {/* Flight Runway Stage */}
            <div className="relative w-72 h-52 flex items-center justify-center">
              {/* Glowing destination ring */}
              <motion.div
                className="w-40 h-40 rounded-full border-2 border-dashed border-amber-400/50 flex items-center justify-center"
                animate={{ rotate: 360, scale: [0.95, 1.06, 0.95] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              />

              {/* Flying Chithi & Wax-Sealed Envelope */}
              <motion.div
                className="absolute flex flex-col items-center"
                initial={{ y: 50, x: -70, scale: 0.78, rotate: -14, opacity: 0 }}
                animate={{
                  y: [50, -6, -86],
                  x: [-70, 0, 125],
                  scale: [0.8, 1.15, 0.55],
                  rotate: [-14, -4, 18],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 2.35, times: [0, 0.42, 1], ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative w-44 h-28 rounded-2xl bg-gradient-to-br from-rose-600 via-red-600 to-amber-500 p-0.5 shadow-2xl shadow-rose-500/40">
                  <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-amber-50 to-rose-50 flex flex-col items-center justify-center relative overflow-hidden">
                    {/* Envelope Flap */}
                    <svg
                      viewBox="0 0 180 70"
                      className="absolute top-0 inset-x-0 w-full h-14 text-rose-500/90"
                      preserveAspectRatio="none"
                    >
                      <polygon points="0,0 180,0 90,62" fill="currentColor" />
                    </svg>
                    {/* Golden Wax Seal */}
                    <div className="relative z-10 mt-3 w-11 h-11 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-2 border-white shadow-lg flex items-center justify-center text-rose-900">
                      <Heart className="w-5 h-5 fill-current" />
                    </div>
                    <span className="mt-1 text-[10px] font-bold tracking-wide text-rose-800">
                      {cardTitleBn}
                    </span>
                  </div>
                </div>
                <motion.div
                  className="mt-2 flex items-center gap-1.5 text-amber-300"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  <Sparkles className="w-4 h-4" />
                  <Send className="w-4 h-4" />
                </motion.div>
              </motion.div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-300">
                {lang === 'bn' ? cardTitleBn : cardTitleEn} · {formatBdt(amount, lang)}
              </div>
              <h2 className="font-display text-2xl font-bold text-white">
                {lang === 'bn'
                  ? `চিঠি ও উপহার উড়ে যাচ্ছে...`
                  : `Your Gift Letter is Flying...`}
              </h2>
              <p className="text-sm text-slate-300">
                {lang === 'bn'
                  ? `${receiverName}-এর অ্যাকাউন্টে উৎসবের কার্ড ও শুভেচ্ছা পাঠানো হচ্ছে`
                  : `Delivering your festive card & ${formatBdt(amount, lang)} directly to ${receiverName}`}
              </p>
            </div>

            <button
              type="button"
              onClick={onComplete}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition-colors"
            >
              {lang === 'bn' ? 'এগিয়ে যান' : 'Continue'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* -------------------------------------------------------------------------- */
/*  Receiver Full-Screen Festival Celebration & Gift Card Unboxing Overlay    */
/* -------------------------------------------------------------------------- */

export const GiftCardReceiverOverlay: React.FC<{
  tx: AcashTransaction;
  lang: Language;
  customCards?: CustomGiftCardRecord[];
  giftCardPolicy?: GiftCardCatalogPolicy;
  initialOpened?: boolean;
  onOpened: (txId: string) => void;
  onSkip: (txId: string) => void;
  onViewReceipt?: (tx: AcashTransaction) => void;
}> = ({ tx, lang, customCards, giftCardPolicy, initialOpened = false, onOpened, onSkip, onViewReceipt }) => {
  const [stage, setStage] = useState<'sealed' | 'opened'>(initialOpened ? 'opened' : 'sealed');
  const [imgFailed, setImgFailed] = useState(false);

  const gift: GiftCardPayload | undefined = tx.giftCard;
  const template = useMemo(() => {
    const base = getGiftCardTemplate(gift?.cardId, customCards, giftCardPolicy);
    if (gift?.customImageUrl) {
      return {
        ...base,
        imageUrl: gift.customImageUrl,
        gradientBg: gift.customGradientBg || base.gradientBg,
        accentHex: gift.customAccentHex || base.accentHex,
      };
    }
    return base;
  }, [gift?.cardId, gift?.customImageUrl, gift?.customGradientBg, gift?.customAccentHex, customCards, giftCardPolicy]);

  if (!gift) return null;

  const signatureLine = formatGiftSignature(gift.signaturePrefix, gift.senderDisplayName);

  const handleOpenEnvelope = () => {
    setStage('opened');
    if (!initialOpened) {
      onOpened(tx.txId);
    }
  };

  return (
    <div className="fixed inset-0 z-[105] bg-slate-950/92 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <FestivalParticles category={gift.themeCategory} />

      <AnimatePresence mode="wait">
        {stage === 'sealed' ? (
          <motion.div
            key="sealed"
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.08, y: -20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-slate-900 via-[#15182b] to-slate-950 border border-amber-400/35 p-6 sm:p-7 text-center text-white shadow-2xl space-y-6"
          >
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                {gift.cardTitleBn} · {gift.cardTitleEn}
              </div>
              <h2 className="font-display text-2xl font-bold text-white leading-snug">
                {lang === 'bn'
                  ? 'আপনার জন্য বিশেষ উপহার কার্ড এসেছে!'
                  : 'A Cultural Gift Card Arrived For You!'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                {lang === 'bn'
                  ? `${tx.senderName} (${tx.senderId}) আপনাকে ভালোবাসা ও শুভেচ্ছাসহ`
                  : `${tx.senderName} (${tx.senderId}) sent you a festive gift with`}{' '}
                <strong className="font-mono-tabular text-emerald-300">
                  +{formatBdt(tx.amount, lang)}
                </strong>
              </p>
            </div>

            {/* Interactive 3D Floating Sealed Envelope */}
            <motion.button
              type="button"
              onClick={handleOpenEnvelope}
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              className="mx-auto block w-64 h-40 rounded-2xl bg-gradient-to-br from-rose-600 via-red-600 to-amber-500 p-0.5 shadow-2xl shadow-rose-500/35 focus-visible:outline-2 focus-visible:outline-amber-300 group"
            >
              <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-amber-50 via-rose-50 to-amber-100 relative overflow-hidden flex flex-col items-center justify-center">
                <svg
                  viewBox="0 0 240 90"
                  className="absolute top-0 inset-x-0 w-full h-20 text-rose-600/95 transition-transform duration-300 group-hover:-translate-y-1"
                  preserveAspectRatio="none"
                >
                  <polygon points="0,0 240,0 120,82" fill="currentColor" />
                </svg>

                <div className="relative z-10 mt-6 w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-2 border-white shadow-xl flex items-center justify-center text-rose-900 group-hover:scale-110 transition-transform">
                  <MailOpen className="w-6 h-6" />
                </div>

                <div className="mt-2 text-xs font-bold text-rose-900">
                  {lang === 'bn' ? 'খুলতে ট্যাপ করুন' : 'Tap Seal to Open'}
                </div>
              </div>
            </motion.button>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleOpenEnvelope}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-sm font-bold text-white shadow-lg shadow-rose-600/30 inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              >
                <Gift className="w-4 h-4" />
                <span>{lang === 'bn' ? 'উপহার কার্ড খুলুন' : 'Open Gift Card'}</span>
              </button>
              <button
                type="button"
                onClick={() => onSkip(tx.txId)}
                className="py-3 px-5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-xs sm:text-sm font-semibold text-slate-200 transition-colors"
              >
                {lang === 'bn' ? 'স্কিপ · পরে দেখব' : 'Skip for Now'}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="opened"
            initial={{ opacity: 0, rotateX: 18, scale: 0.88 }}
            animate={{ opacity: 1, rotateX: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-lg rounded-3xl bg-white dark:bg-[#121622] border border-amber-300/50 dark:border-amber-500/30 overflow-hidden shadow-2xl my-auto"
          >
            {/* Cultural Card Hero Artwork */}
            <div className={`relative h-64 sm:h-72 bg-gradient-to-br ${template.gradientBg}`}>
              {template.imageUrl && !imgFailed ? (
                <img
                  src={template.imageUrl}
                  alt={gift.cardTitleBn}
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/20" />

              <button
                type="button"
                onClick={() => onSkip(tx.txId)}
                className="absolute top-3.5 right-3.5 p-2 rounded-full bg-black/55 hover:bg-black/75 text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-amber-300">
                    {gift.cardTitleEn} · {tx.txHash}
                  </div>
                  <h3 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
                    {gift.cardTitleBn}
                  </h3>
                </div>
                <div className="text-right shrink-0 bg-emerald-600/90 backdrop-blur-sm px-3.5 py-2 rounded-2xl border border-emerald-300/40 text-white shadow-lg">
                  <div className="text-[10px] font-medium text-emerald-100">
                    {lang === 'bn' ? 'উপহার প্রাপ্তি' : 'Gift Credited'}
                  </div>
                  <div className="font-mono-tabular text-base sm:text-lg font-bold">
                    +{formatBdt(tx.amount, lang)}
                  </div>
                </div>
              </div>
            </div>

            {/* Handcrafted Letter / Chithi Body */}
            <div className="p-5 sm:p-6 space-y-4 bg-gradient-to-b from-amber-50/70 via-white to-white dark:from-[#161928] dark:via-[#121622] dark:to-[#0B0D14]">
              <div className="rounded-2xl bg-amber-50/80 dark:bg-[#0B0D14] border border-amber-200/80 dark:border-amber-500/25 p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                  <span>
                    {lang === 'bn' ? `প্রাপক: ${tx.receiverName}` : `To: ${tx.receiverName}`}
                  </span>
                  <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                    {new Date(tx.createdAt).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap font-medium">
                  “{gift.message}”
                </p>

                <div className="pt-3 border-t border-amber-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                    {tx.senderId}
                  </span>
                  <div className="font-display text-sm sm:text-base font-bold text-rose-700 dark:text-rose-300">
                    {signatureLine}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {onViewReceipt && (
                  <button
                    type="button"
                    onClick={() => {
                      onSkip(tx.txId);
                      onViewReceipt(tx);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 transition-colors"
                  >
                    {lang === 'bn' ? 'রসিদ দেখুন' : 'View Receipt'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSkip(tx.txId)}
                  className="ml-auto px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs sm:text-sm font-bold text-white shadow-sm transition-colors"
                >
                  {lang === 'bn' ? 'ধন্যবাদ · বন্ধ করুন' : 'Collect & Close'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
