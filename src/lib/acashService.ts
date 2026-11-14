import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  ensureFirebaseAuthSession,
  handleFirestoreError,
  isPermissionError,
  OperationType,
  signOutFirebase,
  subscribeToFirebaseAuth,
} from './firebase';
import {
  sendAccountCreatedEmails,
  sendHighValueDecisionEmails,
  sendHighValuePendingEmails,
} from './emailjs';
import {
  AcashBooth,
  AcashDirectoryEntry,
  AcashIdentityLock,
  AcashMapLocation,
  AcashTransaction,
  AcashUser,
  AccountNotification,
  AccountNotificationCategory,
  AccountStatus,
  AdminActivityLog,
  AdminActivityType,
  AdminNotification,
  BillerId,
  BoothStatus,
  CreatorMapRole,
  CustomGiftCardRecord,
  FeeBreakdown,
  FeeConfig,
  GiftCardCatalogPolicy,
  GiftCardGovernanceEntry,
  GiftCardPayload,
  IdentityLockType,
  KycInfo,
  KycSubmissionRecord,
  MainAdminCredentialConfig,
  MainTreasuryVault,
  OperatorId,
  PortalThemeConfig,
  PortalThemePresetId,
  PortalThemeSurfacePreference,
  ReferralSource,
  SecondAdminProfile,
  TransactionType,
  TreasuryMintHistoryEntry,
  UserGender,
  UserMapLocation,
  UserRole,
} from '../types/acash';
import {
  clampToMaxWords,
  countWords,
  GIFT_CARD_FEE_BDT,
  GIFT_CARD_MAX_WORDS,
  isGiftCardExpired,
  syncCustomGiftCardsRegistry,
  syncGiftCardPolicyRegistry,
  USER_GIFT_CARD_TTL_MS,
} from './giftCards';
import { DEFAULT_PORTAL_THEME_CONFIG, PORTAL_THEME_PRESETS } from './portalThemes';
import { detectIpGeolocation } from './ipGeo';

const USERS_COL = 'acash_users';
const KYC_SUBMISSIONS_COL = 'acash_kyc_submissions';
const DIRECTORY_COL = 'acash_directory';
const LOCKS_COL = 'acash_identity_locks';
const TX_COL = 'acash_transactions';
const BOOTHS_COL = 'acash_booths';
const MAP_LOCATIONS_COL = 'acash_map_locations';
const SECOND_ADMINS_COL = 'acash_second_admins';
const SETTINGS_COL = 'acash_settings';
const GIFT_CARDS_COL = 'acash_gift_cards';
const ADMIN_NOTIF_COL = 'acash_admin_notifications';
const ACCOUNT_NOTIF_COL = 'acash_account_notifications';
const ADMIN_ACTIVITY_COL = 'acash_admin_activity_logs';
const FEE_DOC_ID = 'fee_config';
const ADMIN_ALERT_DOC_ID = 'admin_alert';
const MAIN_ADMIN_CREDS_DOC_ID = 'main_admin_credentials';
const TREASURY_VAULT_DOC_ID = 'treasury_vault';
const PORTAL_THEME_DOC_ID = 'portal_theme';
const GIFT_CARD_OVERRIDES_DOC_ID = 'gift_card_overrides';
const LOCAL_DB_KEY = 'acash_local_db_v1';
const BOTS_PURGED_FLAG_KEY = 'acash_legacy_bots_purged_v1';
const LAST_REG_TS_KEY = 'acash_last_registration_ts';
const LOCAL_SYNC_EVENT = 'acash-db-sync';

export const DEFAULT_GIFT_CARD_POLICY: GiftCardCatalogPolicy = {
  overrides: {},
  updatedAt: 0,
  updatedBy: '',
};

export const MAIN_ADMIN_EMAIL = 'aiub.muhib@gmail.com';
export const DEFAULT_MAIN_ADMIN_PASSWORD = '1111';
export const DEFAULT_ADMIN_ALERT_EMAIL = MAIN_ADMIN_EMAIL;

export function isMainAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase();
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  feePer1000: 11.5,
  agentShare: 3.6,
  govtShare: 1.5,
  adminShare: 6.4,

  merchantCashOutFeePer1000: 11.5,
  merchantCashOutAgentShare: 3.6,
  merchantCashOutGovtShare: 1.5,
  merchantCashOutAdminShare: 6.4,

  merchantCashOutToAdminFeePer1000: 0,
  merchantCashOutToAdminGovtShare: 0,
  merchantCashOutToAdminShare: 0,

  sendMoneyChargeMode: 'flat_above_threshold',
  sendMoneyFreeThreshold: 1000,
  sendMoneyFeeRate: 5.0,
  sendMoneyGovtShare: 0.75,
  sendMoneyAdminShare: 4.25,

  cashInCommissionPer1000: 4.0,
  highValueThreshold: 50000,
  updatedAt: Date.now(),
  updatedBy: 'System Default',
};

export const DEFAULT_TREASURY_VAULT: MainTreasuryVault = {
  vaultId: 'ADMIN-TREASURY',
  balance: 0,
  totalMinted: 0,
  totalDisbursed: 0,
  mintHistory: [],
  updatedAt: Date.now(),
  updatedBy: MAIN_ADMIN_EMAIL,
};

export function normalizeTreasuryVault(raw?: Partial<MainTreasuryVault> | null): MainTreasuryVault {
  const src = raw || {};
  const numOrZero = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0;
  };
  const rawHistory = Array.isArray(src.mintHistory) ? src.mintHistory : [];
  const mintHistory: TreasuryMintHistoryEntry[] = rawHistory
    .filter((entry): entry is TreasuryMintHistoryEntry => Boolean(entry && typeof entry.id === 'string' && typeof entry.timestamp === 'number'))
    .map((entry) => ({
      id: entry.id,
      action: entry.action === 'refresh' ? ('refresh' as const) : ('mint' as const),
      amount: numOrZero(entry.amount),
      previousBalance: numOrZero(entry.previousBalance),
      newBalance: numOrZero(entry.newBalance),
      note: typeof entry.note === 'string' ? entry.note : '',
      actorEmail: typeof entry.actorEmail === 'string' && entry.actorEmail ? entry.actorEmail : MAIN_ADMIN_EMAIL,
      timestamp: entry.timestamp,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 250);

  return {
    vaultId: 'ADMIN-TREASURY',
    balance: numOrZero(src.balance),
    totalMinted: numOrZero(src.totalMinted),
    totalDisbursed: numOrZero(src.totalDisbursed),
    ...(typeof src.lastMintAmount === 'number' ? { lastMintAmount: src.lastMintAmount } : {}),
    ...(typeof src.lastMintNote === 'string' && src.lastMintNote ? { lastMintNote: src.lastMintNote } : {}),
    mintHistory,
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now(),
    updatedBy: typeof src.updatedBy === 'string' && src.updatedBy ? src.updatedBy : MAIN_ADMIN_EMAIL,
  };
}

function nonNegNum(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(2)) : fallback;
}

export function normalizeFeeConfig(raw?: Partial<FeeConfig> | null): FeeConfig {
  const src = raw || {};
  const agentShare = nonNegNum(src.agentShare, DEFAULT_FEE_CONFIG.agentShare);
  const govtShare = nonNegNum(src.govtShare, DEFAULT_FEE_CONFIG.govtShare);
  const adminShare = nonNegNum(src.adminShare, DEFAULT_FEE_CONFIG.adminShare);
  const feePer1000 = Number((agentShare + govtShare + adminShare).toFixed(2));

  const merchantCashOutAgentShare = nonNegNum(
    src.merchantCashOutAgentShare,
    src.agentShare !== undefined ? agentShare : DEFAULT_FEE_CONFIG.merchantCashOutAgentShare
  );
  const merchantCashOutGovtShare = nonNegNum(
    src.merchantCashOutGovtShare,
    src.govtShare !== undefined ? govtShare : DEFAULT_FEE_CONFIG.merchantCashOutGovtShare
  );
  const merchantCashOutAdminShare = nonNegNum(
    src.merchantCashOutAdminShare,
    src.adminShare !== undefined ? adminShare : DEFAULT_FEE_CONFIG.merchantCashOutAdminShare
  );
  const merchantCashOutFeePer1000 = Number(
    (merchantCashOutAgentShare + merchantCashOutGovtShare + merchantCashOutAdminShare).toFixed(2)
  );

  const merchantCashOutToAdminGovtShare = nonNegNum(
    src.merchantCashOutToAdminGovtShare,
    DEFAULT_FEE_CONFIG.merchantCashOutToAdminGovtShare
  );
  const merchantCashOutToAdminShare = nonNegNum(
    src.merchantCashOutToAdminShare,
    DEFAULT_FEE_CONFIG.merchantCashOutToAdminShare
  );
  const merchantCashOutToAdminFeePer1000 = Number(
    (merchantCashOutToAdminGovtShare + merchantCashOutToAdminShare).toFixed(2)
  );

  const sendMoneyGovtShare = nonNegNum(
    src.sendMoneyGovtShare,
    DEFAULT_FEE_CONFIG.sendMoneyGovtShare
  );
  const sendMoneyAdminShare = nonNegNum(
    src.sendMoneyAdminShare,
    DEFAULT_FEE_CONFIG.sendMoneyAdminShare
  );
  const sendMoneyFeeRate = Number((sendMoneyGovtShare + sendMoneyAdminShare).toFixed(2));

  return {
    feePer1000,
    agentShare,
    govtShare,
    adminShare,
    merchantCashOutFeePer1000,
    merchantCashOutAgentShare,
    merchantCashOutGovtShare,
    merchantCashOutAdminShare,
    merchantCashOutToAdminFeePer1000,
    merchantCashOutToAdminGovtShare,
    merchantCashOutToAdminShare,
    sendMoneyChargeMode:
      src.sendMoneyChargeMode === 'per_1000' ? 'per_1000' : 'flat_above_threshold',
    sendMoneyFreeThreshold: nonNegNum(
      src.sendMoneyFreeThreshold,
      DEFAULT_FEE_CONFIG.sendMoneyFreeThreshold
    ),
    sendMoneyFeeRate,
    sendMoneyGovtShare,
    sendMoneyAdminShare,
    cashInCommissionPer1000: nonNegNum(
      src.cashInCommissionPer1000,
      DEFAULT_FEE_CONFIG.cashInCommissionPer1000
    ),
    highValueThreshold: Math.max(
      1000,
      nonNegNum(src.highValueThreshold, DEFAULT_FEE_CONFIG.highValueThreshold)
    ),
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : DEFAULT_FEE_CONFIG.updatedAt,
    updatedBy: typeof src.updatedBy === 'string' && src.updatedBy ? src.updatedBy : 'System Default',
  };
}

export function hashPin(pin: string): string {
  let hash = 5381;
  const salted = `acash_v1_${pin.trim()}`;
  for (let i = 0; i < salted.length; i++) {
    hash = (hash * 33) ^ salted.charCodeAt(i);
  }
  return `pin_${(hash >>> 0).toString(16)}`;
}

export function generateAccountId(role: UserRole): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `${role}-${num}`;
}

export function generateTxHash(): string {
  const chars = '0123456789ABCDEF';
  let hash = '0xAC';
  for (let i = 0; i < 12; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

export function generateTxId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TXN-${ts}-${rand}`;
}

export function normalizeBdPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) {
    return digits.slice(2);
  }
  return digits;
}

function normalizeNidForLock(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeTaxForLock(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sha256Hex(raw: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoded = new TextEncoder().encode(raw);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback below
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

async function buildIdentityLockId(lockType: IdentityLockType, rawValue: string): Promise<string> {
  if (lockType === 'phone') {
    return `phone_${normalizeBdPhone(rawValue)}`;
  }
  if (lockType === 'email') {
    const hash = await sha256Hex(`acash_lock_email_${rawValue.trim().toLowerCase()}`);
    return `email_${hash}`;
  }
  if (lockType === 'nid') {
    const hash = await sha256Hex(`acash_lock_nid_${normalizeNidForLock(rawValue)}`);
    return `nid_${hash}`;
  }
  const hash = await sha256Hex(`acash_lock_tax_${normalizeTaxForLock(rawValue)}`);
  return `tax_${hash}`;
}

function identityConflictMessage(lockType: IdentityLockType): string {
  switch (lockType) {
    case 'email':
      return 'An Acash account already exists with this Gmail address. One Gmail can only create one Acash account.';
    case 'phone':
      return 'An Acash account already exists with this mobile number. One mobile number can only create one Acash account.';
    case 'nid':
      return 'This NID / Passport number is already registered with another Acash account. Same KYC info cannot be used on multiple accounts.';
    case 'tax':
      return 'This Tax Certificate (TIN / BIN) number is already registered with another Acash Merchant account.';
  }
}

async function checkIdentityLockAvailable(
  lockType: IdentityLockType,
  rawValue: string,
  excludeAccountId?: string
): Promise<void> {
  const lockId = await buildIdentityLockId(lockType, rawValue);
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(lockId)) return;
  try {
    const snap = await getDoc(doc(db, LOCKS_COL, lockId));
    if (snap.exists()) {
      const existing = snap.data() as AcashIdentityLock;
      if (!excludeAccountId || existing.accountId !== excludeAccountId) {
        throw new Error(identityConflictMessage(lockType));
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already')) {
      throw err;
    }
  }
}

async function claimIdentityLock(
  lockType: IdentityLockType,
  rawValue: string,
  accountId: string,
  createdAt: number
): Promise<void> {
  const lockId = await buildIdentityLockId(lockType, rawValue);
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(lockId)) return;
  const ref = doc(db, LOCKS_COL, lockId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as AcashIdentityLock;
      if (existing.accountId === accountId) {
        return;
      }
      throw new Error(identityConflictMessage(lockType));
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already')) {
      throw err;
    }
  }
  const lockDoc: AcashIdentityLock = {
    lockId,
    lockType,
    accountId,
    createdAt,
  };
  await setDoc(ref, lockDoc);
}

async function releaseIdentityLock(
  lockType: IdentityLockType,
  rawValue: string
): Promise<void> {
  if (!rawValue) return;
  const lockId = await buildIdentityLockId(lockType, rawValue);
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(lockId)) return;
  await deleteDoc(doc(db, LOCKS_COL, lockId)).catch(() => {});
}

async function backfillUserIdentityLocks(user: AcashUser): Promise<void> {
  if (!user?.accountId) return;
  const created = user.createdAt || Date.now();
  if (user.email) {
    await claimIdentityLock('email', user.email, user.accountId, created).catch(() => {});
  }
  if (user.phone) {
    await claimIdentityLock('phone', user.phone, user.accountId, created).catch(() => {});
  }
  if (user.kyc?.nidNumber) {
    await claimIdentityLock('nid', user.kyc.nidNumber, user.accountId, created).catch(() => {});
  }
  if (user.kyc?.taxCertificateNumber) {
    await claimIdentityLock('tax', user.kyc.taxCertificateNumber, user.accountId, created).catch(
      () => {}
    );
  }
}

const LEGACY_BOT_USER_IDS = new Set(['U-100001', 'A-200001', 'M-300001', 'M-300002']);
const LEGACY_BOT_ADMIN_IDS = new Set(['ADM-200001', 'ADM-200002']);
const LEGACY_BOT_EMAILS = new Set([
  'nafis.customer@gmail.com',
  'karim.agent@gmail.com',
  'aarong.merchant@gmail.com',
  'walton.b2b@gmail.com',
  'rafiq.admin@acash.com',
  'nusrat.admin@acash.com',
]);
const LEGACY_BOT_PHONES = new Set([
  '01711000001',
  '01811000002',
  '01911000003',
  '01611000004',
  '01799000101',
  '01799000102',
]);

function isSpamOrBotPhone(phone: string): string | null {
  if (!/^01[3-9]\d{8}$/.test(phone)) {
    return 'Enter a valid 11-digit Bangladesh mobile number (e.g. 017XXXXXXXX).';
  }
  if (LEGACY_BOT_PHONES.has(phone)) {
    return 'Dummy/reserved system mobile numbers cannot be used for registration.';
  }
  if (/^01[3-9](\d)\1{7}$/.test(phone) || /(01234567|12345678|23456789|98765432)/.test(phone)) {
    return 'Invalid or repetitive spam phone pattern detected. Use a genuine mobile number.';
  }
  return null;
}

function isSpamOrBotEmail(email: string): string | null {
  const lower = email.trim().toLowerCase();
  if (LEGACY_BOT_EMAILS.has(lower)) {
    return 'Reserved legacy emails cannot be used for registration.';
  }
  const localPart = lower.split('@')[0] || '';
  if (
    localPart.length < 3 ||
    /^(bot|spam|fake|testbot|dummy|noreply)/.test(localPart) ||
    /\+bot\d*/i.test(localPart)
  ) {
    return 'Automated/bot-like Gmail addresses are blocked by Acash Anti-Spam Security.';
  }
  return null;
}

export async function checkRegistrationIdentityAvailability(params: {
  phone: string;
  email: string;
}): Promise<void> {
  const phone = normalizeBdPhone(params.phone);
  const email = params.email.trim().toLowerCase();

  if (phone) {
    const phoneErr = isSpamOrBotPhone(phone);
    if (phoneErr) throw new Error(phoneErr);
  }
  if (email) {
    const emailErr = isSpamOrBotEmail(email);
    if (emailErr) throw new Error(emailErr);
  }

  // 1. Check local synchronized store for both phone and Gmail
  const store = readLocalStore();
  for (const u of Object.values(store.users)) {
    if (phone && normalizeBdPhone(u.phone) === phone) {
      throw new Error(identityConflictMessage('phone'));
    }
    if (email && u.email && u.email.trim().toLowerCase() === email) {
      throw new Error(identityConflictMessage('email'));
    }
  }

  // 2. Check Firestore public routing directory for phone
  if (phone) {
    try {
      const dupDirSnap = await getDocs(
        query(collection(db, DIRECTORY_COL), where('phone', '==', phone), limit(1))
      );
      if (!dupDirSnap.empty) {
        throw new Error(identityConflictMessage('phone'));
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('already')) {
        throw err;
      }
    }
  }

  // 3. Check Firestore acash_users if caller has read permission (e.g., matching Google email or Admin)
  if (email) {
    try {
      const dupEmailSnap = await getDocs(
        query(collection(db, USERS_COL), where('email', '==', email), limit(1))
      );
      if (!dupEmailSnap.empty) {
        throw new Error(identityConflictMessage('email'));
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('already')) {
        throw err;
      }
    }
  }

  // 4. Check zero-PII global deterministic identity locks across all portals & devices
  if (phone) {
    await checkIdentityLockAvailable('phone', phone);
  }
  if (email) {
    await checkIdentityLockAvailable('email', email);
  }
}

function normalizeAccountIdInput(input: string): string {
  const clean = input.trim().toUpperCase().replace(/\s+/g, '');
  const match = clean.match(/^([UAM])-?(\d{6})$/);
  if (match) return `${match[1]}-${match[2]}`;
  return clean;
}

function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

// ---------- Synchronized Resilient Store ----------
interface LocalStoreState {
  users: Record<string, AcashUser>;
  transactions: Record<string, AcashTransaction>;
  booths: Record<string, AcashBooth>;
  mapLocations: Record<string, AcashMapLocation>;
  secondAdmins: Record<string, SecondAdminProfile>;
  notifications: Record<string, AdminNotification>;
  accountNotifications: Record<string, AccountNotification>;
  activityLogs: Record<string, AdminActivityLog>;
  feeConfig: FeeConfig;
  adminAlertEmail: string;
  mainAdminCredentials: MainAdminCredentialConfig;
  treasuryVault: MainTreasuryVault;
  customGiftCards?: Record<string, CustomGiftCardRecord>;
  giftCardPolicy?: GiftCardCatalogPolicy;
  portalTheme?: PortalThemeConfig;
}

let firestoreBackendMode: 'firestore' | 'local_sync' = 'firestore';

export function getBackendSyncMode(): 'firestore' | 'local_sync' {
  return firestoreBackendMode;
}

function buildSeedUsers(): Record<string, AcashUser> {
  return {};
}

function buildDefaultNotifications(): Record<string, AdminNotification> {
  const id = 'NTF-BOOT-1';
  return {
    [id]: {
      id,
      title: 'Acash AML & Fee Engine Active',
      message: 'Real-time monitoring active for 50,000+ BDT reviews, account status changes, and treasury operations.',
      category: 'fee_update',
      severity: 'info',
      createdAt: Date.now() - 60000,
      read: false,
      targetSection: 'overview',
    },
  };
}

function buildDefaultActivityLogs(): Record<string, AdminActivityLog> {
  const id = 'ACT-BOOT-1';
  return {
    [id]: {
      id,
      actionType: 'fee_update',
      title: 'Default Fee Engine Initialized (৳11.50/1,000)',
      details:
        'Platform fee distribution set to Agent ৳3.60, Govt ৳1.50, Admin ৳6.40 per 1,000 BDT; 50,000+ BDT AML threshold active.',
      actorEmail: 'System Compliance',
      timestamp: Date.now() - 120000,
    },
  };
}

function makeActivityEntry(params: {
  idPrefix: string;
  actionType: AdminActivityType;
  title: string;
  details: string;
  actorEmail: string;
  targetIds?: string[];
  amount?: number;
  timestamp?: number;
}): AdminActivityLog {
  const ts = params.timestamp || Date.now();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return {
    id: `${params.idPrefix}-${ts.toString(36).toUpperCase()}-${rand}`,
    actionType: params.actionType,
    title: params.title,
    details: params.details,
    actorEmail: params.actorEmail || 'Admin',
    ...(params.targetIds && params.targetIds.length > 0 ? { targetIds: params.targetIds } : {}),
    ...(typeof params.amount === 'number' ? { amount: params.amount } : {}),
    timestamp: ts,
  };
}

function buildSeedBooths(): Record<string, AcashBooth> {
  const now = Date.now();
  const list: AcashBooth[] = [
    {
      boothId: 'BTH-AGT-01',
      boothType: 'agent_booth',
      name: 'Motijheel Financial Hub Agent Booth',
      area: 'Motijheel',
      city: 'Dhaka',
      address: '42 Dilkusha C/A, Ground Floor Arcade, Motijheel, Dhaka 1000',
      phone: '01811000002',
      hours: '08:30 AM – 10:00 PM',
      status: 'open',
      lat: 23.7272,
      lng: 90.4174,
      services: ['Cash-In', 'Cash-Out', 'Merchant Settlement', 'Agent Account Opening'],
      queueWaitMinutes: 3,
      cashLiquidityLevel: 'high',
      createdAt: now - 86400000 * 30,
      updatedAt: now,
    },
    {
      boothId: 'BTH-SUP-01',
      boothType: 'support_booth',
      name: 'Acash Central Customer Care & KYC Lounge',
      area: 'Motijheel',
      city: 'Dhaka',
      address: 'Acash Tower, Level 2, 18 Toyenbee Circular Rd, Motijheel, Dhaka',
      phone: '16247',
      hours: '09:00 AM – 06:00 PM',
      status: 'open',
      lat: 23.7329,
      lng: 90.4192,
      services: ['KYC Verification', 'Account Recovery', '50K+ AML Escalation', 'PIN Reset'],
      queueWaitMinutes: 7,
      createdAt: now - 86400000 * 30,
      updatedAt: now,
    },
    {
      boothId: 'BTH-AGT-02',
      boothType: 'agent_booth',
      name: 'Gulshan-2 Circle Agent Express Booth',
      area: 'Gulshan',
      city: 'Dhaka',
      address: 'Road 45, Plot 14, Gulshan-2 Circle, Dhaka 1212',
      phone: '01811000102',
      hours: '09:00 AM – 11:00 PM',
      status: 'open',
      lat: 23.7949,
      lng: 90.4144,
      services: ['Cash-In', 'Cash-Out', 'High-Volume Float', 'Bill Pay Assist'],
      queueWaitMinutes: 4,
      cashLiquidityLevel: 'high',
      createdAt: now - 86400000 * 24,
      updatedAt: now,
    },
    {
      boothId: 'BTH-SUP-02',
      boothType: 'support_booth',
      name: 'Banani Flagship Customer Support Booth',
      area: 'Banani',
      city: 'Dhaka',
      address: 'House 78, Road 11, Block M, Banani, Dhaka 1213',
      phone: '09612001122',
      hours: '09:30 AM – 07:30 PM',
      status: 'busy',
      lat: 23.7937,
      lng: 90.4066,
      services: ['KYC Update', 'Merchant Tax Cert Audit', 'Dispute Resolution', 'Cardless PIN Help'],
      queueWaitMinutes: 14,
      createdAt: now - 86400000 * 22,
      updatedAt: now,
    },
    {
      boothId: 'BTH-AGT-03',
      boothType: 'agent_booth',
      name: 'Dhanmondi 27 Square Agent Point',
      area: 'Dhanmondi',
      city: 'Dhaka',
      address: 'Shop 9, Rapa Plaza Annex, Mirpur Road, Dhanmondi 27, Dhaka',
      phone: '01811000203',
      hours: '08:00 AM – 10:30 PM',
      status: 'open',
      lat: 23.7561,
      lng: 90.3755,
      services: ['Cash-In', 'Cash-Out', 'Student Account Help', 'Mobile Recharge'],
      queueWaitMinutes: 5,
      cashLiquidityLevel: 'medium',
      createdAt: now - 86400000 * 18,
      updatedAt: now,
    },
    {
      boothId: 'BTH-SUP-03',
      boothType: 'support_booth',
      name: 'Dhanmondi Care & Merchant Onboarding Booth',
      area: 'Dhanmondi',
      city: 'Dhaka',
      address: 'Satmasjid Road, House 41, Level 1, Dhanmondi 15, Dhaka',
      phone: '09612001133',
      hours: '09:00 AM – 06:30 PM',
      status: 'open',
      lat: 23.7438,
      lng: 90.3728,
      services: ['Merchant Onboarding', 'Soundbox Replacement', 'KYC Verification', 'Fraud Desk'],
      queueWaitMinutes: 6,
      createdAt: now - 86400000 * 16,
      updatedAt: now,
    },
    {
      boothId: 'BTH-AGT-04',
      boothType: 'agent_booth',
      name: 'Mirpur-10 Metro Junction Agent Booth',
      area: 'Mirpur',
      city: 'Dhaka',
      address: 'Shah Ali Plaza East Gate, Mirpur-10 Circle, Dhaka 1216',
      phone: '01811000304',
      hours: '08:00 AM – 11:00 PM',
      status: 'busy',
      lat: 23.8069,
      lng: 90.3687,
      services: ['Cash-In', 'Cash-Out', 'Utility Bill Pay', 'B2B Agent Float'],
      queueWaitMinutes: 11,
      cashLiquidityLevel: 'high',
      createdAt: now - 86400000 * 15,
      updatedAt: now,
    },
    {
      boothId: 'BTH-AGT-05',
      boothType: 'agent_booth',
      name: 'Uttara Sector-7 Azampur Agent Kiosk',
      area: 'Uttara',
      city: 'Dhaka',
      address: 'House 21, Lake Drive Road, Sector 7, Uttara, Dhaka 1230',
      phone: '01811000405',
      hours: '08:30 AM – 10:00 PM',
      status: 'open',
      lat: 23.8682,
      lng: 90.3996,
      services: ['Cash-In', 'Cash-Out', 'Remittance Pick-up'],
      queueWaitMinutes: 2,
      cashLiquidityLevel: 'medium',
      createdAt: now - 86400000 * 12,
      updatedAt: now,
    },
    {
      boothId: 'BTH-SUP-04',
      boothType: 'support_booth',
      name: 'Uttara Sector-3 Citizen Support Center',
      area: 'Uttara',
      city: 'Dhaka',
      address: 'Mascot Plaza Ground Wing, Sector 3, Uttara, Dhaka 1230',
      phone: '09612001144',
      hours: '09:00 AM – 06:00 PM',
      status: 'open',
      lat: 23.8634,
      lng: 90.4001,
      services: ['KYC Verification', 'Disabled Account Review', 'Gmail 2FA Support'],
      queueWaitMinutes: 4,
      createdAt: now - 86400000 * 10,
      updatedAt: now,
    },
    {
      boothId: 'BTH-AGT-06',
      boothType: 'agent_booth',
      name: 'Agrabad Commercial Agent Hub',
      area: 'Agrabad',
      city: 'Chattogram',
      address: 'Sk. Mujib Road, Agrabad C/A, Chattogram 4100',
      phone: '01811000506',
      hours: '08:30 AM – 09:30 PM',
      status: 'open',
      lat: 22.3239,
      lng: 91.8124,
      services: ['Cash-In', 'Cash-Out', 'Merchant Settlement'],
      queueWaitMinutes: 5,
      cashLiquidityLevel: 'high',
      createdAt: now - 86400000 * 9,
      updatedAt: now,
    },
    {
      boothId: 'BTH-SUP-05',
      boothType: 'support_booth',
      name: 'Chattogram GEC Care & Verification Booth',
      area: 'GEC Circle',
      city: 'Chattogram',
      address: 'CDA Avenue, GEC Intersection, Chattogram 4000',
      phone: '09612001155',
      hours: '09:00 AM – 06:00 PM',
      status: 'open',
      lat: 22.3591,
      lng: 91.8216,
      services: ['KYC Verification', 'Account Recovery', 'Merchant Tax Cert Help'],
      queueWaitMinutes: 5,
      createdAt: now - 86400000 * 8,
      updatedAt: now,
    },
    {
      boothId: 'BTH-SUP-06',
      boothType: 'support_booth',
      name: 'Sylhet Zindabazar Support & Agent Desk',
      area: 'Zindabazar',
      city: 'Sylhet',
      address: 'Al-Hamra Shopping City Arcade, Zindabazar, Sylhet 3100',
      phone: '09612001166',
      hours: '09:00 AM – 06:30 PM',
      status: 'open',
      lat: 24.8965,
      lng: 91.8687,
      services: ['KYC Verification', 'Remittance Support', 'PIN Reset'],
      queueWaitMinutes: 3,
      createdAt: now - 86400000 * 6,
      updatedAt: now,
    },
  ];
  const map: Record<string, AcashBooth> = {};
  for (const b of list) map[b.boothId] = b;
  return map;
}

function buildSeedSecondAdmins(): Record<string, SecondAdminProfile> {
  return {};
}

function buildSeedMapLocations(): Record<string, AcashMapLocation> {
  return {};
}

function buildDefaultMainAdminCredentials(): MainAdminCredentialConfig {
  return {
    email: MAIN_ADMIN_EMAIL,
    passwordHash: hashPin(DEFAULT_MAIN_ADMIN_PASSWORD),
    updatedAt: Date.now(),
    updatedBy: 'System Initialization',
  };
}

function purgeLegacyBotRecords(state: LocalStoreState): boolean {
  let mutated = false;
  for (const [id, u] of Object.entries(state.users || {})) {
    const emailLower = (u.email || '').trim().toLowerCase();
    if (
      LEGACY_BOT_USER_IDS.has(id) ||
      LEGACY_BOT_EMAILS.has(emailLower) ||
      id.startsWith('U-1000') ||
      id.startsWith('A-2000') ||
      id.startsWith('M-3000')
    ) {
      delete state.users[id];
      mutated = true;
    }
  }
  for (const [id, tx] of Object.entries(state.transactions || {})) {
    if (
      LEGACY_BOT_USER_IDS.has(tx.senderId) ||
      LEGACY_BOT_USER_IDS.has(tx.receiverId) ||
      tx.senderId.startsWith('U-1000') ||
      tx.receiverId.startsWith('U-1000') ||
      tx.senderId.startsWith('A-2000') ||
      tx.receiverId.startsWith('A-2000')
    ) {
      delete state.transactions[id];
      mutated = true;
    }
  }
  for (const [id, loc] of Object.entries(state.mapLocations || {})) {
    if (LEGACY_BOT_USER_IDS.has(id) || LEGACY_BOT_ADMIN_IDS.has(id) || LEGACY_BOT_USER_IDS.has(loc.creatorId)) {
      delete state.mapLocations[id];
      mutated = true;
    }
  }
  for (const [id, sa] of Object.entries(state.secondAdmins || {})) {
    const emailLower = (sa.email || '').trim().toLowerCase();
    if (LEGACY_BOT_ADMIN_IDS.has(id) || LEGACY_BOT_EMAILS.has(emailLower)) {
      delete state.secondAdmins[id];
      mutated = true;
    }
  }
  for (const b of Object.values(state.booths || {})) {
    if (b.agentAccountId && (LEGACY_BOT_USER_IDS.has(b.agentAccountId) || b.agentAccountId.startsWith('A-2000'))) {
      delete b.agentAccountId;
      mutated = true;
    }
  }
  return mutated;
}

function readLocalStore(): LocalStoreState {
  try {
    const wiped = localStorage.getItem('acash_clean_wipe_v7');
    if (!wiped) {
      localStorage.setItem('acash_clean_wipe_v7', 'true');
      localStorage.removeItem(LOCAL_DB_KEY);
    }
  } catch {
    // ignore
  }

  const defaultCreds = buildDefaultMainAdminCredentials();
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalStoreState;
      const seedBooths = buildSeedBooths();
      const mergedUsers = { ...(parsed.users || {}) };
      const mergedBooths = { ...seedBooths, ...(parsed.booths || {}) };
      const mergedMapLocations = { ...(parsed.mapLocations || {}) };
      const mergedSecondAdmins = { ...(parsed.secondAdmins || {}) };
      const storedCreds =
        parsed.mainAdminCredentials &&
        parsed.mainAdminCredentials.email?.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase() &&
        parsed.mainAdminCredentials.passwordHash
          ? parsed.mainAdminCredentials
          : defaultCreds;
      const normalizedAlertEmail =
        parsed.adminAlertEmail && parsed.adminAlertEmail !== 'aiub58muhib@gmail.com'
          ? parsed.adminAlertEmail
          : DEFAULT_ADMIN_ALERT_EMAIL;
      const hydrated: LocalStoreState = {
        users: mergedUsers,
        transactions: parsed.transactions || {},
        booths: mergedBooths,
        mapLocations: mergedMapLocations,
        secondAdmins: mergedSecondAdmins,
        notifications: parsed.notifications || buildDefaultNotifications(),
        accountNotifications: parsed.accountNotifications || {},
        activityLogs: parsed.activityLogs || buildDefaultActivityLogs(),
        feeConfig: normalizeFeeConfig(parsed.feeConfig),
        adminAlertEmail: normalizedAlertEmail,
        mainAdminCredentials: storedCreds,
        treasuryVault: normalizeTreasuryVault(parsed.treasuryVault),
        customGiftCards: parsed.customGiftCards || {},
        giftCardPolicy: parsed.giftCardPolicy || DEFAULT_GIFT_CARD_POLICY,
        portalTheme: parsed.portalTheme || DEFAULT_PORTAL_THEME_CONFIG,
      };
      if (purgeLegacyBotRecords(hydrated)) {
        writeLocalStore(hydrated, false);
      }
      return hydrated;
    }
  } catch {
    // ignore parse failure
  }
  const initial: LocalStoreState = {
    users: {},
    transactions: {},
    booths: buildSeedBooths(),
    mapLocations: {},
    secondAdmins: {},
    notifications: buildDefaultNotifications(),
    accountNotifications: {},
    activityLogs: buildDefaultActivityLogs(),
    feeConfig: normalizeFeeConfig(DEFAULT_FEE_CONFIG),
    adminAlertEmail: DEFAULT_ADMIN_ALERT_EMAIL,
    mainAdminCredentials: defaultCreds,
    treasuryVault: normalizeTreasuryVault(DEFAULT_TREASURY_VAULT),
    customGiftCards: {},
    giftCardPolicy: DEFAULT_GIFT_CARD_POLICY,
    portalTheme: DEFAULT_PORTAL_THEME_CONFIG,
  };
  writeLocalStore(initial, false);
  return initial;
}

export function getAdminAlertEmail(): string {
  return readLocalStore().adminAlertEmail || DEFAULT_ADMIN_ALERT_EMAIL;
}

export async function setAdminAlertEmail(email: string, actorEmail?: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) {
    throw new Error('Enter a valid Admin alert email address.');
  }
  const now = Date.now();
  const store = readLocalStore();
  const prev = store.adminAlertEmail;
  store.adminAlertEmail = clean;

  if (prev !== clean) {
    const act = makeActivityEntry({
      idPrefix: 'ACT-ALT',
      actionType: 'alert_settings',
      title: 'Admin Alert Email Updated',
      details: `Updated platform compliance alert Gmail from ${prev} to ${clean}.`,
      actorEmail: actorEmail || clean,
      timestamp: now,
    });
    store.activityLogs[act.id] = act;
    writeLocalStore(store, true);
    try {
      await setDoc(doc(db, SETTINGS_COL, ADMIN_ALERT_DOC_ID), { email: clean, updatedAt: now });
      await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
    } catch {
      firestoreBackendMode = 'local_sync';
    }
    return;
  }

  writeLocalStore(store, true);
  try {
    await setDoc(doc(db, SETTINGS_COL, ADMIN_ALERT_DOC_ID), { email: clean, updatedAt: now });
  } catch {
    firestoreBackendMode = 'local_sync';
  }
}

export function subscribeToAdminAlertEmail(callback: (email: string) => void): Unsubscribe {
  const emitLocal = () => callback(getAdminAlertEmail());
  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);
  let unsubFs: Unsubscribe = () => {};
  try {
    unsubFs = onSnapshot(
      doc(db, SETTINGS_COL, ADMIN_ALERT_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { email?: string };
          if (data?.email) {
            const store = readLocalStore();
            store.adminAlertEmail = data.email;
            writeLocalStore(store, false);
            callback(data.email);
          }
        }
      },
      () => emitLocal()
    );
  } catch {
    // ignore
  }
  return () => {
    unsubLocal();
    unsubFs();
  };
}

function writeLocalStore(state: LocalStoreState, notify = true) {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(state));
    if (notify && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LOCAL_SYNC_EVENT));
    }
  } catch {
    // QuotaExceededError resilience: trim oversized base64 images & oldest history and retry
    try {
      const compactUsers: Record<string, AcashUser> = {};
      for (const [id, u] of Object.entries(state.users)) {
        compactUsers[id] = {
          ...u,
          ...(u.kyc
            ? {
                kyc: {
                  ...u.kyc,
                  nidPhotoUrl: undefined,
                  taxCertificatePhotoUrl: undefined,
                },
              }
            : {}),
          ...(u.profilePhotoUrl && u.profilePhotoUrl.length > 24000
            ? { profilePhotoUrl: undefined }
            : {}),
        };
      }
      const recentTxs = Object.entries(state.transactions)
        .sort((a, b) => b[1].createdAt - a[1].createdAt)
        .slice(0, 120);
      const compactState: LocalStoreState = {
        ...state,
        users: compactUsers,
        transactions: Object.fromEntries(recentTxs),
        accountNotifications: Object.fromEntries(
          Object.entries(state.accountNotifications || {})
            .sort((a, b) => b[1].createdAt - a[1].createdAt)
            .slice(0, 120)
        ),
        activityLogs: Object.fromEntries(
          Object.entries(state.activityLogs)
            .sort((a, b) => b[1].timestamp - a[1].timestamp)
            .slice(0, 80)
        ),
      };
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(compactState));
      if (notify && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(LOCAL_SYNC_EVENT));
      }
    } catch {
      // ignore if storage is completely unavailable
    }
  }
}

function subscribeLocalStore(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onSync = () => callback();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_DB_KEY) callback();
  };
  window.addEventListener(LOCAL_SYNC_EVENT, onSync);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LOCAL_SYNC_EVENT, onSync);
    window.removeEventListener('storage', onStorage);
  };
}

function findInLocalStore(identifier: string): AcashUser | null {
  const store = readLocalStore();
  const clean = identifier.trim();
  if (!clean) return null;

  const normalizedId = normalizeAccountIdInput(clean);
  if (store.users[normalizedId]) {
    return store.users[normalizedId];
  }

  const phone = normalizeBdPhone(clean);
  const lower = clean.toLowerCase();

  for (const user of Object.values(store.users)) {
    if (phone.length >= 10 && user.phone === phone) return user;
    if (clean.includes('@') && user.email.toLowerCase() === lower) return user;
  }
  return null;
}

export function calculateFeeBreakdown(
  type: TransactionType,
  amount: number,
  feeConfig: FeeConfig,
  options?: { targetIsAdmin?: boolean; hasGiftCard?: boolean }
): { fee: number; breakdown: FeeBreakdown } {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const cfg = normalizeFeeConfig(feeConfig);
  const now = Date.now();

  if (type === 'cash_out') {
    const rate = cfg.feePer1000;
    const totalShareSum = cfg.agentShare + cfg.govtShare + cfg.adminShare;
    if (rate <= 0 || totalShareSum <= 0) {
      return {
        fee: 0,
        breakdown: {
          ratePer1000: 0,
          chargeMode: 'per_1000',
          agentShareRate: 0,
          govtShareRate: 0,
          adminShareRate: 0,
          agentAmount: 0,
          govtAmount: 0,
          adminAmount: 0,
          lockedAt: now,
        },
      };
    }
    const fee = Number(((safeAmount / 1000) * rate).toFixed(2));
    const agentAmount = Number(((fee * cfg.agentShare) / totalShareSum).toFixed(2));
    const govtAmount = Number(((fee * cfg.govtShare) / totalShareSum).toFixed(2));
    const adminAmount = Number((fee - agentAmount - govtAmount).toFixed(2));

    return {
      fee,
      breakdown: {
        ratePer1000: rate,
        chargeMode: 'per_1000',
        agentShareRate: cfg.agentShare,
        govtShareRate: cfg.govtShare,
        adminShareRate: cfg.adminShare,
        agentAmount,
        govtAmount,
        adminAmount,
        lockedAt: now,
      },
    };
  }

  if (type === 'merchant_cash_out') {
    if (options?.targetIsAdmin) {
      const rate = cfg.merchantCashOutToAdminFeePer1000;
      const totalShareSum = cfg.merchantCashOutToAdminGovtShare + cfg.merchantCashOutToAdminShare;
      if (rate <= 0 || totalShareSum <= 0) {
        return {
          fee: 0,
          breakdown: {
            ratePer1000: 0,
            chargeMode: 'per_1000',
            agentShareRate: 0,
            govtShareRate: 0,
            adminShareRate: 0,
            agentAmount: 0,
            govtAmount: 0,
            adminAmount: 0,
            lockedAt: now,
          },
        };
      }
      const fee = Number(((safeAmount / 1000) * rate).toFixed(2));
      const govtAmount = Number(((fee * cfg.merchantCashOutToAdminGovtShare) / totalShareSum).toFixed(2));
      const adminAmount = Number((fee - govtAmount).toFixed(2));
      return {
        fee,
        breakdown: {
          ratePer1000: rate,
          chargeMode: 'per_1000',
          agentShareRate: 0,
          govtShareRate: cfg.merchantCashOutToAdminGovtShare,
          adminShareRate: cfg.merchantCashOutToAdminShare,
          agentAmount: 0,
          govtAmount,
          adminAmount,
          lockedAt: now,
        },
      };
    }

    const rate = cfg.merchantCashOutFeePer1000;
    const totalShareSum =
      cfg.merchantCashOutAgentShare + cfg.merchantCashOutGovtShare + cfg.merchantCashOutAdminShare;
    if (rate <= 0 || totalShareSum <= 0) {
      return {
        fee: 0,
        breakdown: {
          ratePer1000: 0,
          chargeMode: 'per_1000',
          agentShareRate: 0,
          govtShareRate: 0,
          adminShareRate: 0,
          agentAmount: 0,
          govtAmount: 0,
          adminAmount: 0,
          lockedAt: now,
        },
      };
    }
    const fee = Number(((safeAmount / 1000) * rate).toFixed(2));
    const agentAmount = Number(((fee * cfg.merchantCashOutAgentShare) / totalShareSum).toFixed(2));
    const govtAmount = Number(((fee * cfg.merchantCashOutGovtShare) / totalShareSum).toFixed(2));
    const adminAmount = Number((fee - agentAmount - govtAmount).toFixed(2));

    return {
      fee,
      breakdown: {
        ratePer1000: rate,
        chargeMode: 'per_1000',
        agentShareRate: cfg.merchantCashOutAgentShare,
        govtShareRate: cfg.merchantCashOutGovtShare,
        adminShareRate: cfg.merchantCashOutAdminShare,
        agentAmount,
        govtAmount,
        adminAmount,
        lockedAt: now,
      },
    };
  }

  if (type === 'cash_in') {
    const comm = Number(((safeAmount / 1000) * cfg.cashInCommissionPer1000).toFixed(2));
    return {
      fee: 0,
      breakdown: {
        ratePer1000: cfg.cashInCommissionPer1000,
        chargeMode: 'per_1000',
        agentShareRate: cfg.cashInCommissionPer1000,
        govtShareRate: 0,
        adminShareRate: 0,
        agentAmount: comm,
        govtAmount: 0,
        adminAmount: 0,
        lockedAt: now,
      },
    };
  }

  if (type === 'send_money') {
    if (options?.hasGiftCard) {
      const giftFee = safeAmount > 0 ? GIFT_CARD_FEE_BDT : 0;
      const govtAmount = giftFee > 0 ? 0.3 : 0;
      const adminAmount = Number((giftFee - govtAmount).toFixed(2));
      return {
        fee: giftFee,
        breakdown: {
          ratePer1000: GIFT_CARD_FEE_BDT,
          chargeMode: 'flat',
          agentShareRate: 0,
          govtShareRate: govtAmount,
          adminShareRate: adminAmount,
          agentAmount: 0,
          govtAmount,
          adminAmount,
          lockedAt: now,
        },
      };
    }

    const totalRate = cfg.sendMoneyFeeRate;
    const totalShareSum = cfg.sendMoneyGovtShare + cfg.sendMoneyAdminShare;
    const withinFreeThreshold =
      cfg.sendMoneyFreeThreshold > 0 && safeAmount <= cfg.sendMoneyFreeThreshold;

    if (safeAmount <= 0 || withinFreeThreshold || totalRate <= 0 || totalShareSum <= 0) {
      return {
        fee: 0,
        breakdown: {
          ratePer1000: totalRate,
          chargeMode: cfg.sendMoneyChargeMode === 'per_1000' ? 'per_1000' : 'flat',
          agentShareRate: 0,
          govtShareRate: 0,
          adminShareRate: 0,
          agentAmount: 0,
          govtAmount: 0,
          adminAmount: 0,
          lockedAt: now,
        },
      };
    }

    if (cfg.sendMoneyChargeMode === 'per_1000') {
      const fee = Number(((safeAmount / 1000) * totalRate).toFixed(2));
      const govtAmount = Number(((fee * cfg.sendMoneyGovtShare) / totalShareSum).toFixed(2));
      const adminAmount = Number((fee - govtAmount).toFixed(2));
      return {
        fee,
        breakdown: {
          ratePer1000: totalRate,
          chargeMode: 'per_1000',
          agentShareRate: 0,
          govtShareRate: cfg.sendMoneyGovtShare,
          adminShareRate: cfg.sendMoneyAdminShare,
          agentAmount: 0,
          govtAmount,
          adminAmount,
          lockedAt: now,
        },
      };
    }

    const fee = Number(totalRate.toFixed(2));
    const govtAmount = Number(((fee * cfg.sendMoneyGovtShare) / totalShareSum).toFixed(2));
    const adminAmount = Number((fee - govtAmount).toFixed(2));
    return {
      fee,
      breakdown: {
        ratePer1000: totalRate,
        chargeMode: 'flat',
        agentShareRate: 0,
        govtShareRate: cfg.sendMoneyGovtShare,
        adminShareRate: cfg.sendMoneyAdminShare,
        agentAmount: 0,
        govtAmount,
        adminAmount,
        lockedAt: now,
      },
    };
  }

  if (type === 'b2b_transfer') {
    const fee = Number(Math.min(50, Math.max(5, safeAmount * 0.002)).toFixed(2));
    const govtAmount = Number((fee * 0.15).toFixed(2));
    const adminAmount = Number((fee - govtAmount).toFixed(2));
    return {
      fee,
      breakdown: {
        ratePer1000: 2,
        chargeMode: 'per_1000',
        agentShareRate: 0,
        govtShareRate: 0.3,
        adminShareRate: 1.7,
        agentAmount: 0,
        govtAmount,
        adminAmount,
        lockedAt: now,
      },
    };
  }

  return {
    fee: 0,
    breakdown: {
      ratePer1000: 0,
      chargeMode: 'flat',
      agentShareRate: 0,
      govtShareRate: 0,
      adminShareRate: 0,
      agentAmount: 0,
      govtAmount: 0,
      adminAmount: 0,
      lockedAt: now,
    },
  };
}

export async function ensureDefaultPlatformData(): Promise<void> {
  const store = readLocalStore();
  writeLocalStore(store, false);

  try {
    const fbUser = await ensureFirebaseAuthSession();
    // Only seed protected admin collections in Firestore when signed in as verified user/admin
    if (!fbUser || !fbUser.emailVerified) {
      return;
    }

    const isRootAdmin = isMainAdminEmail(fbUser.email);
    if (isRootAdmin) {
      const feeRef = doc(db, SETTINGS_COL, FEE_DOC_ID);
      const feeSnap = await getDoc(feeRef);
      if (!feeSnap.exists()) {
        await setDoc(feeRef, DEFAULT_FEE_CONFIG);
      }

      const credsRef = doc(db, SETTINGS_COL, MAIN_ADMIN_CREDS_DOC_ID);
      const credsSnap = await getDoc(credsRef);
      if (!credsSnap.exists()) {
        await setDoc(credsRef, store.mainAdminCredentials);
      } else {
        const fsCreds = credsSnap.data() as MainAdminCredentialConfig;
        if (fsCreds?.passwordHash) {
          const nextStore = readLocalStore();
          nextStore.mainAdminCredentials = fsCreds;
          writeLocalStore(nextStore, false);
        }
      }

      const vaultRef = doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID);
      const vaultSnap = await getDoc(vaultRef);
      if (!vaultSnap.exists()) {
        await setDoc(vaultRef, store.treasuryVault);
      }

      const seedBooths = Object.values(buildSeedBooths());
      for (const b of seedBooths) {
        const bRef = doc(db, BOOTHS_COL, b.boothId);
        const bSnap = await getDoc(bRef);
        if (!bSnap.exists()) {
          await setDoc(bRef, b);
        }
      }

      // One-time cleanup: purge any legacy bot/sandbox accounts from Firestore so zero bot accounts exist
      let alreadyPurged = false;
      try {
        alreadyPurged = localStorage.getItem(BOTS_PURGED_FLAG_KEY) === '1';
      } catch {
        // ignore
      }
      if (!alreadyPurged) {
        await Promise.all([
          ...Array.from(LEGACY_BOT_USER_IDS).map((botId) =>
            Promise.all([
              deleteDoc(doc(db, USERS_COL, botId)).catch(() => {}),
              deleteDoc(doc(db, DIRECTORY_COL, botId)).catch(() => {}),
              deleteDoc(doc(db, MAP_LOCATIONS_COL, botId)).catch(() => {}),
              deleteDoc(doc(db, KYC_SUBMISSIONS_COL, botId)).catch(() => {}),
            ])
          ),
          ...Array.from(LEGACY_BOT_ADMIN_IDS).map((botAdminId) =>
            Promise.all([
              deleteDoc(doc(db, SECOND_ADMINS_COL, botAdminId)).catch(() => {}),
              deleteDoc(doc(db, MAP_LOCATIONS_COL, botAdminId)).catch(() => {}),
            ])
          ),
          ...Array.from(LEGACY_BOT_EMAILS).map((e) => releaseIdentityLock('email', e)),
          ...Array.from(LEGACY_BOT_PHONES).map((p) => releaseIdentityLock('phone', p)),
        ]);
        try {
          localStorage.setItem(BOTS_PURGED_FLAG_KEY, '1');
        } catch {
          // ignore
        }
      }
    }
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    console.warn('Firestore bootstrap fallback to local sync:', err);
  }
}

function toDirectoryEntry(user: AcashUser): AcashDirectoryEntry {
  return {
    accountId: user.accountId,
    ...(user.firebaseUid ? { firebaseUid: user.firebaseUid } : {}),
    role: user.role,
    name: user.name,
    ...(user.businessName ? { businessName: user.businessName } : {}),
    phone: user.phone,
    status: user.status,
    verified: Boolean(user.verified),
    createdAt: user.createdAt,
    updatedAt: user.lastActiveAt || user.createdAt || Date.now(),
  };
}

function directoryEntryToStubUser(entry: AcashDirectoryEntry): AcashUser {
  return {
    accountId: entry.accountId,
    ...(entry.firebaseUid ? { firebaseUid: entry.firebaseUid } : {}),
    role: entry.role,
    name: entry.name,
    ...(entry.businessName ? { businessName: entry.businessName } : {}),
    phone: entry.phone,
    email: '',
    pinHash: '',
    balance: 0,
    commissionBalance: 0,
    status: entry.status,
    verified: entry.verified,
    createdAt: entry.createdAt,
    lastActiveAt: entry.updatedAt || entry.createdAt,
  };
}

export async function syncAcashUserToCloud(
  user: AcashUser,
  overrideFirebaseUid?: string
): Promise<boolean> {
  const fbUser = await ensureFirebaseAuthSession();
  if (!fbUser || !fbUser.emailVerified) {
    return false;
  }

  const uidToUse = overrideFirebaseUid || user.firebaseUid || fbUser.uid;
  const syncedUser: AcashUser = {
    ...user,
    firebaseUid: uidToUse,
    lastActiveAt: Date.now(),
  };

  const store = readLocalStore();
  store.users[syncedUser.accountId] = syncedUser;
  writeLocalStore(store, true);

  await setDoc(doc(db, USERS_COL, syncedUser.accountId), syncedUser, { merge: true });
  await setDoc(doc(db, DIRECTORY_COL, syncedUser.accountId), toDirectoryEntry(syncedUser), {
    merge: true,
  });
  firestoreBackendMode = 'firestore';
  return true;
}

export async function resolveAcashUserForGoogleAuth(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<AcashUser | null> {
  const cleanEmail = params.email.trim().toLowerCase();
  const now = Date.now();
  const store = readLocalStore();

  let matched: AcashUser | null = null;
  try {
    const qUid = query(collection(db, USERS_COL), where('firebaseUid', '==', params.uid), limit(1));
    const snapUid = await getDocs(qUid);
    if (!snapUid.empty) {
      matched = snapUid.docs[0].data() as AcashUser;
    } else if (cleanEmail) {
      const qEmail = query(collection(db, USERS_COL), where('email', '==', cleanEmail), limit(1));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        matched = snapEmail.docs[0].data() as AcashUser;
      }
    }
  } catch {
    // fallback to local store lookup below
  }

  if (!matched) {
    matched =
      Object.values(store.users).find(
        (u) => u.firebaseUid === params.uid || u.email.toLowerCase() === cleanEmail
      ) || null;
  }

  if (!matched) return null;

  const updated: AcashUser = {
    ...matched,
    firebaseUid: params.uid,
    ...(!matched.profilePhotoUrl && params.photoURL ? { profilePhotoUrl: params.photoURL } : {}),
    lastActiveAt: now,
  };
  store.users[updated.accountId] = updated;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, USERS_COL, updated.accountId), updated, { merge: true });
    await setDoc(doc(db, DIRECTORY_COL, updated.accountId), toDirectoryEntry(updated), {
      merge: true,
    });
    firestoreBackendMode = 'firestore';
  } catch (err) {
    if (auth.currentUser && isPermissionError(err)) {
      console.warn('Firestore user link sync notice:', err);
    }
    firestoreBackendMode = 'local_sync';
  }

  return updated;
}

export async function findUserByIdentifier(identifier: string): Promise<AcashUser | null> {
  const clean = identifier.trim();
  if (!clean) return null;

  const normalizedId = normalizeAccountIdInput(clean);
  const isAccountIdPattern = /^[UAM]-\d{6}$/.test(normalizedId);
  const phone = normalizeBdPhone(clean);
  const isPhonePattern = phone.length >= 10;
  const lowerEmail = clean.toLowerCase();

  await ensureFirebaseAuthSession();

  // 1. Query authoritative user record in acash_users on Firestore FIRST so balances/status are never stale
  if (isAccountIdPattern) {
    try {
      const snap = await getDoc(doc(db, USERS_COL, normalizedId));
      if (snap.exists()) {
        const u = snap.data() as AcashUser;
        const store = readLocalStore();
        store.users[u.accountId] = u;
        writeLocalStore(store, false);
        return u;
      }
    } catch {
      // Expected PERMISSION_DENIED when looking up another user's private PII doc; continue to acash_directory
    }
  }

  if (isPhonePattern) {
    try {
      const qPhone = query(collection(db, USERS_COL), where('phone', '==', phone), limit(1));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        const u = snapPhone.docs[0].data() as AcashUser;
        const store = readLocalStore();
        store.users[u.accountId] = u;
        writeLocalStore(store, false);
        return u;
      }
    } catch {
      // Expected PERMISSION_DENIED for non-admin recipient phone queries; continue to acash_directory
    }
  }

  if (clean.includes('@')) {
    try {
      const qEmail = query(
        collection(db, USERS_COL),
        where('email', '==', lowerEmail),
        limit(1)
      );
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const u = snapEmail.docs[0].data() as AcashUser;
        const store = readLocalStore();
        store.users[u.accountId] = u;
        writeLocalStore(store, false);
        return u;
      }
    } catch {
      // continue to directory/local store
    }
  }

  // 2. Try non-PII cross-portal routing directory (acash_directory) and hydrate full AcashUser doc
  const resolveFromDirectoryEntry = async (entry: AcashDirectoryEntry): Promise<AcashUser> => {
    try {
      const fullSnap = await getDoc(doc(db, USERS_COL, entry.accountId));
      if (fullSnap.exists()) {
        const u = fullSnap.data() as AcashUser;
        const store = readLocalStore();
        store.users[u.accountId] = u;
        writeLocalStore(store, false);
        return u;
      }
    } catch {
      // fall through to cached / directory fallback
    }

    const store = readLocalStore();
    const cached = store.users[entry.accountId];
    if (cached && cached.pinHash) {
      const merged: AcashUser = {
        ...cached,
        name: entry.name || cached.name,
        ...(entry.businessName ? { businessName: entry.businessName } : {}),
        phone: entry.phone || cached.phone,
        status: entry.status,
        verified: entry.verified,
        ...(entry.firebaseUid ? { firebaseUid: entry.firebaseUid } : {}),
      };
      store.users[entry.accountId] = merged;
      writeLocalStore(store, false);
      return merged;
    }
    return directoryEntryToStubUser(entry);
  };

  if (isAccountIdPattern) {
    try {
      const dirSnap = await getDoc(doc(db, DIRECTORY_COL, normalizedId));
      if (dirSnap.exists()) {
        return await resolveFromDirectoryEntry(dirSnap.data() as AcashDirectoryEntry);
      }
    } catch {
      // continue
    }
  }

  if (isPhonePattern) {
    try {
      const qDirPhone = query(collection(db, DIRECTORY_COL), where('phone', '==', phone), limit(1));
      const dirPhoneSnap = await getDocs(qDirPhone);
      if (!dirPhoneSnap.empty) {
        return await resolveFromDirectoryEntry(dirPhoneSnap.docs[0].data() as AcashDirectoryEntry);
      }
    } catch {
      // continue
    }
  }

  // 3. Fallback to public Agent/Merchant live map directory if applicable
  if (isAccountIdPattern && (normalizedId.startsWith('A-') || normalizedId.startsWith('M-'))) {
    try {
      const mapSnap = await getDoc(doc(db, MAP_LOCATIONS_COL, normalizedId));
      if (mapSnap.exists()) {
        const loc = mapSnap.data() as AcashMapLocation;
        if (loc.creatorRole === 'agent' || loc.creatorRole === 'merchant') {
          return await resolveFromDirectoryEntry({
            accountId: loc.creatorId,
            ...(loc.creatorUid ? { firebaseUid: loc.creatorUid } : {}),
            role: loc.creatorRole === 'agent' ? 'A' : 'M',
            name: loc.name,
            ...(loc.businessName ? { businessName: loc.businessName } : {}),
            phone: loc.phone,
            status: 'active',
            verified: true,
            createdAt: loc.createdAt,
            updatedAt: loc.updatedAt,
          });
        }
      }
    } catch {
      // continue
    }
  }

  if (isPhonePattern) {
    try {
      const qMapPhone = query(
        collection(db, MAP_LOCATIONS_COL),
        where('phone', '==', phone),
        limit(1)
      );
      const mapPhoneSnap = await getDocs(qMapPhone);
      if (!mapPhoneSnap.empty) {
        const loc = mapPhoneSnap.docs[0].data() as AcashMapLocation;
        if (loc.creatorRole === 'agent' || loc.creatorRole === 'merchant') {
          return await resolveFromDirectoryEntry({
            accountId: loc.creatorId,
            ...(loc.creatorUid ? { firebaseUid: loc.creatorUid } : {}),
            role: loc.creatorRole === 'agent' ? 'A' : 'M',
            name: loc.name,
            ...(loc.businessName ? { businessName: loc.businessName } : {}),
            phone: loc.phone,
            status: 'active',
            verified: true,
            createdAt: loc.createdAt,
            updatedAt: loc.updatedAt,
          });
        }
      }
    } catch {
      // continue
    }
  }

  // 4. Fallback to local synchronized store (offline cache)
  return findInLocalStore(clean);
}

export function formatUserReferralSource(user: AcashUser): string {
  if (
    user.referredByType === 'agent' ||
    Boolean(user.referredByAgentId) ||
    Boolean(user.referredByAgentPhone)
  ) {
    const details = [user.referredByAgentId, user.referredByAgentPhone].filter(Boolean).join(' / ');
    const namePart = user.referredByAgentName ? ` - ${user.referredByAgentName}` : '';
    return details ? `Agent (${details}${namePart})` : 'Agent Referral';
  }
  return 'Own App (Self-Registered)';
}

export async function registerAcashUser(params: {
  role: UserRole;
  name: string;
  businessName?: string;
  gender: UserGender;
  termsAcceptedAt?: number;
  phone: string;
  email: string;
  pin: string;
  referredByType?: ReferralSource;
  referredByAgentIdentifier?: string;
  firebaseUid?: string;
  profilePhotoUrl?: string;
  verificationMethod: 'google_auth' | 'emailjs_otp';
  emailJsOtpVerified?: boolean;
}): Promise<AcashUser> {
  const phone = normalizeBdPhone(params.phone);
  const email = params.email.trim().toLowerCase();

  const cleanName = params.name.trim();
  if (cleanName.length < 2 || /^\d+$/.test(cleanName)) {
    throw new Error('Enter your genuine full name (minimum 2 characters, not numeric only).');
  }
  if (!/^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/i.test(email)) {
    throw new Error('Only a valid Gmail address (@gmail.com) can be used to create an Acash ID.');
  }
  if (!params.termsAcceptedAt) {
    throw new Error('Terms & Conditions Agreement (TCA) acceptance is required.');
  }
  if (params.gender !== 'male' && params.gender !== 'female') {
    throw new Error('Gender selection is required.');
  }

  // Anti-spam per-device registration cooldown (45s)
  try {
    const lastRegRaw = localStorage.getItem(LAST_REG_TS_KEY);
    const lastRegTs = lastRegRaw ? Number(lastRegRaw) : 0;
    const elapsedSec = Math.floor((Date.now() - lastRegTs) / 1000);
    if (lastRegTs && elapsedSec >= 0 && elapsedSec < 45) {
      throw new Error(
        `Anti-Spam Protection: Please wait ${45 - elapsedSec} seconds before creating another account from this device.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Anti-Spam')) {
      throw err;
    }
  }

  if (params.verificationMethod === 'google_auth') {
    const fbUser = auth.currentUser;
    const fbEmail = (fbUser?.email || '').trim().toLowerCase();
    if (
      !fbUser ||
      !fbUser.emailVerified ||
      !params.firebaseUid ||
      fbUser.uid !== params.firebaseUid ||
      fbEmail !== email
    ) {
      throw new Error(
        'Direct Google Gmail verification expired or did not match. Please sign in with Google again.'
      );
    }
  } else if (params.verificationMethod === 'emailjs_otp') {
    if (!params.emailJsOtpVerified) {
      throw new Error('EmailJS 6-digit Gmail OTP verification is mandatory to create an Acash ID.');
    }
  } else {
    throw new Error(
      'Acash accounts can only be created via Direct Google Gmail Auth or EmailJS Gmail OTP.'
    );
  }

  // Enforce strict 1-to-1 Gmail and Mobile Number uniqueness across local store, directory, & global identity locks
  await checkRegistrationIdentityAvailability({ phone, email });

  const referredByType: ReferralSource = params.referredByType === 'agent' ? 'agent' : 'own_app';
  let referredByAgentId: string | undefined;
  let referredByAgentPhone: string | undefined;
  let referredByAgentName: string | undefined;

  if (referredByType === 'agent') {
    const rawRef = (params.referredByAgentIdentifier || '').trim();
    if (!rawRef) {
      throw new Error('Please enter the referring Agent ID (e.g. A-234567) or Agent mobile number.');
    }

    const matchedAgent = await findUserByIdentifier(rawRef);
    if (matchedAgent) {
      if (matchedAgent.role !== 'A') {
        throw new Error('Referral ID/number must belong to an Acash Agent (A) account.');
      }
      referredByAgentId = matchedAgent.accountId;
      referredByAgentPhone = matchedAgent.phone;
      referredByAgentName = matchedAgent.businessName || matchedAgent.name;
    } else {
      const normalizedRefId = normalizeAccountIdInput(rawRef);
      const normalizedRefPhone = normalizeBdPhone(rawRef);
      if (/^A-\d{6}$/.test(normalizedRefId)) {
        referredByAgentId = normalizedRefId;
      } else if (/^01[3-9]\d{8}$/.test(normalizedRefPhone)) {
        referredByAgentPhone = normalizedRefPhone;
      } else {
        throw new Error(
          'Enter a valid Agent ID (e.g. A-234567) or 11-digit Agent mobile number (e.g. 017XXXXXXXX).'
        );
      }
    }
  }

  let accountId = generateAccountId(params.role);
  const store = readLocalStore();
  while (store.users[accountId]) {
    accountId = generateAccountId(params.role);
  }
  try {
    let dirExists = await getDoc(doc(db, DIRECTORY_COL, accountId));
    while (dirExists.exists() || store.users[accountId]) {
      accountId = generateAccountId(params.role);
      dirExists = await getDoc(doc(db, DIRECTORY_COL, accountId));
    }
  } catch {
    // ignore offline check
  }

  const initialBalance = params.role === 'A' ? 100000 : params.role === 'M' ? 15000 : 10000;
  const now = Date.now();
  const fbSession = await ensureFirebaseAuthSession();

  if (params.verificationMethod === 'emailjs_otp' && fbSession) {
    // Ensure EmailJS registration runs as clean non-Google identity matching !isSignedIn() rules
    await signOutFirebase();
  }

  const activeUid =
    params.verificationMethod === 'google_auth'
      ? params.firebaseUid || fbSession?.uid
      : undefined;

  const newUser: AcashUser = {
    accountId,
    ...(activeUid ? { firebaseUid: activeUid } : {}),
    role: params.role,
    name: params.name.trim(),
    ...(params.businessName?.trim() ? { businessName: params.businessName.trim() } : {}),
    gender: params.gender,
    termsAcceptedAt: params.termsAcceptedAt || now,
    phone,
    email,
    pinHash: hashPin(params.pin),
    ...(params.role === 'M' ? { staffPinHash: hashPin('0000') } : {}),
    ...(params.profilePhotoUrl ? { profilePhotoUrl: params.profilePhotoUrl } : {}),
    balance: initialBalance,
    commissionBalance: 0,
    status: 'active',
    verified: true,
    referredByType,
    ...(referredByAgentId ? { referredByAgentId } : {}),
    ...(referredByAgentPhone ? { referredByAgentPhone } : {}),
    ...(referredByAgentName ? { referredByAgentName } : {}),
    createdAt: now,
    lastActiveAt: now,
  };

  const referralSummary = formatUserReferralSource(newUser);

  // Save in synced local store immediately
  store.users[accountId] = newUser;
  const regNotif: AdminNotification = {
    id: `NTF-REG-${now.toString(36).toUpperCase()}`,
    title: `New ${params.role === 'U' ? 'Customer' : params.role === 'A' ? 'Agent' : 'Merchant'} Registered`,
    message: `${newUser.businessName || newUser.name} (${accountId}) verified via ${email}. Source: ${referralSummary}.`,
    category: 'registration',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'users',
  };
  store.notifications[regNotif.id] = regNotif;
  writeLocalStore(store, true);

  // Claim global 1-to-1 zero-PII identity locks for Gmail and Phone before/during cloud user creation
  try {
    await claimIdentityLock('email', email, accountId, now);
    await claimIdentityLock('phone', phone, accountId, now);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already')) {
      delete store.users[accountId];
      delete store.notifications[regNotif.id];
      writeLocalStore(store, true);
      throw err;
    }
  }

  try {
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, USERS_COL, accountId), newUser);
      transaction.set(doc(db, DIRECTORY_COL, accountId), toDirectoryEntry(newUser));
    });
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    delete store.users[accountId];
    delete store.notifications[regNotif.id];
    writeLocalStore(store, true);
    await Promise.all([
      releaseIdentityLock('email', email).catch(() => {}),
      releaseIdentityLock('phone', phone).catch(() => {}),
    ]);
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.CREATE, `${USERS_COL}/${accountId}`);
    }
    throw new Error(
      err instanceof Error && !isPermissionError(err)
        ? `Account registration could not be saved to Acash Cloud: ${err.message}`
        : 'Account registration could not be saved to Acash Cloud. Please check your internet connection and try again.'
    );
  }

  try {
    await setDoc(doc(db, ADMIN_NOTIF_COL, regNotif.id), regNotif);
  } catch {
    // non-fatal notification write
  }

  // Notify both Creator Email and Admin Email when account opens
  const roleLabel =
    params.role === 'U' ? 'Customer (U)' : params.role === 'A' ? 'Agent (A)' : 'Merchant (M)';
  await sendAccountCreatedEmails({
    userEmail: email,
    adminEmail: getAdminAlertEmail(),
    accountId,
    userName: newUser.businessName || newUser.name,
    roleLabel,
    phone,
    referredByLabel: referralSummary,
    openedAt: new Date(now).toLocaleString(),
  });

  try {
    localStorage.setItem(LAST_REG_TS_KEY, String(now));
  } catch {
    // ignore storage errors
  }

  return newUser;
}

export async function authenticateAcashUser(params: {
  identifier: string;
  pin: string;
  expectedRole?: UserRole;
}): Promise<AcashUser> {
  const user = await findUserByIdentifier(params.identifier);
  if (!user) {
    throw new Error('Account not found. Check your Acash ID (e.g. U-123456), phone, or Gmail.');
  }
  if (!user.pinHash) {
    throw new Error(
      'Account found in Acash Cloud. On a new browser or device, click "Continue with Google" to verify and load your wallet.'
    );
  }
  if (user.pinHash !== hashPin(params.pin)) {
    throw new Error('Invalid security PIN.');
  }

  const now = Date.now();
  const updated = { ...user, lastActiveAt: now };
  const store = readLocalStore();
  store.users[user.accountId] = updated;
  writeLocalStore(store, true);

  try {
    await updateDoc(doc(db, USERS_COL, user.accountId), { lastActiveAt: now });
  } catch {
    // non-fatal if Firestore rules restrict direct update
  }
  return updated;
}

export function subscribeToUser(
  accountId: string,
  callback: (user: AcashUser | null) => void
): Unsubscribe {
  const emitLocalIfFound = () => {
    const store = readLocalStore();
    if (store.users[accountId]) {
      callback(store.users[accountId]);
      return true;
    }
    return false;
  };

  emitLocalIfFound();
  const unsubLocal = subscribeLocalStore(() => {
    emitLocalIfFound();
  });

  const syncDirIfOwner = (u: AcashUser) => {
    const fbEmail = (auth.currentUser?.email || '').trim().toLowerCase();
    if (
      auth.currentUser?.emailVerified &&
      (u.firebaseUid === auth.currentUser.uid ||
        (!u.firebaseUid && u.email && u.email.toLowerCase() === fbEmail))
    ) {
      void setDoc(doc(db, DIRECTORY_COL, u.accountId), toDirectoryEntry(u), { merge: true }).catch(
        () => {}
      );
    }
  };

  let unsubFs: Unsubscribe = () => {};
  try {
    // Also fetch once in case local store is empty on fresh PWA / browser session
    void getDoc(doc(db, USERS_COL, accountId))
      .then((snap) => {
        if (snap.exists()) {
          const u = snap.data() as AcashUser;
          const store = readLocalStore();
          store.users[accountId] = u;
          writeLocalStore(store, false);
          callback(u);
          syncDirIfOwner(u);
        }
      })
      .catch(() => {
        // Keep cached/local session intact if offline or unauthenticated
      });

    unsubFs = onSnapshot(
      doc(db, USERS_COL, accountId),
      (snap) => {
        if (snap.exists()) {
          const u = snap.data() as AcashUser;
          const store = readLocalStore();
          store.users[accountId] = u;
          writeLocalStore(store, false);
          callback(u);
          syncDirIfOwner(u);
        } else if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
          const store = readLocalStore();
          const localUser = store.users[accountId];
          if (localUser && Date.now() - localUser.createdAt > 10000) {
            delete store.users[accountId];
            writeLocalStore(store, false);
            callback(null);
            return;
          }
          emitLocalIfFound();
        }
      },
      (err) => {
        if (isPermissionError(err)) {
          console.warn('User profile subscription notice:', err);
        }
        firestoreBackendMode = 'local_sync';
        emitLocalIfFound();
      }
    );
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export function subscribeToFeeConfig(callback: (config: FeeConfig) => void): Unsubscribe {
  const emitLocal = () => {
    callback(normalizeFeeConfig(readLocalStore().feeConfig));
  };
  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    unsubFs = onSnapshot(
      doc(db, SETTINGS_COL, FEE_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const cfg = normalizeFeeConfig(snap.data() as Partial<FeeConfig>);
          const store = readLocalStore();
          store.feeConfig = cfg;
          writeLocalStore(store, false);
          callback(cfg);
        }
      },
      () => {
        emitLocal();
      }
    );
  } catch {
    // ignore
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export function subscribeToTreasuryVault(
  callback: (vault: MainTreasuryVault) => void
): Unsubscribe {
  const emitLocal = () => {
    callback(normalizeTreasuryVault(readLocalStore().treasuryVault));
  };
  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    unsubFs = onSnapshot(
      doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const vault = normalizeTreasuryVault(snap.data() as Partial<MainTreasuryVault>);
          const store = readLocalStore();
          store.treasuryVault = vault;
          writeLocalStore(store, false);
          callback(vault);
        }
      },
      () => {
        emitLocal();
      }
    );
  } catch {
    // ignore
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export function subscribeToUserTransactions(
  accountId: string,
  callback: (txs: AcashTransaction[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    const list = Object.values(store.transactions)
      .filter((tx) => tx.senderId === accountId || tx.receiverId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubSenderFs: Unsubscribe = () => {};
  let unsubReceiverFs: Unsubscribe = () => {};

  const attachAccountListeners = () => {
    unsubSenderFs();
    unsubReceiverFs();
    try {
      const mergeSnap = (
        snap: {
          docs: Array<{ data: () => unknown }>;
          docChanges: () => Array<{ type: string; doc: { id: string } }>;
          metadata: { fromCache: boolean; hasPendingWrites?: boolean };
        },
        roleField: 'senderId' | 'receiverId'
      ) => {
        const fsTxs = snap.docs.map((d) => d.data() as AcashTransaction);
        const store = readLocalStore();
        let mutated = false;

        for (const change of snap.docChanges()) {
          if (
            change.type === 'removed' &&
            !snap.metadata.fromCache &&
            !snap.metadata.hasPendingWrites &&
            store.transactions[change.doc.id]
          ) {
            delete store.transactions[change.doc.id];
            mutated = true;
          }
        }

        if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites && fsTxs.length < 1000) {
          const serverIds = new Set(fsTxs.map((t) => t.txId));
          const now = Date.now();
          for (const [id, existingTx] of Object.entries(store.transactions)) {
            if (
              existingTx[roleField] === accountId &&
              now - existingTx.createdAt > 5000 &&
              !serverIds.has(id)
            ) {
              delete store.transactions[id];
              mutated = true;
            }
          }
        }

        for (const tx of fsTxs) {
          store.transactions[tx.txId] = tx;
          mutated = true;
        }

        if (mutated) {
          writeLocalStore(store, false);
        }
        emitLocal();
      };

      const qSender = query(collection(db, TX_COL), where('senderId', '==', accountId), limit(1000));
      const qReceiver = query(collection(db, TX_COL), where('receiverId', '==', accountId), limit(1000));

      // Eagerly hydrate sender & receiver ledger immediately on login/account switch
      void Promise.all([getDocs(qSender), getDocs(qReceiver)])
        .then(([sSnap, rSnap]) => {
          const store = readLocalStore();
          let mutated = false;
          for (const d of sSnap.docs) {
            const tx = d.data() as AcashTransaction;
            store.transactions[tx.txId] = tx;
            mutated = true;
          }
          for (const d of rSnap.docs) {
            const tx = d.data() as AcashTransaction;
            store.transactions[tx.txId] = tx;
            mutated = true;
          }
          if (mutated) {
            writeLocalStore(store, false);
            emitLocal();
          }
        })
        .catch(() => {
          // Handled via live onSnapshot listeners below
        });

      unsubSenderFs = onSnapshot(
        qSender,
        (snap) => mergeSnap(snap, 'senderId'),
        (err) => {
          console.warn('Sender transaction subscription notice:', err);
          emitLocal();
        }
      );
      unsubReceiverFs = onSnapshot(
        qReceiver,
        (snap) => mergeSnap(snap, 'receiverId'),
        (err) => {
          console.warn('Receiver transaction subscription notice:', err);
          emitLocal();
        }
      );
    } catch {
      // ignore
    }
  };

  // Attach immediately by accountId so EmailJS OTP & PIN-authenticated users receive live credits & history
  attachAccountListeners();

  let lastAuthUid = auth.currentUser?.uid || '';
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    const nextUid = fbUser?.uid || '';
    if (nextUid && nextUid !== lastAuthUid) {
      lastAuthUid = nextUid;
      attachAccountListeners();
    } else if (!nextUid) {
      lastAuthUid = '';
    }
  });

  return () => {
    unsubLocal();
    unsubAuth();
    unsubSenderFs();
    unsubReceiverFs();
  };
}

export function subscribeToAllUsers(callback: (users: AcashUser[]) => void): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(Object.values(store.users).sort((a, b) => b.createdAt - a.createdAt));
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  let unsubKycFs: Unsubscribe = () => {};
  let unsubDirFs: Unsubscribe = () => {};
  const kycSubmissionCache: Record<string, KycSubmissionRecord> = {};

  const applyKycSubmissionToUser = (u: AcashUser, sub?: KycSubmissionRecord): AcashUser => {
    if (!sub) return u;
    const existingKycTs = u.kyc?.updatedAt || 0;
    if (u.kyc && sub.updatedAt <= existingKycTs) return u;
    return {
      ...u,
      ...(sub.name ? { name: sub.name } : {}),
      ...(sub.businessName ? { businessName: sub.businessName } : {}),
      kyc: sub.kyc,
      verified: true,
      lastActiveAt: Math.max(u.lastActiveAt || 0, sub.updatedAt),
    };
  };

  const attachDirectoryListener = () => {
    unsubDirFs();
    try {
      const qDir = query(collection(db, DIRECTORY_COL), orderBy('createdAt', 'desc'), limit(1000));
      unsubDirFs = onSnapshot(
        qDir,
        (snap) => {
          const entries = snap.docs.map((d) => d.data() as AcashDirectoryEntry);
          const store = readLocalStore();
          const missingIds: string[] = [];
          let changed = false;

          for (const change of snap.docChanges()) {
            if (
              change.type === 'removed' &&
              !snap.metadata.fromCache &&
              !snap.metadata.hasPendingWrites &&
              store.users[change.doc.id]
            ) {
              delete store.users[change.doc.id];
              changed = true;
            }
          }

          for (const entry of entries) {
            if (LEGACY_BOT_USER_IDS.has(entry.accountId)) continue;
            const existing = store.users[entry.accountId];
            if (!existing) {
              missingIds.push(entry.accountId);
            } else {
              // Merge directory metadata only; NEVER overwrite real balance, commission, pinHash, or email
              const merged = applyKycSubmissionToUser(
                {
                  ...existing,
                  name: entry.name || existing.name,
                  ...(entry.businessName ? { businessName: entry.businessName } : {}),
                  phone: entry.phone || existing.phone,
                  status: entry.status,
                  verified: entry.verified,
                  ...(entry.firebaseUid ? { firebaseUid: entry.firebaseUid } : {}),
                },
                kycSubmissionCache[entry.accountId]
              );
              store.users[entry.accountId] = merged;
              changed = true;
            }
          }
          if (changed) {
            writeLocalStore(store, false);
          }
          emitLocal();

          // Hydrate any missing users directly from authoritative acash_users collection (never balance: 0 stubs)
          if (missingIds.length > 0) {
            void Promise.all(
              missingIds.slice(0, 50).map((id) => getDoc(doc(db, USERS_COL, id)).catch(() => null))
            ).then((snaps) => {
              const nextStore = readLocalStore();
              let hydrated = false;
              for (const s of snaps) {
                if (s && s.exists()) {
                  const realUser = s.data() as AcashUser;
                  if (!LEGACY_BOT_USER_IDS.has(realUser.accountId)) {
                    nextStore.users[realUser.accountId] = applyKycSubmissionToUser(
                      realUser,
                      kycSubmissionCache[realUser.accountId]
                    );
                    hydrated = true;
                  }
                }
              }
              if (hydrated) {
                writeLocalStore(nextStore, false);
                emitLocal();
              }
            });
          }
        },
        (err) => {
          if (isPermissionError(err)) {
            console.warn('Directory subscription notice:', err);
          }
          emitLocal();
        }
      );
    } catch {
      // ignore
    }
  };

  const attachProtectedListeners = () => {
    unsubFs();
    unsubKycFs();
    try {
      const q = query(collection(db, USERS_COL), limit(1000));
      const processUsersSnap = (snap: {
        docs: Array<{ data: () => unknown }>;
        docChanges?: () => Array<{ type: string; doc: { id: string } }>;
        metadata: { fromCache: boolean; hasPendingWrites?: boolean };
      }) => {
        const fsUsers = snap.docs
          .map((d) => d.data() as AcashUser)
          .filter((u) => !LEGACY_BOT_USER_IDS.has(u.accountId));
        const store = readLocalStore();
        let mutated = false;

        if (snap.docChanges) {
          for (const change of snap.docChanges()) {
            if (
              change.type === 'removed' &&
              !snap.metadata.fromCache &&
              !snap.metadata.hasPendingWrites &&
              store.users[change.doc.id]
            ) {
              delete store.users[change.doc.id];
              mutated = true;
            }
          }
        }

        if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
          const serverIds = new Set(fsUsers.map((u) => u.accountId));
          for (const id of Object.keys(store.users)) {
            if (!serverIds.has(id)) {
              delete store.users[id];
              mutated = true;
            }
          }
        }

        for (const u of fsUsers) {
          const existing = store.users[u.accountId];
          const cachedSub = kycSubmissionCache[u.accountId];
          const mergedKyc =
            existing?.kyc && (!u.kyc || existing.kyc.updatedAt > u.kyc.updatedAt)
              ? existing.kyc
              : u.kyc;
          const candidate = applyKycSubmissionToUser(
            {
              ...u,
              ...(mergedKyc ? { kyc: mergedKyc } : {}),
            },
            cachedSub
          );
          store.users[u.accountId] = candidate;
          mutated = true;
        }

        if (mutated) {
          writeLocalStore(store, false);
        }

        if (auth.currentUser?.emailVerified && isMainAdminEmail(auth.currentUser.email)) {
          for (const u of fsUsers) {
            void setDoc(doc(db, DIRECTORY_COL, u.accountId), toDirectoryEntry(u), {
              merge: true,
            }).catch(() => {});
            void backfillUserIdentityLocks(u);
          }
        }
        emitLocal();
      };

      void getDocs(q)
        .then((snap) => processUsersSnap(snap))
        .catch(() => {});

      unsubFs = onSnapshot(
        q,
        (snap) => processUsersSnap(snap),
        (err) => {
          console.warn('Users subscription notice:', err);
          emitLocal();
        }
      );
    } catch {
      // ignore
    }

    try {
      const qKyc = query(collection(db, KYC_SUBMISSIONS_COL), limit(300));
      unsubKycFs = onSnapshot(
        qKyc,
        (snap) => {
          const subs = snap.docs
            .map((d) => d.data() as KycSubmissionRecord)
            .filter((s) => !LEGACY_BOT_USER_IDS.has(s.accountId));
          if (subs.length === 0) return;

          const store = readLocalStore();
          let changed = false;

          for (const sub of subs) {
            kycSubmissionCache[sub.accountId] = sub;
            const existing = store.users[sub.accountId];
            if (!existing) continue;
            const existingKycTs = existing.kyc?.updatedAt || 0;
            if (!existing.kyc || sub.updatedAt > existingKycTs) {
              const updatedUser = applyKycSubmissionToUser(existing, sub);
              store.users[sub.accountId] = updatedUser;
              changed = true;

              if (auth.currentUser?.emailVerified) {
                void setDoc(
                  doc(db, USERS_COL, sub.accountId),
                  {
                    name: updatedUser.name,
                    ...(updatedUser.businessName ? { businessName: updatedUser.businessName } : {}),
                    kyc: updatedUser.kyc,
                    verified: true,
                    lastActiveAt: updatedUser.lastActiveAt,
                  },
                  { merge: true }
                ).catch(() => {});
                if (sub.kyc?.nidNumber) {
                  void claimIdentityLock('nid', sub.kyc.nidNumber, sub.accountId, sub.updatedAt).catch(() => {});
                }
                if (sub.kyc?.taxCertificateNumber) {
                  void claimIdentityLock('tax', sub.kyc.taxCertificateNumber, sub.accountId, sub.updatedAt).catch(() => {});
                }
              }
            }
          }

          if (changed) {
            writeLocalStore(store, false);
            emitLocal();
          }
        },
        () => {
          // Non-admin viewers cannot read KYC submissions
        }
      );
    } catch {
      // ignore
    }
  };

  attachDirectoryListener();
  attachProtectedListeners();

  let lastAuthUid = auth.currentUser?.uid || '';
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    const nextUid = fbUser?.emailVerified ? fbUser.uid : '';
    if (nextUid && nextUid !== lastAuthUid) {
      lastAuthUid = nextUid;
      attachProtectedListeners();
      attachDirectoryListener();
    } else if (!nextUid) {
      lastAuthUid = '';
    }
  });

  return () => {
    unsubLocal();
    unsubAuth();
    unsubFs();
    unsubKycFs();
    unsubDirFs();
  };
}

export function subscribeToAllTransactions(
  callback: (txs: AcashTransaction[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(Object.values(store.transactions).sort((a, b) => b.createdAt - a.createdAt));
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  const attachFs = (useOrderBy = true) => {
    unsubFs();
    try {
      const q = useOrderBy
        ? query(collection(db, TX_COL), orderBy('createdAt', 'desc'), limit(1000))
        : query(collection(db, TX_COL), limit(1000));
      unsubFs = onSnapshot(
        q,
        (snap) => {
          const fsTxs = snap.docs
            .map((d) => d.data() as AcashTransaction)
            .sort((a, b) => b.createdAt - a.createdAt);
          const store = readLocalStore();
          let mutated = false;

          for (const change of snap.docChanges()) {
            if (
              change.type === 'removed' &&
              !snap.metadata.fromCache &&
              !snap.metadata.hasPendingWrites &&
              store.transactions[change.doc.id]
            ) {
              delete store.transactions[change.doc.id];
              mutated = true;
            }
          }

          if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
            const serverIds = new Set(fsTxs.map((t) => t.txId));
            const oldestServerTs =
              fsTxs.length >= 900 ? fsTxs[fsTxs.length - 1].createdAt : Number.NEGATIVE_INFINITY;
            const now = Date.now();
            for (const [id, existingTx] of Object.entries(store.transactions)) {
              if (
                existingTx.createdAt >= oldestServerTs &&
                now - existingTx.createdAt > 5000 &&
                !serverIds.has(id)
              ) {
                delete store.transactions[id];
                mutated = true;
              }
            }
          }

          for (const tx of fsTxs) {
            store.transactions[tx.txId] = tx;
            mutated = true;
          }

          if (mutated) {
            writeLocalStore(store, false);
          }
          emitLocal();
        },
        (err) => {
          console.warn('Global Ledger subscription notice:', err);
          if (useOrderBy) {
            attachFs(false);
            return;
          }
          emitLocal();
        }
      );
    } catch {
      if (useOrderBy) {
        attachFs(false);
      }
    }
  };

  attachFs();
  let lastUid = auth.currentUser?.uid || '';
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    const nextUid = fbUser?.emailVerified ? fbUser.uid : '';
    if (nextUid && nextUid !== lastUid) {
      lastUid = nextUid;
      attachFs();
    } else if (!nextUid) {
      lastUid = '';
    }
  });

  return () => {
    unsubLocal();
    unsubAuth();
    unsubFs();
  };
}

export function subscribeToAdminNotifications(
  callback: (notifications: AdminNotification[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(Object.values(store.notifications || {}).sort((a, b) => b.createdAt - a.createdAt));
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  const attachFs = () => {
    unsubFs();
    try {
      const q = query(collection(db, ADMIN_NOTIF_COL), orderBy('createdAt', 'desc'), limit(100));
      unsubFs = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AdminNotification);
          if (list.length > 0) {
            const store = readLocalStore();
            for (const n of list) {
              store.notifications[n.id] = n;
            }
            writeLocalStore(store, false);
          }
          emitLocal();
        },
        () => {
          emitLocal();
        }
      );
    } catch {
      // ignore
    }
  };

  attachFs();
  let lastUid = auth.currentUser?.uid || '';
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    const nextUid = fbUser?.emailVerified ? fbUser.uid : '';
    if (nextUid && nextUid !== lastUid) {
      lastUid = nextUid;
      attachFs();
    } else if (!nextUid) {
      lastUid = '';
    }
  });

  return () => {
    unsubLocal();
    unsubAuth();
    unsubFs();
  };
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  const store = readLocalStore();
  if (store.notifications[id]) {
    store.notifications[id] = { ...store.notifications[id], read: true };
    writeLocalStore(store, true);
  }
  try {
    await updateDoc(doc(db, ADMIN_NOTIF_COL, id), { read: true });
  } catch {
    // ignore
  }
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  const store = readLocalStore();
  const ids = Object.keys(store.notifications);
  for (const id of ids) {
    store.notifications[id] = { ...store.notifications[id], read: true };
  }
  writeLocalStore(store, true);
  try {
    await Promise.all(
      ids.map((id) => updateDoc(doc(db, ADMIN_NOTIF_COL, id), { read: true }).catch(() => {}))
    );
  } catch {
    // ignore
  }
}

function buildAccountNotification(params: {
  recipientId: string;
  recipientRole?: UserRole | 'ALL';
  title: string;
  message: string;
  category: AccountNotificationCategory;
  severity: 'info' | 'success' | 'warning' | 'critical';
  amount?: number;
  txId?: string;
  txHash?: string;
  createdBy?: string;
  createdAt?: number;
}): AccountNotification {
  const ts = params.createdAt || Date.now();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return stripUndefined({
    id: `ACN-${ts.toString(36).toUpperCase()}-${rand}`,
    recipientId: params.recipientId,
    ...(params.recipientRole ? { recipientRole: params.recipientRole } : {}),
    title: params.title.slice(0, 190),
    message: params.message.slice(0, 950),
    category: params.category,
    severity: params.severity,
    ...(typeof params.amount === 'number' ? { amount: params.amount } : {}),
    ...(params.txId ? { txId: params.txId } : {}),
    ...(params.txHash ? { txHash: params.txHash } : {}),
    ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    read: false,
    readBy: [],
    createdAt: ts,
  });
}

async function persistAccountNotifications(notifs: AccountNotification[]): Promise<void> {
  if (notifs.length === 0) return;
  const store = readLocalStore();
  store.accountNotifications = store.accountNotifications || {};
  for (const n of notifs) {
    store.accountNotifications[n.id] = n;
  }
  writeLocalStore(store, true);
  try {
    await Promise.all(
      notifs.map((n) => setDoc(doc(db, ACCOUNT_NOTIF_COL, n.id), n).catch(() => {}))
    );
  } catch {
    // ignore offline sync fallback
  }
}

export function isAccountNotificationRead(notif: AccountNotification, accountId: string): boolean {
  if (notif.recipientId === 'ALL') {
    return Boolean(notif.readBy?.includes(accountId));
  }
  return Boolean(notif.read || notif.readBy?.includes(accountId));
}

export function subscribeToAccountNotifications(
  accountId: string,
  callback: (notifs: AccountNotification[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    const list = Object.values(store.accountNotifications || {})
      .filter((n) => n.recipientId === accountId || n.recipientId === 'ALL')
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  const attachFs = () => {
    unsubFs();
    try {
      const q = query(
        collection(db, ACCOUNT_NOTIF_COL),
        where('recipientId', 'in', [accountId, 'ALL'])
      );
      unsubFs = onSnapshot(
        q,
        (snap) => {
          const store = readLocalStore();
          store.accountNotifications = store.accountNotifications || {};
          for (const d of snap.docs) {
            const n = d.data() as AccountNotification;
            if (n?.id) {
              store.accountNotifications[n.id] = n;
            }
          }
          writeLocalStore(store, false);
          emitLocal();
        },
        () => emitLocal()
      );
    } catch {
      // ignore
    }
  };

  attachFs();
  let lastUid = auth.currentUser?.uid || '';
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    const nextUid = fbUser?.emailVerified ? fbUser.uid : '';
    if (nextUid && nextUid !== lastUid) {
      lastUid = nextUid;
      attachFs();
    } else if (!nextUid) {
      lastUid = '';
    }
  });

  return () => {
    unsubLocal();
    unsubAuth();
    unsubFs();
  };
}

export async function markAccountNotificationRead(notifId: string, accountId: string): Promise<void> {
  const store = readLocalStore();
  const existing = store.accountNotifications?.[notifId];
  let isBroadcast = false;
  if (existing) {
    isBroadcast = existing.recipientId === 'ALL';
    const nextReadBy = Array.from(new Set([...(existing.readBy || []), accountId]));
    store.accountNotifications[notifId] = {
      ...existing,
      read: isBroadcast ? existing.read : true,
      readBy: nextReadBy,
    };
    writeLocalStore(store, true);
  }
  try {
    await updateDoc(
      doc(db, ACCOUNT_NOTIF_COL, notifId),
      isBroadcast ? { readBy: arrayUnion(accountId) } : { read: true, readBy: arrayUnion(accountId) }
    );
  } catch {
    // ignore
  }
}

export async function markAllAccountNotificationsRead(accountId: string): Promise<void> {
  const store = readLocalStore();
  const matching = Object.values(store.accountNotifications || {}).filter(
    (n) => (n.recipientId === accountId || n.recipientId === 'ALL') && !isAccountNotificationRead(n, accountId)
  );
  if (matching.length === 0) return;

  for (const n of matching) {
    const nextReadBy = Array.from(new Set([...(n.readBy || []), accountId]));
    store.accountNotifications[n.id] = {
      ...n,
      read: n.recipientId === 'ALL' ? n.read : true,
      readBy: nextReadBy,
    };
  }
  writeLocalStore(store, true);

  try {
    await Promise.all(
      matching.map((n) =>
        updateDoc(
          doc(db, ACCOUNT_NOTIF_COL, n.id),
          n.recipientId === 'ALL'
            ? { readBy: arrayUnion(accountId) }
            : { read: true, readBy: arrayUnion(accountId) }
        ).catch(() => {})
      )
    );
  } catch {
    // ignore
  }
}

export async function adminSendAccountNotification(params: {
  recipientIdentifier: string; // 'ALL' or accountId / phone / email
  title: string;
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  adminEmail: string;
}): Promise<AccountNotification> {
  const cleanTitle = params.title.trim();
  const cleanMessage = params.message.trim();
  if (!cleanTitle || !cleanMessage) {
    throw new Error('Alert title and message are required.');
  }

  const cleanTarget = params.recipientIdentifier.trim().toUpperCase();
  let resolvedRecipientId = 'ALL';
  let resolvedRole: UserRole | 'ALL' = 'ALL';

  if (cleanTarget !== 'ALL') {
    const targetUser = await findUserByIdentifier(params.recipientIdentifier);
    if (!targetUser) {
      throw new Error('Target account not found. Enter a valid ID (U-/A-/M-), phone, email, or select ALL.');
    }
    resolvedRecipientId = targetUser.accountId;
    resolvedRole = targetUser.role;
  }

  const now = Date.now();
  const notif = buildAccountNotification({
    recipientId: resolvedRecipientId,
    recipientRole: resolvedRole,
    title: cleanTitle,
    message: cleanMessage,
    category: 'admin_alert',
    severity: params.severity || 'info',
    createdBy: params.adminEmail,
    createdAt: now,
  });

  const act = makeActivityEntry({
    idPrefix: 'ACT-BCN',
    actionType: 'account_alert',
    title:
      resolvedRecipientId === 'ALL'
        ? `Live Broadcast Alert Sent (${cleanTitle})`
        : `Direct Alert Sent to ${resolvedRecipientId}`,
    details: `${cleanTitle} — ${cleanMessage}`,
    actorEmail: params.adminEmail,
    targetIds: resolvedRecipientId === 'ALL' ? [] : [resolvedRecipientId],
    timestamp: now,
  });

  const store = readLocalStore();
  store.accountNotifications = store.accountNotifications || {};
  store.accountNotifications[notif.id] = notif;
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await Promise.all([
      setDoc(doc(db, ACCOUNT_NOTIF_COL, notif.id), notif),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act),
    ]);
    firestoreBackendMode = 'firestore';
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return notif;
}

export function subscribeToAdminActivityLogs(
  callback: (logs: AdminActivityLog[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(Object.values(store.activityLogs || {}).sort((a, b) => b.timestamp - a.timestamp));
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  const attachFs = () => {
    unsubFs();
    try {
      const q = query(collection(db, ADMIN_ACTIVITY_COL), orderBy('timestamp', 'desc'), limit(200));
      unsubFs = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AdminActivityLog);
          if (list.length > 0) {
            const store = readLocalStore();
            for (const item of list) {
              store.activityLogs[item.id] = item;
            }
            writeLocalStore(store, false);
          }
          emitLocal();
        },
        () => {
          emitLocal();
        }
      );
    } catch {
      // ignore
    }
  };

  attachFs();
  let lastUid = auth.currentUser?.uid || '';
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    const nextUid = fbUser?.emailVerified ? fbUser.uid : '';
    if (nextUid && nextUid !== lastUid) {
      lastUid = nextUid;
      attachFs();
    } else if (!nextUid) {
      lastUid = '';
    }
  });

  return () => {
    unsubLocal();
    unsubAuth();
    unsubFs();
  };
}

export async function executeFinancialTransaction(params: {
  type: TransactionType;
  senderId: string;
  receiverIdentifier: string;
  amount: number;
  pin: string;
  feeConfig: FeeConfig;
  operator?: OperatorId;
  rechargeNumber?: string;
  rechargeType?: 'prepaid' | 'postpaid';
  biller?: BillerId;
  billAccountNumber?: string;
  billMonth?: string;
  note?: string;
  giftCard?: GiftCardPayload;
}): Promise<AcashTransaction> {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid amount greater than 0 BDT.');
  }

  const isExternalUtility = params.type === 'mobile_recharge' || params.type === 'bill_pay';
  const cleanReceiverInput = params.receiverIdentifier.trim().toUpperCase();
  const isAdminTarget =
    (params.type === 'agent_cash_out' || params.type === 'merchant_cash_out') &&
    (cleanReceiverInput === 'ADMIN-TREASURY' || cleanReceiverInput === 'ADMIN');

  const store = readLocalStore();
  let senderLocal = store.users[params.senderId];
  try {
    const freshSenderSnap = await getDoc(doc(db, USERS_COL, params.senderId));
    if (freshSenderSnap.exists()) {
      senderLocal = freshSenderSnap.data() as AcashUser;
      store.users[senderLocal.accountId] = senderLocal;
    }
  } catch {
    // fall back to cached sender if offline
  }

  if (!senderLocal) throw new Error('Sender account does not exist.');
  if (senderLocal.status !== 'active') throw new Error('Your account is currently disabled by Admin.');
  if (senderLocal.pinHash !== hashPin(params.pin)) throw new Error('Incorrect Security PIN.');

  let receiverUser: AcashUser | null = null;

  if (params.type === 'agent_cash_out') {
    if (senderLocal.role !== 'A') {
      throw new Error('Only Agent (A-) accounts can perform Agent Cash-Out to Admin.');
    }
    if (!isAdminTarget) {
      throw new Error('Agent Cash-Out can only be sent to Admin Treasury (ADMIN-TREASURY).');
    }
  } else if (!isExternalUtility && !isAdminTarget) {
    receiverUser = await findUserByIdentifier(params.receiverIdentifier);
    if (!receiverUser) {
      throw new Error('Recipient account not found. Please verify the Acash ID or mobile number.');
    }
    if (receiverUser.accountId === params.senderId) {
      throw new Error('You cannot transfer funds to your own account.');
    }

    if (params.type === 'cash_out') {
      if (senderLocal.role !== 'U' || receiverUser.role !== 'A') {
        throw new Error('Customer Cash Out must be from a Customer (U-) to a valid Agent (A-) account.');
      }
    }
    if (params.type === 'merchant_payment') {
      if (senderLocal.role !== 'U' || receiverUser.role !== 'M') {
        throw new Error('Merchant Payment must be from a Customer (U-) to a valid Merchant (M-) account.');
      }
    }
    if (params.type === 'cash_in') {
      if (senderLocal.role !== 'A' || receiverUser.role !== 'U') {
        throw new Error('Agent Cash-In must target a valid Customer (U-) account.');
      }
    }
    if (params.type === 'send_money') {
      if (senderLocal.role === 'A' && receiverUser.role !== 'U') {
        throw new Error('Agents can only Send Money to Customer (U-) accounts.');
      }
      if (senderLocal.role === 'U' && receiverUser.role !== 'U') {
        throw new Error(
          'Customer Send Money is for Customer (U-) accounts. Use Cash Out for Agent or Merchant Pay for Merchant.'
        );
      }
      if (senderLocal.role === 'M') {
        throw new Error('Merchants cannot use Send Money. Use Merchant Cash-Out (Agent/Admin) or B2B.');
      }
    }
    if (params.type === 'merchant_cash_out') {
      if (senderLocal.role !== 'M') {
        throw new Error('Only Merchant (M-) accounts can perform Merchant Cash-Out.');
      }
      if (receiverUser.role !== 'A') {
        throw new Error('Merchant Cash-Out can only target an Agent (A-) account or Admin Treasury.');
      }
    }
    if (params.type === 'b2b_transfer') {
      if (senderLocal.role !== 'M' || receiverUser.role !== 'M') {
        throw new Error('B2B Supplier Transfer requires valid Merchant (M-) sender and recipient.');
      }
    }
  } else if (params.type === 'merchant_cash_out' && senderLocal.role !== 'M') {
    throw new Error('Only Merchant (M-) accounts can perform Merchant Cash-Out.');
  }

  if (params.giftCard) {
    if (params.type !== 'send_money' || senderLocal.role !== 'U' || receiverUser?.role !== 'U') {
      throw new Error('Gift Cards can only be sent on Customer-to-Customer (U- to U-) Send Money.');
    }
    if (countWords(params.giftCard.message || '') > GIFT_CARD_MAX_WORDS) {
      throw new Error(`Gift card letter cannot exceed ${GIFT_CARD_MAX_WORDS} words.`);
    }
  }

  const effectiveFeeConfig = normalizeFeeConfig(
    store.feeConfig && store.feeConfig.updatedAt >= (params.feeConfig?.updatedAt || 0)
      ? store.feeConfig
      : params.feeConfig
  );

  const { fee, breakdown } = calculateFeeBreakdown(params.type, amount, effectiveFeeConfig, {
    targetIsAdmin: isAdminTarget,
    hasGiftCard: Boolean(params.giftCard),
  });
  const totalDebited = Number((amount + fee).toFixed(2));
  const requiresAdminApproval = amount >= effectiveFeeConfig.highValueThreshold;

  const txId = generateTxId();
  const txHash = generateTxHash();
  const now = Date.now();

  if (senderLocal.balance < totalDebited) {
    throw new Error(
      `Insufficient balance. Needed ৳${totalDebited.toFixed(2)}, Available ৳${senderLocal.balance.toFixed(2)}.`
    );
  }

  const resolvedReceiver = receiverUser;
  if (resolvedReceiver && resolvedReceiver.status !== 'active') {
    throw new Error('Recipient account is disabled.');
  }

  const activeUid = auth.currentUser?.uid;
  const baseTxRecord: AcashTransaction = {
    txId,
    txHash,
    type: params.type,
    senderId: senderLocal.accountId,
    ...(senderLocal.firebaseUid || activeUid
      ? { senderUid: senderLocal.firebaseUid || activeUid }
      : {}),
    senderName: senderLocal.businessName || senderLocal.name,
    senderPhone: senderLocal.phone,
    senderRole: senderLocal.role,
    receiverId: isAdminTarget
      ? 'ADMIN-TREASURY'
      : resolvedReceiver
        ? resolvedReceiver.accountId
        : params.operator
          ? `OP-${params.operator.toUpperCase()}`
          : `BILL-${(params.biller || 'UTIL').toUpperCase()}`,
    ...(resolvedReceiver?.firebaseUid ? { receiverUid: resolvedReceiver.firebaseUid } : {}),
    receiverName: isAdminTarget
      ? 'Acash Admin Treasury'
      : resolvedReceiver
        ? resolvedReceiver.businessName || resolvedReceiver.name
        : params.operator
          ? `${params.operator.toUpperCase()} Recharge (${params.rechargeNumber})`
          : `${(params.biller || 'Utility').toUpperCase()} (${params.billAccountNumber})`,
    receiverPhone: isAdminTarget
      ? 'SYSTEM'
      : resolvedReceiver
        ? resolvedReceiver.phone
        : params.rechargeNumber || params.billAccountNumber || '',
    receiverRole: isAdminTarget
      ? 'ADMIN'
      : resolvedReceiver
        ? resolvedReceiver.role
        : params.operator
          ? 'OPERATOR'
          : 'BILLER',
    amount,
    fee,
    totalDebited,
    feeBreakdown: breakdown,
    status: requiresAdminApproval ? 'pending_admin_approval' : 'completed',
    refundedAmount: 0,
    ...(params.operator ? { operator: params.operator } : {}),
    ...(params.rechargeNumber ? { rechargeNumber: params.rechargeNumber } : {}),
    ...(params.rechargeType ? { rechargeType: params.rechargeType } : {}),
    ...(params.biller ? { biller: params.biller } : {}),
    ...(params.billAccountNumber ? { billAccountNumber: params.billAccountNumber } : {}),
    ...(params.billMonth ? { billMonth: params.billMonth } : {}),
    ...(params.note?.trim() ? { note: params.note.trim() } : {}),
    ...(params.giftCard ? { giftCard: stripUndefined(params.giftCard) } : {}),
    createdAt: now,
  };

  const getsCashOutCommission =
    Boolean(resolvedReceiver) &&
    (params.type === 'cash_out' ||
      (params.type === 'merchant_cash_out' && resolvedReceiver?.role === 'A'));
  const creditToReceiver = getsCashOutCommission
    ? Number((amount + breakdown.agentAmount).toFixed(2))
    : amount;
  const receiverCommInc = getsCashOutCommission ? breakdown.agentAmount : 0;

  let txNotif: AdminNotification | null = null;
  if (requiresAdminApproval) {
    txNotif = {
      id: `NTF-AML-${txId}`,
      title: `High-Value Review Required (৳${amount.toLocaleString()})`,
      message: `${senderLocal.name} (${senderLocal.accountId}) initiated ${params.type.replace(/_/g, ' ')} of ৳${amount.toLocaleString()} (${txHash}).`,
      category: 'aml_pending',
      severity: 'critical',
      createdAt: now,
      read: false,
      targetSection: 'approvals',
    };
  } else if (isAdminTarget) {
    txNotif = {
      id: `NTF-SET-${txId}`,
      title: `${senderLocal.role === 'A' ? 'Agent' : 'Merchant'} Cash-Out to Admin (৳${amount.toLocaleString()})`,
      message: `${senderLocal.businessName || senderLocal.name} (${senderLocal.accountId}) settled ৳${amount.toLocaleString()} to ADMIN-TREASURY (${txHash}).`,
      category: 'treasury',
      severity: 'info',
      createdAt: now,
      read: false,
      targetSection: 'treasury',
    };
  }

  let committedSender: AcashUser | null = null;
  let committedReceiver: AcashUser | null = null;
  let committedTxRecord: AcashTransaction = baseTxRecord;

  const executeAtomicCloudTx = async () => {
    await runTransaction(db, async (transaction) => {
      // 1. Execute ALL Firestore reads BEFORE any writes
      const senderRef = doc(db, USERS_COL, params.senderId);
      const receiverRef =
        !isExternalUtility && !isAdminTarget && resolvedReceiver
          ? doc(db, USERS_COL, resolvedReceiver.accountId)
          : null;

      const [senderSnap, receiverSnap] = await Promise.all([
        transaction.get(senderRef),
        receiverRef ? transaction.get(receiverRef) : Promise.resolve(null),
      ]);

      // 2. Compute authoritative sender balance from Firestore snapshot
      if (!senderSnap.exists()) {
        throw new Error('Sender account record not found in Acash Cloud Ledger.');
      }
      const authSender = senderSnap.data() as AcashUser;
      if (authSender.status !== 'active') {
        throw new Error('Your account is currently disabled by Admin.');
      }
      if (authSender.balance < totalDebited) {
        throw new Error(
          `Insufficient balance. Needed ৳${totalDebited.toFixed(2)}, Available ৳${authSender.balance.toFixed(2)}.`
        );
      }

      let nextSenderBalance = Number((authSender.balance - totalDebited).toFixed(2));
      let nextSenderComm = Number((authSender.commissionBalance || 0).toFixed(2));
      if (params.type === 'cash_in' && !requiresAdminApproval) {
        nextSenderBalance = Number((nextSenderBalance + breakdown.agentAmount).toFixed(2));
        nextSenderComm = Number((nextSenderComm + breakdown.agentAmount).toFixed(2));
      }

      committedSender = stripUndefined({
        ...authSender,
        balance: nextSenderBalance,
        commissionBalance: nextSenderComm,
        lastActiveAt: now,
      });

      // 3. Validate & compute authoritative receiver balance from Firestore snapshot
      let nextTxRecord: AcashTransaction = { ...baseTxRecord };
      if (receiverRef && resolvedReceiver) {
        if (!receiverSnap || !receiverSnap.exists()) {
          throw new Error('Recipient account record not found in Acash Cloud Ledger.');
        }
        const authReceiver = receiverSnap.data() as AcashUser;
        if (authReceiver.status !== 'active') {
          throw new Error('Recipient account is disabled.');
        }

        nextTxRecord = {
          ...baseTxRecord,
          receiverName: authReceiver.businessName || authReceiver.name || baseTxRecord.receiverName,
          receiverPhone: authReceiver.phone || baseTxRecord.receiverPhone,
          ...(authReceiver.firebaseUid ? { receiverUid: authReceiver.firebaseUid } : {}),
        };

        if (!requiresAdminApproval) {
          const nextReceiverBalance = Number(
            ((authReceiver.balance || 0) + creditToReceiver).toFixed(2)
          );
          const nextReceiverComm = Number(
            ((authReceiver.commissionBalance || 0) + receiverCommInc).toFixed(2)
          );

          committedReceiver = stripUndefined({
            ...authReceiver,
            balance: nextReceiverBalance,
            commissionBalance: nextReceiverComm,
            lastActiveAt: now,
          });
        }
      }

      committedTxRecord = nextTxRecord;

      // 4. Execute ALL Firestore writes atomically after all reads
      transaction.update(senderRef, {
        balance: committedSender.balance,
        commissionBalance: committedSender.commissionBalance,
        lastActiveAt: now,
      });

      if (receiverRef && committedReceiver && !requiresAdminApproval) {
        transaction.update(receiverRef, {
          balance: committedReceiver.balance,
          commissionBalance: committedReceiver.commissionBalance,
          lastActiveAt: now,
        });
      }

      transaction.set(doc(db, TX_COL, txId), committedTxRecord);
      if (txNotif) {
        transaction.set(doc(db, ADMIN_NOTIF_COL, txNotif.id), txNotif);
      }
    });
  };

  try {
    await executeAtomicCloudTx();
    firestoreBackendMode = 'firestore';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isValidationErr =
      msg.includes('Insufficient balance') ||
      msg.includes('disabled') ||
      msg.includes('Incorrect Security PIN') ||
      msg.includes('not found');
    if (isValidationErr) {
      throw err;
    }
    try {
      await executeAtomicCloudTx();
      firestoreBackendMode = 'firestore';
    } catch (retryErr) {
      firestoreBackendMode = 'local_sync';
      console.error('Atomic Firestore transaction failed:', retryErr);
      throw new Error(
        retryErr instanceof Error && !isPermissionError(retryErr)
          ? retryErr.message
          : 'Transaction could not be committed to Acash Cloud Ledger. Please check your connection and try again.'
      );
    }
  }

  const latestStore = readLocalStore();
  if (committedSender) {
    latestStore.users[(committedSender as AcashUser).accountId] = committedSender;
  }
  if (committedReceiver) {
    latestStore.users[(committedReceiver as AcashUser).accountId] = committedReceiver;
  }
  latestStore.transactions[txId] = committedTxRecord;
  if (txNotif) {
    latestStore.notifications[txNotif.id] = txNotif;
  }
  const accountNotifs: AccountNotification[] = [];
  if (requiresAdminApproval) {
    accountNotifs.push(
      buildAccountNotification({
        recipientId: senderLocal.accountId,
        recipientRole: senderLocal.role,
        title: `Pending Admin Approval · ৳${amount.toLocaleString()}`,
        message: `Your ${params.type.replace(/_/g, ' ')} to ${committedTxRecord.receiverName} (${committedTxRecord.receiverId}) is held for AML review (${txHash}).`,
        category: 'transaction',
        severity: 'warning',
        amount,
        txId,
        txHash,
        createdAt: now,
      })
    );
  } else {
    accountNotifs.push(
      buildAccountNotification({
        recipientId: senderLocal.accountId,
        recipientRole: senderLocal.role,
        title: `${params.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Completed · ৳${amount.toLocaleString()}`,
        message: `Debited ৳${totalDebited.toLocaleString()} to ${committedTxRecord.receiverName} (${committedTxRecord.receiverId}) · ${txHash}`,
        category: 'transaction',
        severity: 'info',
        amount,
        txId,
        txHash,
        createdAt: now,
      })
    );
    if (committedReceiver) {
      const hasGift = Boolean(committedTxRecord.giftCard);
      accountNotifs.push(
        buildAccountNotification({
          recipientId: (committedReceiver as AcashUser).accountId,
          recipientRole: (committedReceiver as AcashUser).role,
          title: hasGift
            ? `🎁 ${committedTxRecord.giftCard?.cardTitleBn || 'Gift Card'} · +৳${creditToReceiver.toLocaleString()}`
            : `Money Received · +৳${creditToReceiver.toLocaleString()}`,
          message: hasGift
            ? `${committedTxRecord.senderName} (${committedTxRecord.senderId}) sent you ৳${amount.toLocaleString()} with a "${committedTxRecord.giftCard?.cardTitleEn}" Gift Card! Tap to open.`
            : `Received ৳${amount.toLocaleString()}${receiverCommInc > 0 ? ` (+৳${receiverCommInc.toFixed(2)} comm)` : ''} from ${committedTxRecord.senderName} (${committedTxRecord.senderId}) · ${txHash}`,
          category: 'transaction',
          severity: 'success',
          amount: creditToReceiver,
          txId,
          txHash,
          createdAt: now,
        })
      );
    }
  }
  await persistAccountNotifications(accountNotifs);

  if (requiresAdminApproval) {
    await sendHighValuePendingEmails({
      senderEmail: senderLocal.email,
      senderName: senderLocal.businessName || senderLocal.name,
      senderId: senderLocal.accountId,
      adminEmail: getAdminAlertEmail(),
      receiverName: committedTxRecord.receiverName,
      receiverId: committedTxRecord.receiverId,
      amount: committedTxRecord.amount,
      txType: committedTxRecord.type,
      txHash: committedTxRecord.txHash,
    });
  }

  return committedTxRecord;
}

export async function executeMerchantRefund(params: {
  merchantId: string;
  txHashInput: string;
  refundAmount: number;
  pin: string;
  note?: string;
}): Promise<AcashTransaction> {
  const cleanHash = params.txHashInput.trim().toUpperCase();
  const refundAmt = Number(params.refundAmount);
  if (!Number.isFinite(refundAmt) || refundAmt <= 0) {
    throw new Error('Refund amount must be greater than 0 BDT.');
  }

  const store = readLocalStore();
  let orig = Object.values(store.transactions).find(
    (tx) => tx.txHash.toUpperCase() === cleanHash || tx.txId.toUpperCase() === cleanHash
  );

  if (!orig) {
    try {
      const qHash = query(collection(db, TX_COL), where('txHash', '==', cleanHash), limit(1));
      const snapHash = await getDocs(qHash);
      if (!snapHash.empty) orig = snapHash.docs[0].data() as AcashTransaction;
    } catch {
      // ignore
    }
  }

  if (!orig) {
    throw new Error('No transaction found matching that Tx Hash or Tx ID.');
  }
  if (orig.receiverId !== params.merchantId) {
    throw new Error('You can only refund incoming payments made to your Merchant account.');
  }
  if (orig.status === 'pending_admin_approval' || orig.status === 'rejected') {
    throw new Error('Cannot refund a transaction that was not completed.');
  }

  const remaining = Number((orig.amount - (orig.refundedAmount || 0)).toFixed(2));
  if (refundAmt > remaining) {
    throw new Error(`Refund exceeds remaining refundable amount (৳${remaining.toFixed(2)}).`);
  }

  let merchant = store.users[params.merchantId];
  if (!merchant) {
    merchant = (await findUserByIdentifier(params.merchantId)) ?? undefined as unknown as AcashUser;
  }
  if (!merchant) throw new Error('Merchant account not found.');
  if (merchant.status !== 'active') throw new Error('Merchant account is disabled.');
  if (merchant.pinHash !== hashPin(params.pin)) throw new Error('Incorrect Security PIN.');
  if (merchant.balance < refundAmt) {
    throw new Error('Insufficient Merchant balance to process this refund.');
  }

  let customer = store.users[orig.senderId];
  if (!customer) {
    customer = (await findUserByIdentifier(orig.senderId)) ?? undefined as unknown as AcashUser;
  }
  if (!customer) throw new Error('Customer account not found.');

  const now = Date.now();
  const refundTxId = generateTxId();
  const refundTxHash = generateTxHash();

  const refundRecord: AcashTransaction = {
    txId: refundTxId,
    txHash: refundTxHash,
    type: 'refund',
    senderId: merchant.accountId,
    ...(merchant.firebaseUid ? { senderUid: merchant.firebaseUid } : {}),
    senderName: merchant.businessName || merchant.name,
    senderPhone: merchant.phone,
    senderRole: 'M',
    receiverId: customer.accountId,
    ...(customer.firebaseUid ? { receiverUid: customer.firebaseUid } : {}),
    receiverName: customer.businessName || customer.name,
    receiverPhone: customer.phone,
    receiverRole: customer.role,
    amount: refundAmt,
    fee: 0,
    totalDebited: refundAmt,
    feeBreakdown: {
      ratePer1000: 0,
      agentShareRate: 0,
      govtShareRate: 0,
      adminShareRate: 0,
      agentAmount: 0,
      govtAmount: 0,
      adminAmount: 0,
      lockedAt: now,
    },
    status: 'completed',
    refundedAmount: 0,
    parentTxHash: orig.txHash,
    note: params.note?.trim() || `Refund for ${orig.txHash}`,
    createdAt: now,
  };

  let committedMerchant: AcashUser | null = null;
  let committedCustomer: AcashUser | null = null;
  let committedOrig: AcashTransaction | null = null;
  let committedRefund: AcashTransaction = refundRecord;

  await runTransaction(db, async (transaction) => {
    const merchantRef = doc(db, USERS_COL, merchant.accountId);
    const customerRef = doc(db, USERS_COL, customer.accountId);
    const origRef = doc(db, TX_COL, orig!.txId);

    const [merchantSnap, customerSnap, origSnap] = await Promise.all([
      transaction.get(merchantRef),
      transaction.get(customerRef),
      transaction.get(origRef),
    ]);

    if (!merchantSnap.exists()) {
      throw new Error('Merchant account record not found in Acash Cloud Ledger.');
    }
    if (!customerSnap.exists()) {
      throw new Error('Customer account record not found in Acash Cloud Ledger.');
    }
    if (!origSnap.exists()) {
      throw new Error('Original transaction not found in Acash Cloud Ledger.');
    }

    const authMerchant = merchantSnap.data() as AcashUser;
    if (authMerchant.balance < refundAmt) {
      throw new Error('Insufficient Merchant balance to process this refund.');
    }
    const authCustomer = customerSnap.data() as AcashUser;
    const authOrig = origSnap.data() as AcashTransaction;

    const authRemaining = Number((authOrig.amount - (authOrig.refundedAmount || 0)).toFixed(2));
    if (refundAmt > authRemaining) {
      throw new Error(`Refund exceeds remaining refundable amount (৳${authRemaining.toFixed(2)}).`);
    }

    const updatedRefundedTotal = Number(((authOrig.refundedAmount || 0) + refundAmt).toFixed(2));
    const newOrigStatus = updatedRefundedTotal >= authOrig.amount ? 'refunded' : 'partially_refunded';

    committedMerchant = stripUndefined({
      ...authMerchant,
      balance: Number((authMerchant.balance - refundAmt).toFixed(2)),
      lastActiveAt: now,
    });
    committedCustomer = stripUndefined({
      ...authCustomer,
      balance: Number(((authCustomer.balance || 0) + refundAmt).toFixed(2)),
      lastActiveAt: now,
    });
    committedOrig = {
      ...authOrig,
      refundedAmount: updatedRefundedTotal,
      status: newOrigStatus,
    };
    committedRefund = {
      ...refundRecord,
      ...(authCustomer.firebaseUid ? { receiverUid: authCustomer.firebaseUid } : {}),
    };

    transaction.update(merchantRef, {
      balance: committedMerchant.balance,
      lastActiveAt: now,
    });

    transaction.update(customerRef, {
      balance: committedCustomer.balance,
      lastActiveAt: now,
    });

    transaction.set(origRef, committedOrig);
    transaction.set(doc(db, TX_COL, refundTxId), committedRefund);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  if (committedMerchant) latestStore.users[(committedMerchant as AcashUser).accountId] = committedMerchant;
  if (committedCustomer) latestStore.users[(committedCustomer as AcashUser).accountId] = committedCustomer;
  if (committedOrig) latestStore.transactions[(committedOrig as AcashTransaction).txId] = committedOrig;
  latestStore.transactions[refundTxId] = committedRefund;
  writeLocalStore(latestStore, true);

  await persistAccountNotifications([
    buildAccountNotification({
      recipientId: customer.accountId,
      recipientRole: customer.role,
      title: `Merchant Refund Received · +৳${refundAmt.toLocaleString()}`,
      message: `${merchant.businessName || merchant.name} (${merchant.accountId}) refunded ৳${refundAmt.toLocaleString()} for ${orig.txHash}.`,
      category: 'transaction',
      severity: 'success',
      amount: refundAmt,
      txId: refundTxId,
      txHash: refundTxHash,
      createdAt: now,
    }),
  ]);

  return committedRefund;
}

// ---------- Admin Actions ----------

export async function mainAdminMintTreasuryCredit(params: {
  amount: number;
  reason?: string;
  actorEmail: string;
}): Promise<{ vault: MainTreasuryVault; tx: AcashTransaction }> {
  if (!isMainAdminEmail(params.actorEmail)) {
    throw new Error(`Only Main Admin (${MAIN_ADMIN_EMAIL}) can mint unlimited initial treasury credit.`);
  }
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Enter a valid credit amount greater than 0 BDT.');
  }

  const now = Date.now();
  const txId = generateTxId();
  const txHash = generateTxHash();
  const noteText = params.reason?.trim() || 'Main Admin Initial Treasury Credit Mint';

  const store = readLocalStore();
  let updatedVault: MainTreasuryVault = normalizeTreasuryVault(store.treasuryVault);

  const txRecord: AcashTransaction = {
    txId,
    txHash,
    type: 'admin_credit',
    senderId: 'MAIN-ADMIN-MINT',
    senderName: 'Main Admin Reserve Mint',
    senderPhone: 'ROOT',
    senderRole: 'ADMIN',
    receiverId: 'ADMIN-TREASURY',
    receiverName: 'Acash Main Admin Treasury',
    receiverPhone: 'SYSTEM',
    receiverRole: 'ADMIN',
    amount: amt,
    fee: 0,
    totalDebited: amt,
    feeBreakdown: {
      ratePer1000: 0,
      agentShareRate: 0,
      govtShareRate: 0,
      adminShareRate: 0,
      agentAmount: 0,
      govtAmount: 0,
      adminAmount: 0,
      lockedAt: now,
    },
    status: 'completed',
    refundedAmount: 0,
    note: noteText.slice(0, 280),
    createdAt: now,
    approvedBy: params.actorEmail,
    approvedAt: now,
  };

  let mintNotif: AdminNotification = {
    id: `NTF-MINT-${txId}`,
    title: `Main Admin Treasury Mint (+৳${amt.toLocaleString()})`,
    message: `Main Admin added ৳${amt.toLocaleString()} to ADMIN-TREASURY.`,
    category: 'treasury',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'treasury',
  };

  let mintActivity = makeActivityEntry({
    idPrefix: 'ACT-MINT',
    actionType: 'credit_add',
    title: `Main Admin Treasury Mint (+৳${amt.toLocaleString()})`,
    details: `Main Admin (${params.actorEmail}) minted ৳${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} into ADMIN-TREASURY. Note: ${noteText}`,
    actorEmail: params.actorEmail,
    targetIds: ['ADMIN-TREASURY'],
    amount: amt,
    timestamp: now,
  });

  await runTransaction(db, async (transaction) => {
    const vaultRef = doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID);
    const vaultSnap = await transaction.get(vaultRef);
    const currentVault = vaultSnap.exists()
      ? normalizeTreasuryVault(vaultSnap.data() as Partial<MainTreasuryVault>)
      : normalizeTreasuryVault(store.treasuryVault);

    const previousBalance = currentVault.balance;
    const newBalance = Number((previousBalance + amt).toFixed(2));
    const mintEntry: TreasuryMintHistoryEntry = {
      id: `MINT-${txId}`,
      action: 'mint',
      amount: amt,
      previousBalance,
      newBalance,
      note: noteText.slice(0, 200),
      actorEmail: params.actorEmail,
      timestamp: now,
    };
    updatedVault = {
      ...currentVault,
      balance: newBalance,
      totalMinted: Number((currentVault.totalMinted + amt).toFixed(2)),
      lastMintAmount: amt,
      lastMintNote: noteText.slice(0, 200),
      mintHistory: [mintEntry, ...(currentVault.mintHistory || [])].slice(0, 250),
      updatedAt: now,
      updatedBy: params.actorEmail,
    };
    mintNotif = {
      ...mintNotif,
      message: `Main Admin added ৳${amt.toLocaleString()} to ADMIN-TREASURY. New Vault Balance: ৳${updatedVault.balance.toLocaleString()}.`,
    };
    mintActivity = {
      ...mintActivity,
      details: `Main Admin (${params.actorEmail}) minted ৳${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} into ADMIN-TREASURY. Vault Balance: ৳${updatedVault.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Note: ${noteText}`,
    };

    transaction.set(vaultRef, updatedVault);
    transaction.set(doc(db, TX_COL, txId), txRecord);
    transaction.set(doc(db, ADMIN_NOTIF_COL, mintNotif.id), mintNotif);
    transaction.set(doc(db, ADMIN_ACTIVITY_COL, mintActivity.id), mintActivity);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  latestStore.treasuryVault = updatedVault;
  latestStore.transactions[txId] = txRecord;
  latestStore.notifications[mintNotif.id] = mintNotif;
  latestStore.activityLogs[mintActivity.id] = mintActivity;
  writeLocalStore(latestStore, true);

  return { vault: updatedVault, tx: txRecord };
}

export async function mainAdminRefreshTreasuryBalance(params: {
  newBalance: number;
  reason?: string;
  actorEmail: string;
}): Promise<MainTreasuryVault> {
  if (!isMainAdminEmail(params.actorEmail)) {
    throw new Error(`Only Main Admin (${MAIN_ADMIN_EMAIL}) can refresh the Treasury Mint Balance.`);
  }
  const nextBal = Number(params.newBalance);
  if (!Number.isFinite(nextBal) || nextBal < 0) {
    throw new Error('Refreshed Mint Balance must be 0 or greater.');
  }

  const now = Date.now();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const entryId = `REF-${now.toString(36).toUpperCase()}-${rand}`;
  const cleanReason =
    params.reason?.trim() ||
    (nextBal === 0 ? 'Main Admin Treasury Mint Balance Reset to ৳0.00' : 'Main Admin Treasury Mint Balance Refresh');

  const store = readLocalStore();
  const newBalance = Number(nextBal.toFixed(2));
  let updatedVault: MainTreasuryVault = normalizeTreasuryVault(store.treasuryVault);

  let refreshNotif: AdminNotification = {
    id: `NTF-${entryId}`,
    title: `Treasury Mint Balance Refreshed (৳${newBalance.toLocaleString()})`,
    message: `Main Admin refreshed ADMIN-TREASURY balance to ৳${newBalance.toLocaleString()}. Note: ${cleanReason}`,
    category: 'treasury',
    severity: 'warning',
    createdAt: now,
    read: false,
    targetSection: 'treasury',
  };

  let refreshActivity = makeActivityEntry({
    idPrefix: 'ACT-REF',
    actionType: 'credit_add',
    title: `Mint Balance Refreshed (৳${newBalance.toLocaleString()})`,
    details: `Main Admin (${params.actorEmail}) refreshed ADMIN-TREASURY mint balance to ৳${newBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Reason: ${cleanReason}`,
    actorEmail: params.actorEmail,
    targetIds: ['ADMIN-TREASURY'],
    amount: newBalance,
    timestamp: now,
  });

  await runTransaction(db, async (transaction) => {
    const vaultRef = doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID);
    const vaultSnap = await transaction.get(vaultRef);
    const currentVault = vaultSnap.exists()
      ? normalizeTreasuryVault(vaultSnap.data() as Partial<MainTreasuryVault>)
      : normalizeTreasuryVault(store.treasuryVault);
    const previousBalance = currentVault.balance;
    const diff = Number(Math.abs(newBalance - previousBalance).toFixed(2));

    const refreshEntry: TreasuryMintHistoryEntry = {
      id: entryId,
      action: 'refresh',
      amount: diff,
      previousBalance,
      newBalance,
      note: cleanReason.slice(0, 200),
      actorEmail: params.actorEmail,
      timestamp: now,
    };

    updatedVault = {
      ...currentVault,
      balance: newBalance,
      lastMintNote: cleanReason.slice(0, 200),
      mintHistory: [refreshEntry, ...(currentVault.mintHistory || [])].slice(0, 250),
      updatedAt: now,
      updatedBy: params.actorEmail,
    };

    refreshNotif = {
      ...refreshNotif,
      message: `Main Admin refreshed ADMIN-TREASURY balance from ৳${previousBalance.toLocaleString()} to ৳${newBalance.toLocaleString()}. Note: ${cleanReason}`,
    };

    refreshActivity = {
      ...refreshActivity,
      title: `Mint Balance Refreshed (৳${previousBalance.toLocaleString()} → ৳${newBalance.toLocaleString()})`,
      details: `Main Admin (${params.actorEmail}) refreshed ADMIN-TREASURY mint balance from ৳${previousBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ৳${newBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Reason: ${cleanReason}`,
    };

    transaction.set(vaultRef, updatedVault);
    transaction.set(doc(db, ADMIN_NOTIF_COL, refreshNotif.id), refreshNotif);
    transaction.set(doc(db, ADMIN_ACTIVITY_COL, refreshActivity.id), refreshActivity);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  latestStore.treasuryVault = updatedVault;
  latestStore.notifications[refreshNotif.id] = refreshNotif;
  latestStore.activityLogs[refreshActivity.id] = refreshActivity;
  writeLocalStore(latestStore, true);

  return updatedVault;
}

export async function adminCreditAccount(params: {
  targetIdentifier: string;
  amount: number;
  reason?: string;
  adminEmail: string;
}): Promise<AcashTransaction> {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Enter a valid credit amount greater than 0 BDT.');
  }

  const targetUser = await findUserByIdentifier(params.targetIdentifier);
  if (!targetUser) {
    throw new Error('Target account not found.');
  }

  const now = Date.now();
  const txId = generateTxId();
  const txHash = generateTxHash();

  const store = readLocalStore();
  const currentTarget = targetUser;
  const currentVault = normalizeTreasuryVault(store.treasuryVault);

  const txRecord: AcashTransaction = {
    txId,
    txHash,
    type: 'admin_credit',
    senderId: 'ADMIN-TREASURY',
    senderName: 'Acash Admin Treasury',
    senderPhone: 'SYSTEM',
    senderRole: 'ADMIN',
    receiverId: currentTarget.accountId,
    ...(currentTarget.firebaseUid ? { receiverUid: currentTarget.firebaseUid } : {}),
    receiverName: currentTarget.businessName || currentTarget.name,
    receiverPhone: currentTarget.phone,
    receiverRole: currentTarget.role,
    amount: amt,
    fee: 0,
    totalDebited: amt,
    feeBreakdown: {
      ratePer1000: 0,
      agentShareRate: 0,
      govtShareRate: 0,
      adminShareRate: 0,
      agentAmount: 0,
      govtAmount: 0,
      adminAmount: 0,
      lockedAt: now,
    },
    status: 'completed',
    refundedAmount: 0,
    note: params.reason?.trim() || 'Admin Liquidity Credit',
    createdAt: now,
    approvedBy: params.adminEmail,
    approvedAt: now,
  };

  const creditNotif: AdminNotification = {
    id: `NTF-CRD-${txId}`,
    title: `Admin Credit Added (৳${amt.toLocaleString()})`,
    message: `Credited ${currentTarget.accountId} (${currentTarget.name}) · Reason: ${txRecord.note}`,
    category: 'treasury',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };

  const creditActivity = makeActivityEntry({
    idPrefix: 'ACT-CRD',
    actionType: 'credit_add',
    title: `Admin Credit Deposit (৳${amt.toLocaleString()})`,
    details: `Credited ৳${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ${currentTarget.businessName || currentTarget.name} (${currentTarget.accountId}). Tx Hash: ${txHash}. Reason: ${txRecord.note}`,
    actorEmail: params.adminEmail,
    targetIds: [currentTarget.accountId],
    amount: amt,
    timestamp: now,
  });

  let committedUser: AcashUser | null = null;
  let committedVault: MainTreasuryVault = currentVault;
  let committedTx: AcashTransaction = txRecord;

  await runTransaction(db, async (transaction) => {
    const targetRef = doc(db, USERS_COL, currentTarget.accountId);
    const vaultRef = doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID);

    const [targetSnap, vaultSnap] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(vaultRef),
    ]);

    if (!targetSnap.exists()) {
      throw new Error(`Target account ${currentTarget.accountId} not found in Acash Cloud Ledger.`);
    }
    const authTarget = targetSnap.data() as AcashUser;
    const authVault = vaultSnap.exists()
      ? normalizeTreasuryVault(vaultSnap.data() as Partial<MainTreasuryVault>)
      : currentVault;

    const deductedFromVault = Math.min(authVault.balance, amt);
    committedVault = {
      ...authVault,
      balance: Number(Math.max(0, authVault.balance - deductedFromVault).toFixed(2)),
      totalDisbursed: Number((authVault.totalDisbursed + amt).toFixed(2)),
      updatedAt: now,
      updatedBy: params.adminEmail,
    };

    committedUser = stripUndefined({
      ...authTarget,
      balance: Number(((authTarget.balance || 0) + amt).toFixed(2)),
      lastActiveAt: now,
    });

    committedTx = {
      ...txRecord,
      ...(authTarget.firebaseUid ? { receiverUid: authTarget.firebaseUid } : {}),
    };

    transaction.update(targetRef, {
      balance: committedUser.balance,
      lastActiveAt: now,
    });

    transaction.set(vaultRef, committedVault);
    transaction.set(doc(db, TX_COL, txId), committedTx);
    transaction.set(doc(db, ADMIN_NOTIF_COL, creditNotif.id), creditNotif);
    transaction.set(doc(db, ADMIN_ACTIVITY_COL, creditActivity.id), creditActivity);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  if (committedUser) latestStore.users[(committedUser as AcashUser).accountId] = committedUser;
  latestStore.treasuryVault = committedVault;
  latestStore.transactions[txId] = committedTx;
  latestStore.notifications[creditNotif.id] = creditNotif;
  latestStore.activityLogs[creditActivity.id] = creditActivity;
  writeLocalStore(latestStore, true);

  await persistAccountNotifications([
    buildAccountNotification({
      recipientId: currentTarget.accountId,
      recipientRole: currentTarget.role,
      title: `Admin Wallet Credit · +৳${amt.toLocaleString()}`,
      message: `Platform Admin credited ৳${amt.toLocaleString()} to your wallet. Note: ${txRecord.note} (${txHash})`,
      category: 'admin_alert',
      severity: 'success',
      amount: amt,
      txId,
      txHash,
      createdBy: params.adminEmail,
      createdAt: now,
    }),
  ]);

  return committedTx;
}

export async function adminTransferBetweenAccounts(params: {
  fromIdentifier: string;
  toIdentifier: string;
  amount: number;
  reason?: string;
  adminEmail: string;
}): Promise<AcashTransaction> {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Enter a valid transfer amount greater than 0 BDT.');
  }

  const toUser = await findUserByIdentifier(params.toIdentifier);
  if (!toUser) throw new Error('Destination account not found.');

  const isFromTreasury = params.fromIdentifier.trim().toUpperCase() === 'ADMIN-TREASURY';
  const fromUser = isFromTreasury ? null : await findUserByIdentifier(params.fromIdentifier);

  if (!isFromTreasury && !fromUser) {
    throw new Error('Source account not found.');
  }
  if (fromUser && fromUser.accountId === toUser.accountId) {
    throw new Error('Source and destination accounts cannot be the same.');
  }

  const store = readLocalStore();
  const currentTo = toUser;
  const currentFrom = fromUser || null;

  if (currentFrom && currentFrom.balance < amt) {
    throw new Error(
      `Source account ${currentFrom.accountId} has insufficient balance (${currentFrom.balance.toFixed(2)} BDT).`
    );
  }

  const now = Date.now();
  const txId = generateTxId();
  const txHash = generateTxHash();

  const baseTxRecord: AcashTransaction = {
    txId,
    txHash,
    type: 'admin_transfer',
    senderId: currentFrom ? currentFrom.accountId : 'ADMIN-TREASURY',
    ...(currentFrom?.firebaseUid ? { senderUid: currentFrom.firebaseUid } : {}),
    senderName: currentFrom ? currentFrom.businessName || currentFrom.name : 'Acash Admin Treasury',
    senderPhone: currentFrom ? currentFrom.phone : 'SYSTEM',
    senderRole: currentFrom ? currentFrom.role : 'ADMIN',
    receiverId: currentTo.accountId,
    ...(currentTo.firebaseUid ? { receiverUid: currentTo.firebaseUid } : {}),
    receiverName: currentTo.businessName || currentTo.name,
    receiverPhone: currentTo.phone,
    receiverRole: currentTo.role,
    amount: amt,
    fee: 0,
    totalDebited: amt,
    feeBreakdown: {
      ratePer1000: 0,
      agentShareRate: 0,
      govtShareRate: 0,
      adminShareRate: 0,
      agentAmount: 0,
      govtAmount: 0,
      adminAmount: 0,
      lockedAt: now,
    },
    status: 'completed',
    refundedAmount: 0,
    note: params.reason?.trim() || 'Admin Executed Settlement Transfer',
    createdAt: now,
    approvedBy: params.adminEmail,
    approvedAt: now,
  };

  const trNotif: AdminNotification = {
    id: `NTF-TRF-${txId}`,
    title: `Admin Fund Transfer (৳${amt.toLocaleString()})`,
    message: `Moved ৳${amt.toLocaleString()} from ${baseTxRecord.senderId} to ${baseTxRecord.receiverId}.`,
    category: 'treasury',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };

  const trActivity = makeActivityEntry({
    idPrefix: 'ACT-TRF',
    actionType: 'fund_transfer',
    title: `Fund Transfer (৳${amt.toLocaleString()})`,
    details: `Transferred ৳${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${baseTxRecord.senderName} (${baseTxRecord.senderId}) to ${baseTxRecord.receiverName} (${baseTxRecord.receiverId}). Tx Hash: ${txHash}. Note: ${baseTxRecord.note}`,
    actorEmail: params.adminEmail,
    targetIds: [baseTxRecord.senderId, baseTxRecord.receiverId],
    amount: amt,
    timestamp: now,
  });

  let committedFrom: AcashUser | null = null;
  let committedTo: AcashUser | null = null;
  let committedVault: MainTreasuryVault | null = null;
  let committedTx: AcashTransaction = baseTxRecord;

  await runTransaction(db, async (transaction) => {
    const toRef = doc(db, USERS_COL, currentTo.accountId);
    const fromRef = currentFrom ? doc(db, USERS_COL, currentFrom.accountId) : null;
    const vaultRef = isFromTreasury ? doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID) : null;

    const [toSnap, fromSnap, vaultSnap] = await Promise.all([
      transaction.get(toRef),
      fromRef ? transaction.get(fromRef) : Promise.resolve(null),
      vaultRef ? transaction.get(vaultRef) : Promise.resolve(null),
    ]);

    if (!toSnap.exists()) {
      throw new Error(`Destination account ${currentTo.accountId} not found in Acash Cloud Ledger.`);
    }
    if (currentFrom && (!fromSnap || !fromSnap.exists())) {
      throw new Error(`Source account ${currentFrom.accountId} not found in Acash Cloud Ledger.`);
    }

    const authTo = toSnap.data() as AcashUser;
    const authFrom = currentFrom ? (fromSnap!.data() as AcashUser) : null;

    if (authFrom && authFrom.balance < amt) {
      throw new Error(
        `Source account ${authFrom.accountId} has insufficient balance (${authFrom.balance.toFixed(2)} BDT).`
      );
    }

    if (authFrom) {
      committedFrom = stripUndefined({
        ...authFrom,
        balance: Number((authFrom.balance - amt).toFixed(2)),
        lastActiveAt: now,
      });
    }

    if (isFromTreasury) {
      const authVault = vaultSnap?.exists()
        ? normalizeTreasuryVault(vaultSnap.data() as Partial<MainTreasuryVault>)
        : normalizeTreasuryVault(store.treasuryVault);
      const deducted = Math.min(authVault.balance, amt);
      committedVault = {
        ...authVault,
        balance: Number(Math.max(0, authVault.balance - deducted).toFixed(2)),
        totalDisbursed: Number((authVault.totalDisbursed + amt).toFixed(2)),
        updatedAt: now,
        updatedBy: params.adminEmail,
      };
    }

    committedTo = stripUndefined({
      ...authTo,
      balance: Number(((authTo.balance || 0) + amt).toFixed(2)),
      lastActiveAt: now,
    });

    committedTx = {
      ...baseTxRecord,
      ...(authFrom?.firebaseUid ? { senderUid: authFrom.firebaseUid } : {}),
      ...(authTo.firebaseUid ? { receiverUid: authTo.firebaseUid } : {}),
    };

    if (fromRef && committedFrom) {
      transaction.update(fromRef, {
        balance: committedFrom.balance,
        lastActiveAt: now,
      });
    }

    if (vaultRef && committedVault) {
      transaction.set(vaultRef, committedVault);
    }

    transaction.update(toRef, {
      balance: committedTo.balance,
      lastActiveAt: now,
    });

    transaction.set(doc(db, TX_COL, txId), committedTx);
    transaction.set(doc(db, ADMIN_NOTIF_COL, trNotif.id), trNotif);
    transaction.set(doc(db, ADMIN_ACTIVITY_COL, trActivity.id), trActivity);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  if (committedFrom) latestStore.users[(committedFrom as AcashUser).accountId] = committedFrom;
  if (committedTo) latestStore.users[(committedTo as AcashUser).accountId] = committedTo;
  if (committedVault) latestStore.treasuryVault = committedVault;
  latestStore.transactions[txId] = committedTx;
  latestStore.notifications[trNotif.id] = trNotif;
  latestStore.activityLogs[trActivity.id] = trActivity;
  writeLocalStore(latestStore, true);

  const transferNotifs: AccountNotification[] = [
    buildAccountNotification({
      recipientId: currentTo.accountId,
      recipientRole: currentTo.role,
      title: `Admin Transfer Credited · +৳${amt.toLocaleString()}`,
      message: `Received ৳${amt.toLocaleString()} from ${baseTxRecord.senderName} (${baseTxRecord.senderId}). Note: ${baseTxRecord.note} (${txHash})`,
      category: 'admin_alert',
      severity: 'success',
      amount: amt,
      txId,
      txHash,
      createdBy: params.adminEmail,
      createdAt: now,
    }),
  ];
  if (committedFrom) {
    transferNotifs.push(
      buildAccountNotification({
        recipientId: (committedFrom as AcashUser).accountId,
        recipientRole: (committedFrom as AcashUser).role,
        title: `Admin Transfer Debited · -৳${amt.toLocaleString()}`,
        message: `Transferred ৳${amt.toLocaleString()} to ${currentTo.businessName || currentTo.name} (${currentTo.accountId}). Note: ${baseTxRecord.note} (${txHash})`,
        category: 'admin_alert',
        severity: 'warning',
        amount: amt,
        txId,
        txHash,
        createdBy: params.adminEmail,
        createdAt: now,
      })
    );
  }
  await persistAccountNotifications(transferNotifs);

  return committedTx;
}

export async function adminApproveTransaction(txId: string, adminEmail: string): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  let tx = store.transactions[txId];
  if (!tx) {
    try {
      const snap = await getDoc(doc(db, TX_COL, txId));
      if (snap.exists()) {
        tx = snap.data() as AcashTransaction;
      }
    } catch {
      // ignore
    }
  }
  if (!tx) throw new Error('Transaction not found.');
  if (tx.status !== 'pending_admin_approval') {
    throw new Error('Transaction is no longer pending approval.');
  }

  // Only credit receiver & agent commission if this transaction was NOT already settled earlier.
  const shouldCreditBalances = !tx.settledOnce;

  const decisionNotif: AdminNotification = {
    id: `NTF-APR-${txId}`,
    title: `${shouldCreditBalances ? '50K+ Approved' : 'Re-Approved (No New Credit)'}: ${tx.txHash}`,
    message: shouldCreditBalances
      ? `Admin ${adminEmail} approved ৳${tx.amount.toLocaleString()} (${tx.senderId} → ${tx.receiverId}). Emails sent.`
      : `Admin ${adminEmail} restored ${tx.txHash} (৳${tx.amount.toLocaleString()}) to completed without duplicate account credit.`,
    category: 'aml_pending',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };

  const approveActivity = makeActivityEntry({
    idPrefix: 'ACT-APR',
    actionType: 'aml_decision',
    title: `${shouldCreditBalances ? 'High-Value Approved' : 'Restored to Completed'} (৳${tx.amount.toLocaleString()})`,
    details: `${shouldCreditBalances ? 'Approved' : 'Restored without duplicate credit'} ${tx.type.replace(/_/g, ' ').toUpperCase()} of ৳${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${tx.senderId} to ${tx.receiverId}. Tx Hash: ${tx.txHash}.`,
    actorEmail: adminEmail,
    targetIds: [tx.senderId, tx.receiverId],
    amount: tx.amount,
    timestamp: now,
  });

  let committedReceiver: AcashUser | null = null;
  let committedSender: AcashUser | null = null;
  let committedTx: AcashTransaction = {
    ...tx,
    status: 'completed',
    settledOnce: true,
    approvedBy: adminEmail,
    approvedAt: now,
  };

  await runTransaction(db, async (transaction) => {
    const txRef = doc(db, TX_COL, txId);
    const needsReceiverRead =
      shouldCreditBalances &&
      (tx!.receiverRole === 'U' || tx!.receiverRole === 'A' || tx!.receiverRole === 'M');
    const needsSenderRead = shouldCreditBalances && tx!.type === 'cash_in';

    const receiverRef = needsReceiverRead ? doc(db, USERS_COL, tx!.receiverId) : null;
    const senderRef = needsSenderRead ? doc(db, USERS_COL, tx!.senderId) : null;

    const [txSnap, receiverSnap, senderSnap] = await Promise.all([
      transaction.get(txRef),
      receiverRef ? transaction.get(receiverRef) : Promise.resolve(null),
      senderRef ? transaction.get(senderRef) : Promise.resolve(null),
    ]);

    const authTx = txSnap.exists() ? (txSnap.data() as AcashTransaction) : tx!;
    if (authTx.status !== 'pending_admin_approval') {
      throw new Error('Transaction is no longer pending approval.');
    }
    const authCredit = !authTx.settledOnce;

    if (authCredit && receiverRef) {
      const authReceiver = receiverSnap?.exists()
        ? (receiverSnap.data() as AcashUser)
        : store.users[authTx.receiverId];
      if (authReceiver) {
        const getsCashOutCommission =
          authTx.type === 'cash_out' ||
          (authTx.type === 'merchant_cash_out' && authTx.receiverRole === 'A');
        const creditAmount = getsCashOutCommission
          ? Number((authTx.amount + authTx.feeBreakdown.agentAmount).toFixed(2))
          : authTx.amount;
        const commInc = getsCashOutCommission ? authTx.feeBreakdown.agentAmount : 0;

        committedReceiver = stripUndefined({
          ...authReceiver,
          balance: Number(((authReceiver.balance || 0) + creditAmount).toFixed(2)),
          commissionBalance: Number(((authReceiver.commissionBalance || 0) + commInc).toFixed(2)),
          lastActiveAt: now,
        });
      }
    }

    if (authCredit && senderRef) {
      const authSender = senderSnap?.exists()
        ? (senderSnap.data() as AcashUser)
        : store.users[authTx.senderId];
      if (authSender) {
        committedSender = stripUndefined({
          ...authSender,
          balance: Number(((authSender.balance || 0) + authTx.feeBreakdown.agentAmount).toFixed(2)),
          commissionBalance: Number(
            ((authSender.commissionBalance || 0) + authTx.feeBreakdown.agentAmount).toFixed(2)
          ),
          lastActiveAt: now,
        });
      }
    }

    committedTx = {
      ...authTx,
      status: 'completed',
      settledOnce: true,
      approvedBy: adminEmail,
      approvedAt: now,
    };

    if (receiverRef && committedReceiver) {
      if (receiverSnap?.exists()) {
        transaction.update(receiverRef, {
          balance: committedReceiver.balance,
          commissionBalance: committedReceiver.commissionBalance,
          lastActiveAt: now,
        });
      } else {
        transaction.set(receiverRef, committedReceiver);
      }
    }

    if (senderRef && committedSender) {
      if (senderSnap?.exists()) {
        transaction.update(senderRef, {
          balance: committedSender.balance,
          commissionBalance: committedSender.commissionBalance,
          lastActiveAt: now,
        });
      } else {
        transaction.set(senderRef, committedSender);
      }
    }

    transaction.set(txRef, committedTx);
    transaction.set(doc(db, ADMIN_NOTIF_COL, decisionNotif.id), decisionNotif);
    transaction.set(doc(db, ADMIN_ACTIVITY_COL, approveActivity.id), approveActivity);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  if (committedReceiver) latestStore.users[(committedReceiver as AcashUser).accountId] = committedReceiver;
  if (committedSender) latestStore.users[(committedSender as AcashUser).accountId] = committedSender;
  latestStore.transactions[txId] = committedTx;
  latestStore.notifications[decisionNotif.id] = decisionNotif;
  latestStore.activityLogs[approveActivity.id] = approveActivity;
  writeLocalStore(latestStore, true);

  const amlApproveNotifs: AccountNotification[] = [
    buildAccountNotification({
      recipientId: tx.senderId,
      recipientRole: tx.senderRole === 'U' || tx.senderRole === 'A' || tx.senderRole === 'M' ? tx.senderRole : undefined,
      title: `AML Transaction Approved · ৳${tx.amount.toLocaleString()}`,
      message: `Admin approved your transaction ${tx.txHash} to ${tx.receiverName} (${tx.receiverId}).`,
      category: 'transaction',
      severity: 'success',
      amount: tx.amount,
      txId,
      txHash: tx.txHash,
      createdBy: adminEmail,
      createdAt: now,
    }),
  ];
  if (tx.receiverRole === 'U' || tx.receiverRole === 'A' || tx.receiverRole === 'M') {
    amlApproveNotifs.push(
      buildAccountNotification({
        recipientId: tx.receiverId,
        recipientRole: tx.receiverRole,
        title: `Approved Funds Credited · +৳${tx.amount.toLocaleString()}`,
        message: `Admin approved incoming transfer of ৳${tx.amount.toLocaleString()} from ${tx.senderName} (${tx.senderId}) · ${tx.txHash}.`,
        category: 'transaction',
        severity: 'success',
        amount: tx.amount,
        txId,
        txHash: tx.txHash,
        createdBy: adminEmail,
        createdAt: now,
      })
    );
  }
  await persistAccountNotifications(amlApproveNotifs);

  const sender = latestStore.users[tx.senderId];
  const resolvedAdminEmail =
    adminEmail && adminEmail.includes('@') && adminEmail !== 'admin@acash.com'
      ? adminEmail
      : getAdminAlertEmail();
  await sendHighValueDecisionEmails({
    decision: 'approved',
    senderEmail: sender?.email || '',
    senderName: tx.senderName,
    senderId: tx.senderId,
    receiverName: tx.receiverName,
    receiverId: tx.receiverId,
    adminEmail: resolvedAdminEmail,
    approvedBy: adminEmail,
    amount: tx.amount,
    txType: tx.type,
    txHash: tx.txHash,
  });
}

export async function adminRejectTransaction(
  txId: string,
  adminEmail: string,
  reason?: string
): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  let tx = store.transactions[txId];
  if (!tx) {
    try {
      const snap = await getDoc(doc(db, TX_COL, txId));
      if (snap.exists()) {
        tx = snap.data() as AcashTransaction;
      }
    } catch {
      // ignore
    }
  }
  if (!tx) throw new Error('Transaction not found.');
  if (tx.status !== 'pending_admin_approval') {
    throw new Error('Transaction is no longer pending approval.');
  }

  const shouldRefundEscrow = !tx.settledOnce;
  const rejectReason = reason || 'Rejected by Admin AML Security Review';
  const decisionNotif: AdminNotification = {
    id: `NTF-REJ-${txId}`,
    title: `${shouldRefundEscrow ? '50K+ Rejected & Refunded' : 'Transaction Rejected (No New Credit)'}: ${tx.txHash}`,
    message: shouldRefundEscrow
      ? `Admin ${adminEmail} rejected ৳${tx.amount.toLocaleString()} from ${tx.senderId}. Funds refunded & emails sent.`
      : `Admin ${adminEmail} marked ${tx.txHash} rejected without issuing any new account credit.`,
    category: 'aml_pending',
    severity: 'warning',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };

  const rejectActivity = makeActivityEntry({
    idPrefix: 'ACT-REJ',
    actionType: 'aml_decision',
    title: `${shouldRefundEscrow ? 'High-Value Rejected & Refunded' : 'Transaction Rejected'} (৳${tx.amount.toLocaleString()})`,
    details: `Rejected ${tx.type.replace(/_/g, ' ').toUpperCase()} of ৳${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${tx.senderId} to ${tx.receiverId} (Tx Hash: ${tx.txHash}). Reason: ${rejectReason}.`,
    actorEmail: adminEmail,
    targetIds: [tx.senderId, tx.receiverId],
    amount: tx.amount,
    timestamp: now,
  });

  let committedSender: AcashUser | null = null;
  let committedTx: AcashTransaction = {
    ...tx,
    status: 'rejected',
    approvedBy: adminEmail,
    approvedAt: now,
    rejectionReason: rejectReason,
  };

  await runTransaction(db, async (transaction) => {
    const txRef = doc(db, TX_COL, txId);
    const senderRef = doc(db, USERS_COL, tx!.senderId);
    const [txSnap, senderSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(senderRef),
    ]);

    const authTx = txSnap.exists() ? (txSnap.data() as AcashTransaction) : tx!;
    if (authTx.status !== 'pending_admin_approval') {
      throw new Error('Transaction is no longer pending approval.');
    }

    if (!authTx.settledOnce) {
      const authSender = senderSnap.exists()
        ? (senderSnap.data() as AcashUser)
        : store.users[authTx.senderId];
      if (authSender) {
        committedSender = stripUndefined({
          ...authSender,
          balance: Number(((authSender.balance || 0) + authTx.totalDebited).toFixed(2)),
          lastActiveAt: now,
        });
      }
    }

    committedTx = {
      ...authTx,
      status: 'rejected',
      approvedBy: adminEmail,
      approvedAt: now,
      rejectionReason: rejectReason,
    };

    if (committedSender) {
      if (senderSnap.exists()) {
        transaction.update(senderRef, {
          balance: committedSender.balance,
          lastActiveAt: now,
        });
      } else {
        transaction.set(senderRef, committedSender);
      }
    }

    transaction.set(txRef, committedTx);
    transaction.set(doc(db, ADMIN_NOTIF_COL, decisionNotif.id), decisionNotif);
    transaction.set(doc(db, ADMIN_ACTIVITY_COL, rejectActivity.id), rejectActivity);
  });

  firestoreBackendMode = 'firestore';
  const latestStore = readLocalStore();
  if (committedSender) latestStore.users[(committedSender as AcashUser).accountId] = committedSender;
  latestStore.transactions[txId] = committedTx;
  latestStore.notifications[decisionNotif.id] = decisionNotif;
  latestStore.activityLogs[rejectActivity.id] = rejectActivity;
  writeLocalStore(latestStore, true);

  await persistAccountNotifications([
    buildAccountNotification({
      recipientId: tx.senderId,
      recipientRole: tx.senderRole === 'U' || tx.senderRole === 'A' || tx.senderRole === 'M' ? tx.senderRole : undefined,
      title: `Transaction Rejected & Refunded · ৳${tx.totalDebited.toLocaleString()}`,
      message: `Admin rejected ${tx.txHash} (Reason: ${rejectReason}). Escrow refunded to your wallet.`,
      category: 'transaction',
      severity: 'warning',
      amount: tx.totalDebited,
      txId,
      txHash: tx.txHash,
      createdBy: adminEmail,
      createdAt: now,
    }),
  ]);

  const sender = latestStore.users[tx.senderId];
  const resolvedAdminEmail =
    adminEmail && adminEmail.includes('@') && adminEmail !== 'admin@acash.com'
      ? adminEmail
      : getAdminAlertEmail();
  await sendHighValueDecisionEmails({
    decision: 'rejected',
    senderEmail: sender?.email || '',
    senderName: tx.senderName,
    senderId: tx.senderId,
    receiverName: tx.receiverName,
    receiverId: tx.receiverId,
    adminEmail: resolvedAdminEmail,
    approvedBy: adminEmail,
    amount: tx.amount,
    txType: tx.type,
    txHash: tx.txHash,
    reason: rejectReason,
  });
}

export async function adminMarkTransactionPending(
  txId: string,
  adminEmail: string,
  reason?: string
): Promise<AcashTransaction> {
  const now = Date.now();
  const store = readLocalStore();
  let tx = store.transactions[txId];
  if (!tx) {
    try {
      const snap = await getDoc(doc(db, TX_COL, txId));
      if (snap.exists()) {
        tx = snap.data() as AcashTransaction;
      }
    } catch {
      // ignore
    }
  }
  if (!tx) throw new Error('Transaction not found.');
  if (tx.status === 'pending_admin_approval') {
    throw new Error('Transaction is already in Pending Admin Approval status.');
  }

  // Strictly preserve settledOnce so moving any completed/settled tx to pending NEVER credits any account anew.
  const wasAlreadySettled = Boolean(
    tx.settledOnce ||
      tx.status === 'completed' ||
      tx.status === 'refunded' ||
      tx.status === 'partially_refunded'
  );
  const cleanReason = (reason || '').trim();
  const nextNote = cleanReason
    ? (tx.note ? `${tx.note} · [Pending: ${cleanReason}]` : `[Pending: ${cleanReason}]`).slice(0, 300)
    : tx.note;

  const updatedTx: AcashTransaction = {
    ...tx,
    status: 'pending_admin_approval',
    settledOnce: wasAlreadySettled,
    ...(nextNote ? { note: nextNote } : {}),
    approvedBy: adminEmail,
    approvedAt: now,
  };

  const pendingNotif: AdminNotification = {
    id: `NTF-PND-${txId}-${now.toString(36).toUpperCase()}`,
    title: `Marked Pending: ${tx.txHash}`,
    message: `Admin ${adminEmail} moved ৳${tx.amount.toLocaleString()} (${tx.senderId} → ${tx.receiverId}) to Pending Review with zero new account credit.`,
    category: 'aml_pending',
    severity: 'warning',
    createdAt: now,
    read: false,
    targetSection: 'approvals',
  };

  const pendingActivity = makeActivityEntry({
    idPrefix: 'ACT-PND',
    actionType: 'aml_decision',
    title: `Transaction Marked Pending (৳${tx.amount.toLocaleString()})`,
    details: `Moved ${tx.type.replace(/_/g, ' ').toUpperCase()} (${tx.txHash}) between ${tx.senderId} and ${tx.receiverId} to pending_admin_approval with NO new credit to any account.${cleanReason ? ` Note: ${cleanReason}` : ''}`,
    actorEmail: adminEmail,
    targetIds: [tx.senderId, tx.receiverId],
    amount: tx.amount,
    timestamp: now,
  });

  store.transactions[txId] = updatedTx;
  store.notifications[pendingNotif.id] = pendingNotif;
  store.activityLogs[pendingActivity.id] = pendingActivity;
  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, TX_COL, txId), updatedTx);
      transaction.set(doc(db, ADMIN_NOTIF_COL, pendingNotif.id), pendingNotif);
      transaction.set(doc(db, ADMIN_ACTIVITY_COL, pendingActivity.id), pendingActivity);
    });
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `${TX_COL}/${txId}`);
    }
  }

  return updatedTx;
}

export async function adminDeleteTransaction(
  txId: string,
  adminEmail: string,
  reason?: string
): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  let tx: AcashTransaction | undefined = store.transactions[txId];
  if (!tx) {
    try {
      const snap = await getDoc(doc(db, TX_COL, txId));
      if (snap.exists()) {
        tx = snap.data() as AcashTransaction;
      }
    } catch {
      // ignore
    }
  }
  if (!tx) throw new Error('Transaction not found.');

  const cleanReason = (reason || '').trim();
  const deleteActivity = makeActivityEntry({
    idPrefix: 'ACT-DELTX',
    actionType: 'aml_decision',
    title: `Transaction Deleted (৳${tx.amount.toLocaleString()})`,
    details: `Permanently deleted ${tx.type.replace(/_/g, ' ').toUpperCase()} (${tx.txId} / ${tx.txHash}) of ৳${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} between ${tx.senderId} and ${tx.receiverId} from all statements.${cleanReason ? ` Reason: ${cleanReason}` : ''}`,
    actorEmail: adminEmail,
    targetIds: [tx.senderId, tx.receiverId],
    amount: tx.amount,
    timestamp: now,
  });

  delete store.transactions[txId];
  store.activityLogs[deleteActivity.id] = deleteActivity;
  writeLocalStore(store, true);

  try {
    await deleteDoc(doc(db, TX_COL, txId));
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, deleteActivity.id), deleteActivity);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `${TX_COL}/${txId}`);
    }
  }
}

export async function adminToggleUserStatus(
  accountId: string,
  newStatus: AccountStatus,
  reason?: string,
  adminEmail?: string
): Promise<AcashUser | null> {
  const now = Date.now();
  const store = readLocalStore();
  const existingUser = store.users[accountId];
  let updatedUser: AcashUser | null = null;

  if (existingUser) {
    updatedUser = {
      ...existingUser,
      status: newStatus,
      ...(newStatus === 'disabled'
        ? {
            disableReason: reason?.trim() || 'Suspended by Admin Security Review',
            disabledAt: now,
            disabledBy: adminEmail || 'Admin',
          }
        : {
            disableReason: '',
            disabledAt: undefined,
            disabledBy: undefined,
          }),
      lastActiveAt: now,
    };
    store.users[accountId] = updatedUser;

    const statusNotif: AdminNotification = {
      id: `NTF-STS-${accountId}-${now.toString(36).toUpperCase()}`,
      title:
        newStatus === 'disabled'
          ? `Account Disabled: ${accountId}`
          : `Account Re-Enabled: ${accountId}`,
      message:
        newStatus === 'disabled'
          ? `${existingUser.name} (${existingUser.email}) disabled. Cause: ${updatedUser.disableReason}`
          : `${existingUser.name} (${existingUser.email}) reactivated by ${adminEmail || 'Admin'}.`,
      category: 'account_status',
      severity: newStatus === 'disabled' ? 'warning' : 'info',
      createdAt: now,
      read: false,
      targetSection: 'users',
    };
    store.notifications[statusNotif.id] = statusNotif;

    const statusActivity = makeActivityEntry({
      idPrefix: 'ACT-STS',
      actionType: 'status_change',
      title:
        newStatus === 'disabled'
          ? `Account Disabled (${accountId})`
          : `Account Enabled (${accountId})`,
      details:
        newStatus === 'disabled'
          ? `Disabled ${existingUser.businessName || existingUser.name} (${accountId}). Cause: ${updatedUser.disableReason}`
          : `Re-enabled ${existingUser.businessName || existingUser.name} (${accountId}). Note: ${reason || 'Reviewed by Admin'}`,
      actorEmail: adminEmail || 'Admin',
      targetIds: [accountId],
      timestamp: now,
    });
    store.activityLogs[statusActivity.id] = statusActivity;
    writeLocalStore(store, true);

    try {
      await updateDoc(doc(db, USERS_COL, accountId), {
        status: newStatus,
        disableReason: updatedUser.disableReason || '',
        ...(newStatus === 'disabled' ? { disabledAt: now, disabledBy: adminEmail || 'Admin' } : {}),
        lastActiveAt: now,
      });
      await setDoc(doc(db, DIRECTORY_COL, accountId), toDirectoryEntry(updatedUser), {
        merge: true,
      });
      await setDoc(doc(db, ADMIN_NOTIF_COL, statusNotif.id), statusNotif);
      await setDoc(doc(db, ADMIN_ACTIVITY_COL, statusActivity.id), statusActivity);
    } catch {
      firestoreBackendMode = 'local_sync';
    }

    await persistAccountNotifications([
      buildAccountNotification({
        recipientId: accountId,
        recipientRole: existingUser.role,
        title: newStatus === 'disabled' ? 'Account Restricted by Admin' : 'Account Reactivated',
        message:
          newStatus === 'disabled'
            ? `Your account has been temporarily restricted. Cause: ${updatedUser.disableReason}`
            : `Your Acash account is active again (${reason || 'Reviewed by Platform Admin'}).`,
        category: 'security',
        severity: newStatus === 'disabled' ? 'critical' : 'success',
        createdBy: adminEmail || 'Admin',
        createdAt: now,
      }),
    ]);
  }

  return updatedUser;
}

export async function adminBulkUpdateUserStatus(params: {
  accountIds: string[];
  newStatus: AccountStatus;
  reason?: string;
  adminEmail: string;
}): Promise<AcashUser[]> {
  const now = Date.now();
  const store = readLocalStore();
  const updatedUsers: AcashUser[] = [];
  const cleanReason =
    params.reason?.trim() ||
    (params.newStatus === 'disabled'
      ? 'Bulk suspended by Admin Security Review'
      : 'Bulk re-activated by Platform Admin');

  for (const accountId of params.accountIds) {
    const existingUser = store.users[accountId];
    if (!existingUser) continue;

    const updatedUser: AcashUser = {
      ...existingUser,
      status: params.newStatus,
      ...(params.newStatus === 'disabled'
        ? {
            disableReason: cleanReason,
            disabledAt: now,
            disabledBy: params.adminEmail || 'Admin',
          }
        : {
            disableReason: '',
            disabledAt: undefined,
            disabledBy: undefined,
          }),
      lastActiveAt: now,
    };
    store.users[accountId] = updatedUser;
    updatedUsers.push(updatedUser);
  }

  if (updatedUsers.length === 0) return [];

  const affectedIds = updatedUsers.map((u) => u.accountId);
  const bulkNotif: AdminNotification = {
    id: `NTF-BLK-${now.toString(36).toUpperCase()}`,
    title:
      params.newStatus === 'disabled'
        ? `Bulk Disabled ${updatedUsers.length} Account(s)`
        : `Bulk Enabled ${updatedUsers.length} Account(s)`,
    message: `${affectedIds.join(', ')} · ${params.newStatus === 'disabled' ? `Cause: ${cleanReason}` : cleanReason}`,
    category: 'account_status',
    severity: params.newStatus === 'disabled' ? 'warning' : 'info',
    createdAt: now,
    read: false,
    targetSection: 'activity',
  };
  store.notifications[bulkNotif.id] = bulkNotif;

  const bulkActivity = makeActivityEntry({
    idPrefix: 'ACT-BLK',
    actionType: 'bulk_status_change',
    title:
      params.newStatus === 'disabled'
        ? `Bulk Froze / Disabled ${updatedUsers.length} Account(s)`
        : `Bulk Enabled ${updatedUsers.length} Account(s)`,
    details: `Changed status to ${params.newStatus.toUpperCase()} for ${updatedUsers.length} accounts (${affectedIds.slice(0, 25).join(', ')}${affectedIds.length > 25 ? '...' : ''}). ${params.newStatus === 'disabled' ? `Cause: ${cleanReason}` : `Note: ${cleanReason}`}`,
    actorEmail: params.adminEmail,
    targetIds: affectedIds.slice(0, 100),
    timestamp: now,
  });
  store.activityLogs[bulkActivity.id] = bulkActivity;
  writeLocalStore(store, true);

  try {
    await Promise.all([
      ...updatedUsers.map((u) =>
        updateDoc(doc(db, USERS_COL, u.accountId), {
          status: u.status,
          disableReason: u.disableReason || '',
          ...(u.status === 'disabled' ? { disabledAt: now, disabledBy: params.adminEmail } : {}),
          lastActiveAt: now,
        }).catch(() => {})
      ),
      ...updatedUsers.map((u) =>
        setDoc(doc(db, DIRECTORY_COL, u.accountId), toDirectoryEntry(u), { merge: true }).catch(
          () => {}
        )
      ),
      setDoc(doc(db, ADMIN_NOTIF_COL, bulkNotif.id), bulkNotif).catch(() => {}),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, bulkActivity.id), bulkActivity).catch(() => {}),
    ]);
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  await persistAccountNotifications(
    updatedUsers.map((u) =>
      buildAccountNotification({
        recipientId: u.accountId,
        recipientRole: u.role,
        title: params.newStatus === 'disabled' ? 'Account Restricted by Admin' : 'Account Reactivated',
        message:
          params.newStatus === 'disabled'
            ? `Your account has been restricted by Platform Admin. Cause: ${cleanReason}`
            : `Your Acash account has been reactivated by Platform Admin.`,
        category: 'security',
        severity: params.newStatus === 'disabled' ? 'critical' : 'success',
        createdBy: params.adminEmail,
        createdAt: now,
      })
    )
  );

  return updatedUsers;
}

export async function adminFreezeAllUsers(params: {
  adminEmail: string;
  reason?: string;
}): Promise<AcashUser[]> {
  const store = readLocalStore();
  const activeIds = Object.values(store.users)
    .filter((u) => u.status === 'active')
    .map((u) => u.accountId);
  if (activeIds.length === 0) return [];
  return adminBulkUpdateUserStatus({
    accountIds: activeIds,
    newStatus: 'disabled',
    reason: params.reason?.trim() || 'Emergency System-Wide Freeze by Platform Admin',
    adminEmail: params.adminEmail,
  });
}

export async function adminBulkDeleteUsers(params: {
  accountIds: string[];
  adminEmail: string;
  reason?: string;
}): Promise<string[]> {
  const uniqueIds = Array.from(new Set(params.accountIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const now = Date.now();
  const store = readLocalStore();
  const deletedUsers: AcashUser[] = [];

  for (const id of uniqueIds) {
    const existing = store.users[id];
    if (existing) {
      deletedUsers.push(existing);
      delete store.users[id];
    }
    if (store.mapLocations[id]) {
      delete store.mapLocations[id];
    }
  }

  const deletedIds = deletedUsers.length > 0 ? deletedUsers.map((u) => u.accountId) : uniqueIds;
  const cleanReason = params.reason?.trim() || 'Permanently deleted by Platform Admin';

  const delNotif: AdminNotification = {
    id: `NTF-DEL-${now.toString(36).toUpperCase()}`,
    title: `Deleted ${deletedIds.length} Account(s) Permanently`,
    message: `${deletedIds.slice(0, 12).join(', ')}${deletedIds.length > 12 ? ` (+${deletedIds.length - 12} more)` : ''} · Reason: ${cleanReason}`,
    category: 'account_status',
    severity: 'warning',
    createdAt: now,
    read: false,
    targetSection: 'activity',
  };
  store.notifications[delNotif.id] = delNotif;

  const delActivity = makeActivityEntry({
    idPrefix: 'ACT-DEL',
    actionType: 'account_delete',
    title: `Deleted ${deletedIds.length} Account(s) Permanently`,
    details: `Removed ${deletedIds.length} account(s) from users, directory, map pins, KYC submissions & released identity locks (${deletedIds.slice(0, 25).join(', ')}${deletedIds.length > 25 ? '...' : ''}). Reason: ${cleanReason}`,
    actorEmail: params.adminEmail || 'Admin',
    targetIds: deletedIds.slice(0, 100),
    timestamp: now,
  });
  store.activityLogs[delActivity.id] = delActivity;

  writeLocalStore(store, true);

  try {
    await Promise.all([
      ...deletedIds.map((id) =>
        Promise.all([
          deleteDoc(doc(db, USERS_COL, id)).catch(() => {}),
          deleteDoc(doc(db, DIRECTORY_COL, id)).catch(() => {}),
          deleteDoc(doc(db, MAP_LOCATIONS_COL, id)).catch(() => {}),
          deleteDoc(doc(db, KYC_SUBMISSIONS_COL, id)).catch(() => {}),
        ])
      ),
      ...deletedUsers.map((u) =>
        Promise.all([
          u.email ? releaseIdentityLock('email', u.email) : Promise.resolve(),
          u.phone ? releaseIdentityLock('phone', u.phone) : Promise.resolve(),
          u.kyc?.nidNumber ? releaseIdentityLock('nid', u.kyc.nidNumber) : Promise.resolve(),
          u.kyc?.taxCertificateNumber
            ? releaseIdentityLock('tax', u.kyc.taxCertificateNumber)
            : Promise.resolve(),
        ])
      ),
      setDoc(doc(db, ADMIN_NOTIF_COL, delNotif.id), delNotif).catch(() => {}),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, delActivity.id), delActivity).catch(() => {}),
    ]);
    firestoreBackendMode = 'firestore';
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return deletedIds;
}

export async function adminDeleteUser(
  accountId: string,
  adminEmail: string,
  reason?: string
): Promise<void> {
  await adminBulkDeleteUsers({
    accountIds: [accountId],
    adminEmail,
    reason,
  });
}

export async function markGiftCardState(
  txId: string,
  action: 'opened' | 'skipped'
): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  const existingTx = store.transactions[txId];
  let updatedGiftCard: GiftCardPayload | undefined;

  if (existingTx?.giftCard) {
    updatedGiftCard = {
      ...existingTx.giftCard,
      ...(action === 'opened' ? { openedAt: now } : { skippedAt: now }),
    };
    store.transactions[txId] = {
      ...existingTx,
      giftCard: updatedGiftCard,
    };
    writeLocalStore(store, true);
  }

  try {
    const txRef = doc(db, TX_COL, txId);
    const snap = await getDoc(txRef);
    if (snap.exists()) {
      const remoteTx = snap.data() as AcashTransaction;
      if (remoteTx.giftCard) {
        const mergedCard: GiftCardPayload = {
          ...remoteTx.giftCard,
          ...(action === 'opened' ? { openedAt: remoteTx.giftCard.openedAt || now } : {}),
          ...(action === 'skipped' ? { skippedAt: now } : {}),
        };
        await updateDoc(txRef, { giftCard: stripUndefined(mergedCard) });
        const latest = readLocalStore();
        latest.transactions[txId] = { ...remoteTx, giftCard: mergedCard };
        writeLocalStore(latest, true);
      }
    }
  } catch (err) {
    console.warn('Could not sync gift card state to cloud:', err);
  }
}

export async function adminReviewKycSubmission(params: {
  accountId: string;
  decision: 'verified' | 'unverified';
  reason?: string;
  adminEmail: string;
}): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  const localUser = store.users[params.accountId];
  let targetUser: AcashUser | null = localUser || null;

  try {
    const snap = await getDoc(doc(db, USERS_COL, params.accountId));
    if (snap.exists()) {
      targetUser = snap.data() as AcashUser;
    }
  } catch {
    // use local fallback
  }

  if (!targetUser) {
    throw new Error('Account not found.');
  }

  const baseKyc: KycInfo = targetUser.kyc || {
    nidNumber: '',
    dateOfBirth: '',
    address: '',
    occupation: '',
    nomineeName: '',
    nomineePhone: '',
    status: 'unverified',
    updatedAt: now,
  };
  const nextKyc: KycInfo = {
    ...baseKyc,
    status: params.decision,
    updatedAt: now,
  };
  const updatedUser: AcashUser = {
    ...targetUser,
    kyc: nextKyc,
    verified: params.decision === 'verified',
    lastActiveAt: now,
  };

  store.users[params.accountId] = updatedUser;
  const actEntry = makeActivityEntry({
    idPrefix: 'ACT-KYC',
    actionType: 'kyc_decision',
    title:
      params.decision === 'verified'
        ? `KYC Verified · ${params.accountId}`
        : `KYC Resubmission Requested · ${params.accountId}`,
    details:
      params.decision === 'verified'
        ? `Verified identity KYC for ${updatedUser.businessName || updatedUser.name} (${params.accountId}).`
        : `Reset KYC status to unverified for ${updatedUser.businessName || updatedUser.name} (${params.accountId}). Reason: ${params.reason?.trim() || 'Incomplete or unclear document'}`,
    actorEmail: params.adminEmail,
    targetIds: [params.accountId],
    timestamp: now,
  });
  store.activityLogs[actEntry.id] = actEntry;
  writeLocalStore(store, true);

  try {
    await Promise.all([
      updateDoc(doc(db, USERS_COL, params.accountId), {
        kyc: stripUndefined(nextKyc),
        verified: params.decision === 'verified',
        lastActiveAt: now,
      }),
      setDoc(
        doc(db, DIRECTORY_COL, params.accountId),
        toDirectoryEntry(updatedUser),
        { merge: true }
      ).catch(() => {}),
      setDoc(
        doc(db, KYC_SUBMISSIONS_COL, params.accountId),
        {
          accountId: params.accountId,
          kyc: stripUndefined(nextKyc),
          updatedAt: now,
        },
        { merge: true }
      ).catch(() => {}),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
    ]);
  } catch (err) {
    console.warn('KYC review cloud sync warning:', err);
  }

  const userNotif = buildAccountNotification({
    recipientId: params.accountId,
    recipientRole: updatedUser.role,
    title:
      params.decision === 'verified'
        ? '✅ KYC Verification Approved'
        : '⚠️ KYC Resubmission Required',
    message:
      params.decision === 'verified'
        ? 'Your Acash identity KYC & dossier have been verified by Compliance Admin.'
        : `Please update and re-submit your KYC documents. Reason: ${params.reason?.trim() || 'Document review required'}`,
    category: 'kyc',
    severity: params.decision === 'verified' ? 'success' : 'warning',
    createdBy: params.adminEmail,
    createdAt: now,
  });
  await persistAccountNotifications([userNotif]);
}

export async function adminResetAllAccountsAndTransactions(params: {
  adminEmail: string;
  reason?: string;
}): Promise<void> {
  const now = Date.now();
  try {
    localStorage.setItem('acash_factory_reset_ts', String(now));
    localStorage.removeItem(LOCAL_DB_KEY);
  } catch {}

  const store = readLocalStore();
  store.users = {};
  store.transactions = {};
  store.mapLocations = {};
  store.treasuryVault = {
    vaultId: 'ADMIN-TREASURY',
    balance: 0,
    totalMinted: 0,
    totalDisbursed: 0,
    mintHistory: [
      {
        id: `MINT-RESET-${now.toString(36).toUpperCase()}`,
        action: 'refresh',
        amount: 0,
        previousBalance: 0,
        newBalance: 0,
        note: params.reason?.trim() || 'System-wide factory reset of all accounts and transactions by Platform Admin',
        actorEmail: params.adminEmail,
        timestamp: now,
      },
    ],
    updatedAt: now,
    updatedBy: params.adminEmail,
  };

  const resetNotif: AdminNotification = {
    id: `NTF-RESET-${now.toString(36).toUpperCase()}`,
    title: 'System Factory Reset · All Users, Merchants, Agents & History Cleared',
    message: `All accounts, transactions, identity locks, and treasury balance wiped clean by ${params.adminEmail}. Ready for fresh registrations.`,
    category: 'account_status',
    severity: 'warning',
    createdAt: now,
    read: false,
    targetSection: 'users',
  };
  store.notifications = { [resetNotif.id]: resetNotif };
  store.accountNotifications = {};

  const resetActivity = makeActivityEntry({
    idPrefix: 'ACT-RESET',
    actionType: 'account_delete',
    title: 'System Factory Reset · All Accounts & History Wiped',
    details: `Successfully wiped all users, merchants, agents, transactions, KYC submissions and reset treasury vault to 0 BDT.`,
    actorEmail: params.adminEmail,
    targetIds: [],
    timestamp: now,
  });
  store.activityLogs = { [resetActivity.id]: resetActivity };

  writeLocalStore(store, true);

  try {
    const [usersSnap, dirSnap, txSnap, mapSnap, kycSnap, locksSnap, acctNotifSnap] = await Promise.all([
      getDocs(collection(db, USERS_COL)),
      getDocs(collection(db, DIRECTORY_COL)),
      getDocs(collection(db, TX_COL)),
      getDocs(collection(db, MAP_LOCATIONS_COL)),
      getDocs(collection(db, KYC_SUBMISSIONS_COL)),
      getDocs(collection(db, LOCKS_COL)),
      getDocs(collection(db, ACCOUNT_NOTIF_COL)),
    ]);

    await Promise.all([
      ...usersSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      ...dirSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      ...txSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      ...mapSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      ...kycSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      ...locksSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      ...acctNotifSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
      setDoc(doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID), store.treasuryVault).catch(() => {}),
      setDoc(doc(db, ADMIN_NOTIF_COL, resetNotif.id), resetNotif).catch(() => {}),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, resetActivity.id), resetActivity).catch(() => {}),
    ]);
    firestoreBackendMode = 'firestore';
  } catch {
    firestoreBackendMode = 'local_sync';
  }
}

export async function adminUpdateFeeConfig(config: Omit<FeeConfig, 'updatedAt'>): Promise<void> {
  const now = Date.now();
  const full: FeeConfig = normalizeFeeConfig({ ...config, updatedAt: now });
  full.updatedAt = now;
  full.updatedBy = config.updatedBy;
  const store = readLocalStore();
  store.feeConfig = full;

  const sendMoneyLabel =
    full.sendMoneyChargeMode === 'per_1000'
      ? `৳${full.sendMoneyFeeRate}/1,000`
      : `৳${full.sendMoneyFeeRate} flat (> ৳${full.sendMoneyFreeThreshold})`;

  const feeNotif: AdminNotification = {
    id: `NTF-FEE-${now.toString(36).toUpperCase()}`,
    title: `Fee Engine Updated · User CO ৳${full.feePer1000}/1k · Merch CO ৳${full.merchantCashOutFeePer1000}/1k · Send ${sendMoneyLabel}`,
    message: `User Cash-Out (A: ৳${full.agentShare}, G: ৳${full.govtShare}, P: ৳${full.adminShare}) | Merchant Cash-Out to Agent (A: ৳${full.merchantCashOutAgentShare}, G: ৳${full.merchantCashOutGovtShare}, P: ৳${full.merchantCashOutAdminShare}) & Admin (৳${full.merchantCashOutToAdminFeePer1000}/1k) | Send Money (G: ৳${full.sendMoneyGovtShare}, P: ৳${full.sendMoneyAdminShare}). Past transactions remain locked.`,
    category: 'fee_update',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'fees',
  };
  store.notifications[feeNotif.id] = feeNotif;

  const feeActivity = makeActivityEntry({
    idPrefix: 'ACT-FEE',
    actionType: 'fee_update',
    title: `Fee Engine Updated (User CO ৳${full.feePer1000}/1k · Merch CO ৳${full.merchantCashOutFeePer1000}/1k · Send ৳${full.sendMoneyFeeRate})`,
    details: `User Cash-Out: ৳${full.feePer1000}/1,000 (Agent ৳${full.agentShare}, Govt ৳${full.govtShare}, Admin ৳${full.adminShare}) | Merchant Cash-Out Agent: ৳${full.merchantCashOutFeePer1000}/1,000 (Agent ৳${full.merchantCashOutAgentShare}, Govt ৳${full.merchantCashOutGovtShare}, Admin ৳${full.merchantCashOutAdminShare}) | Merchant Cash-Out Admin: ৳${full.merchantCashOutToAdminFeePer1000}/1,000 (Govt ৳${full.merchantCashOutToAdminGovtShare}, Admin ৳${full.merchantCashOutToAdminShare}) | Send Money: ${sendMoneyLabel} (Govt ৳${full.sendMoneyGovtShare}, Admin ৳${full.sendMoneyAdminShare}) | Cash-In Bonus: ৳${full.cashInCommissionPer1000}/1,000 | AML: ৳${full.highValueThreshold.toLocaleString()}.`,
    actorEmail: config.updatedBy,
    timestamp: now,
  });
  store.activityLogs[feeActivity.id] = feeActivity;

  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SETTINGS_COL, FEE_DOC_ID), full);
    await setDoc(doc(db, ADMIN_NOTIF_COL, feeNotif.id), feeNotif);
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, feeActivity.id), feeActivity);
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  await persistAccountNotifications([
    buildAccountNotification({
      recipientId: 'ALL',
      recipientRole: 'ALL',
      title: 'Platform Fee Schedule Updated',
      message: `Cash-Out ৳${full.feePer1000}/1k · Merchant CO ৳${full.merchantCashOutFeePer1000}/1k · Send Money ${sendMoneyLabel}. Effective immediately.`,
      category: 'fee_update',
      severity: 'info',
      createdBy: config.updatedBy,
      createdAt: now,
    }),
  ]);
}

export async function updateUserPin(accountId: string, newPin: string): Promise<void> {
  const pinHash = hashPin(newPin);
  const store = readLocalStore();
  if (store.users[accountId]) {
    store.users[accountId] = { ...store.users[accountId], pinHash, lastActiveAt: Date.now() };
    writeLocalStore(store, true);
  }

  try {
    await updateDoc(doc(db, USERS_COL, accountId), { pinHash, lastActiveAt: Date.now() });
  } catch {
    firestoreBackendMode = 'local_sync';
  }
}

export async function changeUserSecurityPin(
  accountId: string,
  currentPin: string,
  newPin: string
): Promise<void> {
  if (!/^\d{4,5}$/.test(newPin.trim())) {
    throw new Error('New Security PIN must be 4 or 5 digits.');
  }
  const store = readLocalStore();
  const user = store.users[accountId];
  if (!user) throw new Error('Account not found.');
  if (user.pinHash !== hashPin(currentPin)) {
    throw new Error('Current Security PIN is incorrect.');
  }
  await updateUserPin(accountId, newPin.trim());
}

export async function updateUserProfilePhoto(
  accountId: string,
  profilePhotoUrl: string
): Promise<AcashUser | null> {
  const now = Date.now();
  const store = readLocalStore();
  const user = store.users[accountId];
  if (!user) throw new Error('Account not found.');

  const updated: AcashUser = {
    ...user,
    profilePhotoUrl,
    lastActiveAt: now,
  };
  store.users[accountId] = updated;

  const existingPin = store.mapLocations[accountId];
  let updatedPin: AcashMapLocation | null = null;
  if (existingPin) {
    updatedPin = {
      ...existingPin,
      profilePhotoUrl,
      updatedAt: now,
    };
    store.mapLocations[accountId] = updatedPin;
  }

  const photoNotif: AdminNotification = {
    id: `NTF-PIC-${accountId}-${now.toString(36).toUpperCase()}`,
    title: `Profile Photo Updated: ${accountId}`,
    message: `${user.businessName || user.name} (${accountId}) uploaded a new profile photo.`,
    category: 'kyc_update',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'users',
  };
  store.notifications[photoNotif.id] = photoNotif;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, USERS_COL, accountId), updated, { merge: true });
    if (updatedPin) {
      await setDoc(doc(db, MAP_LOCATIONS_COL, accountId), updatedPin, { merge: true });
    }
    await setDoc(doc(db, ADMIN_NOTIF_COL, photoNotif.id), photoNotif);
  } catch {
    firestoreBackendMode = 'local_sync';
  }
  return updated;
}

export async function updateUserGender(
  accountId: string,
  gender: UserGender
): Promise<AcashUser | null> {
  const now = Date.now();
  const store = readLocalStore();
  const user = store.users[accountId];
  if (!user) throw new Error('Account not found.');

  const updated: AcashUser = {
    ...user,
    gender,
    lastActiveAt: now,
  };
  store.users[accountId] = updated;
  writeLocalStore(store, true);

  try {
    await updateDoc(doc(db, USERS_COL, accountId), { gender, lastActiveAt: now });
  } catch {
    firestoreBackendMode = 'local_sync';
  }
  return updated;
}

export async function updateUserKyc(params: {
  accountId: string;
  name?: string;
  businessName?: string;
  kyc: Omit<KycInfo, 'updatedAt' | 'status'>;
}): Promise<AcashUser> {
  const now = Date.now();
  const store = readLocalStore();
  let user = store.users[params.accountId];
  if (!user) {
    const found = await findUserByIdentifier(params.accountId);
    if (found) user = found;
  }
  if (!user) throw new Error('Account not found.');

  const cleanNid = params.kyc.nidNumber.trim();
  if (!cleanNid) throw new Error('NID / Passport number is required.');

  const cleanTaxCertNo = params.kyc.taxCertificateNumber?.trim();
  if (user.role === 'M' && !cleanTaxCertNo) {
    throw new Error('TIN / Tax Certificate number is required for Merchant KYC.');
  }

  // Enforce strict 1-to-1 KYC uniqueness (NID/Passport and TIN/Tax Certificate) across all accounts
  const normNid = normalizeNidForLock(cleanNid);
  const normTax = cleanTaxCertNo ? normalizeTaxForLock(cleanTaxCertNo) : '';
  for (const other of Object.values(store.users)) {
    if (other.accountId === params.accountId) continue;
    if (other.kyc?.nidNumber && normalizeNidForLock(other.kyc.nidNumber) === normNid) {
      throw new Error(identityConflictMessage('nid'));
    }
    if (
      normTax &&
      other.kyc?.taxCertificateNumber &&
      normalizeTaxForLock(other.kyc.taxCertificateNumber) === normTax
    ) {
      throw new Error(identityConflictMessage('tax'));
    }
  }
  await checkIdentityLockAvailable('nid', cleanNid, params.accountId);
  if (cleanTaxCertNo) {
    await checkIdentityLockAvailable('tax', cleanTaxCertNo, params.accountId);
  }

  const nextKyc: KycInfo = {
    nidNumber: cleanNid,
    dateOfBirth: params.kyc.dateOfBirth.trim(),
    address: params.kyc.address.trim(),
    occupation: params.kyc.occupation.trim(),
    nomineeName: params.kyc.nomineeName.trim(),
    nomineePhone: normalizeBdPhone(params.kyc.nomineePhone) || params.kyc.nomineePhone.trim(),
    ...(params.kyc.nidPhotoUrl ? { nidPhotoUrl: params.kyc.nidPhotoUrl } : {}),
    ...(cleanTaxCertNo ? { taxCertificateNumber: cleanTaxCertNo } : {}),
    ...(params.kyc.taxCertificatePhotoUrl
      ? { taxCertificatePhotoUrl: params.kyc.taxCertificatePhotoUrl }
      : {}),
    status: 'verified',
    updatedAt: now,
  };

  const updated: AcashUser = {
    ...user,
    ...(params.name?.trim() ? { name: params.name.trim() } : {}),
    ...(params.businessName?.trim() ? { businessName: params.businessName.trim() } : {}),
    kyc: nextKyc,
    verified: true,
    lastActiveAt: now,
  };

  // Claim global KYC uniqueness locks before committing
  try {
    await claimIdentityLock('nid', cleanNid, params.accountId, now);
    if (cleanTaxCertNo) {
      await claimIdentityLock('tax', cleanTaxCertNo, params.accountId, now);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already')) {
      throw err;
    }
  }

  store.users[params.accountId] = updated;

  const existingPin = store.mapLocations[params.accountId];
  let updatedPin: AcashMapLocation | null = null;
  if (existingPin) {
    updatedPin = {
      ...existingPin,
      name: updated.name,
      ...(updated.businessName ? { businessName: updated.businessName } : {}),
      updatedAt: now,
    };
    store.mapLocations[params.accountId] = updatedPin;
  }

  const kycNotif: AdminNotification = {
    id: `NTF-KYC-${params.accountId}-${now.toString(36).toUpperCase()}`,
    title: `KYC Updated: ${params.accountId}`,
    message: `${updated.businessName || updated.name} updated KYC (NID: ${cleanNid}${cleanTaxCertNo ? `, Tax Cert: ${cleanTaxCertNo}` : ''}). Ready for PDF export.`,
    category: 'kyc_update',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'users',
  };
  store.notifications[kycNotif.id] = kycNotif;
  writeLocalStore(store, true);

  const kycBridgePayload: KycSubmissionRecord = {
    accountId: updated.accountId,
    name: updated.name,
    ...(updated.businessName ? { businessName: updated.businessName } : {}),
    kyc: nextKyc,
    updatedAt: now,
  };

  let syncedViaBridge = false;
  try {
    await setDoc(doc(db, KYC_SUBMISSIONS_COL, params.accountId), kycBridgePayload);
    syncedViaBridge = true;
  } catch {
    // fallback handled below
  }

  try {
    await setDoc(doc(db, USERS_COL, params.accountId), updated, { merge: true });
    await setDoc(doc(db, DIRECTORY_COL, params.accountId), toDirectoryEntry(updated), {
      merge: true,
    });
    if (updatedPin) {
      await setDoc(doc(db, MAP_LOCATIONS_COL, params.accountId), updatedPin, { merge: true });
    }
    await setDoc(doc(db, ADMIN_NOTIF_COL, kycNotif.id), kycNotif);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = syncedViaBridge ? 'firestore' : 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      console.warn('Firestore KYC sync error:', err);
    }
  }

  await persistAccountNotifications([
    buildAccountNotification({
      recipientId: updated.accountId,
      recipientRole: updated.role,
      title: 'KYC Identity Verified',
      message: `Your KYC verification (NID: ${cleanNid}${cleanTaxCertNo ? `, Tax: ${cleanTaxCertNo}` : ''}) has been verified and synced.`,
      category: 'kyc',
      severity: 'success',
      createdAt: now,
    }),
  ]);

  return updated;
}

// ---------- Agent Booth & Customer Support Booth Map Service ----------

export function subscribeToBooths(callback: (booths: AcashBooth[]) => void): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(
      Object.values(store.booths || {}).sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
    );
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    const q = query(collection(db, BOOTHS_COL), orderBy('updatedAt', 'desc'), limit(300));
    unsubFs = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AcashBooth);
        if (list.length > 0) {
          const store = readLocalStore();
          for (const b of list) {
            store.booths[b.boothId] = b;
          }
          writeLocalStore(store, false);
        }
        emitLocal();
      },
      (err) => {
        if (isPermissionError(err)) {
          console.warn('Firestore booths read notice:', err);
        }
        emitLocal();
      }
    );
  } catch {
    // fallback to local store
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export async function adminSaveBooth(
  boothInput: Omit<AcashBooth, 'createdAt' | 'updatedAt' | 'boothId'> & { boothId?: string },
  adminEmail: string
): Promise<AcashBooth> {
  const now = Date.now();
  const store = readLocalStore();
  const boothId =
    boothInput.boothId?.trim() ||
    `BTH-${boothInput.boothType === 'agent_booth' ? 'AGT' : 'SUP'}-${now.toString(36).toUpperCase()}`;

  const existing = store.booths[boothId];
  const record: AcashBooth = {
    boothId,
    boothType: boothInput.boothType,
    name: boothInput.name.trim(),
    area: boothInput.area.trim(),
    city: boothInput.city.trim(),
    address: boothInput.address.trim(),
    phone: boothInput.phone.trim(),
    ...(boothInput.agentAccountId?.trim()
      ? { agentAccountId: boothInput.agentAccountId.trim().toUpperCase() }
      : {}),
    hours: boothInput.hours.trim(),
    status: boothInput.status,
    lat: Number(boothInput.lat),
    lng: Number(boothInput.lng),
    services: boothInput.services,
    ...(typeof boothInput.queueWaitMinutes === 'number'
      ? { queueWaitMinutes: boothInput.queueWaitMinutes }
      : {}),
    ...(boothInput.boothType === 'agent_booth' && boothInput.cashLiquidityLevel
      ? { cashLiquidityLevel: boothInput.cashLiquidityLevel }
      : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  store.booths[boothId] = record;

  const act = makeActivityEntry({
    idPrefix: 'ACT-BTH',
    actionType: 'status_change',
    title: `${existing ? 'Updated' : 'Added'} ${record.boothType === 'agent_booth' ? 'Agent Booth' : 'Support Booth'} (${boothId})`,
    details: `${record.name} in ${record.area}, ${record.city} set to ${record.status.toUpperCase()}.`,
    actorEmail: adminEmail,
    targetIds: [boothId],
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, BOOTHS_COL, boothId), record);
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `${BOOTHS_COL}/${boothId}`);
    }
  }

  return record;
}

export async function adminToggleBoothStatus(
  boothId: string,
  status: BoothStatus,
  adminEmail: string
): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  const existing = store.booths[boothId];
  if (!existing) throw new Error('Booth not found.');

  const updated: AcashBooth = {
    ...existing,
    status,
    updatedAt: now,
  };
  store.booths[boothId] = updated;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, BOOTHS_COL, boothId), updated);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `${BOOTHS_COL}/${boothId}`);
    }
  }
}

export async function adminDeleteBooth(boothId: string, adminEmail: string): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  const existing = store.booths[boothId];
  if (!existing) return;

  delete store.booths[boothId];
  const act = makeActivityEntry({
    idPrefix: 'ACT-BTD',
    actionType: 'status_change',
    title: `Removed Booth (${boothId})`,
    details: `Deleted ${existing.name} (${existing.area}, ${existing.city}) from Booth Map.`,
    actorEmail: adminEmail,
    targetIds: [boothId],
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await deleteDoc(doc(db, BOOTHS_COL, boothId));
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `${BOOTHS_COL}/${boothId}`);
    }
  }
}

// ---------- Creator Live Map Locations (2nd Admins, Merchants, Agents) ----------

export function subscribeToMapLocations(callback: (locations: AcashMapLocation[]) => void): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(
      Object.values(store.mapLocations || {}).sort((a, b) => b.updatedAt - a.updatedAt)
    );
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    const q = query(collection(db, MAP_LOCATIONS_COL), orderBy('updatedAt', 'desc'), limit(300));
    unsubFs = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AcashMapLocation);
        if (list.length > 0) {
          const store = readLocalStore();
          for (const item of list) {
            store.mapLocations[item.creatorId] = item;
          }
          writeLocalStore(store, false);
        }
        emitLocal();
      },
      (err) => {
        if (isPermissionError(err)) {
          console.warn('Firestore map locations read notice:', err);
        }
        emitLocal();
      }
    );
  } catch {
    // fallback to local store
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export function subscribeToSecondAdmins(
  callback: (admins: SecondAdminProfile[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const store = readLocalStore();
    callback(
      Object.values(store.secondAdmins || {}).sort((a, b) => a.adminId.localeCompare(b.adminId))
    );
  };

  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    const q = query(collection(db, SECOND_ADMINS_COL), orderBy('createdAt', 'desc'));
    unsubFs = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SecondAdminProfile);
        if (list.length > 0) {
          const store = readLocalStore();
          for (const sa of list) {
            store.secondAdmins[sa.adminId] = sa;
          }
          writeLocalStore(store, false);
        }
        emitLocal();
      },
      () => {
        emitLocal();
      }
    );
  } catch {
    // fallback
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export async function saveUserMapLocation(params: {
  accountId: string;
  lat: number;
  lng: number;
  address: string;
  area: string;
  city: string;
  isVisible: boolean;
}): Promise<AcashUser> {
  const now = Date.now();
  const store = readLocalStore();
  const user = store.users[params.accountId];
  if (!user) throw new Error('Account not found.');
  if (user.role !== 'A' && user.role !== 'M') {
    throw new Error('Only Agents, Merchants, and 2nd Admins can publish a profile map location.');
  }

  const cleanAddress = params.address.trim() || `${params.area.trim() || 'Dhaka'}, ${params.city.trim() || 'Dhaka'}`;
  const cleanArea = params.area.trim() || 'Dhaka';
  const cleanCity = params.city.trim() || 'Dhaka';

  const mapLocation: UserMapLocation = {
    lat: Number(params.lat),
    lng: Number(params.lng),
    address: cleanAddress.slice(0, 240),
    area: cleanArea.slice(0, 80),
    city: cleanCity.slice(0, 60),
    isVisible: params.isVisible,
    updatedAt: now,
  };

  const updatedUser: AcashUser = {
    ...user,
    mapLocation,
    lastActiveAt: now,
  };
  store.users[params.accountId] = updatedUser;

  const creatorRole: CreatorMapRole = user.role === 'A' ? 'agent' : 'merchant';
  const existingPin = store.mapLocations[params.accountId];
  const mapPin: AcashMapLocation = {
    creatorId: user.accountId,
    ...(user.firebaseUid ? { creatorUid: user.firebaseUid } : auth.currentUser?.uid ? { creatorUid: auth.currentUser.uid } : {}),
    creatorRole,
    name: user.name.slice(0, 120),
    ...(user.businessName ? { businessName: user.businessName.slice(0, 140) } : {}),
    phone: user.phone.slice(0, 30),
    ...(user.profilePhotoUrl ? { profilePhotoUrl: user.profilePhotoUrl } : {}),
    address: mapLocation.address,
    area: mapLocation.area,
    city: mapLocation.city,
    lat: mapLocation.lat,
    lng: mapLocation.lng,
    isVisible: params.isVisible,
    locationSource: 'manual_pin',
    ...(existingPin?.ipAddress ? { ipAddress: existingPin.ipAddress } : {}),
    ...(existingPin?.isp ? { isp: existingPin.isp } : {}),
    ...(existingPin?.country ? { country: existingPin.country } : {}),
    ...(existingPin?.lastIpLocatedAt ? { lastIpLocatedAt: existingPin.lastIpLocatedAt } : {}),
    createdAt: existingPin?.createdAt || now,
    updatedAt: now,
  };
  store.mapLocations[user.accountId] = mapPin;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, USERS_COL, user.accountId), updatedUser, { merge: true });
    await setDoc(doc(db, MAP_LOCATIONS_COL, user.accountId), mapPin);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      console.warn('Firestore user map location sync warning:', err);
    }
  }

  return updatedUser;
}

export async function syncAutoIpMapLocation(params: {
  creatorId: string;
  creatorRole: CreatorMapRole;
  name: string;
  businessName?: string;
  phone: string;
  profilePhotoUrl?: string;
  creatorUid?: string;
  forceOverrideManualPin?: boolean;
}): Promise<AcashMapLocation | null> {
  const cleanCreatorId = params.creatorId.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!cleanCreatorId) return null;

  try {
    const geo = await detectIpGeolocation(Boolean(params.forceOverrideManualPin));
    const now = Date.now();
    const store = readLocalStore();
    let existingPin = store.mapLocations[cleanCreatorId];

    if (!existingPin) {
      try {
        const snap = await getDoc(doc(db, MAP_LOCATIONS_COL, cleanCreatorId));
        if (snap.exists()) {
          existingPin = snap.data() as AcashMapLocation;
        }
      } catch {
        // ignore read error
      }
    }

    const keepManual = existingPin?.locationSource === 'manual_pin' && !params.forceOverrideManualPin;

    const mapPin: AcashMapLocation = {
      creatorId: cleanCreatorId,
      ...(params.creatorUid
        ? { creatorUid: params.creatorUid }
        : existingPin?.creatorUid
          ? { creatorUid: existingPin.creatorUid }
          : auth.currentUser?.uid
            ? { creatorUid: auth.currentUser.uid }
            : {}),
      creatorRole: params.creatorRole,
      name: (params.name.trim() || existingPin?.name || cleanCreatorId).slice(0, 120),
      ...(params.businessName?.trim()
        ? { businessName: params.businessName.trim().slice(0, 140) }
        : existingPin?.businessName
          ? { businessName: existingPin.businessName }
          : {}),
      phone: (params.phone.trim() || existingPin?.phone || 'N/A').slice(0, 30),
      ...(params.profilePhotoUrl
        ? { profilePhotoUrl: params.profilePhotoUrl }
        : existingPin?.profilePhotoUrl
          ? { profilePhotoUrl: existingPin.profilePhotoUrl }
          : {}),
      address: keepManual ? existingPin!.address : geo.address.slice(0, 240),
      area: keepManual ? existingPin!.area : (geo.region || geo.city).slice(0, 80),
      city: keepManual ? existingPin!.city : geo.city.slice(0, 60),
      lat: keepManual ? existingPin!.lat : Number(geo.lat),
      lng: keepManual ? existingPin!.lng : Number(geo.lng),
      isVisible: keepManual ? existingPin!.isVisible : true,
      locationSource: keepManual ? 'manual_pin' : 'ip_auto',
      ipAddress: geo.ip.slice(0, 80),
      isp: geo.isp.slice(0, 140),
      country: geo.country.slice(0, 80),
      lastIpLocatedAt: now,
      createdAt: existingPin?.createdAt || now,
      updatedAt: now,
    };

    store.mapLocations[cleanCreatorId] = mapPin;
    writeLocalStore(store, true);

    try {
      await setDoc(doc(db, MAP_LOCATIONS_COL, cleanCreatorId), stripUndefined(mapPin), { merge: true });
      firestoreBackendMode = 'firestore';
    } catch {
      firestoreBackendMode = 'local_sync';
    }

    return mapPin;
  } catch {
    return null;
  }
}

export async function verifyAdminPasswordLogin(
  emailInput: string,
  passwordInput: string
): Promise<{
  adminEmail: string;
  adminName: string;
  adminRole: 'main_admin' | 'second_admin';
  adminId?: string;
  phone?: string;
  profilePhotoUrl?: string;
}> {
  const cleanEmail = emailInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Enter a valid Admin Gmail address.');
  }
  if (!cleanPass) {
    throw new Error('Enter your Admin password.');
  }

  const store = readLocalStore();

  if (isMainAdminEmail(cleanEmail)) {
    let creds = store.mainAdminCredentials;
    if (auth.currentUser && isMainAdminEmail(auth.currentUser.email)) {
      try {
        const snap = await getDoc(doc(db, SETTINGS_COL, MAIN_ADMIN_CREDS_DOC_ID));
        if (snap.exists()) {
          const fsCreds = snap.data() as MainAdminCredentialConfig;
          if (fsCreds?.passwordHash) {
            creds = fsCreds;
            store.mainAdminCredentials = fsCreds;
            writeLocalStore(store, false);
          }
        }
      } catch {
        // use local synced credentials
      }
    }
    if (hashPin(cleanPass) !== creds.passwordHash) {
      throw new Error('Invalid Main Admin password.');
    }
    return {
      adminEmail: MAIN_ADMIN_EMAIL,
      adminName: 'Main Admin (Root)',
      adminRole: 'main_admin',
    };
  }

  let matched = Object.values(store.secondAdmins).find(
    (sa) => sa.email.toLowerCase() === cleanEmail
  );

  if (!matched) {
    try {
      const qSa = query(
        collection(db, SECOND_ADMINS_COL),
        where('email', '==', cleanEmail),
        limit(1)
      );
      const snap = await getDocs(qSa);
      if (!snap.empty) {
        matched = snap.docs[0].data() as SecondAdminProfile;
        store.secondAdmins[matched.adminId] = matched;
        writeLocalStore(store, false);
      }
    } catch {
      // ignore
    }
  }

  if (!matched) {
    throw new Error(
      `Account not authorized. 2nd Admin accounts must first be created by the Main Admin (${MAIN_ADMIN_EMAIL}).`
    );
  }
  if (matched.status !== 'active') {
    throw new Error('This 2nd Admin account is disabled by the Main Admin.');
  }

  const expectedHash = matched.passwordHash || hashPin('Acash2nd@2026');
  if (hashPin(cleanPass) !== expectedHash) {
    throw new Error('Invalid 2nd Admin password.');
  }

  return {
    adminEmail: matched.email,
    adminName: matched.name,
    adminRole: 'second_admin',
    adminId: matched.adminId,
    phone: matched.phone,
    profilePhotoUrl: matched.profilePhotoUrl,
  };
}

export async function authorizeGoogleAdminLogin(params: {
  email: string;
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<{
  adminEmail: string;
  adminName: string;
  adminRole: 'main_admin' | 'second_admin';
  adminId?: string;
  phone?: string;
  profilePhotoUrl?: string;
}> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (isMainAdminEmail(cleanEmail)) {
    return {
      adminEmail: MAIN_ADMIN_EMAIL,
      adminName: params.displayName || 'Main Admin (Root)',
      adminRole: 'main_admin',
      profilePhotoUrl: params.photoURL || undefined,
    };
  }

  const now = Date.now();
  const store = readLocalStore();
  let matched = Object.values(store.secondAdmins).find(
    (sa) => sa.email.toLowerCase() === cleanEmail || sa.firebaseUid === params.uid
  );

  if (!matched) {
    try {
      const qSa = query(
        collection(db, SECOND_ADMINS_COL),
        where('email', '==', cleanEmail),
        limit(1)
      );
      const snap = await getDocs(qSa);
      if (!snap.empty) {
        matched = snap.docs[0].data() as SecondAdminProfile;
        store.secondAdmins[matched.adminId] = matched;
        writeLocalStore(store, false);
      }
    } catch {
      // ignore
    }
  }

  if (!matched) {
    throw new Error(
      `Access denied for ${cleanEmail}. Only Main Admin (${MAIN_ADMIN_EMAIL}) or 2nd Admins created by Main Admin can sign in.`
    );
  }
  if (matched.status !== 'active') {
    throw new Error('This 2nd Admin account is disabled by Main Admin.');
  }

  const refreshed: SecondAdminProfile = {
    ...matched,
    firebaseUid: params.uid,
    ...(!matched.profilePhotoUrl && params.photoURL ? { profilePhotoUrl: params.photoURL } : {}),
    updatedAt: now,
  };
  store.secondAdmins[matched.adminId] = refreshed;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SECOND_ADMINS_COL, matched.adminId), refreshed, { merge: true });
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return {
    adminEmail: refreshed.email,
    adminName: refreshed.name,
    adminRole: 'second_admin',
    adminId: refreshed.adminId,
    phone: refreshed.phone,
    profilePhotoUrl: refreshed.profilePhotoUrl,
  };
}

export async function changeMainAdminPassword(params: {
  currentPassword: string;
  newPassword: string;
  actorEmail: string;
}): Promise<void> {
  if (!isMainAdminEmail(params.actorEmail)) {
    throw new Error('Only the Main Admin can change the Main Admin password.');
  }
  const cleanCurrent = params.currentPassword.trim();
  const cleanNew = params.newPassword.trim();
  if (cleanNew.length < 8) {
    throw new Error('New Main Admin password must be at least 8 characters.');
  }

  const store = readLocalStore();
  if (hashPin(cleanCurrent) !== store.mainAdminCredentials.passwordHash) {
    throw new Error('Current Main Admin password is incorrect.');
  }

  const now = Date.now();
  const updatedCreds: MainAdminCredentialConfig = {
    email: MAIN_ADMIN_EMAIL,
    passwordHash: hashPin(cleanNew),
    updatedAt: now,
    updatedBy: params.actorEmail,
  };
  store.mainAdminCredentials = updatedCreds;

  const act = makeActivityEntry({
    idPrefix: 'ACT-PWD',
    actionType: 'security_update',
    title: 'Main Admin Password Changed',
    details: `Main Admin (${MAIN_ADMIN_EMAIL}) updated executive login password.`,
    actorEmail: params.actorEmail,
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SETTINGS_COL, MAIN_ADMIN_CREDS_DOC_ID), updatedCreds);
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
    firestoreBackendMode = 'firestore';
  } catch {
    firestoreBackendMode = 'local_sync';
  }
}

export async function adminCreateSecondAdmin(params: {
  name: string;
  title?: string;
  email: string;
  phone: string;
  password: string;
  actorEmail: string;
}): Promise<SecondAdminProfile> {
  if (!isMainAdminEmail(params.actorEmail)) {
    throw new Error('Only the Main Admin can create 2nd Admin accounts.');
  }
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) throw new Error('Valid email is required for 2nd Admin.');
  if (isMainAdminEmail(cleanEmail)) {
    throw new Error('This email belongs to the Main Admin.');
  }
  if (!params.password || params.password.trim().length < 6) {
    throw new Error('Initial password for 2nd Admin must be at least 6 characters.');
  }

  const now = Date.now();
  const store = readLocalStore();
  const duplicate = Object.values(store.secondAdmins).find(
    (sa) => sa.email.toLowerCase() === cleanEmail
  );
  if (duplicate) {
    throw new Error(`A 2nd Admin (${duplicate.adminId}) already uses ${cleanEmail}.`);
  }

  let randomNum = Math.floor(200003 + Math.random() * 790000);
  let adminId = `ADM-${randomNum}`;
  while (store.secondAdmins[adminId]) {
    randomNum = Math.floor(200003 + Math.random() * 790000);
    adminId = `ADM-${randomNum}`;
  }

  const profile: SecondAdminProfile = {
    adminId,
    name: params.name.trim().slice(0, 120),
    title: (params.title || '2nd Admin Regional Desk').trim().slice(0, 140),
    email: cleanEmail.slice(0, 160),
    phone: (normalizeBdPhone(params.phone) || params.phone.trim()).slice(0, 30),
    passwordHash: hashPin(params.password.trim()),
    createdBy: params.actorEmail,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  store.secondAdmins[adminId] = profile;

  const act = makeActivityEntry({
    idPrefix: 'ACT-2AD',
    actionType: 'status_change',
    title: `Created 2nd Admin (${profile.adminId})`,
    details: `Main Admin created ${profile.name} (${profile.email}, Phone: ${profile.phone}) as 2nd Admin.`,
    actorEmail: params.actorEmail,
    targetIds: [profile.adminId],
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SECOND_ADMINS_COL, adminId), profile);
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
    firestoreBackendMode = 'firestore';
  } catch {
    firestoreBackendMode = 'local_sync';
  }
  return profile;
}

export async function adminToggleSecondAdminStatus(
  adminId: string,
  newStatus: AccountStatus,
  actorEmail: string
): Promise<SecondAdminProfile> {
  if (!isMainAdminEmail(actorEmail)) {
    throw new Error('Only the Main Admin can enable or disable 2nd Admin accounts.');
  }
  const now = Date.now();
  const store = readLocalStore();
  const existing = store.secondAdmins[adminId];
  if (!existing) throw new Error('2nd Admin not found.');

  const updated: SecondAdminProfile = {
    ...existing,
    status: newStatus,
    updatedAt: now,
  };
  store.secondAdmins[adminId] = updated;

  if (newStatus === 'disabled' && store.mapLocations[adminId]) {
    store.mapLocations[adminId] = {
      ...store.mapLocations[adminId],
      isVisible: false,
      updatedAt: now,
    };
  }

  const act = makeActivityEntry({
    idPrefix: 'ACT-2AS',
    actionType: 'status_change',
    title: `2nd Admin ${newStatus === 'active' ? 'Enabled' : 'Disabled'} (${adminId})`,
    details: `${existing.name} (${existing.email}) status set to ${newStatus.toUpperCase()} by Main Admin.`,
    actorEmail,
    targetIds: [adminId],
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SECOND_ADMINS_COL, adminId), updated, { merge: true });
    if (newStatus === 'disabled' && store.mapLocations[adminId]) {
      await setDoc(doc(db, MAP_LOCATIONS_COL, adminId), store.mapLocations[adminId], { merge: true });
    }
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
  } catch {
    firestoreBackendMode = 'local_sync';
  }
  return updated;
}

export async function adminResetSecondAdminPassword(
  adminId: string,
  newPassword: string,
  actorEmail: string
): Promise<void> {
  if (!isMainAdminEmail(actorEmail)) {
    throw new Error('Only the Main Admin can reset a 2nd Admin password.');
  }
  if (!newPassword || newPassword.trim().length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }
  const now = Date.now();
  const store = readLocalStore();
  const existing = store.secondAdmins[adminId];
  if (!existing) throw new Error('2nd Admin not found.');

  const updated: SecondAdminProfile = {
    ...existing,
    passwordHash: hashPin(newPassword.trim()),
    updatedAt: now,
  };
  store.secondAdmins[adminId] = updated;

  const act = makeActivityEntry({
    idPrefix: 'ACT-2AP',
    actionType: 'security_update',
    title: `Reset 2nd Admin Password (${adminId})`,
    details: `Main Admin reset login password for ${existing.name} (${existing.email}).`,
    actorEmail,
    targetIds: [adminId],
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SECOND_ADMINS_COL, adminId), updated, { merge: true });
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
  } catch {
    firestoreBackendMode = 'local_sync';
  }
}

export async function adminDeleteSecondAdmin(
  adminId: string,
  actorEmail: string
): Promise<void> {
  if (!isMainAdminEmail(actorEmail)) {
    throw new Error('Only the Main Admin can delete 2nd Admin accounts.');
  }
  const now = Date.now();
  const store = readLocalStore();
  const existing = store.secondAdmins[adminId];
  if (!existing) return;

  delete store.secondAdmins[adminId];
  delete store.mapLocations[adminId];

  const act = makeActivityEntry({
    idPrefix: 'ACT-2AD',
    actionType: 'security_update',
    title: `Removed 2nd Admin (${adminId})`,
    details: `Main Admin removed ${existing.name} (${existing.email}) from 2nd Admin roster.`,
    actorEmail,
    targetIds: [adminId],
    timestamp: now,
  });
  store.activityLogs[act.id] = act;
  writeLocalStore(store, true);

  try {
    await deleteDoc(doc(db, SECOND_ADMINS_COL, adminId));
    await deleteDoc(doc(db, MAP_LOCATIONS_COL, adminId)).catch(() => {});
    await setDoc(doc(db, ADMIN_ACTIVITY_COL, act.id), act);
  } catch {
    firestoreBackendMode = 'local_sync';
  }
}

export async function saveSecondAdminProfileAndLocation(params: {
  adminId: string;
  actorEmail: string;
  name: string;
  title?: string;
  phone: string;
  profilePhotoUrl?: string;
  mapLocation?: {
    lat: number;
    lng: number;
    address: string;
    area: string;
    city: string;
    isVisible: boolean;
  };
}): Promise<SecondAdminProfile> {
  if (isMainAdminEmail(params.actorEmail)) {
    throw new Error('Main Admin cannot publish a personal map location.');
  }
  const now = Date.now();
  const store = readLocalStore();
  const existing = store.secondAdmins[params.adminId];
  if (!existing) throw new Error('2nd Admin profile not found.');

  const nextLoc: UserMapLocation | undefined = params.mapLocation
    ? {
        lat: Number(params.mapLocation.lat),
        lng: Number(params.mapLocation.lng),
        address: (params.mapLocation.address.trim() || 'Dhaka, Bangladesh').slice(0, 240),
        area: (params.mapLocation.area.trim() || 'Dhaka').slice(0, 80),
        city: (params.mapLocation.city.trim() || 'Dhaka').slice(0, 60),
        isVisible: params.mapLocation.isVisible,
        updatedAt: now,
      }
    : existing.mapLocation;

  const updated: SecondAdminProfile = {
    ...existing,
    name: params.name.trim().slice(0, 120) || existing.name,
    ...(params.title?.trim() ? { title: params.title.trim().slice(0, 140) } : {}),
    phone: params.phone.trim().slice(0, 30) || existing.phone,
    ...(params.profilePhotoUrl !== undefined
      ? params.profilePhotoUrl
        ? { profilePhotoUrl: params.profilePhotoUrl }
        : {}
      : existing.profilePhotoUrl
        ? { profilePhotoUrl: existing.profilePhotoUrl }
        : {}),
    ...(nextLoc ? { mapLocation: nextLoc } : {}),
    updatedAt: now,
  };
  store.secondAdmins[params.adminId] = updated;

  let mapPin: AcashMapLocation | null = null;
  if (nextLoc) {
    const existingPin = store.mapLocations[params.adminId];
    mapPin = {
      creatorId: updated.adminId,
      ...(updated.firebaseUid
        ? { creatorUid: updated.firebaseUid }
        : auth.currentUser?.uid
          ? { creatorUid: auth.currentUser.uid }
          : {}),
      creatorRole: 'second_admin',
      name: updated.name,
      ...(updated.title ? { businessName: updated.title } : {}),
      phone: updated.phone,
      ...(updated.profilePhotoUrl ? { profilePhotoUrl: updated.profilePhotoUrl } : {}),
      address: nextLoc.address,
      area: nextLoc.area,
      city: nextLoc.city,
      lat: nextLoc.lat,
      lng: nextLoc.lng,
      isVisible: nextLoc.isVisible,
      locationSource: 'manual_pin',
      ...(existingPin?.ipAddress ? { ipAddress: existingPin.ipAddress } : {}),
      ...(existingPin?.isp ? { isp: existingPin.isp } : {}),
      ...(existingPin?.country ? { country: existingPin.country } : {}),
      ...(existingPin?.lastIpLocatedAt ? { lastIpLocatedAt: existingPin.lastIpLocatedAt } : {}),
      createdAt: existingPin?.createdAt || now,
      updatedAt: now,
    };
    store.mapLocations[params.adminId] = mapPin;
  }

  writeLocalStore(store, true);

  try {
    await setDoc(doc(db, SECOND_ADMINS_COL, params.adminId), updated, { merge: true });
    if (mapPin) {
      await setDoc(doc(db, MAP_LOCATIONS_COL, params.adminId), mapPin);
    }
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      console.warn('Firestore 2nd admin sync warning:', err);
    }
  }

  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Social Engagement Management: Custom Gift Cards & Live Portal Theme       */
/* -------------------------------------------------------------------------- */

function normalizePortalThemeConfig(raw?: Partial<PortalThemeConfig> | null): PortalThemeConfig {
  const src = raw || {};
  const validPreset = PORTAL_THEME_PRESETS.some((p) => p.id === src.presetId)
    ? (src.presetId as PortalThemePresetId)
    : 'classic_indigo';
  const surfacePreference: PortalThemeSurfacePreference =
    src.surfacePreference === 'light' || src.surfacePreference === 'dark'
      ? src.surfacePreference
      : 'user_choice';

  return {
    presetId: validPreset,
    ...(typeof src.customAccentHex === 'string' && src.customAccentHex
      ? { customAccentHex: src.customAccentHex.slice(0, 20) }
      : {}),
    bannerEnabled: Boolean(src.bannerEnabled),
    customBannerBn: typeof src.customBannerBn === 'string' ? src.customBannerBn.slice(0, 180) : '',
    customBannerEn: typeof src.customBannerEn === 'string' ? src.customBannerEn.slice(0, 180) : '',
    surfacePreference,
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now(),
    updatedBy:
      typeof src.updatedBy === 'string' && src.updatedBy ? src.updatedBy : MAIN_ADMIN_EMAIL,
  };
}

export function subscribeToPortalTheme(
  callback: (theme: PortalThemeConfig) => void
): Unsubscribe {
  const emitLocal = () => {
    callback(normalizePortalThemeConfig(readLocalStore().portalTheme));
  };
  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    unsubFs = onSnapshot(
      doc(db, SETTINGS_COL, PORTAL_THEME_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const cfg = normalizePortalThemeConfig(snap.data() as Partial<PortalThemeConfig>);
          const store = readLocalStore();
          store.portalTheme = cfg;
          writeLocalStore(store, false);
          callback(cfg);
        }
      },
      () => {
        emitLocal();
      }
    );
  } catch {
    // ignore
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

function normalizeGiftCardPolicy(raw?: Partial<GiftCardCatalogPolicy> | null): GiftCardCatalogPolicy {
  const src = raw || {};
  const rawOverrides = src.overrides && typeof src.overrides === 'object' ? src.overrides : {};
  const cleanOverrides: Record<string, GiftCardGovernanceEntry> = {};
  for (const [cardId, val] of Object.entries(rawOverrides)) {
    if (!val || typeof val !== 'object') continue;
    cleanOverrides[cardId] = {
      ...(typeof val.frozen === 'boolean' ? { frozen: val.frozen } : {}),
      ...(typeof val.featuredFirst === 'boolean' ? { featuredFirst: val.featuredFirst } : {}),
      ...(typeof val.pinnedOrder === 'number' ? { pinnedOrder: val.pinnedOrder } : {}),
      ...(typeof val.deleted === 'boolean' ? { deleted: val.deleted } : {}),
      updatedAt: typeof val.updatedAt === 'number' ? val.updatedAt : Date.now(),
      ...(typeof val.updatedBy === 'string' ? { updatedBy: val.updatedBy } : {}),
    };
  }
  return {
    overrides: cleanOverrides,
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now(),
    updatedBy: typeof src.updatedBy === 'string' ? src.updatedBy : '',
  };
}

export function subscribeToGiftCardPolicy(
  callback: (policy: GiftCardCatalogPolicy) => void
): Unsubscribe {
  const emitLocal = () => {
    const cfg = normalizeGiftCardPolicy(readLocalStore().giftCardPolicy);
    syncGiftCardPolicyRegistry(cfg);
    callback(cfg);
  };
  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    unsubFs = onSnapshot(
      doc(db, SETTINGS_COL, GIFT_CARD_OVERRIDES_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const cfg = normalizeGiftCardPolicy(snap.data() as Partial<GiftCardCatalogPolicy>);
          const store = readLocalStore();
          store.giftCardPolicy = cfg;
          writeLocalStore(store, false);
          syncGiftCardPolicyRegistry(cfg);
          callback(cfg);
        }
      },
      () => {
        emitLocal();
      }
    );
  } catch {
    // ignore
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

let isPurgingExpiredCards = false;

export async function purgeExpiredUserGiftCards(): Promise<number> {
  if (isPurgingExpiredCards) return 0;
  isPurgingExpiredCards = true;
  try {
    const now = Date.now();
    const store = readLocalStore();
    const expiredIds = new Set<string>();

    for (const [cardId, card] of Object.entries(store.customGiftCards || {})) {
      if (isGiftCardExpired(card, now)) {
        expiredIds.add(cardId);
        delete store.customGiftCards![cardId];
      }
    }

    try {
      const snap = await getDocs(collection(db, GIFT_CARDS_COL));
      for (const d of snap.docs) {
        const data = d.data() as CustomGiftCardRecord;
        if (isGiftCardExpired(data, now)) {
          expiredIds.add(d.id);
          await deleteDoc(doc(db, GIFT_CARDS_COL, d.id)).catch(() => {});
        }
      }
    } catch {
      // fallback to local cleanup only
    }

    if (expiredIds.size > 0) {
      for (const id of expiredIds) {
        if (store.customGiftCards?.[id]) {
          delete store.customGiftCards[id];
        }
      }
      syncCustomGiftCardsRegistry(Object.values(store.customGiftCards || {}));
      writeLocalStore(store, true);
    }

    return expiredIds.size;
  } finally {
    isPurgingExpiredCards = false;
  }
}

export function subscribeToCustomGiftCards(
  callback: (cards: CustomGiftCardRecord[]) => void
): Unsubscribe {
  const emitLocal = () => {
    const now = Date.now();
    const map = readLocalStore().customGiftCards || {};
    const activeList = Object.values(map)
      .filter((c) => !isGiftCardExpired(c, now))
      .sort((a, b) => b.createdAt - a.createdAt);
    syncCustomGiftCardsRegistry(activeList);
    callback(activeList);
  };
  emitLocal();
  const unsubLocal = subscribeLocalStore(emitLocal);

  let unsubFs: Unsubscribe = () => {};
  try {
    unsubFs = onSnapshot(
      collection(db, GIFT_CARDS_COL),
      (snap) => {
        const now = Date.now();
        const fsCards = snap.docs.map((d) => d.data() as CustomGiftCardRecord);
        const store = readLocalStore();
        const nextMap: Record<string, CustomGiftCardRecord> = {};
        let foundExpired = false;

        for (const c of fsCards) {
          if (!c || !c.cardId) continue;
          if (isGiftCardExpired(c, now)) {
            foundExpired = true;
            continue;
          }
          nextMap[c.cardId] = c;
        }
        store.customGiftCards = nextMap;
        writeLocalStore(store, false);
        const sorted = Object.values(nextMap).sort((a, b) => b.createdAt - a.createdAt);
        syncCustomGiftCardsRegistry(sorted);
        callback(sorted);

        if (foundExpired) {
          void purgeExpiredUserGiftCards();
        }
      },
      () => {
        emitLocal();
      }
    );
  } catch {
    // ignore
  }

  return () => {
    unsubLocal();
    unsubFs();
  };
}

export async function adminUpdatePortalThemeConfig(params: {
  presetId: PortalThemePresetId;
  bannerEnabled: boolean;
  customBannerBn?: string;
  customBannerEn?: string;
  surfacePreference: PortalThemeSurfacePreference;
  adminEmail: string;
}): Promise<PortalThemeConfig> {
  const now = Date.now();
  const cfg: PortalThemeConfig = normalizePortalThemeConfig({
    presetId: params.presetId,
    bannerEnabled: params.bannerEnabled,
    customBannerBn: params.customBannerBn?.trim() || '',
    customBannerEn: params.customBannerEn?.trim() || '',
    surfacePreference: params.surfacePreference,
    updatedAt: now,
    updatedBy: params.adminEmail,
  });

  const presetMeta =
    PORTAL_THEME_PRESETS.find((p) => p.id === cfg.presetId) || PORTAL_THEME_PRESETS[0];

  const store = readLocalStore();
  store.portalTheme = cfg;
  const actEntry = makeActivityEntry({
    idPrefix: 'ACT-THEME',
    actionType: 'social_engagement',
    title: `Account Portal Theme Updated · ${presetMeta.nameEn}`,
    details: `Applied "${presetMeta.nameEn}" theme (${cfg.surfacePreference}) across Customer, Agent & Merchant portals.${cfg.bannerEnabled && (cfg.customBannerEn || cfg.customBannerBn) ? ` Live Ribbon: "${cfg.customBannerBn || cfg.customBannerEn}"` : ''}`,
    actorEmail: params.adminEmail,
    timestamp: now,
  });
  store.activityLogs[actEntry.id] = actEntry;
  writeLocalStore(store, true);

  try {
    await Promise.all([
      setDoc(doc(db, SETTINGS_COL, PORTAL_THEME_DOC_ID), stripUndefined(cfg)),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
    ]);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `${SETTINGS_COL}/${PORTAL_THEME_DOC_ID}`);
    }
    throw err;
  }

  return cfg;
}

export async function adminSaveCustomGiftCard(params: {
  cardId?: string;
  titleBn: string;
  titleEn: string;
  subtitleBn?: string;
  subtitleEn?: string;
  themeCategory: CustomGiftCardRecord['themeCategory'];
  imageUrl: string;
  gradientBg?: string;
  accentHex?: string;
  particleType?: CustomGiftCardRecord['particleType'];
  defaultMessageBn: string;
  defaultMessageEn: string;
  featured?: boolean;
  featuredFirst?: boolean;
  active?: boolean;
  adminEmail: string;
}): Promise<CustomGiftCardRecord> {
  const now = Date.now();
  const titleBn = params.titleBn.trim().slice(0, 120);
  const titleEn = params.titleEn.trim().slice(0, 120);
  const imageUrl = params.imageUrl.trim();
  if (!titleBn || !titleEn) {
    throw new Error('Both Bangla and English card titles are required.');
  }
  if (!imageUrl || imageUrl.length > 640000) {
    throw new Error('Please upload a valid card image (compressed under 600KB).');
  }

  const cardId =
    params.cardId?.trim().replace(/[^a-zA-Z0-9_-]/g, '_') ||
    `custom_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const store = readLocalStore();
  const existing = store.customGiftCards?.[cardId];
  const isPinned = params.featuredFirst ?? existing?.featuredFirst ?? false;

  const record: CustomGiftCardRecord = {
    cardId,
    titleBn,
    titleEn,
    subtitleBn: (params.subtitleBn?.trim() || 'বিশেষ সাংস্কৃতিক উপহার').slice(0, 180),
    subtitleEn: (params.subtitleEn?.trim() || 'Special Cultural Gift').slice(0, 180),
    themeCategory: params.themeCategory,
    imageUrl,
    gradientBg: (params.gradientBg || 'from-rose-900 via-red-800 to-amber-700').slice(0, 120),
    accentHex: (params.accentHex || '#E11D48').slice(0, 20),
    particleType: params.particleType || 'festive_confetti',
    defaultMessageBn: clampToMaxWords(
      params.defaultMessageBn.trim() || `${titleBn}-এর আন্তরিক শুভেচ্ছা ও ভালোবাসা রইল।`,
      GIFT_CARD_MAX_WORDS
    ).slice(0, 600),
    defaultMessageEn: clampToMaxWords(
      params.defaultMessageEn.trim() || `Sending warm wishes and joy on ${titleEn}!`,
      GIFT_CARD_MAX_WORDS
    ).slice(0, 600),
    featured: params.featured ?? true,
    active: params.active ?? true,
    frozen: false,
    featuredFirst: isPinned,
    pinnedOrder: isPinned ? now : existing?.pinnedOrder || 0,
    isUserSubmitted: false,
    createdBy: existing?.createdBy || params.adminEmail,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  store.customGiftCards = {
    ...(store.customGiftCards || {}),
    [cardId]: record,
  };
  syncCustomGiftCardsRegistry(Object.values(store.customGiftCards));

  const actEntry = makeActivityEntry({
    idPrefix: 'ACT-CARD',
    actionType: 'social_engagement',
    title: existing
      ? `Gift Card Updated · ${record.titleBn}`
      : `New Live Gift Card Published · ${record.titleBn}`,
    details: `Published global card "${record.titleBn} (${record.titleEn})" live to all accounts under ${record.themeCategory}.${isPinned ? ' Pinned to Front.' : ''}`,
    actorEmail: params.adminEmail,
    targetIds: [cardId],
    timestamp: now,
  });
  store.activityLogs[actEntry.id] = actEntry;
  writeLocalStore(store, true);

  try {
    await Promise.all([
      setDoc(doc(db, GIFT_CARDS_COL, cardId), stripUndefined(record)),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
    ]);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `${GIFT_CARDS_COL}/${cardId}`);
    }
    throw err;
  }

  return record;
}

export async function userSubmitCustomGiftCard(params: {
  accountId: string;
  accountName: string;
  titleBn: string;
  titleEn?: string;
  imageUrl: string;
  defaultMessageBn?: string;
  defaultMessageEn?: string;
}): Promise<CustomGiftCardRecord> {
  const now = Date.now();
  const titleBn = params.titleBn.trim().slice(0, 120);
  const titleEn = (params.titleEn?.trim() || params.titleBn.trim()).slice(0, 120);
  const imageUrl = params.imageUrl.trim();
  if (!titleBn) {
    throw new Error('Please enter a title for your Gift Card.');
  }
  if (!imageUrl || imageUrl.length > 640000) {
    throw new Error('Please upload an image under 600KB.');
  }

  const cardId = `usr_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const expiresAt = now + USER_GIFT_CARD_TTL_MS;

  const record: CustomGiftCardRecord = {
    cardId,
    titleBn,
    titleEn,
    subtitleBn: 'ইউজার কাস্টম কার্ড · ২৪ ঘণ্টা',
    subtitleEn: 'User Custom Card · 24h',
    themeCategory: 'others',
    imageUrl,
    gradientBg: 'from-slate-900 via-indigo-950 to-amber-900',
    accentHex: '#F59E0B',
    particleType: 'festive_confetti',
    defaultMessageBn: clampToMaxWords(
      params.defaultMessageBn?.trim() || `${titleBn}-এর আন্তরিক শুভেচ্ছা ও ভালোবাসা রইল।`,
      GIFT_CARD_MAX_WORDS
    ).slice(0, 600),
    defaultMessageEn: clampToMaxWords(
      params.defaultMessageEn?.trim() || `Warm wishes from ${params.accountName}!`,
      GIFT_CARD_MAX_WORDS
    ).slice(0, 600),
    featured: false,
    active: true,
    frozen: false,
    featuredFirst: false,
    pinnedOrder: 0,
    isUserSubmitted: true,
    submittedByAccountId: params.accountId,
    submittedByName: params.accountName.slice(0, 140),
    expiresAt,
    createdBy: `${params.accountName} (${params.accountId})`,
    createdAt: now,
    updatedAt: now,
  };

  const store = readLocalStore();
  store.customGiftCards = {
    ...(store.customGiftCards || {}),
    [cardId]: record,
  };
  syncCustomGiftCardsRegistry(Object.values(store.customGiftCards));

  const actEntry = makeActivityEntry({
    idPrefix: 'ACT-USRCARD',
    actionType: 'social_engagement',
    title: `User Added 24h Card (Others) · ${record.titleBn}`,
    details: `${params.accountName} (${params.accountId}) uploaded a temporary 24h gift card in Others category. Auto-deletes after 24 hours.`,
    actorEmail: params.accountId,
    targetIds: [cardId, params.accountId],
    timestamp: now,
  });
  store.activityLogs[actEntry.id] = actEntry;
  writeLocalStore(store, true);

  try {
    await Promise.all([
      setDoc(doc(db, GIFT_CARDS_COL, cardId), stripUndefined(record)),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
    ]);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `${GIFT_CARDS_COL}/${cardId}`);
    }
    throw err;
  }

  return record;
}

export async function adminGovernAnyGiftCard(params: {
  cardId: string;
  cardTitleHint?: string;
  action:
    | 'freeze'
    | 'unfreeze'
    | 'feature_first'
    | 'unfeature'
    | 'delete'
    | 'restore'
    | 'promote_global';
  adminEmail: string;
}): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  let customRec = store.customGiftCards?.[params.cardId];
  if (!customRec) {
    try {
      const snap = await getDoc(doc(db, GIFT_CARDS_COL, params.cardId));
      if (snap.exists()) {
        customRec = snap.data() as CustomGiftCardRecord;
      }
    } catch {
      // may be built-in
    }
  }

  const label = customRec?.titleBn || params.cardTitleHint || params.cardId;
  const actionLabelMap: Record<typeof params.action, string> = {
    freeze: 'Frozen Card',
    unfreeze: 'Unfrozen Card',
    feature_first: 'Pinned Card to Front',
    unfeature: 'Unpinned Front Feature',
    delete: 'Deleted Card',
    restore: 'Restored Card',
    promote_global: 'Promoted 24h User Card Live to All Accounts',
  };

  const actEntry = makeActivityEntry({
    idPrefix: 'ACT-GOV',
    actionType: 'social_engagement',
    title: `${actionLabelMap[params.action]} · ${label}`,
    details: `Admin ${params.adminEmail} applied "${params.action}" on gift card "${label}" (${params.cardId}).`,
    actorEmail: params.adminEmail,
    targetIds: [params.cardId],
    timestamp: now,
  });
  store.activityLogs[actEntry.id] = actEntry;

  if (customRec) {
    if (params.action === 'delete') {
      if (store.customGiftCards?.[params.cardId]) {
        delete store.customGiftCards[params.cardId];
      }
      syncCustomGiftCardsRegistry(Object.values(store.customGiftCards || {}));
      writeLocalStore(store, true);

      try {
        await Promise.all([
          deleteDoc(doc(db, GIFT_CARDS_COL, params.cardId)),
          setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
        ]);
        firestoreBackendMode = 'firestore';
      } catch (err) {
        firestoreBackendMode = 'local_sync';
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.DELETE, `${GIFT_CARDS_COL}/${params.cardId}`);
        }
        throw err;
      }
      return;
    }

    const updated: CustomGiftCardRecord = { ...customRec, updatedAt: now };
    if (params.action === 'freeze') {
      updated.frozen = true;
      updated.active = false;
    } else if (params.action === 'unfreeze') {
      updated.frozen = false;
      updated.active = true;
    } else if (params.action === 'feature_first') {
      updated.featuredFirst = true;
      updated.pinnedOrder = now;
      updated.featured = true;
    } else if (params.action === 'unfeature') {
      updated.featuredFirst = false;
      updated.pinnedOrder = 0;
    } else if (params.action === 'promote_global') {
      updated.isUserSubmitted = false;
      delete updated.expiresAt;
      updated.frozen = false;
      updated.active = true;
      updated.featuredFirst = true;
      updated.pinnedOrder = now;
      updated.featured = true;
      updated.subtitleBn = 'অ্যাডমিন অনুমোদিত লাইভ কার্ড';
      updated.subtitleEn = 'Approved Global Live Card';
    }

    store.customGiftCards = {
      ...(store.customGiftCards || {}),
      [params.cardId]: updated,
    };
    syncCustomGiftCardsRegistry(Object.values(store.customGiftCards));
    writeLocalStore(store, true);

    try {
      await Promise.all([
        setDoc(doc(db, GIFT_CARDS_COL, params.cardId), stripUndefined(updated)),
        setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
      ]);
      firestoreBackendMode = 'firestore';
    } catch (err) {
      firestoreBackendMode = 'local_sync';
      if (isPermissionError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `${GIFT_CARDS_COL}/${params.cardId}`);
      }
      throw err;
    }
    return;
  }

  // Built-in card governance via acash_settings/gift_card_overrides
  const policy = normalizeGiftCardPolicy(store.giftCardPolicy);
  const prevOv = policy.overrides[params.cardId] || { updatedAt: now };
  const nextOv: GiftCardGovernanceEntry = {
    ...prevOv,
    updatedAt: now,
    updatedBy: params.adminEmail,
  };

  if (params.action === 'freeze') {
    nextOv.frozen = true;
  } else if (params.action === 'unfreeze') {
    nextOv.frozen = false;
  } else if (params.action === 'feature_first') {
    nextOv.featuredFirst = true;
    nextOv.pinnedOrder = now;
  } else if (params.action === 'unfeature') {
    nextOv.featuredFirst = false;
    nextOv.pinnedOrder = 0;
  } else if (params.action === 'delete') {
    nextOv.deleted = true;
    nextOv.featuredFirst = false;
  } else if (params.action === 'restore') {
    nextOv.deleted = false;
    nextOv.frozen = false;
  }

  const nextPolicy: GiftCardCatalogPolicy = {
    overrides: {
      ...policy.overrides,
      [params.cardId]: nextOv,
    },
    updatedAt: now,
    updatedBy: params.adminEmail,
  };

  store.giftCardPolicy = nextPolicy;
  syncGiftCardPolicyRegistry(nextPolicy);
  writeLocalStore(store, true);

  try {
    await Promise.all([
      setDoc(doc(db, SETTINGS_COL, GIFT_CARD_OVERRIDES_DOC_ID), stripUndefined(nextPolicy)),
      setDoc(doc(db, ADMIN_ACTIVITY_COL, actEntry.id), actEntry),
    ]);
    firestoreBackendMode = 'firestore';
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `${SETTINGS_COL}/${GIFT_CARD_OVERRIDES_DOC_ID}`);
    }
    throw err;
  }
}

export async function adminToggleCustomGiftCardStatus(
  cardId: string,
  updates: { active?: boolean; featured?: boolean },
  adminEmail: string
): Promise<void> {
  if (typeof updates.active === 'boolean') {
    await adminGovernAnyGiftCard({
      cardId,
      action: updates.active ? 'unfreeze' : 'freeze',
      adminEmail,
    });
    return;
  }
  if (typeof updates.featured === 'boolean') {
    await adminGovernAnyGiftCard({
      cardId,
      action: updates.featured ? 'feature_first' : 'unfeature',
      adminEmail,
    });
  }
}

export async function adminDeleteCustomGiftCard(
  cardId: string,
  adminEmail: string
): Promise<void> {
  await adminGovernAnyGiftCard({
    cardId,
    action: 'delete',
    adminEmail,
  });
}



