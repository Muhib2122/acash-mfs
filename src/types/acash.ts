export type UserRole = 'U' | 'A' | 'M';

export type UserGender = 'male' | 'female';

export type Language = 'en' | 'bn';

export type ThemeMode = 'light' | 'dark';

export type AccountStatus = 'active' | 'disabled';

export type TransactionType =
  | 'send_money'
  | 'cash_out'
  | 'cash_in'
  | 'agent_cash_out'
  | 'merchant_cash_out'
  | 'mobile_recharge'
  | 'bill_pay'
  | 'merchant_payment'
  | 'b2b_transfer'
  | 'refund'
  | 'admin_credit'
  | 'admin_transfer';

export type TransactionStatus =
  | 'completed'
  | 'pending_admin_approval'
  | 'rejected'
  | 'refunded'
  | 'partially_refunded';

export type OperatorId = 'gp' | 'robi' | 'banglalink' | 'airtel' | 'teletalk';

export type BillerId = 'desco' | 'dpdc' | 'wasa' | 'titas' | 'link3' | 'reb';

export interface FeeBreakdown {
  ratePer1000: number;
  chargeMode?: 'per_1000' | 'flat';
  agentShareRate: number;
  govtShareRate: number;
  adminShareRate: number;
  agentAmount: number;
  govtAmount: number;
  adminAmount: number;
  lockedAt: number;
}

export type SendMoneyChargeMode = 'flat_above_threshold' | 'per_1000';

export interface FeeConfig {
  // Customer Cash-Out (Customer U- -> Agent A-, per 1,000 BDT)
  feePer1000: number; // default 11.5
  agentShare: number; // default 3.6
  govtShare: number; // default 1.5
  adminShare: number; // default 6.4

  // Merchant Cash-Out to Agent (Merchant M- -> Agent A-, per 1,000 BDT)
  merchantCashOutFeePer1000: number; // default 11.5
  merchantCashOutAgentShare: number; // default 3.6
  merchantCashOutGovtShare: number; // default 1.5
  merchantCashOutAdminShare: number; // default 6.4

  // Merchant Cash-Out to Admin Treasury (Merchant M- -> ADMIN-TREASURY, per 1,000 BDT)
  merchantCashOutToAdminFeePer1000: number; // default 0 (Free)
  merchantCashOutToAdminGovtShare: number; // default 0
  merchantCashOutToAdminShare: number; // default 0

  // User Send Money Charge
  sendMoneyChargeMode: SendMoneyChargeMode; // default 'flat_above_threshold'
  sendMoneyFreeThreshold: number; // default 1000 (0 = charge all)
  sendMoneyFeeRate: number; // total flat Tk or per 1,000 Tk (default 5.0)
  sendMoneyGovtShare: number; // default 0.75
  sendMoneyAdminShare: number; // default 4.25

  cashInCommissionPer1000: number; // default 4.0
  highValueThreshold: number; // default 50000
  updatedAt: number;
  updatedBy: string;
}

export type KycStatus = 'unverified' | 'submitted' | 'verified';

export type ReferralSource = 'own_app' | 'agent';

export interface KycInfo {
  nidNumber: string;
  dateOfBirth: string;
  address: string;
  occupation: string;
  nomineeName: string;
  nomineePhone: string;
  nidPhotoUrl?: string;
  taxCertificateNumber?: string;
  taxCertificatePhotoUrl?: string;
  status: KycStatus;
  updatedAt: number;
}

export interface UserMapLocation {
  lat: number;
  lng: number;
  address: string;
  area: string;
  city: string;
  isVisible: boolean;
  updatedAt: number;
}

export interface AcashUser {
  accountId: string; // e.g. U-847291, A-392014, M-501928
  firebaseUid?: string; // Firebase Auth UID when authenticated via Google Sign-In
  role: UserRole;
  name: string;
  businessName?: string;
  gender?: UserGender;
  termsAcceptedAt?: number;
  phone: string;
  email: string;
  pinHash: string;
  staffPinHash?: string; // for Merchant Cashier Mode
  profilePhotoUrl?: string;
  kyc?: KycInfo;
  mapLocation?: UserMapLocation;
  balance: number;
  commissionBalance: number;
  status: AccountStatus;
  disableReason?: string;
  disabledAt?: number;
  disabledBy?: string;
  verified: boolean;
  referredByType?: ReferralSource;
  referredByAgentId?: string;
  referredByAgentPhone?: string;
  referredByAgentName?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface AcashDirectoryEntry {
  accountId: string;
  firebaseUid?: string;
  role: UserRole;
  name: string;
  businessName?: string;
  phone: string;
  status: AccountStatus;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  category: 'aml_pending' | 'account_status' | 'treasury' | 'fee_update' | 'registration' | 'kyc_update';
  severity: 'critical' | 'warning' | 'info';
  createdAt: number;
  read: boolean;
  targetSection?:
    | 'overview'
    | 'users'
    | 'treasury'
    | 'approvals'
    | 'fees'
    | 'ledger'
    | 'activity'
    | 'booths'
    | 'social_engagement'
    | 'admin_profile';
}

export type AccountNotificationCategory =
  | 'transaction'
  | 'admin_alert'
  | 'kyc'
  | 'fee_update'
  | 'security';

export interface AccountNotification {
  id: string;
  recipientId: string; // 'ALL' or specific U-/A-/M- accountId
  recipientRole?: UserRole | 'ALL';
  title: string;
  message: string;
  category: AccountNotificationCategory;
  severity: 'info' | 'success' | 'warning' | 'critical';
  amount?: number;
  txId?: string;
  txHash?: string;
  createdBy?: string;
  read: boolean;
  readBy?: string[];
  createdAt: number;
}

export type AdminActivityType =
  | 'fee_update'
  | 'fund_transfer'
  | 'credit_add'
  | 'bulk_status_change'
  | 'status_change'
  | 'account_delete'
  | 'aml_decision'
  | 'alert_settings'
  | 'security_update'
  | 'account_alert'
  | 'kyc_decision'
  | 'social_engagement';

export interface AdminActivityLog {
  id: string;
  actionType: AdminActivityType;
  title: string;
  details: string;
  actorEmail: string;
  targetIds?: string[];
  amount?: number;
  timestamp: number;
}

export type GiftCardThemeCategory =
  | 'eid'
  | 'boishakh'
  | 'heritage'
  | 'love'
  | 'wishes'
  | 'celebration'
  | 'others';

export type GiftCardParticleType =
  | 'crescent_lantern'
  | 'coins'
  | 'alpana_marigold'
  | 'doves_palash'
  | 'flag_fireworks'
  | 'sunbeams'
  | 'roses_hearts'
  | 'fairy_tea'
  | 'royal_mandala'
  | 'festive_confetti';

export interface CustomGiftCardRecord {
  cardId: string;
  titleBn: string;
  titleEn: string;
  subtitleBn: string;
  subtitleEn: string;
  themeCategory: GiftCardThemeCategory;
  imageUrl: string;
  gradientBg: string;
  accentHex: string;
  particleType: GiftCardParticleType;
  defaultMessageBn: string;
  defaultMessageEn: string;
  featured: boolean;
  active: boolean;
  frozen?: boolean;
  featuredFirst?: boolean;
  pinnedOrder?: number;
  isUserSubmitted?: boolean;
  submittedByAccountId?: string;
  submittedByName?: string;
  expiresAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface GiftCardGovernanceEntry {
  frozen?: boolean;
  featuredFirst?: boolean;
  pinnedOrder?: number;
  deleted?: boolean;
  updatedAt: number;
  updatedBy?: string;
}

export interface GiftCardCatalogPolicy {
  overrides: Record<string, GiftCardGovernanceEntry>;
  updatedAt: number;
  updatedBy: string;
}

export type PortalThemePresetId =
  | 'classic_indigo'
  | 'bkash_crimson'
  | 'emerald_sovereign'
  | 'boishakh_terracotta'
  | 'royal_midnight'
  | 'oceanic_teal';

export type PortalThemeSurfacePreference = 'user_choice' | 'light' | 'dark';

export interface PortalThemeConfig {
  presetId: PortalThemePresetId;
  customAccentHex?: string;
  bannerEnabled: boolean;
  customBannerBn?: string;
  customBannerEn?: string;
  surfacePreference: PortalThemeSurfacePreference;
  updatedAt: number;
  updatedBy: string;
}

export interface GiftCardPayload {
  cardId: string;
  cardTitleBn: string;
  cardTitleEn: string;
  themeCategory: GiftCardThemeCategory;
  message: string;
  signaturePrefix: 'bn' | 'en';
  senderDisplayName: string;
  isCustomEdited: boolean;
  customImageUrl?: string;
  customGradientBg?: string;
  customAccentHex?: string;
  openedAt?: number;
  skippedAt?: number;
}

export interface AcashTransaction {
  txId: string;
  txHash: string; // e.g. 0xAC8F...
  type: TransactionType;
  senderId: string;
  senderUid?: string;
  senderName: string;
  senderPhone: string;
  senderRole: UserRole | 'SYSTEM' | 'ADMIN';
  receiverId: string;
  receiverUid?: string;
  receiverName: string;
  receiverPhone: string;
  receiverRole: UserRole | 'OPERATOR' | 'BILLER' | 'SYSTEM' | 'ADMIN';
  amount: number;
  fee: number;
  totalDebited: number;
  feeBreakdown: FeeBreakdown;
  status: TransactionStatus;
  refundedAmount: number;
  parentTxHash?: string;
  operator?: OperatorId;
  rechargeNumber?: string;
  rechargeType?: 'prepaid' | 'postpaid';
  biller?: BillerId;
  billAccountNumber?: string;
  billMonth?: string;
  note?: string;
  giftCard?: GiftCardPayload;
  createdAt: number;
  approvedBy?: string;
  approvedAt?: number;
  rejectionReason?: string;
  settledOnce?: boolean;
}

export type IdentityLockType = 'email' | 'phone' | 'nid' | 'tax';

export interface AcashIdentityLock {
  lockId: string;
  lockType: IdentityLockType;
  accountId: string;
  createdAt: number;
}

export type BoothType = 'agent_booth' | 'support_booth';

export type BoothStatus = 'open' | 'busy' | 'closed';

export type CashLiquidityLevel = 'high' | 'medium' | 'low';

export interface AcashBooth {
  boothId: string;
  boothType: BoothType;
  name: string;
  area: string;
  city: string;
  address: string;
  phone: string;
  agentAccountId?: string;
  hours: string;
  status: BoothStatus;
  lat: number;
  lng: number;
  services: string[];
  queueWaitMinutes?: number;
  cashLiquidityLevel?: CashLiquidityLevel;
  createdAt: number;
  updatedAt: number;
}

export type CreatorMapRole = 'agent' | 'merchant' | 'admin' | 'second_admin';

export interface AcashMapLocation {
  creatorId: string; // e.g. A-200001, M-300001, ADM-MAIN, ADM-200001
  creatorUid?: string;
  creatorRole: CreatorMapRole;
  name: string;
  businessName?: string;
  phone: string;
  profilePhotoUrl?: string;
  address: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  isVisible: boolean;
  locationSource?: 'ip_auto' | 'manual_pin';
  ipAddress?: string;
  isp?: string;
  country?: string;
  lastIpLocatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SecondAdminProfile {
  adminId: string; // e.g. ADM-200001
  firebaseUid?: string;
  name: string;
  title?: string;
  email: string;
  phone: string;
  passwordHash?: string;
  createdBy?: string;
  profilePhotoUrl?: string;
  mapLocation?: UserMapLocation;
  status: AccountStatus;
  createdAt: number;
  updatedAt: number;
}

export interface MainAdminCredentialConfig {
  email: string;
  passwordHash: string;
  updatedAt: number;
  updatedBy: string;
}

export interface AcashSession {
  accountId: string;
  role: UserRole;
  email: string;
  firebaseUid?: string;
  loggedInAt: number;
  integritySig?: string;
}

export interface AdminSession {
  adminEmail: string;
  adminName: string;
  adminRole: 'main_admin' | 'second_admin';
  adminId?: string;
  adminGender?: UserGender;
  phone?: string;
  profilePhotoUrl?: string;
  firebaseUid?: string;
  loggedInAt: number;
  integritySig?: string;
}

export type SecurityEventType =
  | 'brute_force_lockout'
  | 'spam_flood_blocked'
  | 'session_tamper'
  | 'xss_payload_blocked'
  | 'otp_abuse'
  | 'admin_unlock'
  | 'policy_change';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEventRecord {
  id: string;
  portal: 'unified' | 'admin';
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  targetIdentifier: string;
  details: string;
  blockedUntil?: number;
  resolved?: boolean;
  timestamp: number;
}

export interface SecurityPolicyConfig {
  strictAntiSpamMode: boolean;
  maxTxPerMinute: number;
  maxLoginFailures: number;
  lockoutMinutes: number;
  adminIdleTimeoutMinutes: number;
  accountIdleTimeoutMinutes: number;
  requireChallengeOnAdminFail: boolean;
  updatedAt: number;
  updatedBy: string;
}

export interface TreasuryMintHistoryEntry {
  id: string;
  action: 'mint' | 'refresh';
  amount: number;
  previousBalance: number;
  newBalance: number;
  note: string;
  actorEmail: string;
  timestamp: number;
}

export interface MainTreasuryVault {
  vaultId: 'ADMIN-TREASURY';
  balance: number;
  totalMinted: number;
  totalDisbursed: number;
  lastMintAmount?: number;
  lastMintNote?: string;
  mintHistory?: TreasuryMintHistoryEntry[];
  updatedAt: number;
  updatedBy: string;
}

export interface KycSubmissionRecord {
  accountId: string;
  name: string;
  businessName?: string;
  kyc: KycInfo;
  updatedAt: number;
}


