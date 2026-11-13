import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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
  AcashMapLocation,
  AcashTransaction,
  AcashUser,
  AccountStatus,
  AdminActivityLog,
  AdminActivityType,
  AdminNotification,
  BillerId,
  BoothStatus,
  CreatorMapRole,
  FeeBreakdown,
  FeeConfig,
  KycInfo,
  MainAdminCredentialConfig,
  MainTreasuryVault,
  OperatorId,
  ReferralSource,
  SecondAdminProfile,
  TransactionType,
  UserGender,
  UserMapLocation,
  UserRole,
} from '../types/acash';

const USERS_COL = 'acash_users';
const DIRECTORY_COL = 'acash_directory';
const TX_COL = 'acash_transactions';
const BOOTHS_COL = 'acash_booths';
const MAP_LOCATIONS_COL = 'acash_map_locations';
const SECOND_ADMINS_COL = 'acash_second_admins';
const SETTINGS_COL = 'acash_settings';
const ADMIN_NOTIF_COL = 'acash_admin_notifications';
const ADMIN_ACTIVITY_COL = 'acash_admin_activity_logs';
const FEE_DOC_ID = 'fee_config';
const ADMIN_ALERT_DOC_ID = 'admin_alert';
const MAIN_ADMIN_CREDS_DOC_ID = 'main_admin_credentials';
const TREASURY_VAULT_DOC_ID = 'treasury_vault';
const LOCAL_DB_KEY = 'acash_local_db_v1';
const LOCAL_SYNC_EVENT = 'acash-db-sync';

export const MAIN_ADMIN_EMAIL = 'aiub.muhib@gmail.com';
export const DEFAULT_MAIN_ADMIN_PASSWORD = '017muhibAa@';
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
  updatedAt: Date.now(),
  updatedBy: MAIN_ADMIN_EMAIL,
};

export function normalizeTreasuryVault(raw?: Partial<MainTreasuryVault> | null): MainTreasuryVault {
  const src = raw || {};
  const numOrZero = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0;
  };
  return {
    vaultId: 'ADMIN-TREASURY',
    balance: numOrZero(src.balance),
    totalMinted: numOrZero(src.totalMinted),
    totalDisbursed: numOrZero(src.totalDisbursed),
    ...(typeof src.lastMintAmount === 'number' ? { lastMintAmount: src.lastMintAmount } : {}),
    ...(typeof src.lastMintNote === 'string' && src.lastMintNote ? { lastMintNote: src.lastMintNote } : {}),
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

function normalizeAccountIdInput(input: string): string {
  const clean = input.trim().toUpperCase().replace(/\s+/g, '');
  const match = clean.match(/^([UAM])-?(\d{6})$/);
  if (match) return `${match[1]}-${match[2]}`;
  return clean;
}

// ---------- Synchronized Resilient Store ----------
interface LocalStoreState {
  users: Record<string, AcashUser>;
  transactions: Record<string, AcashTransaction>;
  booths: Record<string, AcashBooth>;
  mapLocations: Record<string, AcashMapLocation>;
  secondAdmins: Record<string, SecondAdminProfile>;
  notifications: Record<string, AdminNotification>;
  activityLogs: Record<string, AdminActivityLog>;
  feeConfig: FeeConfig;
  adminAlertEmail: string;
  mainAdminCredentials: MainAdminCredentialConfig;
  treasuryVault: MainTreasuryVault;
}

let firestoreBackendMode: 'firestore' | 'local_sync' = 'firestore';

export function getBackendSyncMode(): 'firestore' | 'local_sync' {
  return firestoreBackendMode;
}

function buildSeedUsers(): Record<string, AcashUser> {
  const now = Date.now();
  const list: AcashUser[] = [
    {
      accountId: 'U-100001',
      role: 'U',
      name: 'Nafis Rahman',
      gender: 'male',
      termsAcceptedAt: now - 86400000 * 7,
      phone: '01711000001',
      email: 'nafis.customer@gmail.com',
      pinHash: hashPin('1234'),
      balance: 125000,
      commissionBalance: 0,
      status: 'active',
      verified: true,
      referredByType: 'agent',
      referredByAgentId: 'A-200001',
      referredByAgentPhone: '01811000002',
      referredByAgentName: 'Dhaka Central Agent Point',
      createdAt: now - 86400000 * 7,
      lastActiveAt: now,
    },
    {
      accountId: 'A-200001',
      role: 'A',
      name: 'Karim Uddin',
      businessName: 'Dhaka Central Agent Point',
      gender: 'male',
      termsAcceptedAt: now - 86400000 * 14,
      phone: '01811000002',
      email: 'karim.agent@gmail.com',
      pinHash: hashPin('1234'),
      balance: 450000,
      commissionBalance: 2480.5,
      status: 'active',
      verified: true,
      referredByType: 'own_app',
      createdAt: now - 86400000 * 14,
      lastActiveAt: now,
    },
    {
      accountId: 'M-300001',
      role: 'M',
      name: 'Farhana Yasmin',
      businessName: 'Aarong Flagship Store',
      gender: 'female',
      termsAcceptedAt: now - 86400000 * 21,
      phone: '01911000003',
      email: 'aarong.merchant@gmail.com',
      pinHash: hashPin('1234'),
      staffPinHash: hashPin('0000'),
      balance: 280000,
      commissionBalance: 0,
      status: 'active',
      verified: true,
      referredByType: 'own_app',
      createdAt: now - 86400000 * 21,
      lastActiveAt: now,
    },
    {
      accountId: 'M-300002',
      role: 'M',
      name: 'Tariq Mahmud',
      businessName: 'Walton Wholesale Supply',
      gender: 'male',
      termsAcceptedAt: now - 86400000 * 10,
      phone: '01611000004',
      email: 'walton.b2b@gmail.com',
      pinHash: hashPin('1234'),
      staffPinHash: hashPin('0000'),
      balance: 190000,
      commissionBalance: 0,
      status: 'active',
      verified: true,
      referredByType: 'agent',
      referredByAgentId: 'A-200001',
      referredByAgentPhone: '01811000002',
      referredByAgentName: 'Dhaka Central Agent Point',
      createdAt: now - 86400000 * 10,
      lastActiveAt: now,
    },
  ];

  const map: Record<string, AcashUser> = {};
  for (const u of list) map[u.accountId] = u;
  return map;
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
      agentAccountId: 'A-200001',
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
      agentAccountId: 'A-200001',
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
      agentAccountId: 'A-200001',
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
      agentAccountId: 'A-200001',
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
      agentAccountId: 'A-200001',
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
      agentAccountId: 'A-200001',
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

function makeAvatarSvgDataUrl(initials: string, bgHex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bgHex}"/><stop offset="100%" stop-color="#1E103C"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="64" y="75" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="44" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildSeedSecondAdmins(): Record<string, SecondAdminProfile> {
  const now = Date.now();
  const list: SecondAdminProfile[] = [
    {
      adminId: 'ADM-200001',
      name: 'Rafiqul Islam',
      title: 'Dhaka Metro 2nd Admin & Field Desk',
      email: 'rafiq.admin@acash.com',
      phone: '01799000101',
      passwordHash: hashPin('Acash2nd@2026'),
      createdBy: MAIN_ADMIN_EMAIL,
      profilePhotoUrl: makeAvatarSvgDataUrl('RI', '#0EA5E9'),
      mapLocation: {
        lat: 23.7509,
        lng: 90.3935,
        address: 'Karwan Bazar Regional Admin Desk, Level 3, Dhaka 1215',
        area: 'Karwan Bazar',
        city: 'Dhaka',
        isVisible: true,
        updatedAt: now,
      },
      status: 'active',
      createdAt: now - 86400000 * 25,
      updatedAt: now,
    },
    {
      adminId: 'ADM-200002',
      name: 'Nusrat Jahan',
      title: 'Uttara Zone 2nd Admin Coordinator',
      email: 'nusrat.admin@acash.com',
      phone: '01799000102',
      passwordHash: hashPin('Acash2nd@2026'),
      createdBy: MAIN_ADMIN_EMAIL,
      profilePhotoUrl: makeAvatarSvgDataUrl('NJ', '#0284C7'),
      mapLocation: {
        lat: 23.8728,
        lng: 90.3984,
        address: 'Sector 11 Regional Verification Desk, Uttara, Dhaka 1230',
        area: 'Uttara',
        city: 'Dhaka',
        isVisible: true,
        updatedAt: now,
      },
      status: 'active',
      createdAt: now - 86400000 * 18,
      updatedAt: now,
    },
  ];
  const map: Record<string, SecondAdminProfile> = {};
  for (const a of list) map[a.adminId] = a;
  return map;
}

function buildSeedMapLocations(): Record<string, AcashMapLocation> {
  const now = Date.now();
  const list: AcashMapLocation[] = [
    {
      creatorId: 'A-200001',
      creatorRole: 'agent',
      name: 'Karim Uddin',
      businessName: 'Dhaka Central Agent Point',
      phone: '01811000002',
      profilePhotoUrl: makeAvatarSvgDataUrl('KU', '#10B981'),
      address: '42 Dilkusha C/A, Motijheel, Dhaka 1000',
      area: 'Motijheel',
      city: 'Dhaka',
      lat: 23.7285,
      lng: 90.4152,
      isVisible: true,
      createdAt: now - 86400000 * 14,
      updatedAt: now,
    },
    {
      creatorId: 'M-300001',
      creatorRole: 'merchant',
      name: 'Farhana Yasmin',
      businessName: 'Aarong Flagship Store',
      phone: '01911000003',
      profilePhotoUrl: makeAvatarSvgDataUrl('FY', '#C026D3'),
      address: 'Lalmatia / Satmasjid Rd, Dhanmondi 27, Dhaka 1209',
      area: 'Dhanmondi',
      city: 'Dhaka',
      lat: 23.7536,
      lng: 90.3712,
      isVisible: true,
      createdAt: now - 86400000 * 21,
      updatedAt: now,
    },
    {
      creatorId: 'M-300002',
      creatorRole: 'merchant',
      name: 'Tariq Mahmud',
      businessName: 'Walton Wholesale Supply',
      phone: '01611000004',
      profilePhotoUrl: makeAvatarSvgDataUrl('TM', '#9333EA'),
      address: 'Bashundhara Gate Commercial Complex, Dhaka 1229',
      area: 'Bashundhara',
      city: 'Dhaka',
      lat: 23.8135,
      lng: 90.4248,
      isVisible: true,
      createdAt: now - 86400000 * 10,
      updatedAt: now,
    },
    {
      creatorId: 'ADM-200001',
      creatorRole: 'second_admin',
      name: 'Rafiqul Islam',
      businessName: 'Dhaka Metro 2nd Admin & Field Desk',
      phone: '01799000101',
      profilePhotoUrl: makeAvatarSvgDataUrl('RI', '#0EA5E9'),
      address: 'Karwan Bazar Regional Admin Desk, Level 3, Dhaka 1215',
      area: 'Karwan Bazar',
      city: 'Dhaka',
      lat: 23.7509,
      lng: 90.3935,
      isVisible: true,
      createdAt: now - 86400000 * 25,
      updatedAt: now,
    },
    {
      creatorId: 'ADM-200002',
      creatorRole: 'second_admin',
      name: 'Nusrat Jahan',
      businessName: 'Uttara Zone 2nd Admin Coordinator',
      phone: '01799000102',
      profilePhotoUrl: makeAvatarSvgDataUrl('NJ', '#0284C7'),
      address: 'Sector 11 Regional Verification Desk, Uttara, Dhaka 1230',
      area: 'Uttara',
      city: 'Dhaka',
      lat: 23.8728,
      lng: 90.3984,
      isVisible: true,
      createdAt: now - 86400000 * 18,
      updatedAt: now,
    },
  ];
  const map: Record<string, AcashMapLocation> = {};
  for (const item of list) map[item.creatorId] = item;
  return map;
}

function buildDefaultMainAdminCredentials(): MainAdminCredentialConfig {
  return {
    email: MAIN_ADMIN_EMAIL,
    passwordHash: hashPin(DEFAULT_MAIN_ADMIN_PASSWORD),
    updatedAt: Date.now(),
    updatedBy: 'System Initialization',
  };
}

function readLocalStore(): LocalStoreState {
  const defaultCreds = buildDefaultMainAdminCredentials();
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalStoreState;
      const seedUsers = buildSeedUsers();
      const seedBooths = buildSeedBooths();
      const seedMapLocations = buildSeedMapLocations();
      const seedSecondAdmins = buildSeedSecondAdmins();
      const mergedUsers = { ...seedUsers, ...(parsed.users || {}) };
      const mergedBooths = { ...seedBooths, ...(parsed.booths || {}) };
      const mergedMapLocations = { ...seedMapLocations, ...(parsed.mapLocations || {}) };
      const mergedSecondAdmins = { ...seedSecondAdmins, ...(parsed.secondAdmins || {}) };
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
      return {
        users: mergedUsers,
        transactions: parsed.transactions || {},
        booths: mergedBooths,
        mapLocations: mergedMapLocations,
        secondAdmins: mergedSecondAdmins,
        notifications: parsed.notifications || buildDefaultNotifications(),
        activityLogs: parsed.activityLogs || buildDefaultActivityLogs(),
        feeConfig: normalizeFeeConfig(parsed.feeConfig),
        adminAlertEmail: normalizedAlertEmail,
        mainAdminCredentials: storedCreds,
        treasuryVault: normalizeTreasuryVault(parsed.treasuryVault),
      };
    }
  } catch {
    // ignore parse failure
  }
  const initial: LocalStoreState = {
    users: buildSeedUsers(),
    transactions: {},
    booths: buildSeedBooths(),
    mapLocations: buildSeedMapLocations(),
    secondAdmins: buildSeedSecondAdmins(),
    notifications: buildDefaultNotifications(),
    activityLogs: buildDefaultActivityLogs(),
    feeConfig: normalizeFeeConfig(DEFAULT_FEE_CONFIG),
    adminAlertEmail: DEFAULT_ADMIN_ALERT_EMAIL,
    mainAdminCredentials: defaultCreds,
    treasuryVault: normalizeTreasuryVault(DEFAULT_TREASURY_VAULT),
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
  options?: { targetIsAdmin?: boolean }
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

      const seedUsers = Object.values(buildSeedUsers());
      for (const u of seedUsers) {
        const ref = doc(db, USERS_COL, u.accountId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, u);
        }
        const dirRef = doc(db, DIRECTORY_COL, u.accountId);
        const dirSnap = await getDoc(dirRef);
        if (!dirSnap.exists()) {
          await setDoc(dirRef, toDirectoryEntry(u));
        }
      }

      const seedBooths = Object.values(buildSeedBooths());
      for (const b of seedBooths) {
        const bRef = doc(db, BOOTHS_COL, b.boothId);
        const bSnap = await getDoc(bRef);
        if (!bSnap.exists()) {
          await setDoc(bRef, b);
        }
      }

      const seedSecondAdmins = Object.values(buildSeedSecondAdmins());
      for (const sa of seedSecondAdmins) {
        const saRef = doc(db, SECOND_ADMINS_COL, sa.adminId);
        const saSnap = await getDoc(saRef);
        if (!saSnap.exists()) {
          await setDoc(saRef, sa);
        }
      }

      const seedMapLocs = Object.values(buildSeedMapLocations());
      for (const loc of seedMapLocs) {
        const lRef = doc(db, MAP_LOCATIONS_COL, loc.creatorId);
        const lSnap = await getDoc(lRef);
        if (!lSnap.exists()) {
          await setDoc(lRef, loc);
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

  await ensureFirebaseAuthSession();

  // 1. Try full user record in acash_users (succeeds for owner or Admin)
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
        where('email', '==', clean.toLowerCase()),
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

  // 2. Try non-PII cross-portal routing directory (acash_directory)
  const resolveFromDirectoryEntry = (entry: AcashDirectoryEntry): AcashUser => {
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
        return resolveFromDirectoryEntry(dirSnap.data() as AcashDirectoryEntry);
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
        return resolveFromDirectoryEntry(dirPhoneSnap.docs[0].data() as AcashDirectoryEntry);
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
          return directoryEntryToStubUser({
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
          return directoryEntryToStubUser({
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

  // 4. Fallback to local synchronized store (sandbox & locally registered accounts)
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

  if (!/^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/i.test(email)) {
    throw new Error('Only a valid Gmail address (@gmail.com) can be used to create an Acash ID.');
  }
  if (!params.termsAcceptedAt) {
    throw new Error('Terms & Conditions Agreement (TCA) acceptance is required.');
  }
  if (params.gender !== 'male' && params.gender !== 'female') {
    throw new Error('Gender selection is required.');
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

  // Check duplicate in local store & Firestore directory
  const existingLocal = findInLocalStore(phone);
  if (existingLocal) {
    throw new Error('An Acash account with this mobile number already exists.');
  }
  try {
    const dupDirSnap = await getDocs(
      query(collection(db, DIRECTORY_COL), where('phone', '==', phone), limit(1))
    );
    if (!dupDirSnap.empty) {
      throw new Error('An Acash account with this mobile number already exists.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      throw err;
    }
  }

  const referredByType: ReferralSource = params.referredByType === 'agent' ? 'agent' : 'own_app';
  let referredByAgentId: string | undefined;
  let referredByAgentPhone: string | undefined;
  let referredByAgentName: string | undefined;

  if (referredByType === 'agent') {
    const rawRef = (params.referredByAgentIdentifier || '').trim();
    if (!rawRef) {
      throw new Error('Please enter the referring Agent ID (e.g. A-200001) or Agent mobile number.');
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
      } else if (/^01\d{9}$/.test(normalizedRefPhone)) {
        referredByAgentPhone = normalizedRefPhone;
      } else {
        throw new Error(
          'Enter a valid Agent ID (e.g. A-200001) or 11-digit Agent mobile number (e.g. 01811000002).'
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
  const activeUid = params.firebaseUid || auth.currentUser?.uid;

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

  try {
    const fbUser = await ensureFirebaseAuthSession();
    if (fbUser && fbUser.emailVerified) {
      await setDoc(doc(db, USERS_COL, accountId), newUser);
      await setDoc(doc(db, DIRECTORY_COL, accountId), toDirectoryEntry(newUser));
      await setDoc(doc(db, ADMIN_NOTIF_COL, regNotif.id), regNotif);
      firestoreBackendMode = 'firestore';
    } else {
      firestoreBackendMode = 'local_sync';
    }
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      handleFirestoreError(err, OperationType.CREATE, `${USERS_COL}/${accountId}`);
    }
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

  return newUser;
}

export async function authenticateAcashUser(params: {
  identifier: string;
  pin: string;
  expectedRole?: UserRole;
}): Promise<AcashUser> {
  const user = await findUserByIdentifier(params.identifier);
  if (!user) {
    throw new Error('Account not found. Check your Acash ID (e.g. U-100001), phone, or Gmail.');
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
    if (auth.currentUser?.emailVerified && u.firebaseUid === auth.currentUser.uid) {
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
        } else if (!snap.metadata.fromCache) {
          // Only emit null if neither Firestore server nor local store has this user
          emitLocalIfFound();
        }
      },
      () => {
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
  let attachedUid: string | null = null;

  const attachForUid = (uid: string | undefined) => {
    if (!uid || attachedUid === uid) return;
    attachedUid = uid;
    unsubSenderFs();
    unsubReceiverFs();
    try {
      const mergeSnap = (docs: Array<{ data: () => unknown }>) => {
        const fsTxs = docs.map((d) => d.data() as AcashTransaction);
        if (fsTxs.length > 0) {
          const store = readLocalStore();
          for (const tx of fsTxs) {
            store.transactions[tx.txId] = tx;
          }
          writeLocalStore(store, false);
        }
        emitLocal();
      };

      unsubSenderFs = onSnapshot(
        query(collection(db, TX_COL), where('senderUid', '==', uid), limit(150)),
        (snap) => mergeSnap(snap.docs),
        () => emitLocal()
      );
      unsubReceiverFs = onSnapshot(
        query(collection(db, TX_COL), where('receiverUid', '==', uid), limit(150)),
        (snap) => mergeSnap(snap.docs),
        () => emitLocal()
      );
    } catch {
      // ignore
    }
  };

  attachForUid(auth.currentUser?.uid);
  const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
    if (fbUser?.uid) {
      attachForUid(fbUser.uid);
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
  let unsubDirFs: Unsubscribe = () => {};
  try {
    const q = query(collection(db, USERS_COL), orderBy('createdAt', 'desc'));
    unsubFs = onSnapshot(
      q,
      (snap) => {
        const fsUsers = snap.docs.map((d) => d.data() as AcashUser);
        if (fsUsers.length > 0) {
          const store = readLocalStore();
          for (const u of fsUsers) {
            store.users[u.accountId] = u;
          }
          writeLocalStore(store, false);
          // Backfill directory entries for existing accounts when signed in as Admin
          if (auth.currentUser?.emailVerified && isMainAdminEmail(auth.currentUser.email)) {
            for (const u of fsUsers) {
              void setDoc(doc(db, DIRECTORY_COL, u.accountId), toDirectoryEntry(u), {
                merge: true,
              }).catch(() => {});
            }
          }
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

  try {
    const qDir = query(collection(db, DIRECTORY_COL), orderBy('createdAt', 'desc'));
    unsubDirFs = onSnapshot(
      qDir,
      (snap) => {
        const entries = snap.docs.map((d) => d.data() as AcashDirectoryEntry);
        if (entries.length > 0) {
          const store = readLocalStore();
          let changed = false;
          for (const entry of entries) {
            const existing = store.users[entry.accountId];
            if (!existing) {
              store.users[entry.accountId] = directoryEntryToStubUser(entry);
              changed = true;
            } else {
              const updated: AcashUser = {
                ...existing,
                name: entry.name || existing.name,
                ...(entry.businessName ? { businessName: entry.businessName } : {}),
                phone: entry.phone || existing.phone,
                status: entry.status,
                verified: entry.verified,
                ...(entry.firebaseUid ? { firebaseUid: entry.firebaseUid } : {}),
              };
              store.users[entry.accountId] = updated;
              changed = true;
            }
          }
          if (changed) {
            writeLocalStore(store, false);
          }
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

  return () => {
    unsubLocal();
    unsubFs();
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
  try {
    const q = query(collection(db, TX_COL), orderBy('createdAt', 'desc'), limit(300));
    unsubFs = onSnapshot(
      q,
      (snap) => {
        const fsTxs = snap.docs.map((d) => d.data() as AcashTransaction);
        if (fsTxs.length > 0) {
          const store = readLocalStore();
          for (const tx of fsTxs) {
            store.transactions[tx.txId] = tx;
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

  return () => {
    unsubLocal();
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

  return () => {
    unsubLocal();
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

  return () => {
    unsubLocal();
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
  const senderLocal = store.users[params.senderId];
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

  const effectiveFeeConfig = normalizeFeeConfig(
    store.feeConfig && store.feeConfig.updatedAt >= (params.feeConfig?.updatedAt || 0)
      ? store.feeConfig
      : params.feeConfig
  );

  const { fee, breakdown } = calculateFeeBreakdown(params.type, amount, effectiveFeeConfig, {
    targetIsAdmin: isAdminTarget,
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

  const cachedReceiver = receiverUser ? store.users[receiverUser.accountId] : null;
  const resolvedReceiver = receiverUser
    ? cachedReceiver && cachedReceiver.pinHash
      ? cachedReceiver
      : receiverUser
    : null;
  if (resolvedReceiver && resolvedReceiver.status !== 'active') {
    throw new Error('Recipient account is disabled.');
  }

  const activeUid = auth.currentUser?.uid;
  const txRecord: AcashTransaction = {
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
    createdAt: now,
  };

  // Apply balance mutations locally
  let newSenderBalance = Number((senderLocal.balance - totalDebited).toFixed(2));
  let newSenderComm = senderLocal.commissionBalance || 0;
  if (params.type === 'cash_in' && !requiresAdminApproval) {
    newSenderBalance = Number((newSenderBalance + breakdown.agentAmount).toFixed(2));
    newSenderComm = Number((newSenderComm + breakdown.agentAmount).toFixed(2));
  }
  store.users[senderLocal.accountId] = {
    ...senderLocal,
    balance: newSenderBalance,
    commissionBalance: newSenderComm,
    lastActiveAt: now,
  };

  const getsCashOutCommission =
    Boolean(resolvedReceiver) &&
    (params.type === 'cash_out' ||
      (params.type === 'merchant_cash_out' && resolvedReceiver?.role === 'A'));
  const creditToReceiver = getsCashOutCommission
    ? Number((amount + breakdown.agentAmount).toFixed(2))
    : amount;
  const receiverCommInc = getsCashOutCommission ? breakdown.agentAmount : 0;

  if (!requiresAdminApproval && resolvedReceiver && cachedReceiver && cachedReceiver.pinHash) {
    store.users[resolvedReceiver.accountId] = {
      ...cachedReceiver,
      balance: Number((cachedReceiver.balance + creditToReceiver).toFixed(2)),
      commissionBalance: Number(((cachedReceiver.commissionBalance || 0) + receiverCommInc).toFixed(2)),
      lastActiveAt: now,
    };
  }

  store.transactions[txId] = txRecord;

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
    store.notifications[txNotif.id] = txNotif;
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
    store.notifications[txNotif.id] = txNotif;
  }

  writeLocalStore(store, true);

  // Sync atomically to Firestore when accessible (using increment on receiver to respect PII isolation)
  const runFirestoreSync = async (includeReceiverUpdate: boolean) => {
    await runTransaction(db, async (transaction) => {
      const senderRef = doc(db, USERS_COL, params.senderId);
      const senderSnap = await transaction.get(senderRef);
      if (senderSnap.exists()) {
        transaction.update(senderRef, {
          balance: store.users[senderLocal.accountId].balance,
          commissionBalance: store.users[senderLocal.accountId].commissionBalance,
          lastActiveAt: now,
        });
      } else {
        transaction.set(senderRef, store.users[senderLocal.accountId]);
      }

      if (includeReceiverUpdate && !requiresAdminApproval && resolvedReceiver) {
        const receiverRef = doc(db, USERS_COL, resolvedReceiver.accountId);
        transaction.update(receiverRef, {
          balance: increment(creditToReceiver),
          ...(receiverCommInc > 0 ? { commissionBalance: increment(receiverCommInc) } : {}),
          lastActiveAt: now,
        });
      }

      transaction.set(doc(db, TX_COL, txId), txRecord);
      if (txNotif) {
        transaction.set(doc(db, ADMIN_NOTIF_COL, txNotif.id), txNotif);
      }
    });
  };

  try {
    await runFirestoreSync(true);
    firestoreBackendMode = 'firestore';
  } catch {
    // Fallback if receiverRef is a local-only seed account not yet initialized in Firestore
    try {
      await runFirestoreSync(false);
      firestoreBackendMode = 'firestore';
    } catch {
      firestoreBackendMode = 'local_sync';
    }
  }

  if (requiresAdminApproval) {
    await sendHighValuePendingEmails({
      senderEmail: senderLocal.email,
      senderName: senderLocal.businessName || senderLocal.name,
      senderId: senderLocal.accountId,
      adminEmail: getAdminAlertEmail(),
      receiverName: txRecord.receiverName,
      receiverId: txRecord.receiverId,
      amount: txRecord.amount,
      txType: txRecord.type,
      txHash: txRecord.txHash,
    });
  }

  return txRecord;
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

  const merchant = store.users[params.merchantId];
  if (!merchant) throw new Error('Merchant account not found.');
  if (merchant.status !== 'active') throw new Error('Merchant account is disabled.');
  if (merchant.pinHash !== hashPin(params.pin)) throw new Error('Incorrect Security PIN.');
  if (merchant.balance < refundAmt) {
    throw new Error('Insufficient Merchant balance to process this refund.');
  }

  const customer = store.users[orig.senderId];
  if (!customer) throw new Error('Customer account not found.');

  const now = Date.now();
  const refundTxId = generateTxId();
  const refundTxHash = generateTxHash();
  const updatedRefundedTotal = Number(((orig.refundedAmount || 0) + refundAmt).toFixed(2));
  const newOrigStatus = updatedRefundedTotal >= orig.amount ? 'refunded' : 'partially_refunded';

  store.users[merchant.accountId] = {
    ...merchant,
    balance: Number((merchant.balance - refundAmt).toFixed(2)),
    lastActiveAt: now,
  };
  store.users[customer.accountId] = {
    ...customer,
    balance: Number((customer.balance + refundAmt).toFixed(2)),
    lastActiveAt: now,
  };
  store.transactions[orig.txId] = {
    ...orig,
    refundedAmount: updatedRefundedTotal,
    status: newOrigStatus,
  };

  const refundRecord: AcashTransaction = {
    txId: refundTxId,
    txHash: refundTxHash,
    type: 'refund',
    senderId: merchant.accountId,
    senderName: merchant.businessName || merchant.name,
    senderPhone: merchant.phone,
    senderRole: 'M',
    receiverId: customer.accountId,
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

  store.transactions[refundTxId] = refundRecord;
  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, USERS_COL, merchant.accountId), store.users[merchant.accountId]);
      transaction.set(doc(db, USERS_COL, customer.accountId), store.users[customer.accountId]);
      transaction.set(doc(db, TX_COL, orig!.txId), store.transactions[orig!.txId]);
      transaction.set(doc(db, TX_COL, refundTxId), refundRecord);
    });
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return refundRecord;
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
  const currentVault = normalizeTreasuryVault(store.treasuryVault);
  const updatedVault: MainTreasuryVault = {
    ...currentVault,
    balance: Number((currentVault.balance + amt).toFixed(2)),
    totalMinted: Number((currentVault.totalMinted + amt).toFixed(2)),
    lastMintAmount: amt,
    lastMintNote: noteText.slice(0, 200),
    updatedAt: now,
    updatedBy: params.actorEmail,
  };
  store.treasuryVault = updatedVault;

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

  store.transactions[txId] = txRecord;

  const mintNotif: AdminNotification = {
    id: `NTF-MINT-${txId}`,
    title: `Main Admin Treasury Mint (+৳${amt.toLocaleString()})`,
    message: `Main Admin added ৳${amt.toLocaleString()} to ADMIN-TREASURY. New Vault Balance: ৳${updatedVault.balance.toLocaleString()}.`,
    category: 'treasury',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'treasury',
  };
  store.notifications[mintNotif.id] = mintNotif;

  const mintActivity = makeActivityEntry({
    idPrefix: 'ACT-MINT',
    actionType: 'credit_add',
    title: `Main Admin Treasury Mint (+৳${amt.toLocaleString()})`,
    details: `Main Admin (${params.actorEmail}) minted ৳${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} into ADMIN-TREASURY. Vault Balance: ৳${updatedVault.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Note: ${noteText}`,
    actorEmail: params.actorEmail,
    targetIds: ['ADMIN-TREASURY'],
    amount: amt,
    timestamp: now,
  });
  store.activityLogs[mintActivity.id] = mintActivity;

  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID), updatedVault);
      transaction.set(doc(db, TX_COL, txId), txRecord);
      transaction.set(doc(db, ADMIN_NOTIF_COL, mintNotif.id), mintNotif);
      transaction.set(doc(db, ADMIN_ACTIVITY_COL, mintActivity.id), mintActivity);
    });
    firestoreBackendMode = 'firestore';
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return { vault: updatedVault, tx: txRecord };
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
  const currentTarget = store.users[targetUser.accountId] || targetUser;
  store.users[targetUser.accountId] = {
    ...currentTarget,
    balance: Number((currentTarget.balance + amt).toFixed(2)),
    lastActiveAt: now,
  };

  const currentVault = normalizeTreasuryVault(store.treasuryVault);
  const deductedFromVault = Math.min(currentVault.balance, amt);
  const updatedVault: MainTreasuryVault = {
    ...currentVault,
    balance: Number(Math.max(0, currentVault.balance - deductedFromVault).toFixed(2)),
    totalDisbursed: Number((currentVault.totalDisbursed + amt).toFixed(2)),
    updatedAt: now,
    updatedBy: params.adminEmail,
  };
  store.treasuryVault = updatedVault;

  const txRecord: AcashTransaction = {
    txId,
    txHash,
    type: 'admin_credit',
    senderId: 'ADMIN-TREASURY',
    senderName: 'Acash Admin Treasury',
    senderPhone: 'SYSTEM',
    senderRole: 'ADMIN',
    receiverId: currentTarget.accountId,
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

  store.transactions[txId] = txRecord;
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
  store.notifications[creditNotif.id] = creditNotif;

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
  store.activityLogs[creditActivity.id] = creditActivity;

  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      if (currentTarget.pinHash) {
        transaction.set(
          doc(db, USERS_COL, currentTarget.accountId),
          store.users[currentTarget.accountId]
        );
      } else {
        transaction.update(doc(db, USERS_COL, currentTarget.accountId), {
          balance: increment(amt),
          lastActiveAt: now,
        });
      }
      transaction.set(doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID), updatedVault);
      transaction.set(doc(db, TX_COL, txId), txRecord);
      transaction.set(doc(db, ADMIN_NOTIF_COL, creditNotif.id), creditNotif);
      transaction.set(doc(db, ADMIN_ACTIVITY_COL, creditActivity.id), creditActivity);
    });
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return txRecord;
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
  const currentTo = store.users[toUser.accountId] || toUser;
  const currentFrom = fromUser ? store.users[fromUser.accountId] || fromUser : null;

  if (currentFrom && currentFrom.balance < amt) {
    throw new Error(
      `Source account ${currentFrom.accountId} has insufficient balance (${currentFrom.balance.toFixed(2)} BDT).`
    );
  }

  const now = Date.now();
  const txId = generateTxId();
  const txHash = generateTxHash();

  if (currentFrom) {
    store.users[currentFrom.accountId] = {
      ...currentFrom,
      balance: Number((currentFrom.balance - amt).toFixed(2)),
      lastActiveAt: now,
    };
  }

  if (isFromTreasury) {
    const currentVault = normalizeTreasuryVault(store.treasuryVault);
    const deducted = Math.min(currentVault.balance, amt);
    store.treasuryVault = {
      ...currentVault,
      balance: Number(Math.max(0, currentVault.balance - deducted).toFixed(2)),
      totalDisbursed: Number((currentVault.totalDisbursed + amt).toFixed(2)),
      updatedAt: now,
      updatedBy: params.adminEmail,
    };
  }

  store.users[currentTo.accountId] = {
    ...currentTo,
    balance: Number((currentTo.balance + amt).toFixed(2)),
    lastActiveAt: now,
  };

  const txRecord: AcashTransaction = {
    txId,
    txHash,
    type: 'admin_transfer',
    senderId: currentFrom ? currentFrom.accountId : 'ADMIN-TREASURY',
    senderName: currentFrom ? currentFrom.businessName || currentFrom.name : 'Acash Admin Treasury',
    senderPhone: currentFrom ? currentFrom.phone : 'SYSTEM',
    senderRole: currentFrom ? currentFrom.role : 'ADMIN',
    receiverId: currentTo.accountId,
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

  store.transactions[txId] = txRecord;
  const trNotif: AdminNotification = {
    id: `NTF-TRF-${txId}`,
    title: `Admin Fund Transfer (৳${amt.toLocaleString()})`,
    message: `Moved ৳${amt.toLocaleString()} from ${txRecord.senderId} to ${txRecord.receiverId}.`,
    category: 'treasury',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };
  store.notifications[trNotif.id] = trNotif;

  const trActivity = makeActivityEntry({
    idPrefix: 'ACT-TRF',
    actionType: 'fund_transfer',
    title: `Fund Transfer (৳${amt.toLocaleString()})`,
    details: `Transferred ৳${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${txRecord.senderName} (${txRecord.senderId}) to ${txRecord.receiverName} (${txRecord.receiverId}). Tx Hash: ${txHash}. Note: ${txRecord.note}`,
    actorEmail: params.adminEmail,
    targetIds: [txRecord.senderId, txRecord.receiverId],
    amount: amt,
    timestamp: now,
  });
  store.activityLogs[trActivity.id] = trActivity;

  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      if (currentFrom) {
        if (currentFrom.pinHash) {
          transaction.set(
            doc(db, USERS_COL, currentFrom.accountId),
            store.users[currentFrom.accountId]
          );
        } else {
          transaction.update(doc(db, USERS_COL, currentFrom.accountId), {
            balance: increment(-amt),
            lastActiveAt: now,
          });
        }
      }
      if (isFromTreasury) {
        transaction.set(doc(db, SETTINGS_COL, TREASURY_VAULT_DOC_ID), store.treasuryVault);
      }
      if (currentTo.pinHash) {
        transaction.set(doc(db, USERS_COL, currentTo.accountId), store.users[currentTo.accountId]);
      } else {
        transaction.update(doc(db, USERS_COL, currentTo.accountId), {
          balance: increment(amt),
          lastActiveAt: now,
        });
      }
      transaction.set(doc(db, TX_COL, txId), txRecord);
      transaction.set(doc(db, ADMIN_NOTIF_COL, trNotif.id), trNotif);
      transaction.set(doc(db, ADMIN_ACTIVITY_COL, trActivity.id), trActivity);
    });
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  return txRecord;
}

export async function adminApproveTransaction(txId: string, adminEmail: string): Promise<void> {
  const now = Date.now();
  const store = readLocalStore();
  const tx = store.transactions[txId];
  if (!tx) throw new Error('Transaction not found.');
  if (tx.status !== 'pending_admin_approval') {
    throw new Error('Transaction is no longer pending approval.');
  }

  if (tx.receiverRole === 'U' || tx.receiverRole === 'A' || tx.receiverRole === 'M') {
    const receiver = store.users[tx.receiverId];
    if (receiver) {
      const getsCashOutCommission =
        tx.type === 'cash_out' || (tx.type === 'merchant_cash_out' && tx.receiverRole === 'A');
      const creditAmount = getsCashOutCommission
        ? Number((tx.amount + tx.feeBreakdown.agentAmount).toFixed(2))
        : tx.amount;
      const commInc = getsCashOutCommission ? tx.feeBreakdown.agentAmount : 0;
      store.users[tx.receiverId] = {
        ...receiver,
        balance: Number((receiver.balance + creditAmount).toFixed(2)),
        commissionBalance: Number(((receiver.commissionBalance || 0) + commInc).toFixed(2)),
        lastActiveAt: now,
      };
    }
  }

  if (tx.type === 'cash_in') {
    const sender = store.users[tx.senderId];
    if (sender) {
      store.users[tx.senderId] = {
        ...sender,
        balance: Number((sender.balance + tx.feeBreakdown.agentAmount).toFixed(2)),
        commissionBalance: Number(
          ((sender.commissionBalance || 0) + tx.feeBreakdown.agentAmount).toFixed(2)
        ),
      };
    }
  }

  const decisionNotif: AdminNotification = {
    id: `NTF-APR-${txId}`,
    title: `50K+ Approved: ${tx.txHash}`,
    message: `Admin ${adminEmail} approved ৳${tx.amount.toLocaleString()} (${tx.senderId} → ${tx.receiverId}). Emails sent.`,
    category: 'aml_pending',
    severity: 'info',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };
  store.notifications[decisionNotif.id] = decisionNotif;

  const approveActivity = makeActivityEntry({
    idPrefix: 'ACT-APR',
    actionType: 'aml_decision',
    title: `High-Value Approved (৳${tx.amount.toLocaleString()})`,
    details: `Approved ${tx.type.replace(/_/g, ' ').toUpperCase()} of ৳${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${tx.senderId} to ${tx.receiverId}. Tx Hash: ${tx.txHash}.`,
    actorEmail: adminEmail,
    targetIds: [tx.senderId, tx.receiverId],
    amount: tx.amount,
    timestamp: now,
  });
  store.activityLogs[approveActivity.id] = approveActivity;

  store.transactions[txId] = {
    ...tx,
    status: 'completed',
    approvedBy: adminEmail,
    approvedAt: now,
  };
  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      if (store.users[tx.receiverId]) {
        transaction.set(doc(db, USERS_COL, tx.receiverId), store.users[tx.receiverId]);
      }
      if (tx.type === 'cash_in' && store.users[tx.senderId]) {
        transaction.set(doc(db, USERS_COL, tx.senderId), store.users[tx.senderId]);
      }
      transaction.set(doc(db, TX_COL, txId), store.transactions[txId]);
      transaction.set(doc(db, ADMIN_NOTIF_COL, decisionNotif.id), decisionNotif);
      transaction.set(doc(db, ADMIN_ACTIVITY_COL, approveActivity.id), approveActivity);
    });
  } catch {
    firestoreBackendMode = 'local_sync';
  }

  const sender = store.users[tx.senderId];
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
  const tx = store.transactions[txId];
  if (!tx) throw new Error('Transaction not found.');
  if (tx.status !== 'pending_admin_approval') {
    throw new Error('Transaction is no longer pending approval.');
  }

  const sender = store.users[tx.senderId];
  if (sender) {
    store.users[tx.senderId] = {
      ...sender,
      balance: Number((sender.balance + tx.totalDebited).toFixed(2)),
      lastActiveAt: now,
    };
  }

  const rejectReason = reason || 'Rejected by Admin AML Security Review';
  const decisionNotif: AdminNotification = {
    id: `NTF-REJ-${txId}`,
    title: `50K+ Rejected & Refunded: ${tx.txHash}`,
    message: `Admin ${adminEmail} rejected ৳${tx.amount.toLocaleString()} from ${tx.senderId}. Funds refunded & emails sent.`,
    category: 'aml_pending',
    severity: 'warning',
    createdAt: now,
    read: false,
    targetSection: 'ledger',
  };
  store.notifications[decisionNotif.id] = decisionNotif;

  const rejectActivity = makeActivityEntry({
    idPrefix: 'ACT-REJ',
    actionType: 'aml_decision',
    title: `High-Value Rejected & Refunded (৳${tx.amount.toLocaleString()})`,
    details: `Rejected ${tx.type.replace(/_/g, ' ').toUpperCase()} of ৳${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${tx.senderId} to ${tx.receiverId} (Tx Hash: ${tx.txHash}). Reason: ${rejectReason}.`,
    actorEmail: adminEmail,
    targetIds: [tx.senderId, tx.receiverId],
    amount: tx.amount,
    timestamp: now,
  });
  store.activityLogs[rejectActivity.id] = rejectActivity;

  store.transactions[txId] = {
    ...tx,
    status: 'rejected',
    approvedBy: adminEmail,
    approvedAt: now,
    rejectionReason: rejectReason,
  };
  writeLocalStore(store, true);

  try {
    await runTransaction(db, async (transaction) => {
      if (store.users[tx.senderId]) {
        transaction.set(doc(db, USERS_COL, tx.senderId), store.users[tx.senderId]);
      }
      transaction.set(doc(db, TX_COL, txId), store.transactions[txId]);
      transaction.set(doc(db, ADMIN_NOTIF_COL, decisionNotif.id), decisionNotif);
      transaction.set(doc(db, ADMIN_ACTIVITY_COL, rejectActivity.id), rejectActivity);
    });
  } catch {
    firestoreBackendMode = 'local_sync';
  }

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
        ? `Bulk Disabled ${updatedUsers.length} Account(s)`
        : `Bulk Enabled ${updatedUsers.length} Account(s)`,
    details: `Changed status to ${params.newStatus.toUpperCase()} for ${updatedUsers.length} accounts (${affectedIds.join(', ')}). ${params.newStatus === 'disabled' ? `Cause: ${cleanReason}` : `Note: ${cleanReason}`}`,
    actorEmail: params.adminEmail,
    targetIds: affectedIds,
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

  return updatedUsers;
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
  const user = store.users[params.accountId];
  if (!user) throw new Error('Account not found.');

  const cleanNid = params.kyc.nidNumber.trim();
  if (!cleanNid) throw new Error('NID / Passport number is required.');

  const cleanTaxCertNo = params.kyc.taxCertificateNumber?.trim();
  if (user.role === 'M' && !cleanTaxCertNo) {
    throw new Error('TIN / Tax Certificate number is required for Merchant KYC.');
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

  try {
    await setDoc(doc(db, USERS_COL, params.accountId), updated, { merge: true });
    await setDoc(doc(db, DIRECTORY_COL, params.accountId), toDirectoryEntry(updated), {
      merge: true,
    });
    if (updatedPin) {
      await setDoc(doc(db, MAP_LOCATIONS_COL, params.accountId), updatedPin, { merge: true });
    }
    await setDoc(doc(db, ADMIN_NOTIF_COL, kycNotif.id), kycNotif);
  } catch (err) {
    firestoreBackendMode = 'local_sync';
    if (auth.currentUser && isPermissionError(err)) {
      console.warn('Firestore KYC sync error:', err);
    }
  }
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
    const q = query(collection(db, BOOTHS_COL), orderBy('updatedAt', 'desc'));
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
    const q = query(collection(db, MAP_LOCATIONS_COL), orderBy('updatedAt', 'desc'));
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

  if (!matched && auth.currentUser?.email?.toLowerCase() === cleanEmail) {
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


