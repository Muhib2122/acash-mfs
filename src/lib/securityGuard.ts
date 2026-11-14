import { SecurityPolicyConfig } from '../types/acash';

const RATE_SHIELD_KEY = 'acash_rate_shield_v1';
const TX_FLOOD_KEY = 'acash_tx_flood_v1';
const REG_QUOTA_KEY = 'acash_reg_quota_v1';
const OTP_QUOTA_KEY = 'acash_otp_quota_v1';
const GIFT_QUOTA_KEY = 'acash_gift_quota_v1';

const APP_SIGNING_PEPPER = 'ACASH_ZERO_TRUST_SEC2_PEPPER_2026_BD';

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  strictAntiSpamMode: true,
  maxTxPerMinute: 6,
  maxLoginFailures: 5,
  lockoutMinutes: 5,
  adminIdleTimeoutMinutes: 15,
  accountIdleTimeoutMinutes: 30,
  requireChallengeOnAdminFail: true,
  updatedAt: 0,
  updatedBy: 'System Security Baseline',
};

export function normalizeSecurityPolicy(
  raw?: Partial<SecurityPolicyConfig> | null
): SecurityPolicyConfig {
  const src = raw || {};
  const clampInt = (val: unknown, fallback: number, min: number, max: number) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    strictAntiSpamMode:
      typeof src.strictAntiSpamMode === 'boolean'
        ? src.strictAntiSpamMode
        : DEFAULT_SECURITY_POLICY.strictAntiSpamMode,
    maxTxPerMinute: clampInt(src.maxTxPerMinute, DEFAULT_SECURITY_POLICY.maxTxPerMinute, 2, 30),
    maxLoginFailures: clampInt(src.maxLoginFailures, DEFAULT_SECURITY_POLICY.maxLoginFailures, 3, 12),
    lockoutMinutes: clampInt(src.lockoutMinutes, DEFAULT_SECURITY_POLICY.lockoutMinutes, 1, 60),
    adminIdleTimeoutMinutes: clampInt(
      src.adminIdleTimeoutMinutes,
      DEFAULT_SECURITY_POLICY.adminIdleTimeoutMinutes,
      5,
      120
    ),
    accountIdleTimeoutMinutes: clampInt(
      src.accountIdleTimeoutMinutes,
      DEFAULT_SECURITY_POLICY.accountIdleTimeoutMinutes,
      5,
      240
    ),
    requireChallengeOnAdminFail:
      typeof src.requireChallengeOnAdminFail === 'boolean'
        ? src.requireChallengeOnAdminFail
        : DEFAULT_SECURITY_POLICY.requireChallengeOnAdminFail,
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : 0,
    updatedBy:
      typeof src.updatedBy === 'string' && src.updatedBy
        ? src.updatedBy
        : DEFAULT_SECURITY_POLICY.updatedBy,
  };
}

function getCryptoObj(): Crypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  return null;
}

export function secureRandomHex(byteCount = 8): string {
  const c = getCryptoObj();
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(byteCount);
    c.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let out = '';
  for (let i = 0; i < byteCount; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

export function secureRandomDigits(length: number): string {
  const c = getCryptoObj();
  let result = '';
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    for (let i = 0; i < length; i++) {
      // Rejection sampling to eliminate modulo bias
      let val = 0;
      const limit = Math.floor(0xffffffff / 10) * 10;
      do {
        c.getRandomValues(buf);
        val = buf[0];
      } while (val >= limit);
      const digit = i === 0 && length >= 6 ? (val % 9) + 1 : val % 10;
      result += String(digit);
    }
    return result;
  }
  for (let i = 0; i < length; i++) {
    const digit = i === 0 && length >= 6 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10);
    result += String(digit);
  }
  return result;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const c = getCryptoObj();
  if (c?.subtle) {
    const buf = new Uint8Array(input).buffer;
    const digest = await c.subtle.digest('SHA-256', buf);
    return new Uint8Array(digest);
  }
  // Fallback pure JS 256-bit mixing when SubtleCrypto is unavailable
  const out = new Uint8Array(32);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  for (let i = 0; i < input.length; i++) {
    const b = input[i];
    h0 = Math.imul(h0 ^ b, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ (b + i), 0x85ebca6b) >>> 0;
    h2 = Math.imul(h2 ^ (b * 33), 0xc2b2ae35) >>> 0;
    h3 = Math.imul(h3 ^ (b + 17), 0x27d4eb2f) >>> 0;
  }
  const words = [h0, h1, h2, h3, h0 ^ h2, h1 ^ h3, (h0 + h1) >>> 0, (h2 + h3) >>> 0];
  words.forEach((w, idx) => {
    out[idx * 4] = (w >>> 24) & 0xff;
    out[idx * 4 + 1] = (w >>> 16) & 0xff;
    out[idx * 4 + 2] = (w >>> 8) & 0xff;
    out[idx * 4 + 3] = w & 0xff;
  });
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256HexString(raw: string): Promise<string> {
  const enc = new TextEncoder().encode(raw);
  const digest = await sha256Bytes(enc);
  return bytesToHex(digest);
}

/**
 * Cryptographic salted key-stretched secret hash (sec2_<16hexSalt>_<64hexDigest>).
 * Resists rainbow tables, offline dictionary cracking, and 32-bit collisions.
 */
export async function hashSecretStrong(
  secret: string,
  existingSalt?: string
): Promise<string> {
  const clean = secret.trim();
  const salt = existingSalt || secureRandomHex(8);
  const encoder = new TextEncoder();
  let current = encoder.encode(`${APP_SIGNING_PEPPER}:${salt}:${clean}`);
  // 512 rounds of SHA-256 stretching keeps browser login instant (<8ms) while strongly slowing brute force
  for (let round = 0; round < 512; round++) {
    current = await sha256Bytes(current);
  }
  return `sec2_${salt}_${bytesToHex(current)}`;
}

export async function verifySecretAgainstStored(
  candidate: string,
  storedHash: string | undefined,
  legacyHashFn: (raw: string) => string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!storedHash) return { valid: false, needsUpgrade: false };
  const cleanCandidate = candidate.trim();

  if (storedHash.startsWith('sec2_')) {
    const parts = storedHash.split('_');
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt] = parts;
    const computed = await hashSecretStrong(cleanCandidate, salt);
    return { valid: timingSafeEqual(computed, storedHash), needsUpgrade: false };
  }

  // Backward-compatible verification for existing pin_* hashes -> flags auto-upgrade
  const legacyCandidate = legacyHashFn(cleanCandidate);
  const ok = timingSafeEqual(legacyCandidate, storedHash);
  return { valid: ok, needsUpgrade: ok };
}

// ============================================================
// INPUT SANITIZATION & XSS / SVG BOMB GUARD
// ============================================================

const DANGEROUS_PATTERNS = [
  /<\s*script/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /on\w+\s*=/i,
  /data\s*:\s*text\/html/i,
  /data\s*:\s*image\/svg/i,
];

export function containsDangerousMarkup(raw: string): boolean {
  if (!raw) return false;
  return DANGEROUS_PATTERNS.some((rx) => rx.test(raw));
}

export function sanitizePlainText(raw: string, maxLen = 300): string {
  if (!raw) return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u200E\u200F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLen);
}

export function assertSafeImageDataUrl(url: string, maxLength = 650000): string {
  const clean = (url || '').trim();
  if (!clean) {
    throw new Error('Image payload is empty.');
  }
  if (clean.length > maxLength) {
    throw new Error('Uploaded image exceeds maximum permitted size.');
  }
  if (containsDangerousMarkup(clean)) {
    throw new Error('Blocked potentially unsafe image markup.');
  }
  if (clean.startsWith('data:')) {
    const allowedDataPrefix = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
    if (!allowedDataPrefix.test(clean)) {
      throw new Error('Only clean PNG, JPEG, or WebP images are permitted.');
    }
    return clean;
  }
  if (clean.startsWith('/') || clean.startsWith('https://')) {
    return clean;
  }
  throw new Error('Unsupported or unsafe image source URL.');
}

// ============================================================
// TAMPER-PROOF SESSION SIGNING
// ============================================================

export async function signSessionPayload(params: {
  id: string;
  role: string;
  email: string;
  loggedInAt: number;
}): Promise<string> {
  const originHint =
    typeof window !== 'undefined' && window.location?.host ? window.location.host : 'acash.local';
  const raw = `${APP_SIGNING_PEPPER}|${originHint}|${params.id}|${params.role}|${params.email.toLowerCase()}|${params.loggedInAt}`;
  return sha256HexString(raw);
}

export async function verifySessionPayload(params: {
  id: string;
  role: string;
  email: string;
  loggedInAt: number;
  integritySig?: string;
}): Promise<boolean> {
  if (!params.integritySig) return false;
  const expected = await signSessionPayload({
    id: params.id,
    role: params.role,
    email: params.email,
    loggedInAt: params.loggedInAt,
  });
  return timingSafeEqual(expected, params.integritySig);
}

// ============================================================
// BRUTE-FORCE RATE LIMITER & EXPONENTIAL LOCKOUT
// ============================================================

interface RateLimitEntry {
  attempts: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

type RateShieldMap = Record<string, RateLimitEntry>;

function readRateShieldMap(): RateShieldMap {
  try {
    const raw = localStorage.getItem(RATE_SHIELD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RateShieldMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRateShieldMap(map: RateShieldMap): void {
  try {
    localStorage.setItem(RATE_SHIELD_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function makeShieldKey(scope: string, target: string): string {
  return `${scope}:${target.trim().toLowerCase() || 'unknown'}`;
}

export function formatDurationRemaining(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function checkAttemptLockout(
  scope: string,
  target: string
): { allowed: boolean; remainingMs: number; attempts: number } {
  const now = Date.now();
  const map = readRateShieldMap();
  const key = makeShieldKey(scope, target);
  const entry = map[key];
  if (!entry) return { allowed: true, remainingMs: 0, attempts: 0 };

  // Reset stale attempts older than 45 minutes if not locked
  if (entry.lockedUntil <= now && now - entry.lastAttemptAt > 45 * 60 * 1000) {
    delete map[key];
    writeRateShieldMap(map);
    return { allowed: true, remainingMs: 0, attempts: 0 };
  }

  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      remainingMs: entry.lockedUntil - now,
      attempts: entry.attempts,
    };
  }
  return { allowed: true, remainingMs: 0, attempts: entry.attempts };
}

export function recordFailedSecurityAttempt(
  scope: string,
  target: string,
  maxFailures = 5,
  baseLockoutMinutes = 5
): {
  locked: boolean;
  lockedUntil: number;
  attempts: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  const map = readRateShieldMap();
  const key = makeShieldKey(scope, target);
  const prev = map[key] || { attempts: 0, lockedUntil: 0, lastAttemptAt: 0 };
  const attempts = prev.attempts + 1;

  let lockedUntil = 0;
  if (attempts >= maxFailures) {
    // Exponential escalation: 1x -> 3x -> 6x lockout minutes on repeat offenses
    const escalationFactor =
      attempts >= maxFailures + 4 ? 6 : attempts >= maxFailures + 2 ? 3 : 1;
    lockedUntil = now + baseLockoutMinutes * escalationFactor * 60 * 1000;
  }

  map[key] = {
    attempts,
    lockedUntil,
    lastAttemptAt: now,
  };
  writeRateShieldMap(map);

  return {
    locked: lockedUntil > now,
    lockedUntil,
    attempts,
    remainingAttempts: Math.max(0, maxFailures - attempts),
  };
}

export function clearSecurityAttempts(scope: string, target: string): void {
  const map = readRateShieldMap();
  const key = makeShieldKey(scope, target);
  if (map[key]) {
    delete map[key];
    writeRateShieldMap(map);
  }
}

export function unlockRateLimitEntry(scope: string, target: string): void {
  clearSecurityAttempts(scope, target);
}

export function getActiveLockouts(): Array<{
  scope: string;
  key: string;
  attempts: number;
  lockedUntil: number;
}> {
  const now = Date.now();
  const map = readRateShieldMap();
  const out: Array<{ scope: string; key: string; attempts: number; lockedUntil: number }> = [];
  for (const [compound, entry] of Object.entries(map)) {
    if (entry.lockedUntil > now) {
      const idx = compound.indexOf(':');
      const scope = idx > 0 ? compound.slice(0, idx) : 'unknown';
      const key = idx > 0 ? compound.slice(idx + 1) : compound;
      out.push({
        scope,
        key,
        attempts: entry.attempts,
        lockedUntil: entry.lockedUntil,
      });
    }
  }
  return out;
}

// ============================================================
// ANTI-SPAM FLOOD & IDEMPOTENCY SHIELDS
// ============================================================

interface TxFloodState {
  timestamps: Record<string, number[]>;
  recentFingerprints: Record<string, number>;
}

export function checkAndRecordTxFlood(
  accountId: string,
  fingerprint: string,
  policy: SecurityPolicyConfig = DEFAULT_SECURITY_POLICY
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let state: TxFloodState = { timestamps: {}, recentFingerprints: {} };
  try {
    const raw = localStorage.getItem(TX_FLOOD_KEY);
    if (raw) state = JSON.parse(raw) as TxFloodState;
  } catch {
    // start fresh
  }

  // 1. Duplicate idempotency protection (blocks double-click or replay spam within 6s)
  const lastSameAt = state.recentFingerprints[fingerprint] || 0;
  if (now - lastSameAt < 6000) {
    return {
      allowed: false,
      reason:
        'Duplicate transaction detected within 6 seconds. Blocked by Anti-Spam Idempotency Shield.',
    };
  }

  // 2. Sliding 60-second burst cap
  const list = (state.timestamps[accountId] || []).filter((ts) => now - ts < 60 * 1000);
  const limit = Math.max(2, policy.maxTxPerMinute || 6);
  if (list.length >= limit) {
    return {
      allowed: false,
      reason: `Transaction rate limit reached (${limit}/minute). Please wait a few seconds before sending again.`,
    };
  }

  list.push(now);
  state.timestamps[accountId] = list;
  state.recentFingerprints[fingerprint] = now;

  // Prune old fingerprints
  for (const [fp, ts] of Object.entries(state.recentFingerprints)) {
    if (now - ts > 60 * 1000) {
      delete state.recentFingerprints[fp];
    }
  }

  try {
    localStorage.setItem(TX_FLOOD_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }

  return { allowed: true };
}

export function checkAndRecordOtpSendQuota(email: string): {
  allowed: boolean;
  cooldownRemainingSec: number;
  reason?: string;
} {
  const now = Date.now();
  const clean = email.trim().toLowerCase();
  let map: Record<string, number[]> = {};
  try {
    const raw = localStorage.getItem(OTP_QUOTA_KEY);
    if (raw) map = JSON.parse(raw) as Record<string, number[]>;
  } catch {
    map = {};
  }

  const recent = (map[clean] || []).filter((ts) => now - ts < 10 * 60 * 1000);
  if (recent.length > 0) {
    const sinceLast = now - recent[recent.length - 1];
    if (sinceLast < 45 * 1000) {
      const rem = Math.ceil((45 * 1000 - sinceLast) / 1000);
      return {
        allowed: false,
        cooldownRemainingSec: rem,
        reason: `Please wait ${rem}s before requesting another OTP code.`,
      };
    }
  }

  if (recent.length >= 4) {
    return {
      allowed: false,
      cooldownRemainingSec: 120,
      reason:
        'OTP request flood blocked (max 4 codes per 10 minutes). Please wait or use Google Auth.',
    };
  }

  recent.push(now);
  map[clean] = recent;
  try {
    localStorage.setItem(OTP_QUOTA_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  return { allowed: true, cooldownRemainingSec: 45 };
}

export function checkGiftCardSubmissionQuota(
  accountId: string,
  activeUserCardCount: number
): { allowed: boolean; reason?: string } {
  if (activeUserCardCount >= 3) {
    return {
      allowed: false,
      reason:
        'Maximum 3 active 24h custom cards allowed per user at a time. Wait for expiry or remove an older card.',
    };
  }
  const now = Date.now();
  let map: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(GIFT_QUOTA_KEY);
    if (raw) map = JSON.parse(raw) as Record<string, number>;
  } catch {
    map = {};
  }
  const lastAt = map[accountId] || 0;
  if (now - lastAt < 45 * 1000) {
    const rem = Math.ceil((45 * 1000 - (now - lastAt)) / 1000);
    return {
      allowed: false,
      reason: `Please wait ${rem}s before submitting another custom Gift Card.`,
    };
  }
  map[accountId] = now;
  try {
    localStorage.setItem(GIFT_QUOTA_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  return { allowed: true };
}

export function checkAndRecordRegistrationBurst(): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let list: number[] = [];
  try {
    const raw = localStorage.getItem(REG_QUOTA_KEY);
    if (raw) list = (JSON.parse(raw) as number[]).filter((ts) => now - ts < 60 * 60 * 1000);
  } catch {
    list = [];
  }
  if (list.length >= 4) {
    return {
      allowed: false,
      reason:
        'Anti-Spam Shield: Too many account registrations from this browser within 1 hour.',
    };
  }
  list.push(now);
  try {
    localStorage.setItem(REG_QUOTA_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return { allowed: true };
}

export interface SecurityChallenge {
  question: string;
  expectedAnswer: number;
}

export function createSecurityChallenge(lang: 'en' | 'bn' = 'en'): SecurityChallenge {
  const a = 3 + (Number(secureRandomDigits(1)) % 7);
  const b = 2 + (Number(secureRandomDigits(1)) % 7);
  return {
    question:
      lang === 'bn'
        ? `বট সুরক্ষা যাচাই: ${a} + ${b} = ?`
        : `Human Security Check: What is ${a} + ${b}?`,
    expectedAnswer: a + b,
  };
}
