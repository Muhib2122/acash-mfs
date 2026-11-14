import eidMubarakImg from '../assets/images/gift_eid_mubarak_1794669697332.jpg';
import eidSalamiImg from '../assets/images/gift_eid_salami_1794669655685.jpg';
import miladunnabiImg from '../assets/images/gift_miladunnabi_1794669656457.jpg';
import noboborshoImg from '../assets/images/gift_noboborsho_1794669657645.jpg';
import ekusheyImg from '../assets/images/gift_ekushey_february_1794669657377.jpg';
import victory16DecImg from '../assets/images/gift_victory_16_dec_1794669658524.jpg';
import march7Img from '../assets/images/gift_march_7_1794669658911.jpg';
import valobasaImg from '../assets/images/gift_valobasa_dibos_1794669659155.jpg';
import bondhuImg from '../assets/images/gift_bondhu_dibos_1794669658853.jpg';
import shuvecchaImg from '../assets/images/gift_shuveccha_1794669660076.jpg';
import {
  CustomGiftCardRecord,
  GiftCardCatalogPolicy,
  GiftCardParticleType,
  GiftCardThemeCategory,
} from '../types/acash';

export const GIFT_CARD_FEE_BDT = 2;
export const GIFT_CARD_MAX_WORDS = 50;
export const USER_GIFT_CARD_TTL_MS = 24 * 60 * 60 * 1000;

export type { GiftCardParticleType };

export interface GiftCardTemplate {
  id: string;
  titleBn: string;
  titleEn: string;
  subtitleBn: string;
  subtitleEn: string;
  themeCategory: GiftCardThemeCategory;
  imageUrl?: string;
  gradientBg: string;
  accentHex: string;
  particleType: GiftCardParticleType;
  defaultMessageBn: string;
  defaultMessageEn: string;
  featured: boolean;
  isCustomUploaded?: boolean;
  active?: boolean;
  frozen?: boolean;
  featuredFirst?: boolean;
  pinnedOrder?: number;
  deleted?: boolean;
  isUserSubmitted?: boolean;
  submittedByAccountId?: string;
  submittedByName?: string;
  expiresAt?: number;
  createdBy?: string;
  createdAt?: number;
}

export const GIFT_CARDS: GiftCardTemplate[] = [
  {
    id: 'eid_mubarak',
    titleBn: 'ঈদ মোবারক',
    titleEn: 'Eid Mubarak',
    subtitleBn: 'আনন্দ ও ভালোবাসায় ভরা ঈদ',
    subtitleEn: 'Blessed Eid Joy & Peace',
    themeCategory: 'eid',
    imageUrl: eidMubarakImg,
    gradientBg: 'from-emerald-950 via-teal-900 to-emerald-800',
    accentHex: '#F59E0B',
    particleType: 'crescent_lantern',
    defaultMessageBn: 'ঈদ মোবারক! আপনার ও আপনার পরিবারের প্রতিটি দিন আনন্দ, শান্তি ও সমৃদ্ধিতে ভরে উঠুক।',
    defaultMessageEn: 'Eid Mubarak! May this blessed occasion fill your home with joy, warmth, and prosperity.',
    featured: true,
  },
  {
    id: 'eid_salami',
    titleBn: 'ঈদ সালামি',
    titleEn: 'Eid Salami',
    subtitleBn: 'ছোট্ট উপহারে বড় খুশি',
    subtitleEn: 'Festive Cash Gift',
    themeCategory: 'eid',
    imageUrl: eidSalamiImg,
    gradientBg: 'from-teal-950 via-emerald-900 to-amber-900',
    accentHex: '#FBBF24',
    particleType: 'coins',
    defaultMessageBn: 'ঈদের খুশিতে রইল আমার পক্ষ থেকে ভালোবাসার ঈদ সালামি। আনন্দে কাটুক এবারের ঈদ!',
    defaultMessageEn: 'Sending you warm Eid Salami with heartfelt prayers for smiles and happiness all year long!',
    featured: true,
  },
  {
    id: 'noboborsho',
    titleBn: 'শুভ নববর্ষ',
    titleEn: 'Shuvo Noboborsho',
    subtitleBn: 'বৈশাখী আনন্দ ও বাঙালি ঐতিহ্য',
    subtitleEn: 'Pohela Boishakh Heritage',
    themeCategory: 'boishakh',
    imageUrl: noboborshoImg,
    gradientBg: 'from-rose-700 via-red-600 to-amber-600',
    accentHex: '#DC2626',
    particleType: 'alpana_marigold',
    defaultMessageBn: 'শুভ নববর্ষ! নতুন বাংলা বছরের প্রতিটি সকাল বয়ে আনুক মঙ্গল, সুস্বাস্থ্য ও নতুন সম্ভাবনা।',
    defaultMessageEn: 'Shuvo Noboborsho! Wishing you vibrant new beginnings, health, and happiness this Bengali New Year.',
    featured: true,
  },
  {
    id: 'ekushey_february',
    titleBn: 'একুশে ফেব্রুয়ারি',
    titleEn: 'Ekushey February',
    subtitleBn: 'আন্তর্জাতিক মাতৃভাষা দিবস',
    subtitleEn: 'Mother Language Tribute',
    themeCategory: 'heritage',
    imageUrl: ekusheyImg,
    gradientBg: 'from-zinc-950 via-neutral-900 to-red-950',
    accentHex: '#EF4444',
    particleType: 'doves_palash',
    defaultMessageBn: 'অমর একুশের শ্রদ্ধা ও বাংলা ভাষার গর্বে আপনাকে জানাই হৃদয়ের গভীর ভালোবাসা ও শুভেচ্ছা।',
    defaultMessageEn: 'Honoring the spirit of Ekushey February and the timeless pride of our beloved mother tongue.',
    featured: true,
  },
  {
    id: 'victory_16_dec',
    titleBn: '১৬ই ডিসেম্বর বিজয় দিবস',
    titleEn: '16th December Victory Day',
    subtitleBn: 'গৌরবময় বিজয়ের শুভেচ্ছা',
    subtitleEn: 'Victory Day of Bangladesh',
    themeCategory: 'heritage',
    imageUrl: victory16DecImg,
    gradientBg: 'from-emerald-900 via-green-800 to-red-900',
    accentHex: '#10B981',
    particleType: 'flag_fireworks',
    defaultMessageBn: 'মহান বিজয় দিবসের শুভেচ্ছা! লাল-সবুজের গৌরব আমাদের জীবনে বয়ে আনুক শান্তি ও প্রগতি।',
    defaultMessageEn: 'Happy Victory Day! May the red-and-green spirit of freedom inspire pride, unity, and progress.',
    featured: true,
  },
  {
    id: 'march_7',
    titleBn: '৭ই মার্চ',
    titleEn: '7th March Heritage',
    subtitleBn: 'ঐতিহাসিক ৭ই মার্চের প্রেরণা',
    subtitleEn: 'Historic 7th March',
    themeCategory: 'heritage',
    imageUrl: march7Img,
    gradientBg: 'from-amber-950 via-orange-900 to-amber-700',
    accentHex: '#F59E0B',
    particleType: 'sunbeams',
    defaultMessageBn: 'ঐতিহাসিক ৭ই মার্চের অদম্য প্রেরণা ও সাহসে আপনার আগামীর পথচলা হোক আলোকিত ও সফল।',
    defaultMessageEn: 'Inspired by the historic 7th March spirit—wishing you courage, strength, and brightness ahead.',
    featured: true,
  },
  {
    id: 'miladunnabi',
    titleBn: 'ঈদে মিলাদুন্নবী (সা.)',
    titleEn: 'Eid-e-Miladunnabi (S.A.)',
    subtitleBn: 'শান্তি ও রহমতের বার্তা',
    subtitleEn: 'Peace & Blessings',
    themeCategory: 'eid',
    imageUrl: miladunnabiImg,
    gradientBg: 'from-emerald-950 via-teal-950 to-slate-900',
    accentHex: '#34D399',
    particleType: 'crescent_lantern',
    defaultMessageBn: 'পবিত্র ঈদে মিলাদুন্নবী (সা.) উপলক্ষে আপনার জীবনে বর্ষিত হোক অশেষ রহমত, শান্তি ও কল্যাণ।',
    defaultMessageEn: 'Wishing you serene peace, mercy, and abundant blessings on this sacred Eid-e-Miladunnabi.',
    featured: true,
  },
  {
    id: 'valobasa_dibos',
    titleBn: 'ভালোবাসা দিবস',
    titleEn: 'Valobasa Dibos',
    subtitleBn: 'ভালোবাসায় রঙিন প্রতিটি মুহূর্ত',
    subtitleEn: 'Love & Affection',
    themeCategory: 'love',
    imageUrl: valobasaImg,
    gradientBg: 'from-rose-900 via-pink-800 to-red-900',
    accentHex: '#FB7185',
    particleType: 'roses_hearts',
    defaultMessageBn: 'শুভ ভালোবাসা দিবস! আমাদের সুন্দর স্মৃতি ও ভালোবাসা চিরদিন এভাবেই অমলিন থাকুক।',
    defaultMessageEn: 'Happy Valentine’s Day! Sending affection and a little token to brighten your day.',
    featured: true,
  },
  {
    id: 'bondhu_dibos',
    titleBn: 'বন্ধু দিবস',
    titleEn: 'Bondhu Dibos',
    subtitleBn: 'চায়ের আড্ডা ও অটুট বন্ধুত্ব',
    subtitleEn: 'Friendship & Memories',
    themeCategory: 'wishes',
    imageUrl: bondhuImg,
    gradientBg: 'from-amber-800 via-orange-700 to-teal-900',
    accentHex: '#FBBF24',
    particleType: 'fairy_tea',
    defaultMessageBn: 'বন্ধু দিবসের শুভেচ্ছা! চায়ের আড্ডা আর নির্ভেজাল বন্ধুত্ব যেন আজীবন অটুট থাকে।',
    defaultMessageEn: 'Happy Friendship Day! Here is to endless adda, laughter, and our unbreakable bond.',
    featured: true,
  },
  {
    id: 'shuveccha',
    titleBn: 'শুভেচ্ছা',
    titleEn: 'Shuveccha',
    subtitleBn: 'আন্তরিক শুভকামনা ও আলপনা',
    subtitleEn: 'Warm Bengali Wishes',
    themeCategory: 'wishes',
    imageUrl: shuvecchaImg,
    gradientBg: 'from-blue-900 via-indigo-800 to-amber-700',
    accentHex: '#3B82F6',
    particleType: 'royal_mandala',
    defaultMessageBn: 'আপনার প্রতিটি দিন হোক সুন্দর ও সাফল্যমণ্ডিত—এই আন্তরিক শুভেচ্ছা ও ভালোবাসা রইল।',
    defaultMessageEn: 'Sending warm wishes and heartfelt appreciation to make your day shine brighter.',
    featured: true,
  },
  {
    id: 'independence_26_march',
    titleBn: '২৬শে মার্চ স্বাধীনতা দিবস',
    titleEn: '26th March Independence',
    subtitleBn: 'স্বাধীনতার রক্তিম সূর্য',
    subtitleEn: 'Independence Day',
    themeCategory: 'heritage',
    imageUrl: victory16DecImg,
    gradientBg: 'from-green-900 via-emerald-800 to-rose-800',
    accentHex: '#16A34A',
    particleType: 'flag_fireworks',
    defaultMessageBn: 'মহান স্বাধীনতা দিবসের শুভেচ্ছা! স্বাধীনতার চেতনায় গড়ে উঠুক আলোকিত আগামী।',
    defaultMessageEn: 'Happy Independence Day! May freedom and unity always shine bright over Bangladesh.',
    featured: false,
  },
  {
    id: 'sharadiyo',
    titleBn: 'শারদীয় শুভেচ্ছা',
    titleEn: 'Sharadiyo Shuveccha',
    subtitleBn: 'কাশফুল ও ঢাকের তালে উৎসব',
    subtitleEn: 'Autumn Festival Joy',
    themeCategory: 'celebration',
    imageUrl: shuvecchaImg,
    gradientBg: 'from-red-900 via-rose-800 to-amber-700',
    accentHex: '#F97316',
    particleType: 'alpana_marigold',
    defaultMessageBn: 'শারদীয় শুভেচ্ছা! ঢাকের বাদ্যি আর শিউলি ফুলের সুবাসে ভরে উঠুক উৎসবের প্রতিটি ক্ষণ।',
    defaultMessageEn: 'Sharadiyo Shuveccha! Wishing you festive joy, harmony, and luminous celebrations.',
    featured: false,
  },
  {
    id: 'bibaho',
    titleBn: 'শুভ বিবাহ',
    titleEn: 'Shuvo Bibaho',
    subtitleBn: 'নবদম্পতির জন্য শুভকামনা',
    subtitleEn: 'Wedding Blessings',
    themeCategory: 'celebration',
    imageUrl: valobasaImg,
    gradientBg: 'from-rose-950 via-red-900 to-amber-800',
    accentHex: '#F59E0B',
    particleType: 'roses_hearts',
    defaultMessageBn: 'শুভ বিবাহ! আপনাদের নতুন জীবনের প্রতিটি দিন ভালোবাসা, বিশ্বাস ও সুখে পূর্ণ হোক।',
    defaultMessageEn: 'Congratulations on your wedding! Wishing you a lifetime of love and harmony together.',
    featured: false,
  },
  {
    id: 'birthday',
    titleBn: 'শুভ জন্মদিন',
    titleEn: 'Happy Birthday',
    subtitleBn: 'জন্মদিনের মিষ্টি উপহার',
    subtitleEn: 'Birthday Celebration',
    themeCategory: 'celebration',
    imageUrl: eidSalamiImg,
    gradientBg: 'from-indigo-900 via-violet-800 to-pink-700',
    accentHex: '#EC4899',
    particleType: 'festive_confetti',
    defaultMessageBn: 'শুভ জন্মদিন! আপনার আগামী বছরটি সুস্থতা, সাফল্য ও অগণিত আনন্দে ভরে উঠুক।',
    defaultMessageEn: 'Happy Birthday! May this year bring incredible milestones, joy, and bright memories.',
    featured: false,
  },
  {
    id: 'dhonnobad',
    titleBn: 'ধন্যবাদ',
    titleEn: 'Dhonnobad',
    subtitleBn: 'কৃতজ্ঞতা ও আন্তরিক সম্মান',
    subtitleEn: 'Thank You Gift',
    themeCategory: 'wishes',
    imageUrl: bondhuImg,
    gradientBg: 'from-amber-900 via-orange-800 to-emerald-900',
    accentHex: '#F59E0B',
    particleType: 'royal_mandala',
    defaultMessageBn: 'আপনার সাহায্য ও সুন্দর ব্যবহারের জন্য অসংখ্য ধন্যবাদ। ভালো থাকবেন সবসময়!',
    defaultMessageEn: 'Thank you sincerely for your kindness and support. Truly appreciated!',
    featured: false,
  },
  {
    id: 'obhinondon',
    titleBn: 'অভিনন্দন',
    titleEn: 'Obhinondon',
    subtitleBn: 'সাফল্যের রঙিন উদযাপন',
    subtitleEn: 'Congratulations',
    themeCategory: 'celebration',
    imageUrl: march7Img,
    gradientBg: 'from-blue-950 via-indigo-900 to-amber-800',
    accentHex: '#FBBF24',
    particleType: 'festive_confetti',
    defaultMessageBn: 'অভিনন্দন! আপনার এই অসাধারণ সাফল্যে আমি ভীষণ আনন্দিত। এগিয়ে যান আরও বহুদূর!',
    defaultMessageEn: 'Heartiest congratulations on your wonderful achievement! Keep shining bright!',
    featured: false,
  },
];

let syncedCustomCardRecords: CustomGiftCardRecord[] = [];
let syncedGiftCardPolicy: GiftCardCatalogPolicy = {
  overrides: {},
  updatedAt: 0,
  updatedBy: '',
};

export function isGiftCardExpired(
  card: { expiresAt?: number },
  now = Date.now()
): boolean {
  return typeof card.expiresAt === 'number' && card.expiresAt > 0 && card.expiresAt <= now;
}

export function formatRemaining24h(expiresAt?: number, now = Date.now()): string {
  if (!expiresAt) return 'Permanent';
  const diff = expiresAt - now;
  if (diff <= 0) return 'Expired';
  const totalMins = Math.floor(diff / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours <= 0) return `${mins}m left`;
  return `${hours}h ${mins}m left`;
}

export function customRecordToTemplate(rec: CustomGiftCardRecord): GiftCardTemplate {
  return {
    id: rec.cardId,
    titleBn: rec.titleBn,
    titleEn: rec.titleEn,
    subtitleBn: rec.subtitleBn,
    subtitleEn: rec.subtitleEn,
    themeCategory: rec.themeCategory,
    imageUrl: rec.imageUrl,
    gradientBg: rec.gradientBg || 'from-rose-900 via-red-800 to-amber-700',
    accentHex: rec.accentHex || '#E11D48',
    particleType: rec.particleType || 'festive_confetti',
    defaultMessageBn: rec.defaultMessageBn,
    defaultMessageEn: rec.defaultMessageEn,
    featured: rec.featured,
    isCustomUploaded: true,
    active: rec.active,
    frozen: Boolean(rec.frozen || rec.active === false),
    featuredFirst: Boolean(rec.featuredFirst),
    pinnedOrder: rec.pinnedOrder || 0,
    isUserSubmitted: Boolean(rec.isUserSubmitted),
    submittedByAccountId: rec.submittedByAccountId,
    submittedByName: rec.submittedByName,
    expiresAt: rec.expiresAt,
    createdBy: rec.createdBy,
    createdAt: rec.createdAt,
  };
}

export function syncCustomGiftCardsRegistry(records: CustomGiftCardRecord[]): void {
  syncedCustomCardRecords = records;
}

export function syncGiftCardPolicyRegistry(policy: GiftCardCatalogPolicy): void {
  syncedGiftCardPolicy = policy || { overrides: {}, updatedAt: 0, updatedBy: '' };
}

export function getAllGiftCardTemplates(
  extraRecords?: CustomGiftCardRecord[],
  policy?: GiftCardCatalogPolicy,
  viewerAccountId?: string
): GiftCardTemplate[] {
  const now = Date.now();
  const records = extraRecords ?? syncedCustomCardRecords;
  const activePolicy = policy ?? syncedGiftCardPolicy;
  const overrides = activePolicy?.overrides || {};

  const customList = records
    .filter((r) => !isGiftCardExpired(r, now))
    .map((r) => {
      const ov = overrides[r.cardId];
      const tpl = customRecordToTemplate(r);
      return {
        ...tpl,
        frozen: Boolean(tpl.frozen || ov?.frozen || r.active === false),
        deleted: Boolean(ov?.deleted),
        featuredFirst: Boolean(tpl.featuredFirst || ov?.featuredFirst),
        pinnedOrder: Math.max(tpl.pinnedOrder || 0, ov?.pinnedOrder || 0),
      };
    })
    .filter((t) => {
      if (t.deleted || t.frozen || t.active === false) return false;
      if (t.isUserSubmitted) {
        return Boolean(viewerAccountId && t.submittedByAccountId === viewerAccountId);
      }
      return true;
    });

  const builtInList = GIFT_CARDS.map((card) => {
    const ov = overrides[card.id];
    return {
      ...card,
      frozen: Boolean(ov?.frozen),
      deleted: Boolean(ov?.deleted),
      featuredFirst: Boolean(ov?.featuredFirst),
      pinnedOrder: ov?.pinnedOrder || 0,
    };
  }).filter((t) => !t.deleted && !t.frozen);

  const combined = [...customList, ...builtInList];

  return combined.sort((a, b) => {
    const aPin = a.featuredFirst ? 1 : 0;
    const bPin = b.featuredFirst ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    if (aPin === 1 && (b.pinnedOrder || 0) !== (a.pinnedOrder || 0)) {
      return (b.pinnedOrder || 0) - (a.pinnedOrder || 0);
    }
    const aAdminCustom = a.isCustomUploaded && !a.isUserSubmitted ? 1 : 0;
    const bAdminCustom = b.isCustomUploaded && !b.isUserSubmitted ? 1 : 0;
    if (aAdminCustom !== bAdminCustom) return bAdminCustom - aAdminCustom;

    const aUserCustom = a.isUserSubmitted ? 1 : 0;
    const bUserCustom = b.isUserSubmitted ? 1 : 0;
    if (aUserCustom !== bUserCustom) return bUserCustom - aUserCustom;

    if (a.isCustomUploaded && b.isCustomUploaded) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return 0;
  });
}

export function getFullGovernanceCatalog(
  extraRecords?: CustomGiftCardRecord[],
  policy?: GiftCardCatalogPolicy
): {
  activeCatalog: GiftCardTemplate[];
  userOthersCards: GiftCardTemplate[];
  deletedBuiltInCards: GiftCardTemplate[];
} {
  const now = Date.now();
  const records = extraRecords ?? syncedCustomCardRecords;
  const activePolicy = policy ?? syncedGiftCardPolicy;
  const overrides = activePolicy?.overrides || {};

  const customTemplates = records
    .filter((r) => !isGiftCardExpired(r, now))
    .map((r) => {
      const ov = overrides[r.cardId];
      const tpl = customRecordToTemplate(r);
      return {
        ...tpl,
        frozen: Boolean(tpl.frozen || ov?.frozen || r.active === false),
        deleted: Boolean(ov?.deleted),
        featuredFirst: Boolean(tpl.featuredFirst || ov?.featuredFirst),
        pinnedOrder: Math.max(tpl.pinnedOrder || 0, ov?.pinnedOrder || 0),
      };
    })
    .filter((t) => !t.deleted);

  const userOthersCards = customTemplates
    .filter((t) => t.isUserSubmitted)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const adminCustomCards = customTemplates.filter((t) => !t.isUserSubmitted);

  const allBuiltIns = GIFT_CARDS.map((card) => {
    const ov = overrides[card.id];
    return {
      ...card,
      frozen: Boolean(ov?.frozen),
      deleted: Boolean(ov?.deleted),
      featuredFirst: Boolean(ov?.featuredFirst),
      pinnedOrder: ov?.pinnedOrder || 0,
    };
  });

  const activeBuiltIns = allBuiltIns.filter((c) => !c.deleted);
  const deletedBuiltInCards = allBuiltIns.filter((c) => c.deleted);

  const activeCatalog = [...adminCustomCards, ...activeBuiltIns].sort((a, b) => {
    const aPin = a.featuredFirst ? 1 : 0;
    const bPin = b.featuredFirst ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    if (aPin === 1 && (b.pinnedOrder || 0) !== (a.pinnedOrder || 0)) {
      return (b.pinnedOrder || 0) - (a.pinnedOrder || 0);
    }
    const aCustom = a.isCustomUploaded ? 1 : 0;
    const bCustom = b.isCustomUploaded ? 1 : 0;
    if (aCustom !== bCustom) return bCustom - aCustom;
    if (a.isCustomUploaded && b.isCustomUploaded) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return 0;
  });

  return {
    activeCatalog,
    userOthersCards,
    deletedBuiltInCards,
  };
}

export function getGiftCardTemplate(
  cardId?: string,
  extraRecords?: CustomGiftCardRecord[],
  policy?: GiftCardCatalogPolicy
): GiftCardTemplate {
  const records = extraRecords ?? syncedCustomCardRecords;
  const activePolicy = policy ?? syncedGiftCardPolicy;
  const overrides = activePolicy?.overrides || {};

  if (cardId) {
    const customRec = records.find((r) => r.cardId === cardId);
    if (customRec) return customRecordToTemplate(customRec);
    const builtIn = GIFT_CARDS.find((c) => c.id === cardId);
    if (builtIn) {
      const ov = overrides[builtIn.id];
      return {
        ...builtIn,
        frozen: Boolean(ov?.frozen),
        featuredFirst: Boolean(ov?.featuredFirst),
      };
    }
  }
  const available = getAllGiftCardTemplates(records, activePolicy);
  return available[0] || GIFT_CARDS[0];
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function clampToMaxWords(text: string, maxWords = GIFT_CARD_MAX_WORDS): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return text;
  return parts.slice(0, maxWords).join(' ');
}

export function formatGiftSignature(prefix: 'bn' | 'en', displayName: string): string {
  const cleanName = displayName.trim() || 'Acash User';
  return prefix === 'bn' ? `ইতি, তোমার ${cleanName}` : `Yours, ${cleanName}`;
}
