import { Language, TransactionType, UserGender } from '../types/acash';

const VOICE_MUTED_KEY = 'acash_voice_alerts_muted_v1';

const MALE_VOICE_REGEX =
  /\b(male|man|david|mark|george|daniel|alex|fred|rishi|prabhat|bashkar|hemant|ravi|andrew|guy|ryan|christopher|eric|roger|steffan|brian|james|oliver|paul|thomas|arthur|madhur|aaditya|dev)\b/i;

const FEMALE_VOICE_REGEX =
  /\b(female|woman|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|veena|lekha|nabanita|tanisha|heera|kalpana|swara|aria|jenny|michelle|ana|emma|sonia|libby|maisie|clara|sara|neerja|katja|asha)\b/i;

let sharedAudioCtx: AudioContext | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
let unlockListenersAttached = false;

function refreshVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  try {
    const list = window.speechSynthesis.getVoices();
    if (list && list.length > 0) {
      cachedVoices = list;
    }
  } catch {
    // ignore
  }
  return cachedVoices;
}

export function initSoundboxAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  refreshVoices();
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.onvoiceschanged = () => {
        refreshVoices();
      };
    } catch {
      // ignore
    }
  }

  if (unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!sharedAudioCtx) {
          sharedAudioCtx = new AudioCtx();
        }
        if (sharedAudioCtx.state === 'suspended') {
          void sharedAudioCtx.resume();
        }
      }
      refreshVoices();
    } catch {
      // ignore autoplay errors
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function getVoiceMuted(): boolean {
  try {
    return localStorage.getItem(VOICE_MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setVoiceMuted(muted: boolean): void {
  try {
    localStorage.setItem(VOICE_MUTED_KEY, muted ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function getOppositeVoiceGender(listenerGender?: UserGender): UserGender {
  return listenerGender === 'female' ? 'male' : 'female';
}

function scoreVoice(
  voice: SpeechSynthesisVoice,
  targetGender: UserGender,
  preferredLang: Language
): number {
  const name = `${voice.name} ${voice.voiceURI}`;
  const langLower = (voice.lang || '').toLowerCase();
  const isMale = MALE_VOICE_REGEX.test(name);
  const isFemale = FEMALE_VOICE_REGEX.test(name);
  const matchesTargetGender =
    targetGender === 'male' ? isMale && !isFemale : isFemale && !isMale;
  const matchesOppositeGender =
    targetGender === 'male' ? isFemale : isMale;

  let score = 0;

  if (matchesTargetGender) score += 100;
  else if (!matchesOppositeGender) score += 20;
  else score -= 80;

  if (preferredLang === 'bn') {
    if (langLower.startsWith('bn')) score += 45;
    else if (langLower.startsWith('en')) score += 15;
  } else {
    if (langLower.startsWith('en-gb') || langLower.startsWith('en-us')) score += 35;
    else if (langLower.startsWith('en')) score += 25;
  }

  if (voice.localService) score += 5;
  return score;
}

function selectVoiceForGender(
  targetGender: UserGender,
  preferredLang: Language
): SpeechSynthesisVoice | null {
  const voices = refreshVoices();
  if (!voices.length) return null;

  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoice(v, targetGender, preferredLang);
    if (s > bestScore) {
      bestScore = s;
      bestVoice = v;
    }
  }
  return bestVoice;
}

export function playNotificationChime(variant: 'credit' | 'debit' | 'alert' = 'credit'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    if (variant === 'alert') {
      playTone(880, now, 0.14, 'triangle');
      playTone(698.46, now + 0.13, 0.16, 'triangle');
      playTone(1046.5, now + 0.28, 0.25, 'sine');
    } else if (variant === 'debit') {
      playTone(587.33, now, 0.14); // D5
      playTone(783.99, now + 0.12, 0.22); // G5
    } else {
      playTone(659.25, now, 0.16); // E5
      playTone(880.0, now + 0.12, 0.24); // A5
      playTone(1174.66, now + 0.24, 0.3); // D6
    }
  } catch {
    // Audio playback blocked by browser policy
  }
}

export function formatTxTypeForVoice(txType: TransactionType | string, lang: Language = 'en'): string {
  const enMap: Record<string, string> = {
    send_money: 'Send Money',
    cash_out: 'Cash Out',
    cash_in: 'Cash In',
    agent_cash_out: 'Agent Cash Out',
    merchant_cash_out: 'Merchant Cash Out',
    mobile_recharge: 'Mobile Recharge',
    bill_pay: 'Utility Bill Payment',
    merchant_payment: 'Merchant Payment',
    b2b_transfer: 'B2B Transfer',
    refund: 'Refund',
    admin_credit: 'Admin Credit',
    admin_transfer: 'Admin Transfer',
  };
  const bnMap: Record<string, string> = {
    send_money: 'সেন্ড মানি',
    cash_out: 'ক্যাশ আউট',
    cash_in: 'ক্যাশ ইন',
    agent_cash_out: 'এজেন্ট ক্যাশ আউট',
    merchant_cash_out: 'মার্চেন্ট ক্যাশ আউট',
    mobile_recharge: 'মোবাইল রিচার্জ',
    bill_pay: 'বিল পেমেন্ট',
    merchant_payment: 'মার্চেন্ট পেমেন্ট',
    b2b_transfer: 'বিটুবি ট্রান্সফার',
    refund: 'রিফান্ড',
    admin_credit: 'অ্যাডমিন ক্রেডিট',
    admin_transfer: 'অ্যাডমিন ট্রান্সফার',
  };
  return lang === 'bn' ? bnMap[txType] || 'লেনদেন' : enMap[txType] || 'transaction';
}

export interface TransactionVoiceAlertParams {
  listenerGender?: UserGender;
  amount: number;
  txType: TransactionType | string;
  direction: 'received' | 'sent' | 'pending' | 'admin';
  counterpartyName?: string;
  secondaryName?: string;
  lang?: Language;
  muted?: boolean;
}

export function playTransactionVoiceAlert(params: TransactionVoiceAlertParams): void {
  if (params.muted || getVoiceMuted()) return;

  const lang: Language = params.lang || 'en';
  const targetVoiceGender = getOppositeVoiceGender(params.listenerGender);
  const formattedAmt = Math.round(params.amount * 100) / 100 === Math.floor(params.amount)
    ? Math.floor(params.amount).toLocaleString('en-US')
    : params.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const chimeType =
    params.direction === 'pending'
      ? 'alert'
      : params.direction === 'sent'
        ? 'debit'
        : 'credit';
  playNotificationChime(chimeType);

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    const selectedVoice = selectVoiceForGender(targetVoiceGender, lang);
    const hasBnVoice = Boolean(selectedVoice && selectedVoice.lang.toLowerCase().startsWith('bn'));
    const speakLang: Language = lang === 'bn' && hasBnVoice ? 'bn' : 'en';
    const typeLabel = formatTxTypeForVoice(params.txType, speakLang);
    const cp = (params.counterpartyName || '').trim();
    const cp2 = (params.secondaryName || '').trim();

    let text = '';
    if (speakLang === 'bn') {
      if (params.direction === 'admin') {
        text = `অ্যাডমিন নোটিফিকেশন। ${formattedAmt} টাকার ${typeLabel} সম্পন্ন হয়েছে${cp ? ` ${cp}` : ''}${cp2 ? ` থেকে ${cp2} এ` : ''}।`;
      } else if (params.direction === 'pending') {
        text = `আক্যাশ অ্যালার্ট। ${formattedAmt} টাকার ${typeLabel} অ্যাডমিন অনুমোদনের জন্য পাঠানো হয়েছে।`;
      } else if (params.direction === 'received') {
        text = `আক্যাশ অ্যালার্ট। ${formattedAmt} টাকা ${typeLabel} এর মাধ্যমে আপনার অ্যাকাউন্টে জমা হয়েছে${cp ? ` ${cp} এর কাছ থেকে` : ''}।`;
      } else {
        text = `আক্যাশ অ্যালার্ট। ${formattedAmt} টাকা ${typeLabel} সম্পন্ন হয়েছে${cp ? ` ${cp} এ` : ''}।`;
      }
    } else {
      if (params.direction === 'admin') {
        text = `Admin alert. ${typeLabel} of ${formattedAmt} Taka${cp ? ` from ${cp}` : ''}${cp2 ? ` to ${cp2}` : ''}.`;
      } else if (params.direction === 'pending') {
        text = `Acash alert. High value ${typeLabel} of ${formattedAmt} Taka submitted for Admin approval.`;
      } else if (params.direction === 'received') {
        text = `Acash alert. Received ${formattedAmt} Taka via ${typeLabel}${cp ? ` from ${cp}` : ''}.`;
      } else {
        text = `Acash alert. ${typeLabel} of ${formattedAmt} Taka${cp ? ` to ${cp}` : ''} completed.`;
      }
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = speakLang === 'bn' ? 'bn-BD' : 'en-US';
    }

    // Reinforce opposite-gender pitch & cadence even if system voice pack only has neutral voices
    if (targetVoiceGender === 'male') {
      utterance.pitch = 0.84;
      utterance.rate = 0.94;
    } else {
      utterance.pitch = 1.2;
      utterance.rate = 1.01;
    }
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis unavailable
  }
}

export function playMerchantSoundbox(
  amount: number,
  payerName: string,
  lang: Language = 'en',
  listenerGender?: UserGender
): void {
  playTransactionVoiceAlert({
    listenerGender,
    amount,
    txType: 'merchant_payment',
    direction: 'received',
    counterpartyName: payerName,
    lang,
  });
}
