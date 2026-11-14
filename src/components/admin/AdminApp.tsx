import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Users,
  AlertOctagon,
  Sliders,
  Activity,
  LogOut,
  Search,
  CheckCircle2,
  XCircle,
  Lock,
  ArrowLeftRight,
  PlusCircle,
  Send,
  FileText,
  Bell,
  Mail,
  Check,
  X,
  FileBadge2,
  User as UserIcon,
  ClipboardList,
  Clock,
  Calendar,
  Filter,
  RotateCcw,
  MapPin,
  Trash2,
  Camera,
  Upload,
  Phone,
  Shield,
  Minus,
  Plus,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Eye,
  Megaphone,
  Command,
  Download,
  Gift,
  Sparkles,
  Globe,
  Crosshair,
} from 'lucide-react';
import {
  AcashBooth,
  AcashMapLocation,
  AcashTransaction,
  AcashUser,
  AdminActivityLog,
  AdminActivityType,
  AdminNotification,
  AdminSession,
  BoothStatus,
  BoothType,
  CustomGiftCardRecord,
  FeeConfig,
  GiftCardCatalogPolicy,
  Language,
  MainTreasuryVault,
  PortalThemeConfig,
  SecondAdminProfile,
  SendMoneyChargeMode,
  ThemeMode,
  TransactionStatus,
  TransactionType,
  UserGender,
  UserRole,
} from '../../types/acash';
import { formatBdt, formatCompactBdt, t } from '../../lib/i18n';
import { consumeGoogleRedirectResult, signInWithGoogleSmart } from '../../lib/firebase';
import {
  getVoiceMuted,
  playTransactionVoiceAlert,
  setVoiceMuted,
} from '../../lib/soundbox';
import {
  DEFAULT_ADMIN_ALERT_EMAIL,
  DEFAULT_FEE_CONFIG,
  adminApproveTransaction,
  adminBulkUpdateUserStatus,
  adminCreateSecondAdmin,
  adminCreditAccount,
  adminDeleteBooth,
  adminDeleteTransaction,
  adminDeleteUser,
  adminBulkDeleteUsers,
  adminResetAllAccountsAndTransactions,
  adminFreezeAllUsers,
  adminMarkTransactionPending,
  adminRejectTransaction,
  adminSaveBooth,
  adminSendAccountNotification,
  adminToggleBoothStatus,
  adminToggleUserStatus,
  adminTransferBetweenAccounts,
  adminUpdateFeeConfig,
  authorizeGoogleAdminLogin,
  calculateFeeBreakdown,
  changeMainAdminPassword,
  formatUserReferralSource,
  isMainAdminEmail,
  mainAdminMintTreasuryCredit,
  mainAdminRefreshTreasuryBalance,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  saveSecondAdminProfileAndLocation,
  setAdminAlertEmail,
  subscribeToAdminAlertEmail,
  syncAutoIpMapLocation,
  verifyAdminPasswordLogin,
} from '../../lib/acashService';
import { sendAccountStatusEmail } from '../../lib/emailjs';
import {
  downloadAccountStatementPdf,
  downloadCreatorKycProfilePdf,
  downloadGlobalLedgerPdf,
  downloadUsersDirectoryPdf,
} from '../../lib/pdfGenerator';
import { BrandLogo } from '../common/BrandLogo';
import { TransactionVolumeChart } from './TransactionVolumeChart';
import { BoothLocatorMap } from '../common/BoothLocatorMap';
import { RealLocationPickerMap, RealLocationValue } from '../common/RealLocationPickerMap';
import { AdminAccountViewModal } from './AdminAccountViewModal';
import {
  AdminCommandPaletteModal,
  AdminKycReviewQueuePanel,
  AdminOverviewIntelligence,
  exportLedgerToCsv,
  exportUsersToCsv,
} from './AdminExecutiveWidgets';
import { AdminSocialEngagementPanel } from './AdminSocialEngagementPanel';

interface AdminAppProps {
  lang: Language;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onSwitchToUnifiedApp: () => void;
  portalLocked?: boolean;
  externalUserPortalUrl?: string;
  adminSession: AdminSession | null;
  onAdminLogin: (session: AdminSession) => void;
  onAdminLogout: () => void;
  users: AcashUser[];
  transactions: AcashTransaction[];
  notifications: AdminNotification[];
  activityLogs: AdminActivityLog[];
  booths: AcashBooth[];
  creatorLocations: AcashMapLocation[];
  secondAdmins: SecondAdminProfile[];
  feeConfig: FeeConfig;
  treasuryVault: MainTreasuryVault;
  customGiftCards: CustomGiftCardRecord[];
  giftCardPolicy: GiftCardCatalogPolicy;
  portalTheme: PortalThemeConfig;
}

type AdminSection =
  | 'overview'
  | 'users'
  | 'treasury'
  | 'approvals'
  | 'kyc_queue'
  | 'social_engagement'
  | 'fees'
  | 'ledger'
  | 'activity'
  | 'booths'
  | 'admin_profile';

const DISABLE_PRESETS = [
  'Suspicious AML high-value activity detected',
  'KYC identity verification mismatch',
  'Unauthorized merchant chargeback / dispute',
  'Account security compromise suspected',
];

async function compressAdminImageToDataUrl(file: File, maxDim = 320, quality = 0.84): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not decode image file.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export const AdminApp: React.FC<AdminAppProps> = ({
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onSwitchToUnifiedApp,
  portalLocked = false,
  externalUserPortalUrl = '',
  adminSession,
  onAdminLogin,
  onAdminLogout,
  users,
  transactions,
  notifications,
  activityLogs,
  booths,
  creatorLocations,
  secondAdmins,
  feeConfig,
  treasuryVault,
  customGiftCards,
  giftCardPolicy,
  portalTheme,
}) => {
  const [adminEmail, setAdminEmail] = useState(DEFAULT_ADMIN_ALERT_EMAIL);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [authError, setAuthError] = useState('');

  const [section, setSection] = useState<AdminSection>('overview');
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [viewedAccountId, setViewedAccountId] = useState<string | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // In-app executive confirmation dialog (replaces window.confirm for iframe safety)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'danger' | 'warning';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Live Account Alert / Broadcast modal state
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState('ALL');
  const [broadcastSeverity, setBroadcastSeverity] = useState<
    'info' | 'success' | 'warning' | 'critical'
  >('info');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  // Notification Bar & Drawer state + Admin Alert Email + Voice Alerts
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [alertEmailInput, setAlertEmailInput] = useState(DEFAULT_ADMIN_ALERT_EMAIL);
  const [savingAlertEmail, setSavingAlertEmail] = useState(false);
  const [voiceMuted, setVoiceMutedState] = useState<boolean>(getVoiceMuted);
  const [adminGender, setAdminGenderState] = useState<UserGender>(() => {
    if (adminSession?.adminGender) return adminSession.adminGender;
    try {
      const saved = localStorage.getItem('acash_admin_gender_v1');
      return saved === 'female' ? 'female' : 'male';
    } catch {
      return 'male';
    }
  });
  const [adminVoiceBanner, setAdminVoiceBanner] = useState<{
    amount: number;
    details: string;
    txHash: string;
  } | null>(null);
  const seenAdminTxIdsRef = useRef<Set<string> | null>(null);
  const adminIpSyncedRef = useRef<string | null>(null);
  const [syncingAdminIp, setSyncingAdminIp] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAdminAlertEmail((email) => setAlertEmailInput(email));
    return () => unsub();
  }, []);

  useEffect(() => {
    seenAdminTxIdsRef.current = null;
  }, [adminSession?.adminEmail]);

  useEffect(() => {
    if (!adminSession) {
      adminIpSyncedRef.current = null;
      return;
    }
    const creatorId =
      adminSession.adminRole === 'main_admin' ? 'ADM-MAIN' : adminSession.adminId || '';
    if (!creatorId || adminIpSyncedRef.current === creatorId) return;
    adminIpSyncedRef.current = creatorId;
    const creatorRole = adminSession.adminRole === 'main_admin' ? 'admin' : 'second_admin';
    void syncAutoIpMapLocation({
      creatorId,
      creatorRole,
      name:
        adminSession.adminName ||
        (adminSession.adminRole === 'main_admin' ? 'Main Admin' : '2nd Admin'),
      businessName:
        adminSession.adminRole === 'main_admin'
          ? 'Acash Main Admin Command'
          : 'Acash 2nd Admin Desk',
      phone: adminSession.phone || adminSession.adminEmail,
      profilePhotoUrl: adminSession.profilePhotoUrl,
      creatorUid: adminSession.firebaseUid,
    });
  }, [adminSession]);

  useEffect(() => {
    if (!adminSession) return;
    if (seenAdminTxIdsRef.current === null) {
      seenAdminTxIdsRef.current = new Set(transactions.map((tx) => tx.txId));
      return;
    }

    for (const tx of transactions) {
      if (!seenAdminTxIdsRef.current.has(tx.txId)) {
        seenAdminTxIdsRef.current.add(tx.txId);
        setAdminVoiceBanner({
          amount: tx.amount,
          details: `${tx.type.replace(/_/g, ' ').toUpperCase()} · ${tx.senderName} → ${tx.receiverName}`,
          txHash: tx.txHash,
        });
        playTransactionVoiceAlert({
          listenerGender: adminGender,
          amount: tx.amount,
          txType: tx.type,
          direction: tx.status === 'pending_admin_approval' ? 'pending' : 'admin',
          counterpartyName: tx.senderName,
          secondaryName: tx.receiverName,
          lang,
          muted: voiceMuted,
        });
        break;
      }
    }
  }, [transactions, adminSession, adminGender, lang, voiceMuted]);

  const toggleAdminVoiceMute = () => {
    setVoiceMutedState((prev) => {
      const next = !prev;
      setVoiceMuted(next);
      return next;
    });
  };

  const handleToggleAdminGender = (nextGender: UserGender) => {
    setAdminGenderState(nextGender);
    try {
      localStorage.setItem('acash_admin_gender_v1', nextGender);
    } catch {
      // ignore
    }
    if (adminSession) {
      onAdminLogin({
        ...adminSession,
        adminGender: nextGender,
      });
    }
  };

  // Disable Account Cause Modal state
  const [disableTargetUser, setDisableTargetUser] = useState<AcashUser | null>(null);
  const [disableCause, setDisableCause] = useState('');
  const [disableSubmitting, setDisableSubmitting] = useState(false);

  // Multi-select & Bulk Enable/Disable state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDisableOpen, setBulkDisableOpen] = useState(false);
  const [bulkDisableCause, setBulkDisableCause] = useState('');

  // Transaction Set Pending / Delete confirmation modal state
  const [txActionModal, setTxActionModal] = useState<{
    mode: 'pending' | 'delete';
    tx: AcashTransaction;
  } | null>(null);
  const [txActionReason, setTxActionReason] = useState('');
  const [txActionSubmitting, setTxActionSubmitting] = useState(false);

  // Activity Log filter & search state
  const [activityFilter, setActivityFilter] = useState<'ALL' | AdminActivityType>('ALL');
  const [activitySearch, setActivitySearch] = useState('');

  // Global Ledger advanced filter state
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'ALL' | TransactionStatus>('ALL');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [ledgerMinAmount, setLedgerMinAmount] = useState('');
  const [ledgerMaxAmount, setLedgerMaxAmount] = useState('');
  const [ledgerGiftOnly, setLedgerGiftOnly] = useState(false);

  useEffect(() => {
    if (!adminSession) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCmdPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adminSession]);

  // Google Admin Login & Booth Map Management state
  const [googleAdminBusy, setGoogleAdminBusy] = useState(false);
  const [boothTypeInput, setBoothTypeInput] = useState<BoothType>('agent_booth');
  const [boothNameInput, setBoothNameInput] = useState('');
  const [boothAreaInput, setBoothAreaInput] = useState('Gulshan');
  const [boothCityInput, setBoothCityInput] = useState('Dhaka');
  const [boothAddressInput, setBoothAddressInput] = useState('');
  const [boothPhoneInput, setBoothPhoneInput] = useState('');
  const [boothAgentIdInput, setBoothAgentIdInput] = useState('A-200001');
  const [boothHoursInput, setBoothHoursInput] = useState('09:00 AM – 09:00 PM');
  const [boothLatInput, setBoothLatInput] = useState('23.7805');
  const [boothLngInput, setBoothLngInput] = useState('90.4165');
  const [boothServicesInput, setBoothServicesInput] = useState('Cash-In, Cash-Out, KYC Help');
  const [savingBooth, setSavingBooth] = useState(false);

  // 2nd Admin Profile & Direct Map Location state
  const isCurrentMainAdmin = adminSession ? isMainAdminEmail(adminSession.adminEmail) : true;
  const activeSecondAdmin = useMemo(() => {
    if (!adminSession || isCurrentMainAdmin) return null;
    const lowerEmail = adminSession.adminEmail.toLowerCase();
    return (
      secondAdmins.find(
        (sa) =>
          (adminSession.adminId && sa.adminId === adminSession.adminId) ||
          sa.email.toLowerCase() === lowerEmail
      ) || null
    );
  }, [adminSession, isCurrentMainAdmin, secondAdmins]);

  const [secondAdminNameInput, setSecondAdminNameInput] = useState('');
  const [secondAdminTitleInput, setSecondAdminTitleInput] = useState('');
  const [secondAdminPhoneInput, setSecondAdminPhoneInput] = useState('');
  const [secondAdminPhotoInput, setSecondAdminPhotoInput] = useState('');
  const [savingSecondAdmin, setSavingSecondAdmin] = useState(false);

  // Main Admin -> Register new 2nd Admin form & Password Change
  const [new2ndName, setNew2ndName] = useState('');
  const [new2ndTitle, setNew2ndTitle] = useState('Regional 2nd Admin');
  const [new2ndEmail, setNew2ndEmail] = useState('');
  const [new2ndPhone, setNew2ndPhone] = useState('');
  const [new2ndPassword, setNew2ndPassword] = useState('');
  const [creating2ndAdmin, setCreating2ndAdmin] = useState(false);

  const [currentMainPwd, setCurrentMainPwd] = useState('');
  const [newMainPwd, setNewMainPwd] = useState('');
  const [confirmMainPwd, setConfirmMainPwd] = useState('');
  const [changingMainPwd, setChangingMainPwd] = useState(false);

  useEffect(() => {
    if (activeSecondAdmin) {
      setSecondAdminNameInput(activeSecondAdmin.name);
      setSecondAdminTitleInput(activeSecondAdmin.title || '2nd Admin Desk');
      setSecondAdminPhoneInput(activeSecondAdmin.phone);
      setSecondAdminPhotoInput(activeSecondAdmin.profilePhotoUrl || '');
    } else if (adminSession && !isCurrentMainAdmin) {
      setSecondAdminNameInput(adminSession.adminName);
      setSecondAdminTitleInput('Regional 2nd Admin');
      setSecondAdminPhoneInput(adminSession.phone || '01799000101');
      setSecondAdminPhotoInput(adminSession.profilePhotoUrl || '');
    }
  }, [activeSecondAdmin, adminSession, isCurrentMainAdmin]);

  // Treasury: Main Admin Unlimited Credit Mint + Direct Wallet Credit state
  const [mintAmount, setMintAmount] = useState('');
  const [mintReason, setMintReason] = useState('Main Admin Initial Capital Mint');
  const [mintBusy, setMintBusy] = useState(false);

  const [creditTarget, setCreditTarget] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('Admin Liquidity Top-Up');
  const [creditBusy, setCreditBusy] = useState(false);

  // Treasury: Inter-Account / Treasury Transfer state
  const [transferFrom, setTransferFrom] = useState('ADMIN-TREASURY');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferReason, setTransferReason] = useState('Float Allocation Transfer');
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => {
    if (users.length === 0) return;
    setCreditTarget((prev) => (prev ? prev : users[0].accountId));
    setTransferTo((prev) => {
      if (prev && users.some((u) => u.accountId === prev)) return prev;
      const preferredAgent = users.find((u) => u.role === 'A');
      return (preferredAgent || users[0]).accountId;
    });
  }, [users]);

  // Treasury Refresh state
  const [refreshBalanceVal, setRefreshBalanceVal] = useState('');
  const [refreshReasonVal, setRefreshReasonVal] = useState('Main Admin Mint Balance Reset & Refresh');
  const [refreshBusy, setRefreshBusy] = useState(false);

  // Dynamic Fee Engine editable state
  const [editAgentShare, setEditAgentShare] = useState(String(feeConfig.agentShare));
  const [editGovtShare, setEditGovtShare] = useState(String(feeConfig.govtShare));
  const [editAdminShare, setEditAdminShare] = useState(String(feeConfig.adminShare));

  const [editMerchantAgentShare, setEditMerchantAgentShare] = useState(
    String(feeConfig.merchantCashOutAgentShare)
  );
  const [editMerchantGovtShare, setEditMerchantGovtShare] = useState(
    String(feeConfig.merchantCashOutGovtShare)
  );
  const [editMerchantAdminShare, setEditMerchantAdminShare] = useState(
    String(feeConfig.merchantCashOutAdminShare)
  );

  const [editMerchantToAdminGovtShare, setEditMerchantToAdminGovtShare] = useState(
    String(feeConfig.merchantCashOutToAdminGovtShare)
  );
  const [editMerchantToAdminShare, setEditMerchantToAdminShare] = useState(
    String(feeConfig.merchantCashOutToAdminShare)
  );

  const [editSendMoneyMode, setEditSendMoneyMode] = useState<SendMoneyChargeMode>(
    feeConfig.sendMoneyChargeMode
  );
  const [editSendMoneyFreeThreshold, setEditSendMoneyFreeThreshold] = useState(
    String(feeConfig.sendMoneyFreeThreshold)
  );
  const [editSendMoneyGovtShare, setEditSendMoneyGovtShare] = useState(
    String(feeConfig.sendMoneyGovtShare)
  );
  const [editSendMoneyAdminShare, setEditSendMoneyAdminShare] = useState(
    String(feeConfig.sendMoneyAdminShare)
  );

  const [editCashInComm, setEditCashInComm] = useState(String(feeConfig.cashInCommissionPer1000));
  const [editHighThreshold, setEditHighThreshold] = useState(String(feeConfig.highValueThreshold));
  const [savingFee, setSavingFee] = useState(false);
  const [feePreviewType, setFeePreviewType] = useState<
    'cash_out' | 'merchant_cash_out_agent' | 'merchant_cash_out_admin' | 'send_money'
  >('cash_out');
  const [feePreviewAmount, setFeePreviewAmount] = useState('2500');

  useEffect(() => {
    setEditAgentShare(String(feeConfig.agentShare));
    setEditGovtShare(String(feeConfig.govtShare));
    setEditAdminShare(String(feeConfig.adminShare));
    setEditMerchantAgentShare(String(feeConfig.merchantCashOutAgentShare));
    setEditMerchantGovtShare(String(feeConfig.merchantCashOutGovtShare));
    setEditMerchantAdminShare(String(feeConfig.merchantCashOutAdminShare));
    setEditMerchantToAdminGovtShare(String(feeConfig.merchantCashOutToAdminGovtShare));
    setEditMerchantToAdminShare(String(feeConfig.merchantCashOutToAdminShare));
    setEditSendMoneyMode(feeConfig.sendMoneyChargeMode);
    setEditSendMoneyFreeThreshold(String(feeConfig.sendMoneyFreeThreshold));
    setEditSendMoneyGovtShare(String(feeConfig.sendMoneyGovtShare));
    setEditSendMoneyAdminShare(String(feeConfig.sendMoneyAdminShare));
    setEditCashInComm(String(feeConfig.cashInCommissionPer1000));
    setEditHighThreshold(String(feeConfig.highValueThreshold));
  }, [feeConfig]);

  const computedTotalFeePer1000 = Number(
    (
      (Number(editAgentShare) || 0) +
      (Number(editGovtShare) || 0) +
      (Number(editAdminShare) || 0)
    ).toFixed(2)
  );

  const computedMerchantCashOutPer1000 = Number(
    (
      (Number(editMerchantAgentShare) || 0) +
      (Number(editMerchantGovtShare) || 0) +
      (Number(editMerchantAdminShare) || 0)
    ).toFixed(2)
  );

  const computedMerchantToAdminPer1000 = Number(
    (
      (Number(editMerchantToAdminGovtShare) || 0) +
      (Number(editMerchantToAdminShare) || 0)
    ).toFixed(2)
  );

  const computedSendMoneyRate = Number(
    ((Number(editSendMoneyGovtShare) || 0) + (Number(editSendMoneyAdminShare) || 0)).toFixed(2)
  );

  const draftFeeConfig = useMemo<FeeConfig>(
    () => ({
      feePer1000: computedTotalFeePer1000,
      agentShare: Math.max(0, Number(editAgentShare) || 0),
      govtShare: Math.max(0, Number(editGovtShare) || 0),
      adminShare: Math.max(0, Number(editAdminShare) || 0),
      merchantCashOutFeePer1000: computedMerchantCashOutPer1000,
      merchantCashOutAgentShare: Math.max(0, Number(editMerchantAgentShare) || 0),
      merchantCashOutGovtShare: Math.max(0, Number(editMerchantGovtShare) || 0),
      merchantCashOutAdminShare: Math.max(0, Number(editMerchantAdminShare) || 0),
      merchantCashOutToAdminFeePer1000: computedMerchantToAdminPer1000,
      merchantCashOutToAdminGovtShare: Math.max(0, Number(editMerchantToAdminGovtShare) || 0),
      merchantCashOutToAdminShare: Math.max(0, Number(editMerchantToAdminShare) || 0),
      sendMoneyChargeMode: editSendMoneyMode,
      sendMoneyFreeThreshold: Math.max(0, Number(editSendMoneyFreeThreshold) || 0),
      sendMoneyFeeRate: computedSendMoneyRate,
      sendMoneyGovtShare: Math.max(0, Number(editSendMoneyGovtShare) || 0),
      sendMoneyAdminShare: Math.max(0, Number(editSendMoneyAdminShare) || 0),
      cashInCommissionPer1000: Math.max(0, Number(editCashInComm) || 0),
      highValueThreshold: Math.max(1000, Number(editHighThreshold) || 50000),
      updatedAt: Date.now(),
      updatedBy: adminSession?.adminEmail || 'Admin',
    }),
    [
      computedTotalFeePer1000,
      editAgentShare,
      editGovtShare,
      editAdminShare,
      computedMerchantCashOutPer1000,
      editMerchantAgentShare,
      editMerchantGovtShare,
      editMerchantAdminShare,
      computedMerchantToAdminPer1000,
      editMerchantToAdminGovtShare,
      editMerchantToAdminShare,
      editSendMoneyMode,
      editSendMoneyFreeThreshold,
      computedSendMoneyRate,
      editSendMoneyGovtShare,
      editSendMoneyAdminShare,
      editCashInComm,
      editHighThreshold,
      adminSession?.adminEmail,
    ]
  );

  const feePreviewResult = useMemo(() => {
    const amt = Math.max(0, Number(feePreviewAmount) || 0);
    if (feePreviewType === 'cash_out') {
      return calculateFeeBreakdown('cash_out', amt, draftFeeConfig);
    }
    if (feePreviewType === 'merchant_cash_out_agent') {
      return calculateFeeBreakdown('merchant_cash_out', amt, draftFeeConfig, {
        targetIsAdmin: false,
      });
    }
    if (feePreviewType === 'merchant_cash_out_admin') {
      return calculateFeeBreakdown('merchant_cash_out', amt, draftFeeConfig, {
        targetIsAdmin: true,
      });
    }
    return calculateFeeBreakdown('send_money', amt, draftFeeConfig);
  }, [feePreviewAmount, feePreviewType, draftFeeConfig]);

  const adjustShare = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    currentValue: string,
    delta: number
  ) => {
    const next = Math.max(0, Number(((Number(currentValue) || 0) + delta).toFixed(2)));
    setter(String(next));
  };

  const viewedAccount = useMemo(
    () => (viewedAccountId ? users.find((u) => u.accountId === viewedAccountId) || null : null),
    [users, viewedAccountId]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read),
    [notifications]
  );

  const latestUnread = unreadNotifications[0] || null;

  // Platform Metrics
  const metrics = useMemo(() => {
    const totalFloat = users.reduce((s, u) => s + (u.balance || 0), 0);
    const completed = transactions.filter((tx) => tx.status === 'completed');
    const pendingHighValue = transactions.filter((tx) => tx.status === 'pending_admin_approval');

    const totalVolume = completed.reduce((s, tx) => s + tx.amount, 0);
    const adminRevenue = completed.reduce((s, tx) => s + (tx.feeBreakdown?.adminAmount || 0), 0);
    const govtPool = completed.reduce((s, tx) => s + (tx.feeBreakdown?.govtAmount || 0), 0);
    const agentPool = completed.reduce((s, tx) => s + (tx.feeBreakdown?.agentAmount || 0), 0);

    return {
      totalFloat,
      totalVolume,
      adminRevenue,
      govtPool,
      agentPool,
      pendingHighValue,
      pendingKycCount: users.filter((u) => u.kyc?.status === 'submitted').length,
      activeUsersCount: users.filter((u) => u.status === 'active').length,
    };
  }, [users, transactions]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.accountId.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.businessName || '').toLowerCase().includes(q) ||
        u.phone.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.kyc?.nidNumber || '').toLowerCase().includes(q) ||
        (u.kyc?.taxCertificateNumber || '').toLowerCase().includes(q) ||
        (u.referredByAgentId || '').toLowerCase().includes(q) ||
        (u.referredByAgentPhone || '').includes(q)
      );
    });
  }, [users, userSearch, roleFilter]);

  const inspectedCreator = useMemo(() => {
    if (selectedDossierId) {
      const found = users.find((u) => u.accountId === selectedDossierId);
      if (found) return found;
    }
    if (userSearch.trim() && filteredUsers.length > 0) {
      return filteredUsers[0];
    }
    return null;
  }, [selectedDossierId, userSearch, filteredUsers, users]);

  const selectedUserSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedUserSet.has(u.accountId)),
    [users, selectedUserSet]
  );
  const selectedActiveUsers = useMemo(
    () => selectedUsers.filter((u) => u.status === 'active'),
    [selectedUsers]
  );
  const selectedDisabledUsers = useMemo(
    () => selectedUsers.filter((u) => u.status === 'disabled'),
    [selectedUsers]
  );
  const allFilteredSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserSet.has(u.accountId));
  const someFilteredSelected =
    filteredUsers.some((u) => selectedUserSet.has(u.accountId)) && !allFilteredSelected;

  const toggleSelectUser = (accountId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredUsers.map((u) => u.accountId);
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredIds);
      setSelectedUserIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const filteredActivityLogs = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return activityLogs.filter((log) => {
      if (activityFilter !== 'ALL' && log.actionType !== activityFilter) return false;
      if (!q) return true;
      return (
        log.title.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        (log.targetIds || []).some((id) => id.toLowerCase().includes(q))
      );
    });
  }, [activityLogs, activityFilter, activitySearch]);

  const toLocalDateInputValue = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const applyLedgerDatePreset = (preset: 'today' | '7d' | '30d' | 'all') => {
    if (preset === 'all') {
      setLedgerDateFrom('');
      setLedgerDateTo('');
      return;
    }
    const now = new Date();
    const endStr = toLocalDateInputValue(now);
    const start = new Date(now);
    if (preset === '7d') {
      start.setDate(start.getDate() - 6);
    } else if (preset === '30d') {
      start.setDate(start.getDate() - 29);
    }
    setLedgerDateFrom(toLocalDateInputValue(start));
    setLedgerDateTo(endStr);
  };

  const resetLedgerFilters = () => {
    setLedgerSearch('');
    setLedgerTypeFilter('ALL');
    setLedgerStatusFilter('ALL');
    setLedgerDateFrom('');
    setLedgerDateTo('');
    setLedgerMinAmount('');
    setLedgerMaxAmount('');
    setLedgerGiftOnly(false);
  };

  const hasActiveLedgerFilters =
    ledgerSearch.trim() !== '' ||
    ledgerTypeFilter !== 'ALL' ||
    ledgerStatusFilter !== 'ALL' ||
    ledgerDateFrom !== '' ||
    ledgerDateTo !== '' ||
    ledgerMinAmount.trim() !== '' ||
    ledgerMaxAmount.trim() !== '' ||
    ledgerGiftOnly;

  const parsedLedgerBounds = useMemo(() => {
    const fromTs = ledgerDateFrom ? new Date(`${ledgerDateFrom}T00:00:00`).getTime() : null;
    const toTs = ledgerDateTo ? new Date(`${ledgerDateTo}T23:59:59.999`).getTime() : null;
    const minRaw = ledgerMinAmount.trim();
    const maxRaw = ledgerMaxAmount.trim();
    const minAmt =
      minRaw !== '' && Number.isFinite(Number(minRaw)) ? Math.max(0, Number(minRaw)) : null;
    const maxAmt =
      maxRaw !== '' && Number.isFinite(Number(maxRaw)) ? Math.max(0, Number(maxRaw)) : null;
    return {
      fromTs: fromTs !== null && Number.isFinite(fromTs) ? fromTs : null,
      toTs: toTs !== null && Number.isFinite(toTs) ? toTs : null,
      minAmt,
      maxAmt,
    };
  }, [ledgerDateFrom, ledgerDateTo, ledgerMinAmount, ledgerMaxAmount]);

  const isInvalidLedgerDateRange =
    parsedLedgerBounds.fromTs !== null &&
    parsedLedgerBounds.toTs !== null &&
    parsedLedgerBounds.fromTs > parsedLedgerBounds.toTs;

  const isInvalidLedgerAmountRange =
    parsedLedgerBounds.minAmt !== null &&
    parsedLedgerBounds.maxAmt !== null &&
    parsedLedgerBounds.minAmt > parsedLedgerBounds.maxAmt;

  const filteredLedgerTransactions = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    const { fromTs, toTs, minAmt, maxAmt } = parsedLedgerBounds;
    return transactions.filter((tx) => {
      if (ledgerTypeFilter !== 'ALL' && tx.type !== ledgerTypeFilter) return false;
      if (ledgerStatusFilter !== 'ALL' && tx.status !== ledgerStatusFilter) return false;
      if (ledgerGiftOnly && !tx.giftCard) return false;
      if (fromTs !== null && tx.createdAt < fromTs) return false;
      if (toTs !== null && tx.createdAt > toTs) return false;
      if (minAmt !== null && tx.amount < minAmt) return false;
      if (maxAmt !== null && tx.amount > maxAmt) return false;
      if (!q) return true;
      return (
        tx.txHash.toLowerCase().includes(q) ||
        tx.txId.toLowerCase().includes(q) ||
        tx.senderId.toLowerCase().includes(q) ||
        tx.senderName.toLowerCase().includes(q) ||
        tx.receiverId.toLowerCase().includes(q) ||
        tx.receiverName.toLowerCase().includes(q) ||
        (tx.note || '').toLowerCase().includes(q) ||
        (tx.giftCard?.cardTitleBn || '').toLowerCase().includes(q) ||
        (tx.giftCard?.cardTitleEn || '').toLowerCase().includes(q)
      );
    });
  }, [transactions, ledgerSearch, ledgerTypeFilter, ledgerStatusFilter, ledgerGiftOnly, parsedLedgerBounds]);

  const ledgerAuditStats = useMemo(() => {
    const totalVolume = filteredLedgerTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const totalFees = filteredLedgerTransactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
    const highValueCount = filteredLedgerTransactions.filter(
      (tx) => tx.amount >= feeConfig.highValueThreshold
    ).length;
    return {
      totalVolume,
      totalFees,
      highValueCount,
    };
  }, [filteredLedgerTransactions, feeConfig.highValueThreshold]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!adminEmail.includes('@') || !adminPasscode.trim()) {
      setAuthError('Enter valid Admin email and password.');
      return;
    }
    try {
      const verified = await verifyAdminPasswordLogin(adminEmail, adminPasscode);
      onAdminLogin({
        adminEmail: verified.adminEmail,
        adminName: verified.adminName,
        adminRole: verified.adminRole,
        adminId: verified.adminRole === 'main_admin' ? 'ADM-MAIN' : verified.adminId,
        phone: verified.phone,
        profilePhotoUrl: verified.profilePhotoUrl,
        loggedInAt: Date.now(),
      });
      setAdminPasscode('');
      if (verified.adminRole === 'second_admin') {
        setSection('admin_profile');
      } else {
        setSection('overview');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Admin login failed.');
    }
  };

  const handleUserStatusButtonClick = async (user: AcashUser) => {
    if (user.status === 'active') {
      // Open Disable Cause Modal so Admin writes the exact reason before disabling & emailing Gmail
      setDisableTargetUser(user);
      setDisableCause('');
      return;
    }

    // Re-enable user & send reactivation email
    if (!adminSession) return;
    setActionBusyId(user.accountId);
    setFeedbackMsg('');
    try {
      await adminToggleUserStatus(user.accountId, 'active', 'Re-activated by Platform Admin', adminSession.adminEmail);
      const emailRes = await sendAccountStatusEmail({
        toEmail: user.email,
        toName: user.businessName || user.name,
        accountId: user.accountId,
        status: 'active',
        reason: 'Your account has been reviewed and re-enabled by Platform Administration.',
      });
      setFeedbackMsg(
        emailRes.sent
          ? `${user.accountId} re-enabled and notification emailed to ${user.email}.`
          : `${user.accountId} re-enabled (EmailJS notice: ${emailRes.error}).`
      );
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmDisableWithCause = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableTargetUser || !adminSession || !disableCause.trim()) return;

    setDisableSubmitting(true);
    setFeedbackMsg('');
    try {
      const cleanCause = disableCause.trim();
      await adminToggleUserStatus(
        disableTargetUser.accountId,
        'disabled',
        cleanCause,
        adminSession.adminEmail
      );

      const emailRes = await sendAccountStatusEmail({
        toEmail: disableTargetUser.email,
        toName: disableTargetUser.businessName || disableTargetUser.name,
        accountId: disableTargetUser.accountId,
        status: 'disabled',
        reason: cleanCause,
      });

      setFeedbackMsg(
        emailRes.sent
          ? `Account ${disableTargetUser.accountId} disabled. Cause emailed automatically to ${disableTargetUser.email}.`
          : `Account ${disableTargetUser.accountId} disabled & saved. (EmailJS notice: ${emailRes.error})`
      );
      setDisableTargetUser(null);
      setDisableCause('');
    } finally {
      setDisableSubmitting(false);
    }
  };

  const handleBulkEnableSelected = async () => {
    if (!adminSession || selectedDisabledUsers.length === 0) return;
    setBulkBusy(true);
    setFeedbackMsg('');
    try {
      const updated = await adminBulkUpdateUserStatus({
        accountIds: selectedDisabledUsers.map((u) => u.accountId),
        newStatus: 'active',
        reason: 'Bulk re-activated by Platform Admin',
        adminEmail: adminSession.adminEmail,
      });

      let emailSentCount = 0;
      for (const target of updated) {
        const emailRes = await sendAccountStatusEmail({
          toEmail: target.email,
          toName: target.businessName || target.name,
          accountId: target.accountId,
          status: 'active',
          reason: 'Your account has been reviewed and re-enabled by Platform Administration.',
        });
        if (emailRes.sent) emailSentCount += 1;
      }
      setFeedbackMsg(
        `Bulk enabled ${updated.length} account(s) & logged in Activity Log. Gmail notifications delivered: ${emailSentCount}/${updated.length}.`
      );
      setSelectedUserIds([]);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleConfirmBulkDisableWithCause = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession || selectedActiveUsers.length === 0 || !bulkDisableCause.trim()) return;
    setBulkBusy(true);
    setFeedbackMsg('');
    try {
      const cleanCause = bulkDisableCause.trim();
      const updated = await adminBulkUpdateUserStatus({
        accountIds: selectedActiveUsers.map((u) => u.accountId),
        newStatus: 'disabled',
        reason: cleanCause,
        adminEmail: adminSession.adminEmail,
      });

      let emailSentCount = 0;
      for (const target of updated) {
        const emailRes = await sendAccountStatusEmail({
          toEmail: target.email,
          toName: target.businessName || target.name,
          accountId: target.accountId,
          status: 'disabled',
          reason: cleanCause,
        });
        if (emailRes.sent) emailSentCount += 1;
      }
      setFeedbackMsg(
        `Bulk disabled ${updated.length} account(s) (Cause: "${cleanCause}") & logged in Activity Log. Gmail notifications delivered: ${emailSentCount}/${updated.length}.`
      );
      setBulkDisableOpen(false);
      setBulkDisableCause('');
      setSelectedUserIds([]);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleMainAdminMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession || !isCurrentMainAdmin) return;
    setMintBusy(true);
    setFeedbackMsg('');
    try {
      const { vault, tx } = await mainAdminMintTreasuryCredit({
        amount: Number(mintAmount),
        reason: mintReason,
        actorEmail: adminSession.adminEmail,
      });
      setFeedbackMsg(
        `Main Admin minted ${formatBdt(tx.amount)} into ADMIN-TREASURY. New Vault Balance: ${formatBdt(vault.balance)}. Tx Hash: ${tx.txHash}`
      );
      setMintAmount('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Treasury mint failed.');
    } finally {
      setMintBusy(false);
    }
  };

  const handleCreditAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession) return;
    setCreditBusy(true);
    setFeedbackMsg('');
    try {
      const tx = await adminCreditAccount({
        targetIdentifier: creditTarget,
        amount: Number(creditAmount),
        reason: creditReason,
        adminEmail: adminSession.adminEmail,
      });
      setFeedbackMsg(
        `Added ${formatBdt(tx.amount)} credit to ${tx.receiverName} (${tx.receiverId}). Tx Hash: ${tx.txHash}`
      );
      setCreditAmount('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Credit add failed.');
    } finally {
      setCreditBusy(false);
    }
  };

  const handleAdminTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession) return;
    setTransferBusy(true);
    setFeedbackMsg('');
    try {
      const tx = await adminTransferBetweenAccounts({
        fromIdentifier: transferFrom,
        toIdentifier: transferTo,
        amount: Number(transferAmount),
        reason: transferReason,
        adminEmail: adminSession.adminEmail,
      });
      setFeedbackMsg(
        `Transferred ${formatBdt(tx.amount)} from ${tx.senderId} to ${tx.receiverId}. Tx Hash: ${tx.txHash}`
      );
      setTransferAmount('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Transfer failed.');
    } finally {
      setTransferBusy(false);
    }
  };

  const handleApproveTx = async (txId: string) => {
    if (!adminSession) return;
    setActionBusyId(txId);
    setFeedbackMsg('');
    try {
      await adminApproveTransaction(txId, adminSession.adminEmail);
      setFeedbackMsg(
        `High-value transaction ${txId} approved and settled. Approval emails dispatched to user & admin.`
      );
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Approval error.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectTx = async (txId: string) => {
    if (!adminSession) return;
    setActionBusyId(txId);
    setFeedbackMsg('');
    try {
      await adminRejectTransaction(txId, adminSession.adminEmail);
      setFeedbackMsg(
        `Transaction ${txId} rejected and refunded to sender. Rejection emails dispatched to user & admin.`
      );
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Rejection error.');
    } finally {
      setActionBusyId(null);
    }
  };

  const openTxActionModal = (mode: 'pending' | 'delete', tx: AcashTransaction) => {
    setTxActionReason('');
    setTxActionModal({ mode, tx });
  };

  const handleConfirmTxAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession || !txActionModal) return;
    const { mode, tx } = txActionModal;
    setTxActionSubmitting(true);
    setActionBusyId(tx.txId);
    setFeedbackMsg('');
    try {
      if (mode === 'pending') {
        await adminMarkTransactionPending(tx.txId, adminSession.adminEmail, txActionReason);
        setFeedbackMsg(
          lang === 'bn'
            ? `লেনদেন ${tx.txHash} পেন্ডিং (Pending Admin Approval) করা হয়েছে — কোনো অ্যাকাউন্টে নতুন করে টাকা ক্রেডিট হয়নি।`
            : `Transaction ${tx.txHash} marked as Pending Admin Approval. Zero new credit issued to any account.`
        );
      } else {
        await adminDeleteTransaction(tx.txId, adminSession.adminEmail, txActionReason);
        setFeedbackMsg(
          lang === 'bn'
            ? `লেনদেন ${tx.txHash} অ্যাডমিন, ইউজার, এজেন্ট ও মার্চেন্টের সকল স্টেটমেন্ট থেকে স্থায়ীভাবে ডিলিট করা হয়েছে।`
            : `Transaction ${tx.txHash} permanently deleted from all statements (User, Agent, Merchant & Admin).`
        );
      }
      setTxActionModal(null);
      setTxActionReason('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Transaction action failed.');
    } finally {
      setTxActionSubmitting(false);
      setActionBusyId(null);
    }
  };

  const handleSaveFeeEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession) return;
    setSavingFee(true);
    setFeedbackMsg('');
    try {
      await adminUpdateFeeConfig({
        feePer1000: computedTotalFeePer1000,
        agentShare: Math.max(0, Number(editAgentShare) || 0),
        govtShare: Math.max(0, Number(editGovtShare) || 0),
        adminShare: Math.max(0, Number(editAdminShare) || 0),
        merchantCashOutFeePer1000: computedMerchantCashOutPer1000,
        merchantCashOutAgentShare: Math.max(0, Number(editMerchantAgentShare) || 0),
        merchantCashOutGovtShare: Math.max(0, Number(editMerchantGovtShare) || 0),
        merchantCashOutAdminShare: Math.max(0, Number(editMerchantAdminShare) || 0),
        merchantCashOutToAdminFeePer1000: computedMerchantToAdminPer1000,
        merchantCashOutToAdminGovtShare: Math.max(0, Number(editMerchantToAdminGovtShare) || 0),
        merchantCashOutToAdminShare: Math.max(0, Number(editMerchantToAdminShare) || 0),
        sendMoneyChargeMode: editSendMoneyMode,
        sendMoneyFreeThreshold: Math.max(0, Number(editSendMoneyFreeThreshold) || 0),
        sendMoneyFeeRate: computedSendMoneyRate,
        sendMoneyGovtShare: Math.max(0, Number(editSendMoneyGovtShare) || 0),
        sendMoneyAdminShare: Math.max(0, Number(editSendMoneyAdminShare) || 0),
        cashInCommissionPer1000: Math.max(0, Number(editCashInComm) || 0),
        highValueThreshold: Math.max(1000, Number(editHighThreshold) || 50000),
        updatedBy: adminSession.adminEmail,
      });
      setFeedbackMsg(
        `Fee structure published! User Cash-Out: ৳${computedTotalFeePer1000}/1k · Merchant Cash-Out: ৳${computedMerchantCashOutPer1000}/1k (Admin ৳${computedMerchantToAdminPer1000}/1k) · Send Money: ৳${computedSendMoneyRate}. All new transactions & statements will use these charges.`
      );
    } finally {
      setSavingFee(false);
    }
  };

  const completeGoogleAdminAuth = async (fbUser: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  }) => {
    const email = (fbUser.email || '').trim().toLowerCase();
    if (!email) throw new Error('Google account has no verified email.');
    const verified = await authorizeGoogleAdminLogin({
      email,
      uid: fbUser.uid,
      displayName: fbUser.displayName,
      photoURL: fbUser.photoURL,
    });
    onAdminLogin({
      adminEmail: verified.adminEmail,
      adminName: verified.adminName,
      adminRole: verified.adminRole,
      adminId: verified.adminRole === 'main_admin' ? 'ADM-MAIN' : verified.adminId,
      phone: verified.phone,
      profilePhotoUrl: verified.profilePhotoUrl,
      firebaseUid: fbUser.uid,
      loggedInAt: Date.now(),
    });
    if (verified.adminRole === 'second_admin') {
      setSection('admin_profile');
    } else {
      setSection('overview');
    }
  };

  useEffect(() => {
    if (adminSession) return;
    let active = true;
    const handleRedirectReturn = async () => {
      const outcome = await consumeGoogleRedirectResult('admin');
      if (!active) return;
      if (outcome.error) {
        setAuthError(outcome.error);
        return;
      }
      if (outcome.user) {
        setGoogleAdminBusy(true);
        try {
          await completeGoogleAdminAuth(outcome.user);
        } catch (err) {
          if (active) {
            setAuthError(err instanceof Error ? err.message : 'Google Admin Sign-In failed.');
          }
        } finally {
          if (active) setGoogleAdminBusy(false);
        }
      }
    };
    void handleRedirectReturn();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSession]);

  const handleGoogleAdminSignIn = async () => {
    setAuthError('');
    setGoogleAdminBusy(true);
    try {
      const outcome = await signInWithGoogleSmart('admin');
      if (outcome.status === 'redirecting') {
        return;
      }
      await completeGoogleAdminAuth(outcome.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Admin Sign-In failed.');
    } finally {
      setGoogleAdminBusy(false);
    }
  };

  const handleSecondAdminPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressAdminImageToDataUrl(file, 320, 0.84);
      setSecondAdminPhotoInput(dataUrl);
      setFeedbackMsg('2nd Admin photo ready — click "Save Real Location Directly to Map" to publish.');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Could not read image.');
    }
  };

  const handleSaveSecondAdminLocation = async (loc: RealLocationValue) => {
    if (!adminSession || isCurrentMainAdmin) return;
    const targetAdminId = activeSecondAdmin?.adminId || adminSession.adminId;
    if (!targetAdminId) {
      setFeedbackMsg('2nd Admin account ID missing. Please sign in again.');
      return;
    }

    setSavingSecondAdmin(true);
    setFeedbackMsg('');
    try {
      const saved = await saveSecondAdminProfileAndLocation({
        adminId: targetAdminId,
        actorEmail: adminSession.adminEmail,
        name: secondAdminNameInput || adminSession.adminName,
        title: secondAdminTitleInput,
        phone: secondAdminPhoneInput || '01799000101',
        profilePhotoUrl: secondAdminPhotoInput || undefined,
        mapLocation: {
          lat: loc.lat,
          lng: loc.lng,
          address: loc.address,
          area: loc.area,
          city: loc.city,
          isVisible: loc.isVisible,
        },
      });

      onAdminLogin({
        ...adminSession,
        adminName: saved.name,
        adminId: saved.adminId,
        phone: saved.phone,
        profilePhotoUrl: saved.profilePhotoUrl,
      });

      setFeedbackMsg(
        lang === 'bn'
          ? `২য় এডমিন (${saved.adminId}) প্রোফাইল ও রিয়েল লোকেশন লাইভ ম্যাপে সেভ হয়েছে!`
          : `2nd Admin (${saved.adminId}) profile photo, number & live map location published!`
      );
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Could not save 2nd Admin location.');
    } finally {
      setSavingSecondAdmin(false);
    }
  };

  const handleCreateSecondAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession) return;
    setCreating2ndAdmin(true);
    setFeedbackMsg('');
    try {
      const created = await adminCreateSecondAdmin({
        name: new2ndName,
        title: new2ndTitle,
        email: new2ndEmail,
        phone: new2ndPhone,
        password: new2ndPassword,
        actorEmail: adminSession.adminEmail,
      });
      setFeedbackMsg(
        `Registered 2nd Admin ${created.name} (${created.adminId}). They can now sign in with ${created.email} and pin their location directly on the map.`
      );
      setNew2ndName('');
      setNew2ndEmail('');
      setNew2ndPhone('');
      setNew2ndPassword('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Failed to create 2nd Admin.');
    } finally {
      setCreating2ndAdmin(false);
    }
  };

  const handleChangeMainAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession || !isCurrentMainAdmin) return;
    if (newMainPwd !== confirmMainPwd) {
      setFeedbackMsg('New Main Admin passwords do not match.');
      return;
    }
    setChangingMainPwd(true);
    setFeedbackMsg('');
    try {
      await changeMainAdminPassword({
        currentPassword: currentMainPwd,
        newPassword: newMainPwd,
        actorEmail: adminSession.adminEmail,
      });
      setCurrentMainPwd('');
      setNewMainPwd('');
      setConfirmMainPwd('');
      setFeedbackMsg('Main Admin password updated securely and synced.');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Could not update Main Admin password.');
    } finally {
      setChangingMainPwd(false);
    }
  };

  const handleSaveNewBooth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession) return;
    if (!boothNameInput.trim() || !boothAddressInput.trim()) return;
    setSavingBooth(true);
    setFeedbackMsg('');
    try {
      const saved = await adminSaveBooth(
        {
          boothType: boothTypeInput,
          name: boothNameInput,
          area: boothAreaInput,
          city: boothCityInput,
          address: boothAddressInput,
          phone: boothPhoneInput || '16247',
          agentAccountId: boothTypeInput === 'agent_booth' ? boothAgentIdInput : undefined,
          hours: boothHoursInput,
          status: 'open',
          lat: Number(boothLatInput) || 23.7805,
          lng: Number(boothLngInput) || 90.4165,
          services: boothServicesInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          queueWaitMinutes: 4,
          cashLiquidityLevel: boothTypeInput === 'agent_booth' ? 'high' : undefined,
        },
        adminSession.adminEmail
      );
      setFeedbackMsg(`Added ${saved.name} (${saved.boothId}) to the Booth Map & Firestore.`);
      setBoothNameInput('');
      setBoothAddressInput('');
      setBoothPhoneInput('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Could not save booth.');
    } finally {
      setSavingBooth(false);
    }
  };

  const handleRefreshTreasury = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession || !isCurrentMainAdmin) return;
    const nextBal = Number(refreshBalanceVal);
    if (!Number.isFinite(nextBal) || nextBal < 0) {
      setFeedbackMsg('Please enter a valid non-negative balance for the treasury vault.');
      return;
    }
    setRefreshBusy(true);
    setFeedbackMsg('');
    try {
      await mainAdminRefreshTreasuryBalance({
        newBalance: nextBal,
        reason: refreshReasonVal,
        actorEmail: adminSession.adminEmail,
      });
      setFeedbackMsg(`Successfully refreshed ADMIN-TREASURY balance to ${formatBdt(nextBal, lang)}.`);
      setRefreshBalanceVal('');
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Could not refresh treasury balance.');
    } finally {
      setRefreshBusy(false);
    }
  };

  const handleFreezeAll = () => {
    if (!adminSession) return;
    setConfirmModal({
      title: lang === 'bn' ? 'সব অ্যাকাউন্ট ফ্রিজ করবেন?' : 'Freeze ALL Active Accounts?',
      message:
        lang === 'bn'
          ? 'সিস্টেমের সব সক্রিয় কাস্টমার, এজেন্ট ও মার্চেন্ট অ্যাকাউন্ট সাময়িকভাবে বন্ধ হবে।'
          : 'This will temporarily freeze every active Customer, Agent, and Merchant account across the platform.',
      confirmLabel: lang === 'bn' ? 'সব ফ্রিজ করুন' : 'Freeze All Accounts',
      tone: 'warning',
      onConfirm: async () => {
        setBulkBusy(true);
        setFeedbackMsg('');
        try {
          const frozen = await adminFreezeAllUsers({
            adminEmail: adminSession.adminEmail,
            reason: 'Admin emergency freeze of all system accounts',
          });
          setFeedbackMsg(`Successfully froze ${frozen.length} active account(s).`);
        } catch (err) {
          setFeedbackMsg(err instanceof Error ? err.message : 'Could not freeze accounts.');
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleDeleteSelected = () => {
    if (!adminSession || selectedUserIds.length === 0) return;
    setConfirmModal({
      title:
        lang === 'bn'
          ? `${selectedUserIds.length}টি নির্বাচিত অ্যাকাউন্ট ডিলিট করবেন?`
          : `Delete ${selectedUserIds.length} Selected Account(s)?`,
      message:
        lang === 'bn'
          ? 'নির্বাচিত অ্যাকাউন্টগুলো স্থায়ীভাবে মুছে যাবে এবং এটি ফিরিয়ে আনা যাবে না।'
          : 'This permanently deletes the selected accounts and releases their identity locks. This cannot be undone.',
      confirmLabel: lang === 'bn' ? 'স্থায়ী ডিলিট' : 'Delete Selected',
      tone: 'danger',
      onConfirm: async () => {
        setBulkBusy(true);
        setFeedbackMsg('');
        try {
          const deleted = await adminBulkDeleteUsers({
            accountIds: selectedUserIds,
            adminEmail: adminSession.adminEmail,
            reason: 'Admin bulk delete selected accounts',
          });
          setFeedbackMsg(`Permanently deleted ${deleted.length} account(s) and released identity locks.`);
          setSelectedUserIds([]);
        } catch (err) {
          setFeedbackMsg(err instanceof Error ? err.message : 'Could not delete accounts.');
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleDeleteAll = () => {
    if (!adminSession) return;
    setConfirmModal({
      title: lang === 'bn' ? 'সিস্টেমের সব অ্যাকাউন্ট ডিলিট করবেন?' : 'Delete ALL Platform Accounts?',
      message:
        lang === 'bn'
          ? 'সব অ্যাকাউন্ট ও আইডেন্টিটি লক স্থায়ীভাবে মুছে যাবে। নিশ্চিত হলে এগিয়ে যান।'
          : 'WARNING: This will permanently delete ALL Customer, Agent, and Merchant accounts and clear identity locks.',
      confirmLabel: lang === 'bn' ? 'সব ডিলিট করুন' : 'Delete All Accounts',
      tone: 'danger',
      onConfirm: async () => {
        setBulkBusy(true);
        setFeedbackMsg('');
        try {
          const allIds = users.map((u) => u.accountId);
          const deleted = await adminBulkDeleteUsers({
            accountIds: allIds,
            adminEmail: adminSession.adminEmail,
            reason: 'Admin bulk delete all system accounts',
          });
          setFeedbackMsg(`Permanently deleted all ${deleted.length} system accounts.`);
          setSelectedUserIds([]);
        } catch (err) {
          setFeedbackMsg(err instanceof Error ? err.message : 'Could not delete all accounts.');
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleFactoryResetSystem = () => {
    if (!adminSession) return;
    setConfirmModal({
      title: lang === 'bn' ? 'সিস্টেম ফ্যাক্টরি রিসেট' : 'Factory Reset Entire Platform',
      message:
        lang === 'bn'
          ? 'সকল ইউজার, এজেন্ট, মার্চেন্ট, লেনদেন, KYC রেকর্ড মুছে যাবে এবং ট্রেজারি ভল্ট ৳0.00-এ রিসেট হবে।'
          : 'Delete ALL users, merchants, agents, transactions, KYC records, and reset the treasury vault to 0 BDT so you can start fresh.',
      confirmLabel: lang === 'bn' ? 'ফ্যাক্টরি রিসেট নিশ্চিত করুন' : 'Confirm Factory Reset',
      tone: 'danger',
      onConfirm: async () => {
        setBulkBusy(true);
        setFeedbackMsg('');
        try {
          await adminResetAllAccountsAndTransactions({
            adminEmail: adminSession.adminEmail,
            reason: 'System factory reset by Main Admin',
          });
          setFeedbackMsg(
            'System factory reset completed successfully! All accounts, transactions & history wiped clean.'
          );
          setSelectedUserIds([]);
          setViewedAccountId(null);
        } catch (err) {
          setFeedbackMsg(err instanceof Error ? err.message : 'Factory reset failed.');
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleDeleteSingleUser = (accountId: string) => {
    if (!adminSession) return;
    setConfirmModal({
      title:
        lang === 'bn'
          ? `অ্যাকাউন্ট ${accountId} ডিলিট করবেন?`
          : `Delete Account ${accountId}?`,
      message:
        lang === 'bn'
          ? `অ্যাকাউন্ট ${accountId} স্থায়ীভাবে মুছে ফেলা হবে। এটি আর পুনরুদ্ধার করা যাবে না।`
          : `Permanently delete account ${accountId} and release its identity locks? This cannot be undone.`,
      confirmLabel: lang === 'bn' ? 'ডিলিট করুন' : 'Delete Account',
      tone: 'danger',
      onConfirm: async () => {
        setActionBusyId(accountId);
        setFeedbackMsg('');
        try {
          await adminDeleteUser(accountId, adminSession.adminEmail, 'Admin deleted account');
          setFeedbackMsg(`Successfully deleted account ${accountId}.`);
          if (viewedAccountId === accountId) setViewedAccountId(null);
        } catch (err) {
          setFeedbackMsg(err instanceof Error ? err.message : 'Could not delete account.');
        } finally {
          setActionBusyId(null);
        }
      },
    });
  };

  const handleSendBroadcastAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSession) return;
    setBroadcastBusy(true);
    setFeedbackMsg('');
    try {
      const sent = await adminSendAccountNotification({
        recipientIdentifier: broadcastTarget,
        title: broadcastTitle,
        message: broadcastMessage,
        severity: broadcastSeverity,
        adminEmail: adminSession.adminEmail,
      });
      setFeedbackMsg(
        sent.recipientId === 'ALL'
          ? `Live broadcast popup pushed to ALL Accounts ("${sent.title}").`
          : `Live popup alert pushed directly to ${sent.recipientId} ("${sent.title}").`
      );
      setBroadcastTitle('');
      setBroadcastMessage('');
      setBroadcastModalOpen(false);
    } catch (err) {
      setFeedbackMsg(err instanceof Error ? err.message : 'Could not send account alert.');
    } finally {
      setBroadcastBusy(false);
    }
  };

  if (!adminSession) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0D14] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
        <header className="px-4 sm:px-6 py-4 bg-white/90 dark:bg-[#0B0D14]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-3">
          <BrandLogo subtitle="Separate Admin Command App" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleLang}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {lang === 'en' ? 'EN | বাংলা' : 'বাংলা | EN'}
            </button>
            {externalUserPortalUrl ? (
              <a
                href={externalUserPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/25"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>{t('switchToApp', lang)}</span>
              </a>
            ) : !portalLocked ? (
              <button
                type="button"
                onClick={onSwitchToUnifiedApp}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/25"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>{t('switchToApp', lang)}</span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-7 sm:p-8 space-y-5 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {t('adminPortal', lang)}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('adminSubtitle', lang)}</p>
              </div>
            </div>

            <button
              type="button"
              disabled={googleAdminBusy}
              onClick={handleGoogleAdminSignIn}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold shadow-sm inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>
                {googleAdminBusy
                  ? 'Signing in with Google...'
                  : 'Sign in with Google Admin (Firebase Auth)'}
              </span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="px-3 bg-white dark:bg-[#121622] text-[10px] uppercase tracking-wider text-slate-400 shrink-0">
                Or Passcode Login
              </span>
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdminEmail(DEFAULT_ADMIN_ALERT_EMAIL)}
                className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                  isMainAdminEmail(adminEmail)
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Main Admin
              </button>
              <button
                type="button"
                onClick={() => setAdminEmail('rafiq.admin@acash.com')}
                className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                  !isMainAdminEmail(adminEmail)
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                2nd Admin (Location Pin)
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Administrator Email
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Admin Security Passcode
              </label>
              <input
                type="password"
                required
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Enter executive password"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white shadow-sm transition-colors"
            >
              Access Admin Command Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0D14] text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row transition-colors duration-200 overflow-x-hidden">
      {/* Left Admin Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-white dark:bg-[#121622] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
        <div className="space-y-6">
          <BrandLogo subtitle="Admin Command App" />

          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5">
            {[
              { id: 'overview', label: 'Platform Overview', icon: Activity },
              { id: 'treasury', label: 'Credit Add & Transfer', icon: PlusCircle },
              { id: 'users', label: t('globalUsers', lang), icon: Users },
              {
                id: 'approvals',
                label: `${t('highValueQueue', lang)} (${metrics.pendingHighValue.length})`,
                icon: AlertOctagon,
              },
              {
                id: 'kyc_queue',
                label:
                  lang === 'bn'
                    ? `কেওয়াইসি কিউ (${metrics.pendingKycCount})`
                    : `KYC Queue (${metrics.pendingKycCount})`,
                icon: FileBadge2,
              },
              {
                id: 'booths',
                label:
                  lang === 'bn'
                    ? `লাইভ ম্যাপ ও বুথ (${booths.length + creatorLocations.filter((c) => c.isVisible).length})`
                    : `Live Map & Booths (${booths.length + creatorLocations.filter((c) => c.isVisible).length})`,
                icon: MapPin,
              },
              {
                id: 'social_engagement',
                label:
                  lang === 'bn'
                    ? 'সোশ্যাল এনগেজমেন্ট'
                    : 'Social Engagement',
                icon: Sparkles,
              },
              ...(!isCurrentMainAdmin
                ? [
                    {
                      id: 'admin_profile',
                      label:
                        lang === 'bn'
                          ? 'আমার প্রোফাইল ও ম্যাপ পিন'
                          : 'My Profile & Map Pin',
                      icon: UserIcon,
                    },
                  ]
                : []),
              { id: 'fees', label: t('feeEngine', lang), icon: Sliders },
              { id: 'ledger', label: t('globalLedger', lang), icon: Lock },
              {
                id: 'activity',
                label:
                  lang === 'bn'
                    ? `অ্যাক্টিভিটি লগ (${activityLogs.length})`
                    : `Activity Log (${activityLogs.length})`,
                icon: ClipboardList,
              },
            ].map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id as AdminSection)}
                  className={`min-h-[42px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors text-left ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block space-y-2.5 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
            <span>{isCurrentMainAdmin ? 'Main Admin (Map Pin Exempt)' : `2nd Admin (${activeSecondAdmin?.adminId || adminSession.adminId || 'ADM'})`}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{adminSession.adminEmail}</div>
          {externalUserPortalUrl ? (
            <a
              href={externalUserPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-2"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{t('switchToApp', lang)}</span>
            </a>
          ) : !portalLocked ? (
            <button
              type="button"
              onClick={onSwitchToUnifiedApp}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-2"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{t('switchToApp', lang)}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdminLogout}
            className="w-full py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-xs font-semibold text-rose-700 dark:text-rose-200 inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('logout', lang)}</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-white/90 dark:bg-[#0B0D14]/90 backdrop-blur-md sticky top-0 z-30">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">{t('adminPortal', lang)}</h1>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                  isCurrentMainAdmin
                    ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/35'
                    : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/35'
                }`}
              >
                {isCurrentMainAdmin ? 'Main Admin' : '2nd Admin'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">{t('adminSubtitle', lang)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
              className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
              title="Quick Command Search (Ctrl+K / Cmd+K)"
            >
              <Command className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden md:inline">Quick Jump</span>
              <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-white dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-[10px] font-mono-tabular text-slate-500">
                ⌘K
              </kbd>
            </button>

            {!isCurrentMainAdmin && (
              <button
                type="button"
                onClick={() => setSection('admin_profile')}
                className="min-h-[38px] px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/35 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-xs font-semibold text-amber-800 dark:text-amber-200 inline-flex items-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                <span>{lang === 'bn' ? 'আমার লোকেশন পিন' : 'My Profile & Map Pin'}</span>
              </button>
            )}

            {/* Admin Voice Alert Mute + Gender Switch (Opposite Voice) */}
            <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-0.5">
              <button
                type="button"
                onClick={toggleAdminVoiceMute}
                title={voiceMuted ? 'Enable Transaction Voice Alerts' : 'Mute Transaction Voice Alerts'}
                className="min-h-[34px] px-2.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 hover:bg-white dark:hover:bg-slate-800"
              >
                {voiceMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-500" />}
                <span className="hidden xl:inline">{voiceMuted ? 'Muted' : 'Sound'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleAdminGender(adminGender === 'male' ? 'female' : 'male')}
                title="Switch Admin Sex (Male hears Female voice; Female hears Male voice)"
                className="min-h-[34px] px-2 rounded-lg text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800"
              >
                {adminGender === 'female' ? 'F→M Voice' : 'M→F Voice'}
              </button>
            </div>

            {/* Light / Dark Mode Switch */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
              <span className="hidden xl:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            {/* Notification Bell Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifDrawerOpen((prev) => !prev)}
                className="relative min-h-[38px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-100 inline-flex items-center gap-2"
              >
                <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Notifications</span>
                {unreadNotifications.length > 0 && (
                  <span className="font-mono-tabular px-1.5 py-0.5 rounded-md bg-indigo-600 text-[10px] font-bold text-white">
                    {unreadNotifications.length}
                  </span>
                )}
              </button>

              {notifDrawerOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Admin Notifications ({unreadNotifications.length} unread)
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadNotifications.length > 0 && (
                        <button
                          type="button"
                          onClick={() => markAllAdminNotificationsRead()}
                          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>Mark all read</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifDrawerOpen(false)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSavingAlertEmail(true);
                      try {
                        await setAdminAlertEmail(alertEmailInput);
                        setFeedbackMsg(`Admin alert email updated to ${alertEmailInput.trim().toLowerCase()}.`);
                      } catch (err) {
                        setFeedbackMsg(err instanceof Error ? err.message : 'Invalid email.');
                      } finally {
                        setSavingAlertEmail(false);
                      }
                    }}
                    className="px-4 py-2.5 bg-slate-50 dark:bg-[#0B0D14] border-b border-slate-200 dark:border-slate-800 space-y-1.5"
                  >
                    <label className="block text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                      Admin Alert Email (New Accounts & 50K+ AML)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        required
                        value={alertEmailInput}
                        onChange={(e) => setAlertEmailInput(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={savingAlertEmail}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white"
                      >
                        {savingAlertEmail ? '...' : 'Save'}
                      </button>
                    </div>
                  </form>
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            markAdminNotificationRead(n.id);
                            if (n.targetSection) setSection(n.targetSection);
                            setNotifDrawerOpen(false);
                          }}
                          className={`w-full p-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                            n.read ? 'opacity-65' : 'bg-indigo-50/60 dark:bg-indigo-500/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-bold ${
                                n.severity === 'critical'
                                  ? 'text-rose-600 dark:text-rose-300'
                                  : n.severity === 'warning'
                                    ? 'text-amber-600 dark:text-amber-300'
                                    : 'text-indigo-700 dark:text-indigo-300'
                              }`}
                            >
                              {n.title}
                            </span>
                            <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {n.message}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setBroadcastModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-sm transition-colors"
              title={lang === 'bn' ? 'অ্যাকাউন্ট পোর্টালে লাইভ অ্যালার্ট পাঠান' : 'Send Live Alert to Accounts'}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'অ্যালার্ট পাঠান' : 'Push Alert'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadGlobalLedgerPdf(transactions, users, feeConfig, adminSession.adminEmail)
              }
              className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Audit PDF</span>
            </button>
            <button
              type="button"
              onClick={() => downloadUsersDirectoryPdf(users, adminSession.adminEmail)}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Users PDF</span>
            </button>
            <button
              type="button"
              onClick={onToggleLang}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {lang === 'en' ? 'EN | বাংলা' : 'বাংলা | EN'}
            </button>
            {externalUserPortalUrl ? (
              <a
                href={externalUserPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="lg:hidden px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {t('switchToApp', lang)}
              </a>
            ) : !portalLocked ? (
              <button
                type="button"
                onClick={onSwitchToUnifiedApp}
                className="lg:hidden px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {t('switchToApp', lang)}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onAdminLogout}
              className="lg:hidden px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-200"
            >
              {t('logout', lang)}
            </button>
          </div>
        </header>

        {/* Persistent Live Admin Notification Bar */}
        {latestUnread && (
          <div
            className={`px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
              latestUnread.severity === 'critical'
                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-500/35 text-rose-900 dark:text-rose-100'
                : latestUnread.severity === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/35 text-amber-900 dark:text-amber-100'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30 text-indigo-900 dark:text-indigo-100'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Bell className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="font-semibold shrink-0">{latestUnread.title}:</span>
              <span className="truncate text-slate-700 dark:text-slate-200">{latestUnread.message}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {latestUnread.targetSection && (
                <button
                  type="button"
                  onClick={() => {
                    markAdminNotificationRead(latestUnread.id);
                    if (latestUnread.targetSection) setSection(latestUnread.targetSection);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white"
                >
                  Open
                </button>
              )}
              <button
                type="button"
                onClick={() => markAdminNotificationRead(latestUnread.id)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-black/30 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-black/50 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
              >
                Mark Read
              </button>
              {unreadNotifications.length > 1 && (
                <button
                  type="button"
                  onClick={() => setNotifDrawerOpen(true)}
                  className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 underline"
                >
                  +{unreadNotifications.length - 1} more
                </button>
              )}
            </div>
          </div>
        )}

        <main className="p-4 sm:p-6 space-y-6 flex-1">
          {adminVoiceBanner && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Volume2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0 text-xs">
                  <div className="font-bold text-emerald-800 dark:text-emerald-200">
                    Live Transaction Sound Alert · {formatBdt(adminVoiceBanner.amount, lang)} ({adminVoiceBanner.txHash})
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 truncate">{adminVoiceBanner.details}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminVoiceBanner(null)}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          {feedbackMsg && (
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/35 px-4 py-3 text-xs font-medium text-indigo-800 dark:text-indigo-200 flex items-center justify-between">
              <span>{feedbackMsg}</span>
              <button
                type="button"
                onClick={() => setFeedbackMsg('')}
                className="text-indigo-600 dark:text-indigo-300 hover:underline font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 3D Executive KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="acash-3d-tile rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-4 text-white">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300">{t('totalSystemFloat', lang)}</span>
                <button
                  type="button"
                  onClick={() => setSection('treasury')}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/25 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/40"
                >
                  Mint Vault
                </button>
              </div>
              <div className="font-mono-tabular text-xl font-bold text-white mt-1.5">
                {formatBdt(metrics.totalFloat, lang)}
              </div>
              <div className="text-[11px] text-indigo-300 mt-1">
                Vault: {formatBdt(treasuryVault.balance, lang)} · {metrics.activeUsersCount}/{users.length} active
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('adminRevenue', lang)}</div>
              <div className="font-mono-tabular text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                {formatBdt(metrics.adminRevenue, lang)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {feeConfig.adminShare} Tk / 1,000 rate
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('govtLevy', lang)}</div>
              <div className="font-mono-tabular text-xl font-bold text-sky-600 dark:text-sky-400 mt-1.5">
                {formatBdt(metrics.govtPool, lang)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {feeConfig.govtShare} Tk / 1,000 rate
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('agentPool', lang)}</div>
              <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1.5">
                {formatBdt(metrics.agentPool, lang)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {feeConfig.agentShare} Tk / 1,000 rate
              </div>
            </div>
            <div className="acash-3d-tile rounded-2xl bg-white dark:bg-[#121622] border border-amber-200 dark:border-amber-500/35 p-4">
              <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">{t('pendingReviews', lang)}</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-600 dark:text-amber-200 mt-1.5">
                {metrics.pendingHighValue.length}
              </div>
              <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
                Threshold: {formatBdt(feeConfig.highValueThreshold, lang)}
              </div>
            </div>
          </div>

          {/* SECTION: Overview */}
          {section === 'overview' && (
            <div className="space-y-6">
              <TransactionVolumeChart transactions={transactions} lang={lang} theme={theme} />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    High-Value Approval Queue (50,000+ BDT)
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('approvals')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Open Full Queue
                  </button>
                </div>

                {metrics.pendingHighValue.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                    No high-value transactions awaiting manual AML approval.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {metrics.pendingHighValue.map((tx) => (
                      <div
                        key={tx.txId}
                        className="p-4 rounded-2xl bg-amber-50/70 dark:bg-[#0B0D14] border border-amber-200 dark:border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="font-mono-tabular text-sm font-bold text-amber-700 dark:text-amber-300">
                            {formatBdt(tx.amount, lang)} · {tx.type.replace('_', ' ').toUpperCase()}
                          </div>
                          <div className="text-xs text-slate-900 dark:text-white mt-0.5">
                            {tx.senderName} ({tx.senderId}) → {tx.receiverName} ({tx.receiverId})
                          </div>
                          <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {tx.txHash} · {new Date(tx.createdAt).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={actionBusyId === tx.txId}
                            onClick={() => openTxActionModal('delete', tx)}
                            className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 transition-colors"
                            title={lang === 'bn' ? 'সব স্টেটমেন্ট থেকে ডিলিট করুন' : 'Delete from all statements'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{lang === 'bn' ? 'ডিলিট' : 'Delete'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId === tx.txId}
                            onClick={() => handleRejectTx(tx.txId)}
                            className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-xs font-semibold text-rose-700 dark:text-rose-200 transition-colors"
                          >
                            {t('rejectRefund', lang)}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId === tx.txId}
                            onClick={() => handleApproveTx(tx.txId)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
                          >
                            {t('approveSettle', lang)}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="xl:col-span-5 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Active Fee Distribution (per 1,000 BDT)
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('fees')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Configure All
                  </button>
                </div>

                <div className="font-mono-tabular text-3xl font-bold text-slate-900 dark:text-white">
                  ৳{feeConfig.feePer1000.toFixed(2)}
                </div>

                <div className="h-3.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-[#0B0D14]">
                  <div
                    className="bg-indigo-500"
                    style={{
                      width: `${
                        feeConfig.feePer1000 > 0
                          ? (feeConfig.agentShare / feeConfig.feePer1000) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div
                    className="bg-sky-500"
                    style={{
                      width: `${
                        feeConfig.feePer1000 > 0
                          ? (feeConfig.govtShare / feeConfig.feePer1000) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div
                    className="bg-emerald-500"
                    style={{
                      width: `${
                        feeConfig.feePer1000 > 0
                          ? (feeConfig.adminShare / feeConfig.feePer1000) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="space-y-2 text-xs pt-2">
                  <div className="flex justify-between">
                    <span className="text-indigo-600 dark:text-indigo-300 font-medium">Customer Cash-Out · Agent</span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                      ৳{feeConfig.agentShare.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sky-600 dark:text-sky-300 font-medium">Customer Cash-Out · Govt Levy</span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                      ৳{feeConfig.govtShare.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-600 dark:text-emerald-300 font-medium">Customer Cash-Out · Admin</span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                      ৳{feeConfig.adminShare.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Merchant Cash-Out (Agent / Admin)</span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                      ৳{feeConfig.merchantCashOutFeePer1000.toFixed(2)} / ৳
                      {feeConfig.merchantCashOutToAdminFeePer1000.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700 dark:text-amber-300 font-medium">User Send Money Charge</span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                      {feeConfig.sendMoneyChargeMode === 'per_1000'
                        ? `৳${feeConfig.sendMoneyFeeRate.toFixed(2)}/1k`
                        : `৳${feeConfig.sendMoneyFeeRate.toFixed(2)} (>৳${feeConfig.sendMoneyFreeThreshold})`}
                    </span>
                  </div>
                  </div>
                </div>
              </div>

              <AdminOverviewIntelligence
                users={users}
                transactions={transactions}
                lang={lang}
                theme={theme}
                onInspectAccount={(accId) => setViewedAccountId(accId)}
                onOpenLedgerGifts={() => {
                  setLedgerGiftOnly(true);
                  setSection('ledger');
                }}
              />
            </div>
          )}

          {/* SECTION: Credit Add & Admin Treasury Transfer */}
          {section === 'treasury' && (
            <div className="space-y-6">
              {/* Main Admin Unlimited Initial Credit Mint & Reserve Vault */}
              <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 text-white shadow-lg">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-center">
                  <div className="xl:col-span-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                        Unlimited Initial Capital
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-[10px] font-semibold">
                        ADMIN-TREASURY
                      </span>
                    </div>
                    <h2 className="font-display text-lg font-bold text-white">
                      {lang === 'bn'
                        ? 'মেইন এডমিন আনলিমিটেড ক্রেডিট ও ট্রেজারি ভল্ট'
                        : 'Main Admin Unlimited Credit Mint & Treasury Vault'}
                    </h2>
                    <div className="font-mono-tabular text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight">
                      {formatCompactBdt(treasuryVault.balance, lang)}
                      <div className="text-xs font-semibold text-indigo-200 mt-1">
                        Exact: {formatBdt(treasuryVault.balance, lang)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        <div className="text-[10px] text-slate-300 uppercase">Total Minted</div>
                        <div className="font-mono-tabular text-xs font-bold text-emerald-300 mt-0.5">
                          {formatBdt(treasuryVault.totalMinted, lang)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        <div className="text-[10px] text-slate-300 uppercase">Total Disbursed</div>
                        <div className="font-mono-tabular text-xs font-bold text-amber-300 mt-0.5">
                          {formatBdt(treasuryVault.totalDisbursed, lang)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isCurrentMainAdmin ? (
                    <form
                      onSubmit={handleMainAdminMint}
                      className="xl:col-span-7 rounded-2xl bg-white/5 border border-white/15 p-4 sm:p-5 space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-indigo-100">
                          {lang === 'bn'
                            ? 'মেইন এডমিন হিসেবে ইচ্ছামতো ক্রেডিট অ্যাড করুন (কোনো লিমিট নেই)'
                            : 'Mint Any Initial Credit Amount (No Upper Limit)'}
                        </div>
                        <span className="text-[10px] text-emerald-300 font-mono-tabular">
                          Actor: {adminSession.adminEmail}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {[100000, 1000000, 10000000, 500000000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setMintAmount(String(preset))}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-indigo-500/40 border border-white/15 text-[11px] font-mono-tabular font-semibold text-white transition-colors"
                          >
                            +৳{preset.toLocaleString()}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-300 mb-1">
                            Credit Amount (BDT — Unlimited)
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            value={mintAmount}
                            onChange={(e) => setMintAmount(e.target.value)}
                            placeholder="e.g. 50000000"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/20 text-sm font-mono-tabular text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-300 mb-1">
                            Mint Reference / Note
                          </label>
                          <input
                            type="text"
                            required
                            value={mintReason}
                            onChange={(e) => setMintReason(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/20 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={mintBusy}
                        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-bold transition-colors shadow-sm disabled:opacity-60"
                      >
                        {mintBusy
                          ? 'Minting Unlimited Credit...'
                          : lang === 'bn'
                            ? 'ট্রেজারিতে ক্রেডিট অ্যাড করুন'
                            : 'Add Unlimited Credit to Main Admin Treasury'}
                      </button>
                    </form>
                  ) : (
                    <div className="xl:col-span-7 rounded-2xl bg-white/5 border border-white/15 p-5 space-y-2">
                      <div className="text-sm font-bold text-amber-300">Main Admin Exclusive Privilege</div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Only the Main Admin ({DEFAULT_ADMIN_ALERT_EMAIL}) can mint unlimited initial capital into ADMIN-TREASURY. As a 2nd Admin, you can still disburse and transfer funds below.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Main Admin Refresh Mint Balance & Timestamped Audit History */}
              {isCurrentMainAdmin && (
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {lang === 'bn' ? 'ট্রেজারি মিন্ট ব্যালেন্স রিফ্রেশ ও রিসেট' : 'Treasury Mint Balance Refresh & Reset'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Main Admin can refresh or reset ADMIN-TREASURY mint balance at any time with full timestamped audit logs.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-mono-tabular font-semibold">
                      Current Vault: {formatBdt(treasuryVault.balance, lang)}
                    </span>
                  </div>

                  <form onSubmit={handleRefreshTreasury} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        New Refreshed Balance (BDT)
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={refreshBalanceVal}
                        onChange={(e) => setRefreshBalanceVal(e.target.value)}
                        placeholder="e.g. 0 or 100000000"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Refresh Reason / Audit Note
                      </label>
                      <input
                        type="text"
                        required
                        value={refreshReasonVal}
                        onChange={(e) => setRefreshReasonVal(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <button
                        type="submit"
                        disabled={refreshBusy}
                        className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white shadow-sm transition-colors disabled:opacity-50"
                      >
                        {refreshBusy ? 'Refreshing...' : 'Refresh / Reset Balance'}
                      </button>
                    </div>
                  </form>

                  {treasuryVault.mintHistory && treasuryVault.mintHistory.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {lang === 'bn' ? 'মিন্ট ও রিফ্রেশ ইতিহাস (তারিখ ও সময় সহ)' : 'Mint & Balance Refresh History (Date & Time)'}
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-2">
                        {treasuryVault.mintHistory.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    item.action === 'mint'
                                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  }`}
                                >
                                  {item.action.toUpperCase()}
                                </span>
                                <span>{item.note}</span>
                              </div>
                              <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {new Date(item.timestamp).toLocaleString()} · Actor: {item.actorEmail}
                              </div>
                            </div>
                            <div className="text-right font-mono-tabular">
                              <div className="font-bold text-indigo-600 dark:text-indigo-400">
                                {item.action === 'mint' ? '+' : 'Reset'} {formatBdt(item.amount, lang)}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {formatBdt(item.previousBalance, lang)} → {formatBdt(item.newBalance, lang)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Credit Add Card */}
              <form
                onSubmit={handleCreditAdd}
                className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <PlusCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Admin Credit Add (Direct Wallet Deposit)
                    </h2>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                    No Cap
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inject any unlimited initial liquidity or promotional balance directly into any Customer (U), Agent (A), or Merchant (M) wallet.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Target Account (Select or enter ID/Phone)
                  </label>
                  <select
                    value={creditTarget}
                    onChange={(e) => setCreditTarget(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white mb-2 focus:outline-none focus:border-indigo-500"
                  >
                    {users.map((u) => (
                      <option key={u.accountId} value={u.accountId} className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">
                        {u.accountId} — {u.businessName || u.name} ({formatBdt(u.balance)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={creditTarget}
                    onChange={(e) => setCreditTarget(e.target.value)}
                    placeholder="Or enter Acash ID / Phone"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Credit Amount (BDT — Unlimited)
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {[10000, 50000, 500000, 5000000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCreditAmount(String(preset))}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-[10px] font-mono-tabular font-semibold text-slate-700 dark:text-slate-300"
                        >
                          +৳{preset.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder="e.g. 25000 or 5000000"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Audit Reason / Reference
                  </label>
                  <input
                    type="text"
                    required
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creditBusy}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition-colors"
                >
                  {creditBusy ? 'Crediting Wallet...' : 'Credit Account Balance'}
                </button>
              </form>

              {/* Admin Transfer Card */}
              <form
                onSubmit={handleAdminTransfer}
                className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Send className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Admin Fund Transfer (Treasury / Inter-Account)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Move settlement funds from Admin Treasury or between any two platform accounts with an immutable ledger record.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Source Account
                    </label>
                    <select
                      value={transferFrom}
                      onChange={(e) => setTransferFrom(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ADMIN-TREASURY" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">
                        ADMIN-TREASURY (Platform Mint)
                      </option>
                      {users.map((u) => (
                        <option key={u.accountId} value={u.accountId} className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">
                          {u.accountId} — {u.businessName || u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Destination Account
                    </label>
                    <select
                      value={transferTo}
                      onChange={(e) => setTransferTo(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      {users.map((u) => (
                        <option key={u.accountId} value={u.accountId} className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">
                          {u.accountId} — {u.businessName || u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Transfer Amount (BDT)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Settlement Note
                  </label>
                  <input
                    type="text"
                    required
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={transferBusy}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
                >
                  {transferBusy ? 'Executing Transfer...' : 'Execute Admin Transfer'}
                </button>
              </form>

              {/* Incoming Agent & Merchant Cash-Outs to ADMIN-TREASURY */}
              <div className="lg:col-span-12 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Agent & Merchant Cash-Outs to Admin Treasury
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Agents cash out strictly to Admin Treasury; Merchants cash out to Agent or Admin Treasury.
                    </p>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Settled Total:{' '}
                    {formatBdt(
                      transactions
                        .filter(
                          (tx) =>
                            tx.receiverId === 'ADMIN-TREASURY' &&
                            tx.status === 'completed' &&
                            (tx.type === 'agent_cash_out' || tx.type === 'merchant_cash_out')
                        )
                        .reduce((s, tx) => s + tx.amount, 0),
                      lang
                    )}
                  </span>
                </div>

                {transactions.filter(
                  (tx) =>
                    tx.receiverId === 'ADMIN-TREASURY' &&
                    (tx.type === 'agent_cash_out' || tx.type === 'merchant_cash_out')
                ).length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                    No Agent or Merchant Cash-Out settlements received by Admin Treasury yet.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto">
                    {transactions
                      .filter(
                        (tx) =>
                          tx.receiverId === 'ADMIN-TREASURY' &&
                          (tx.type === 'agent_cash_out' || tx.type === 'merchant_cash_out')
                      )
                      .map((tx) => (
                        <div
                          key={tx.txId}
                          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {tx.senderName} ({tx.senderId}) ·{' '}
                              <span className="text-indigo-600 dark:text-indigo-300">
                                {tx.type.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {tx.txHash} · {new Date(tx.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400">
                              + {formatBdt(tx.amount, lang)}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300">
                              {tx.status.replace(/_/g, ' ')}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {/* SECTION: Global User Oversight & Creator Search */}
          {section === 'users' && (
            <div className="space-y-5">
              {/* Highlighted Creator Dossier Preview Card when searching or inspecting a creator */}
              {inspectedCreator && (
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-indigo-200 dark:border-indigo-500/35 p-5 sm:p-6 shadow-md space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-4">
                      {(inspectedCreator.profilePhotoUrl || inspectedCreator.kyc?.nidPhotoUrl) ? (
                        <img
                          src={inspectedCreator.profilePhotoUrl || inspectedCreator.kyc?.nidPhotoUrl}
                          alt={inspectedCreator.name}
                          className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
                          <UserIcon className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular text-sm font-bold text-indigo-600 dark:text-indigo-400">
                            {inspectedCreator.accountId}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                            {inspectedCreator.role === 'U'
                              ? 'Customer (U)'
                              : inspectedCreator.role === 'A'
                                ? 'Agent (A)'
                                : 'Merchant (M)'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                              inspectedCreator.kyc?.status === 'verified'
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/35 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            KYC: {(inspectedCreator.kyc?.status || 'unverified').toUpperCase()}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                          {inspectedCreator.businessName || inspectedCreator.name}
                          {inspectedCreator.businessName && (
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-2">
                              ({inspectedCreator.name})
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {inspectedCreator.email} · <span className="font-mono-tabular">{inspectedCreator.phone}</span> · Balance:{' '}
                          <span className="font-mono-tabular font-bold text-emerald-600 dark:text-emerald-300">
                            {formatBdt(inspectedCreator.balance, lang)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewedAccountId(inspectedCreator.accountId)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span>{lang === 'bn' ? 'সম্পূর্ণ অ্যাকাউন্ট দেখুন' : 'Full Account View'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          downloadAccountStatementPdf(
                            inspectedCreator,
                            transactions.filter(
                              (tx) =>
                                tx.senderId === inspectedCreator.accountId ||
                                tx.receiverId === inspectedCreator.accountId
                            ),
                            feeConfig
                          )
                        }
                        className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Download Statement PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          downloadCreatorKycProfilePdf(inspectedCreator, adminSession.adminEmail)
                        }
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <FileBadge2 className="w-4 h-4" />
                        <span>Download KYC & Pic PDF</span>
                      </button>

                      {selectedDossierId && (
                        <button
                          type="button"
                          onClick={() => setSelectedDossierId(null)}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Close preview"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Updated KYC & Onboarding Security Summary Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Account Opening Date</div>
                      <div className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                        {new Date(inspectedCreator.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Referred By (Security)</div>
                      <div className="font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5 break-words">
                        {formatUserReferralSource(inspectedCreator)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">NID / Passport</div>
                      <div className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                        {inspectedCreator.kyc?.nidNumber || 'Not submitted'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Date of Birth / Occupation</div>
                      <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                        {inspectedCreator.kyc?.dateOfBirth || '—'} · {inspectedCreator.kyc?.occupation || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Present Address</div>
                      <div className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate" title={inspectedCreator.kyc?.address}>
                        {inspectedCreator.kyc?.address || 'Not submitted'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Nominee & KYC Updated</div>
                      <div className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                        {inspectedCreator.kyc?.nomineeName
                          ? `${inspectedCreator.kyc.nomineeName} (${inspectedCreator.kyc.nomineePhone || ''})`
                          : 'Not set'}
                      </div>
                      {inspectedCreator.kyc?.updatedAt && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-300 mt-0.5">
                          Updated: {new Date(inspectedCreator.kyc.updatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {inspectedCreator.role === 'M' && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-indigo-700 dark:text-indigo-300 font-semibold">
                          Merchant Tax Certificate (TIN / BIN):
                        </span>{' '}
                        <span className="font-mono-tabular font-bold text-slate-900 dark:text-white ml-1">
                          {inspectedCreator.kyc?.taxCertificateNumber || 'Not submitted yet'}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                          inspectedCreator.kyc?.taxCertificatePhotoUrl
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/35 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {inspectedCreator.kyc?.taxCertificatePhotoUrl
                          ? 'Tax Certificate Image Attached (Included in KYC PDF)'
                          : 'Tax Certificate Image Not Attached'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#0B0D14] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                    {(['ALL', 'U', 'A', 'M'] as const).map((rf) => (
                      <button
                        key={rf}
                        type="button"
                        onClick={() => setRoleFilter(rf)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          roleFilter === rf
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {rf === 'ALL'
                          ? 'All Roles'
                          : rf === 'U'
                            ? 'Customer (U)'
                            : rf === 'A'
                              ? 'Agent (A)'
                              : 'Merchant (M)'}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-72">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => {
                          setUserSearch(e.target.value);
                          setSelectedDossierId(null);
                        }}
                        placeholder="Search Creator ID, name, phone, email, NID..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={filteredUsers.length === 0}
                      onClick={() => exportUsersToCsv(filteredUsers)}
                      className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadUsersDirectoryPdf(users, adminSession.adminEmail)}
                      className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 inline-flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Directory PDF</span>
                    </button>
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={handleFreezeAll}
                      className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/25 inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-40"
                      title="Freeze all active accounts in the system"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Freeze All</span>
                    </button>
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={handleDeleteAll}
                      className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-40"
                      title="Permanently delete all accounts"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All</span>
                    </button>
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={handleFactoryResetSystem}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-sm inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-40"
                      title="Factory Reset: Wipe all accounts, transactions & history"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Factory Reset All</span>
                    </button>
                  </div>
                </div>

                {/* Bulk Selection Action Bar */}
                {selectedUsers.length > 0 && (
                  <div className="px-5 py-3 bg-indigo-50 dark:bg-indigo-500/15 border-b border-indigo-200 dark:border-indigo-500/30 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold font-mono-tabular">
                        {selectedUsers.length} selected
                      </span>
                      <span className="text-slate-700 dark:text-slate-200">
                        <strong className="text-emerald-600 dark:text-emerald-300">{selectedActiveUsers.length}</strong> active ·{' '}
                        <strong className="text-rose-600 dark:text-rose-300">{selectedDisabledUsers.length}</strong> disabled
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedUserIds([])}
                        className="text-indigo-600 dark:text-indigo-300 hover:underline text-[11px] font-medium"
                      >
                        Clear selection
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={bulkBusy || selectedDisabledUsers.length === 0}
                        onClick={handleBulkEnableSelected}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {bulkBusy
                            ? 'Processing...'
                            : `Enable Selected (${selectedDisabledUsers.length})`}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={bulkBusy || selectedActiveUsers.length === 0}
                        onClick={() => {
                          setBulkDisableCause('');
                          setBulkDisableOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>
                          {bulkBusy
                            ? 'Processing...'
                            : `Disable Selected (${selectedActiveUsers.length})`}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={handleDeleteSelected}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                        title="Permanently delete selected accounts"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {bulkBusy ? 'Deleting...' : `Delete Selected (${selectedUsers.length})`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B0D14]">
                        <th className="py-3 pl-5 pr-2 w-10">
                          <input
                            type="checkbox"
                            aria-label="Select all visible accounts"
                            checked={allFilteredSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someFilteredSelected;
                            }}
                            onChange={toggleSelectAllFiltered}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0B0D14] accent-indigo-600 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-4 font-semibold">Creator & ID</th>
                        <th className="py-3 px-4 font-semibold">Role & KYC</th>
                        <th className="py-3 px-4 font-semibold">Contact</th>
                        <th className="py-3 px-4 font-semibold text-right">Balance</th>
                        <th className="py-3 px-4 font-semibold">Status & Cause</th>
                        <th className="py-3 px-5 font-semibold text-right">PDFs & Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u) => {
                        const isChecked = selectedUserSet.has(u.accountId);
                        return (
                        <tr
                          key={u.accountId}
                          onClick={() => setSelectedDossierId(u.accountId)}
                          className={`cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-indigo-50/90 dark:bg-indigo-500/15'
                              : inspectedCreator?.accountId === u.accountId
                                ? 'bg-indigo-50/50 dark:bg-indigo-500/10'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td
                            className="py-3.5 pl-5 pr-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Select account ${u.accountId}`}
                              checked={isChecked}
                              onChange={() => toggleSelectUser(u.accountId)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0B0D14] accent-indigo-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {(u.profilePhotoUrl || u.kyc?.nidPhotoUrl) ? (
                                <img
                                  src={u.profilePhotoUrl || u.kyc?.nidPhotoUrl}
                                  alt={u.name}
                                  referrerPolicy="no-referrer"
                                  className="w-9 h-9 rounded-xl object-cover border border-indigo-200 dark:border-indigo-500/35 shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
                                  <UserIcon className="w-4 h-4" />
                                </div>
                              )}
                              <div>
                                <div className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-400">
                                  {u.accountId}
                                </div>
                                <div className="text-slate-900 dark:text-white font-medium">
                                  {u.businessName || u.name}
                                </div>
                                {u.businessName && (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{u.name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                            <div>
                              {u.role === 'U' ? 'Customer (U)' : u.role === 'A' ? 'Agent (A)' : 'Merchant (M)'}
                            </div>
                            <div
                              className={`text-[11px] font-semibold mt-0.5 ${
                                u.kyc?.status === 'verified' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'
                              }`}
                            >
                              KYC: {(u.kyc?.status || 'unverified').toUpperCase()}
                            </div>
                            <div className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80 mt-0.5">
                              {formatUserReferralSource(u)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                            <div className="font-mono-tabular">{u.phone}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{u.email}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Opened: {new Date(u.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono-tabular font-bold text-slate-900 dark:text-white">
                            {formatBdt(u.balance, lang)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-semibold ${
                                u.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {u.status === 'active'
                                ? t('accountActive', lang)
                                : t('accountDisabled', lang)}
                            </span>
                            {u.status === 'disabled' && u.disableReason && (
                              <div className="text-[11px] text-rose-600/90 dark:text-rose-300/90 mt-0.5 max-w-[200px] truncate" title={u.disableReason}>
                                {u.disableReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewedAccountId(u.accountId)}
                                title={lang === 'bn' ? 'PDF ছাড়া সম্পূর্ণ অ্যাকাউন্ট দেখুন' : 'Inspect Full Account (No PDF needed)'}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1 transition-colors shadow-xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{lang === 'bn' ? 'দেখুন' : 'View'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCreditTarget(u.accountId);
                                  setSection('treasury');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors"
                              >
                                + Credit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadAccountStatementPdf(
                                    u,
                                    transactions.filter(
                                      (tx) =>
                                        tx.senderId === u.accountId || tx.receiverId === u.accountId
                                    ),
                                    feeConfig
                                  )
                                }
                                title="Download Statement PDF"
                                className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1 transition-colors"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Statement</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadCreatorKycProfilePdf(u, adminSession.adminEmail)
                                }
                                title="Download Single PDF with Pic & Updated KYC"
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/40 text-xs font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 inline-flex items-center gap-1 transition-colors"
                              >
                                <FileBadge2 className="w-3 h-3" />
                                <span>KYC & Pic</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionBusyId === u.accountId}
                                onClick={() => handleUserStatusButtonClick(u)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  u.status === 'active'
                                    ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/25'
                                    : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25'
                                }`}
                              >
                                {u.status === 'active'
                                  ? t('disableAccount', lang)
                                  : t('enableAccount', lang)}
                              </button>
                              <button
                                type="button"
                                disabled={actionBusyId === u.accountId}
                                onClick={() => handleDeleteSingleUser(u.accountId)}
                                title="Permanently delete account"
                                className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: High-Value 50K+ Approvals */}
          {section === 'approvals' && (
            <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Mandatory AML Review Queue (≥ {formatBdt(feeConfig.highValueThreshold, lang)})
              </h2>
              {metrics.pendingHighValue.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  All high-value transactions have been reviewed.
                </div>
              ) : (
                <div className="space-y-3">
                  {metrics.pendingHighValue.map((tx) => (
                    <div
                      key={tx.txId}
                      className="p-5 rounded-2xl bg-amber-50/70 dark:bg-[#0B0D14] border border-amber-200 dark:border-amber-500/35 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono-tabular text-lg font-bold text-amber-700 dark:text-amber-300">
                            {formatBdt(tx.amount, lang)}
                          </span>
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            {tx.type.replace('_', ' ').toUpperCase()}
                          </span>
                          <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                            {tx.txHash}
                          </span>
                        </div>
                        <div className="text-sm text-slate-900 dark:text-white">
                          From <span className="font-semibold">{tx.senderName}</span> ({tx.senderId}) → To{' '}
                          <span className="font-semibold">{tx.receiverName}</span> ({tx.receiverId})
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Fee: {formatBdt(tx.fee)} · Total Held: {formatBdt(tx.totalDebited)} ·{' '}
                          {new Date(tx.createdAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          disabled={actionBusyId === tx.txId}
                          onClick={() => openTxActionModal('delete', tx)}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{lang === 'bn' ? 'ডিলিট' : 'Delete'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === tx.txId}
                          onClick={() => handleRejectTx(tx.txId)}
                          className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-xs font-semibold text-rose-700 dark:text-rose-200 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>{t('rejectRefund', lang)}</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === tx.txId}
                          onClick={() => handleApproveTx(tx.txId)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t('approveSettle', lang)}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION: Dedicated KYC Verification Queue */}
          {section === 'kyc_queue' && (
            <AdminKycReviewQueuePanel
              users={users}
              adminEmail={adminSession.adminEmail}
              lang={lang}
              onInspectAccount={(accId) => setViewedAccountId(accId)}
              onFeedback={(msg) => setFeedbackMsg(msg)}
            />
          )}

          {/* SECTION: Social Engagement Management */}
          {section === 'social_engagement' && (
            <AdminSocialEngagementPanel
              lang={lang}
              adminEmail={adminSession.adminEmail}
              transactions={transactions}
              customGiftCards={customGiftCards}
              giftCardPolicy={giftCardPolicy}
              portalTheme={portalTheme}
              onInspectAccount={(accId) => setViewedAccountId(accId)}
              onFeedback={(msg) => setFeedbackMsg(msg)}
            />
          )}

          {/* SECTION: Dynamic Fee Engine */}
          {section === 'fees' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <form onSubmit={handleSaveFeeEngine} className="xl:col-span-7 space-y-5">
                {/* 1. User Cash-Out Charge */}
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        1. {lang === 'bn' ? 'গ্রাহক ক্যাশ-আউট চার্জ (U- → A-)' : 'Customer Cash-Out Charge (U- → A-)'}
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lang === 'bn'
                          ? 'চার্জ কমান/বাড়ান ও এজেন্ট, সরকার ও অ্যাডমিন কে কত পাবে নির্ধারণ করুন (প্রতি ১,০০০ টাকায়)।'
                          : 'Increase/decrease charge & configure who gets how much per 1,000 BDT.'}
                      </p>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 font-mono-tabular text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      Total: ৳{computedTotalFeePer1000.toFixed(2)} / 1,000
                    </span>
                  </div>

                  {/* Stacked Proportion Bar */}
                  <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                    <div
                      className="bg-indigo-500 transition-all"
                      style={{
                        width: `${
                          computedTotalFeePer1000 > 0
                            ? ((Number(editAgentShare) || 0) / computedTotalFeePer1000) * 100
                            : 0
                        }%`,
                      }}
                    />
                    <div
                      className="bg-sky-500 transition-all"
                      style={{
                        width: `${
                          computedTotalFeePer1000 > 0
                            ? ((Number(editGovtShare) || 0) / computedTotalFeePer1000) * 100
                            : 0
                        }%`,
                      }}
                    />
                    <div
                      className="bg-emerald-500 transition-all"
                      style={{
                        width: `${
                          computedTotalFeePer1000 > 0
                            ? ((Number(editAdminShare) || 0) / computedTotalFeePer1000) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/25 p-3 space-y-2">
                      <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300">
                        Agent Share (Tk/1k)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => adjustShare(setEditAgentShare, editAgentShare, -0.25)}
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors"
                          title="-0.25"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          required
                          value={editAgentShare}
                          onChange={(e) => setEditAgentShare(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white text-center focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => adjustShare(setEditAgentShare, editAgentShare, 0.25)}
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors"
                          title="+0.25"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-sky-200 dark:border-sky-500/25 p-3 space-y-2">
                      <label className="block text-xs font-medium text-sky-700 dark:text-sky-300">
                        Govt Levy (Tk/1k)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => adjustShare(setEditGovtShare, editGovtShare, -0.25)}
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20 transition-colors"
                          title="-0.25"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          required
                          value={editGovtShare}
                          onChange={(e) => setEditGovtShare(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white text-center focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => adjustShare(setEditGovtShare, editGovtShare, 0.25)}
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20 transition-colors"
                          title="+0.25"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-emerald-200 dark:border-emerald-500/25 p-3 space-y-2">
                      <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Admin Share (Tk/1k)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => adjustShare(setEditAdminShare, editAdminShare, -0.25)}
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 transition-colors"
                          title="-0.25"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          required
                          value={editAdminShare}
                          onChange={(e) => setEditAdminShare(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white text-center focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => adjustShare(setEditAdminShare, editAdminShare, 0.25)}
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 transition-colors"
                          title="+0.25"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Agent Cash-In Bonus (per 1,000 Tk)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        value={editCashInComm}
                        onChange={(e) => setEditCashInComm(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        High-Value AML Threshold (BDT)
                      </label>
                      <input
                        type="number"
                        step="1000"
                        min="1000"
                        required
                        value={editHighThreshold}
                        onChange={(e) => setEditHighThreshold(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Merchant Cash-Out Charge */}
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        2. {lang === 'bn' ? 'মার্চেন্ট ক্যাশ-আউট চার্জ (M-)' : 'Merchant Cash-Out Charge (M-)'}
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lang === 'bn'
                          ? 'এজেন্ট (A-) ও অ্যাডমিন ট্রেজারিতে মার্চেন্ট ক্যাশ-আউটের চার্জ এবং বণ্টন আলাদাভাবে নির্ধারণ করুন।'
                          : 'Set separate Merchant Cash-Out charges & splits for Agent (A-) vs Admin Treasury.'}
                      </p>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 font-mono-tabular text-xs font-bold text-indigo-700 dark:text-indigo-300">
                      Agent: ৳{computedMerchantCashOutPer1000.toFixed(2)}/1k · Admin: ৳
                      {computedMerchantToAdminPer1000.toFixed(2)}/1k
                    </span>
                  </div>

                  {/* Merchant -> Agent */}
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                        Merchant → Agent Cash-Out (per 1,000 BDT)
                      </span>
                      <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                        ৳{computedMerchantCashOutPer1000.toFixed(2)} / 1,000
                      </span>
                    </div>

                    <div className="h-2 rounded-full overflow-hidden flex bg-slate-200 dark:bg-[#121622]">
                      <div
                        className="bg-indigo-500 transition-all"
                        style={{
                          width: `${
                            computedMerchantCashOutPer1000 > 0
                              ? ((Number(editMerchantAgentShare) || 0) /
                                  computedMerchantCashOutPer1000) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                      <div
                        className="bg-sky-500 transition-all"
                        style={{
                          width: `${
                            computedMerchantCashOutPer1000 > 0
                              ? ((Number(editMerchantGovtShare) || 0) /
                                  computedMerchantCashOutPer1000) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{
                          width: `${
                            computedMerchantCashOutPer1000 > 0
                              ? ((Number(editMerchantAdminShare) || 0) /
                                  computedMerchantCashOutPer1000) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="rounded-xl bg-white dark:bg-[#121622] border border-indigo-200 dark:border-indigo-500/25 p-2.5 space-y-1.5">
                        <label className="block text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                          Agent Gets (Tk/1k)
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantAgentShare, editMerchantAgentShare, -0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/20"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            required
                            value={editMerchantAgentShare}
                            onChange={(e) => setEditMerchantAgentShare(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantAgentShare, editMerchantAgentShare, 0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/20"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white dark:bg-[#121622] border border-sky-200 dark:border-sky-500/25 p-2.5 space-y-1.5">
                        <label className="block text-[11px] font-medium text-sky-700 dark:text-sky-300">
                          Govt Gets (Tk/1k)
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantGovtShare, editMerchantGovtShare, -0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            required
                            value={editMerchantGovtShare}
                            onChange={(e) => setEditMerchantGovtShare(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantGovtShare, editMerchantGovtShare, 0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white dark:bg-[#121622] border border-emerald-200 dark:border-emerald-500/25 p-2.5 space-y-1.5">
                        <label className="block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          Admin Gets (Tk/1k)
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantAdminShare, editMerchantAdminShare, -0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            required
                            value={editMerchantAdminShare}
                            onChange={(e) => setEditMerchantAdminShare(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantAdminShare, editMerchantAdminShare, 0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Merchant -> Admin Treasury */}
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        Merchant → Admin Treasury Settlement (0 = Free)
                      </span>
                      <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                        ৳{computedMerchantToAdminPer1000.toFixed(2)} / 1,000
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-white dark:bg-[#121622] border border-sky-200 dark:border-sky-500/25 p-2.5 space-y-1.5">
                        <label className="block text-[11px] font-medium text-sky-700 dark:text-sky-300">
                          Govt Share (Tk/1k)
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(
                                setEditMerchantToAdminGovtShare,
                                editMerchantToAdminGovtShare,
                                -0.25
                              )
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            required
                            value={editMerchantToAdminGovtShare}
                            onChange={(e) => setEditMerchantToAdminGovtShare(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(
                                setEditMerchantToAdminGovtShare,
                                editMerchantToAdminGovtShare,
                                0.25
                              )
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white dark:bg-[#121622] border border-emerald-200 dark:border-emerald-500/25 p-2.5 space-y-1.5">
                        <label className="block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          Admin Share (Tk/1k)
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantToAdminShare, editMerchantToAdminShare, -0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            required
                            value={editMerchantToAdminShare}
                            onChange={(e) => setEditMerchantToAdminShare(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              adjustShare(setEditMerchantToAdminShare, editMerchantToAdminShare, 0.25)
                            }
                            className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. User Send Money Charge */}
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        3. {lang === 'bn' ? 'ইউজার সেন্ড মানি চার্জ (U- → U-)' : 'User Send Money Charge (U- → U-)'}
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lang === 'bn'
                          ? 'ফ্রি সীমা, ফ্ল্যাট চার্জ বা প্রতি ১,০০০ টাকা রেট ও সরকার/অ্যাডমিনের অংশ নির্ধারণ করুন।'
                          : 'Configure free threshold, flat or per-1,000 charge mode, and Govt / Admin split.'}
                      </p>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/35 font-mono-tabular text-xs font-bold text-amber-800 dark:text-amber-200">
                      {editSendMoneyMode === 'per_1000'
                        ? `৳${computedSendMoneyRate.toFixed(2)} / 1,000`
                        : `৳${computedSendMoneyRate.toFixed(2)} flat (> ৳${Number(editSendMoneyFreeThreshold) || 0})`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Charge Calculation Mode
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEditSendMoneyMode('flat_above_threshold')}
                          className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                            editSendMoneyMode === 'flat_above_threshold'
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Flat Above Limit
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditSendMoneyMode('per_1000')}
                          className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                            editSendMoneyMode === 'per_1000'
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Per 1,000 BDT
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Free Limit Threshold (BDT · 0 = charge all)
                      </label>
                      <input
                        type="number"
                        step="100"
                        min="0"
                        required
                        value={editSendMoneyFreeThreshold}
                        onChange={(e) => setEditSendMoneyFreeThreshold(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-sky-200 dark:border-sky-500/25 p-3 space-y-2">
                      <label className="block text-xs font-medium text-sky-700 dark:text-sky-300">
                        Govt Share (Tk)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            adjustShare(setEditSendMoneyGovtShare, editSendMoneyGovtShare, -0.25)
                          }
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          required
                          value={editSendMoneyGovtShare}
                          onChange={(e) => setEditSendMoneyGovtShare(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white text-center focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            adjustShare(setEditSendMoneyGovtShare, editSendMoneyGovtShare, 0.25)
                          }
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/20"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-emerald-200 dark:border-emerald-500/25 p-3 space-y-2">
                      <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Admin Share (Tk)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            adjustShare(setEditSendMoneyAdminShare, editSendMoneyAdminShare, -0.25)
                          }
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          required
                          value={editSendMoneyAdminShare}
                          onChange={(e) => setEditSendMoneyAdminShare(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white text-center focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            adjustShare(setEditSendMoneyAdminShare, editSendMoneyAdminShare, 0.25)
                          }
                          className="p-2 rounded-lg bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t('historicalLockNote', lang)}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditAgentShare(String(DEFAULT_FEE_CONFIG.agentShare));
                        setEditGovtShare(String(DEFAULT_FEE_CONFIG.govtShare));
                        setEditAdminShare(String(DEFAULT_FEE_CONFIG.adminShare));
                        setEditMerchantAgentShare(
                          String(DEFAULT_FEE_CONFIG.merchantCashOutAgentShare)
                        );
                        setEditMerchantGovtShare(
                          String(DEFAULT_FEE_CONFIG.merchantCashOutGovtShare)
                        );
                        setEditMerchantAdminShare(
                          String(DEFAULT_FEE_CONFIG.merchantCashOutAdminShare)
                        );
                        setEditMerchantToAdminGovtShare(
                          String(DEFAULT_FEE_CONFIG.merchantCashOutToAdminGovtShare)
                        );
                        setEditMerchantToAdminShare(
                          String(DEFAULT_FEE_CONFIG.merchantCashOutToAdminShare)
                        );
                        setEditSendMoneyMode(DEFAULT_FEE_CONFIG.sendMoneyChargeMode);
                        setEditSendMoneyFreeThreshold(
                          String(DEFAULT_FEE_CONFIG.sendMoneyFreeThreshold)
                        );
                        setEditSendMoneyGovtShare(String(DEFAULT_FEE_CONFIG.sendMoneyGovtShare));
                        setEditSendMoneyAdminShare(String(DEFAULT_FEE_CONFIG.sendMoneyAdminShare));
                        setEditCashInComm(String(DEFAULT_FEE_CONFIG.cashInCommissionPer1000));
                        setEditHighThreshold(String(DEFAULT_FEE_CONFIG.highValueThreshold));
                      }}
                      className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      Reset All Defaults
                    </button>
                    <button
                      type="submit"
                      disabled={savingFee}
                      className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                    >
                      {savingFee ? 'Publishing Fee Schedule...' : t('saveFeeConfig', lang)}
                    </button>
                  </div>
                </div>
              </form>

              <div className="xl:col-span-5 space-y-5">
                {/* Live Draft Charge Calculator */}
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Live Charge & Split Simulator
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                    {[
                      { id: 'cash_out', label: 'User Cash-Out' },
                      { id: 'merchant_cash_out_agent', label: 'Merch CO → Agent' },
                      { id: 'merchant_cash_out_admin', label: 'Merch CO → Admin' },
                      { id: 'send_money', label: 'Send Money' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setFeePreviewType(
                            opt.id as
                              | 'cash_out'
                              | 'merchant_cash_out_agent'
                              | 'merchant_cash_out_admin'
                              | 'send_money'
                          )
                        }
                        className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                          feePreviewType === opt.id
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-700 dark:text-slate-300 mb-1">
                      Sample Transaction Amount (BDT)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={feePreviewAmount}
                      onChange={(e) => setFeePreviewAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Calculated Charge</span>
                      <span className="font-mono-tabular font-bold text-amber-700 dark:text-amber-300">
                        {formatBdt(feePreviewResult.fee, lang)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-indigo-600 dark:text-indigo-300 font-medium">Agent Receives</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatBdt(feePreviewResult.breakdown.agentAmount, lang)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-600 dark:text-sky-300 font-medium">Govt Receives</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatBdt(feePreviewResult.breakdown.govtAmount, lang)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-600 dark:text-emerald-300 font-medium">Admin Receives</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatBdt(feePreviewResult.breakdown.adminAmount, lang)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Historical Transaction Fee Lock Audit */}
                <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Historical Transaction Fee Lock Audit
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Every transaction locks its exact fee breakdown at execution time and immediately posts to user & merchant statements.
                  </p>

                  <div className="space-y-2.5 max-h-96 overflow-y-auto">
                    {transactions
                      .filter((tx) => tx.fee > 0)
                      .slice(0, 14)
                      .map((tx) => {
                        const rateTag =
                          tx.feeBreakdown.chargeMode === 'flat'
                            ? `Flat ৳${tx.feeBreakdown.ratePer1000}`
                            : `৳${tx.feeBreakdown.ratePer1000}/1000`;
                        return (
                          <div
                            key={tx.txId}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-300 truncate">
                                {tx.type.replace(/_/g, ' ').toUpperCase()} · {formatBdt(tx.amount)}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {tx.txHash} · Locked: {rateTag} ·{' '}
                                {new Date(tx.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-right font-mono-tabular text-[11px] text-slate-700 dark:text-slate-200 shrink-0">
                              <div className="font-semibold text-slate-900 dark:text-white">Fee: {formatBdt(tx.fee)}</div>
                              <div className="text-slate-500 dark:text-slate-400">
                                A:{tx.feeBreakdown.agentAmount} · G:{tx.feeBreakdown.govtAmount} · P:
                                {tx.feeBreakdown.adminAmount}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: Global Ledger */}
          {section === 'ledger' && (
            <div className="space-y-5">
              {/* Audit Summary Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'মিল পাওয়া লেনদেন' : 'Matching Transactions'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {filteredLedgerTransactions.length}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                      / {transactions.length}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'ফিল্টারকৃত ভলিউম' : 'Filtered Volume'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">
                    {formatBdt(ledgerAuditStats.totalVolume, lang)}
                  </div>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'মোট চার্জ / ফি' : 'Filtered Fees'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-300 mt-1">
                    {formatBdt(ledgerAuditStats.totalFees, lang)}
                  </div>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? `হাই-ভ্যালু (>= ${formatBdt(feeConfig.highValueThreshold, lang)})`
                      : `High-Value (>= ${formatBdt(feeConfig.highValueThreshold, lang)})`}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-amber-600 dark:text-amber-300 mt-1">
                    {ledgerAuditStats.highValueCount}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                {/* Header & Export */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>{t('globalLedger', lang)}</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {lang === 'bn'
                        ? 'তারিখ, লেনদেনের ধরন, স্ট্যাটাস এবং টাকার সীমা অনুযায়ী পূর্ণ অডিট ফিল্টারিং।'
                        : 'Filter platform ledger by date range, transaction type, status, and min/max BDT thresholds.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {hasActiveLedgerFilters && (
                      <button
                        type="button"
                        onClick={resetLedgerFilters}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'ফিল্টার রিসেট' : 'Reset Filters'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={filteredLedgerTransactions.length === 0}
                      onClick={() => exportLedgerToCsv(filteredLedgerTransactions)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35 text-xs font-semibold text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      disabled={filteredLedgerTransactions.length === 0}
                      onClick={() =>
                        downloadGlobalLedgerPdf(
                          filteredLedgerTransactions,
                          users,
                          feeConfig,
                          adminSession.adminEmail
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/35 text-xs font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        {hasActiveLedgerFilters
                          ? lang === 'bn'
                            ? `ফিল্টারকৃত PDF (${filteredLedgerTransactions.length})`
                            : `Export Filtered PDF (${filteredLedgerTransactions.length})`
                          : 'Download Ledger PDF'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Advanced Audit Filter Bar */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-[#0B0D14] border-b border-slate-200 dark:border-slate-800 space-y-3.5">
                  {/* Top Bar: Quick Presets + Search */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{lang === 'bn' ? 'কুইক রেঞ্জ:' : 'Quick Range:'}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => applyLedgerDatePreset('all')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                          !ledgerDateFrom && !ledgerDateTo
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {lang === 'bn' ? 'সব তারিখ' : 'All Dates'}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyLedgerDatePreset('today')}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-indigo-400 transition"
                      >
                        {lang === 'bn' ? 'আজ' : 'Today'}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyLedgerDatePreset('7d')}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-indigo-400 transition"
                      >
                        {lang === 'bn' ? 'গত ৭ দিন' : 'Last 7D'}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyLedgerDatePreset('30d')}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-indigo-400 transition"
                      >
                        {lang === 'bn' ? 'গত ৩০ দিন' : 'Last 30D'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const thresholdStr = String(feeConfig.highValueThreshold);
                          if (ledgerMinAmount === thresholdStr && ledgerMaxAmount === '') {
                            setLedgerMinAmount('');
                          } else {
                            setLedgerMinAmount(thresholdStr);
                            setLedgerMaxAmount('');
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                          ledgerMinAmount === String(feeConfig.highValueThreshold) &&
                          ledgerMaxAmount === ''
                            ? 'bg-amber-50 dark:bg-amber-500/20 border-amber-300 dark:border-amber-400/60 text-amber-800 dark:text-amber-200'
                            : 'bg-white dark:bg-[#121622] border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:border-amber-400'
                        }`}
                      >
                        {lang === 'bn'
                          ? `${(feeConfig.highValueThreshold / 1000).toFixed(0)}K+ হাই-ভ্যালু`
                          : `${(feeConfig.highValueThreshold / 1000).toFixed(0)}K+ AML`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerGiftOnly((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1 transition ${
                          ledgerGiftOnly
                            ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                            : 'bg-white dark:bg-[#121622] border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:border-rose-400'
                        }`}
                      >
                        <Gift className="w-3 h-3" />
                        <span>{lang === 'bn' ? 'গিফট কার্ড' : 'Gift Cards'}</span>
                      </button>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        placeholder={
                          lang === 'bn'
                            ? 'হ্যাশ, আইডি, প্রেরক/প্রাপক খুঁজুন...'
                            : 'Search Tx Hash, ID, Account, Note...'
                        }
                        className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Filter Grid: Date From, Date To, Type, Status, Min/Max Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'শুরুর তারিখ (From)' : 'From Date'}
                      </label>
                      <input
                        type="date"
                        value={ledgerDateFrom}
                        max={ledgerDateTo || undefined}
                        onChange={(e) => setLedgerDateFrom(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'শেষ তারিখ (To)' : 'To Date'}
                      </label>
                      <input
                        type="date"
                        value={ledgerDateTo}
                        min={ledgerDateFrom || undefined}
                        onChange={(e) => setLedgerDateTo(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'লেনদেনের ধরন (Type)' : 'Transaction Type'}
                      </label>
                      <select
                        value={ledgerTypeFilter}
                        onChange={(e) =>
                          setLedgerTypeFilter(e.target.value as 'ALL' | TransactionType)
                        }
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="ALL" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">
                          {lang === 'bn' ? 'সব ধরনের লেনদেন' : 'All Transaction Types'}
                        </option>
                        <option value="send_money" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Send Money</option>
                        <option value="cash_in" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Cash In</option>
                        <option value="cash_out" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Cash Out (User)</option>
                        <option value="agent_cash_out" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Agent Cash Out</option>
                        <option value="merchant_cash_out" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Merchant Cash Out</option>
                        <option value="merchant_payment" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Merchant Payment</option>
                        <option value="b2b_transfer" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">B2B Transfer</option>
                        <option value="mobile_recharge" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Mobile Recharge</option>
                        <option value="bill_pay" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Bill Pay</option>
                        <option value="admin_credit" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Admin Credit</option>
                        <option value="admin_transfer" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Admin Transfer</option>
                        <option value="refund" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Refund</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'স্ট্যাটাস (Status)' : 'Status'}
                      </label>
                      <select
                        value={ledgerStatusFilter}
                        onChange={(e) =>
                          setLedgerStatusFilter(e.target.value as 'ALL' | TransactionStatus)
                        }
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="ALL" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">
                          {lang === 'bn' ? 'সব স্ট্যাটাস' : 'All Statuses'}
                        </option>
                        <option value="completed" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Completed</option>
                        <option value="pending_admin_approval" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Pending Admin Approval</option>
                        <option value="rejected" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Rejected</option>
                        <option value="refunded" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Refunded</option>
                        <option value="partially_refunded" className="bg-white dark:bg-[#121622] text-slate-900 dark:text-white">Partially Refunded</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'টাকার সীমা (Min – Max ৳)' : 'Amount Threshold (Min – Max ৳)'}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={ledgerMinAmount}
                          onChange={(e) => setLedgerMinAmount(e.target.value)}
                          placeholder="Min ৳"
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={ledgerMaxAmount}
                          onChange={(e) => setLedgerMaxAmount(e.target.value)}
                          placeholder="Max ৳"
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {(isInvalidLedgerDateRange || isInvalidLedgerAmountRange) && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-400/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                      {isInvalidLedgerDateRange &&
                        (lang === 'bn'
                          ? 'সতর্কতা: শুরুর তারিখ শেষ তারিখের চেয়ে বড় হতে পারবে না। '
                          : 'Warning: From Date is later than To Date. ')}
                      {isInvalidLedgerAmountRange &&
                        (lang === 'bn'
                          ? 'সতর্কতা: সর্বনিম্ন টাকার পরিমাণ সর্বোচ্চ পরিমাণের চেয়ে বড় হতে পারবে না।'
                          : 'Warning: Minimum amount exceeds maximum amount.')}
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B0D14]">
                        <th className="py-3 px-5 font-semibold">Tx Hash</th>
                        <th className="py-3 px-4 font-semibold">
                          {lang === 'bn' ? 'সময়' : 'Timestamp'}
                        </th>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold">Sender</th>
                        <th className="py-3 px-4 font-semibold">Recipient</th>
                        <th className="py-3 px-4 font-semibold text-right">Amount</th>
                        <th className="py-3 px-4 font-semibold text-right">Fee</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-5 font-semibold text-right">
                          {lang === 'bn' ? 'অ্যাকশন' : 'Actions'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredLedgerTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 px-6 text-center text-slate-500 dark:text-slate-400">
                            <div className="max-w-sm mx-auto space-y-2">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {lang === 'bn'
                                  ? 'নির্বাচিত ফিল্টারের সাথে কোনো লেনদেন পাওয়া যায়নি।'
                                  : 'No transactions match the active audit filters.'}
                              </p>
                              {hasActiveLedgerFilters && (
                                <button
                                  type="button"
                                  onClick={resetLedgerFilters}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/35 text-xs font-semibold text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>
                                    {lang === 'bn' ? 'সব ফিল্টার রিসেট করুন' : 'Clear All Filters'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredLedgerTransactions.map((tx) => (
                          <tr key={tx.txId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-5 font-mono-tabular text-indigo-600 dark:text-indigo-400 font-medium">
                              {tx.txHash}
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {new Date(tx.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-200 whitespace-nowrap font-medium">
                              <div>{tx.type.replace(/_/g, ' ').toUpperCase()}</div>
                              {tx.giftCard && (
                                <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                  <Gift className="w-3 h-3" />
                                  <span>{tx.giftCard.cardTitleBn}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-900 dark:text-white">
                              {tx.senderName}{' '}
                              {/^[UAM]-/.test(tx.senderId) ? (
                                <button
                                  type="button"
                                  onClick={() => setViewedAccountId(tx.senderId)}
                                  className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                  title="Inspect sender account"
                                >
                                  ({tx.senderId})
                                </button>
                              ) : (
                                <span className="text-slate-500 dark:text-slate-400">({tx.senderId})</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-900 dark:text-white">
                              {tx.receiverName}{' '}
                              {/^[UAM]-/.test(tx.receiverId) ? (
                                <button
                                  type="button"
                                  onClick={() => setViewedAccountId(tx.receiverId)}
                                  className="font-mono-tabular font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                  title="Inspect recipient account"
                                >
                                  ({tx.receiverId})
                                </button>
                              ) : (
                                <span className="text-slate-500 dark:text-slate-400">({tx.receiverId})</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {formatBdt(tx.amount, lang)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {formatBdt(tx.fee, lang)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  tx.status === 'completed'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : tx.status === 'pending_admin_approval'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : tx.status === 'rejected'
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {tx.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-5 whitespace-nowrap text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {tx.status !== 'pending_admin_approval' && (
                                  <button
                                    type="button"
                                    disabled={actionBusyId === tx.txId}
                                    onClick={() => openTxActionModal('pending', tx)}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/35 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-[11px] font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                                    title={
                                      lang === 'bn'
                                        ? 'পেন্ডিং করুন (কোনো অ্যাকাউন্টে নতুন ক্রেডিট হবে না)'
                                        : 'Set Pending (Zero new account credit)'
                                    }
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>{lang === 'bn' ? 'পেন্ডিং' : 'Set Pending'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={actionBusyId === tx.txId}
                                  onClick={() => openTxActionModal('delete', tx)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-[11px] font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                                  title={
                                    lang === 'bn'
                                      ? 'সব স্টেটমেন্ট থেকে স্থায়ীভাবে ডিলিট করুন'
                                      : 'Delete from all statements'
                                  }
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>{lang === 'bn' ? 'ডিলিট' : 'Delete'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: Admin Activity Log */}
          {section === 'activity' && (
            <div className="space-y-5">
              {/* Summary Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'মোট অ্যাডমিন অ্যাকশন' : 'Total Admin Actions'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {activityLogs.length}
                  </div>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'ফি ইঞ্জিন আপডেট' : 'Fee Engine Updates'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-indigo-600 dark:text-indigo-300 mt-1">
                    {activityLogs.filter((l) => l.actionType === 'fee_update').length}
                  </div>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'ফান্ড ট্রান্সফার ও ক্রেডিট' : 'Transfers & Credits'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {
                      activityLogs.filter(
                        (l) => l.actionType === 'fund_transfer' || l.actionType === 'credit_add'
                      ).length
                    }
                  </div>
                </div>
                <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'bn' ? 'বাল্ক ও স্ট্যাটাস পরিবর্তন' : 'Status & Bulk Actions'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold text-amber-600 dark:text-amber-300 mt-1">
                    {
                      activityLogs.filter(
                        (l) =>
                          l.actionType === 'bulk_status_change' || l.actionType === 'status_change'
                      ).length
                    }
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {lang === 'bn'
                          ? 'অ্যাডমিন অ্যাক্টিভিটি ও অডিট লগ'
                          : 'Admin Activity & Security Audit Log'}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {lang === 'bn'
                        ? 'ফি পরিবর্তন, ফান্ড ট্রান্সফার, ক্রেডিট অ্যাড ও বাল্ক স্ট্যাটাস পরিবর্তনের রিয়েল-টাইম রেকর্ড'
                        : 'Immutable real-time log of fee updates, fund transfers, AML approvals, and single/bulk status changes'}
                    </p>
                  </div>

                  <div className="relative w-full xl:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                      placeholder="Search action, admin, target ID..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Action Type Filter Bar */}
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D14] flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'All Actions' },
                      { id: 'fee_update', label: 'Fee Updates' },
                      { id: 'fund_transfer', label: 'Fund Transfers' },
                      { id: 'credit_add', label: 'Credit Adds' },
                      { id: 'bulk_status_change', label: 'Bulk Status' },
                      { id: 'status_change', label: 'Account Status' },
                      { id: 'aml_decision', label: 'AML Decisions' },
                      { id: 'kyc_decision', label: 'KYC Reviews' },
                      { id: 'social_engagement', label: 'Social Engagement' },
                      { id: 'account_alert', label: 'Account Alerts' },
                      { id: 'alert_settings', label: 'Alert Settings' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActivityFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activityFilter === tab.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {filteredActivityLogs.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                    No admin activity entries match the current filter.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[620px] overflow-y-auto">
                    {filteredActivityLogs.map((log) => {
                      const badgeStyle =
                        log.actionType === 'fee_update'
                          ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/35 text-indigo-700 dark:text-indigo-200'
                          : log.actionType === 'fund_transfer'
                            ? 'bg-sky-50 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/35 text-sky-700 dark:text-sky-200'
                            : log.actionType === 'credit_add'
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/35 text-emerald-700 dark:text-emerald-200'
                              : log.actionType === 'bulk_status_change'
                                ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/35 text-amber-800 dark:text-amber-200'
                                : log.actionType === 'status_change'
                                  ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/35 text-rose-700 dark:text-rose-200'
                                  : log.actionType === 'social_engagement'
                                    ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/35 text-rose-700 dark:text-rose-200'
                                    : log.actionType === 'aml_decision'
                                      ? 'bg-violet-50 dark:bg-violet-500/15 border-violet-200 dark:border-violet-500/35 text-violet-700 dark:text-violet-200'
                                      : 'bg-slate-100 dark:bg-slate-500/15 border-slate-200 dark:border-slate-500/35 text-slate-700 dark:text-slate-200';

                      return (
                        <div
                          key={log.id}
                          className="p-4 sm:px-6 hover:bg-slate-50 dark:hover:bg-slate-800/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wider uppercase ${badgeStyle}`}
                              >
                                {log.actionType.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                {log.title}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{log.details}</p>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>
                                Actor:{' '}
                                <strong className="text-indigo-700 dark:text-indigo-300 font-medium">
                                  {log.actorEmail}
                                </strong>
                              </span>
                              {log.targetIds && log.targetIds.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span>· Targets:</span>
                                  {log.targetIds.map((tid) => (
                                    <span
                                      key={tid}
                                      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 font-mono-tabular text-[10px] text-indigo-700 dark:text-indigo-200"
                                    >
                                      {tid}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="lg:text-right shrink-0 space-y-1">
                            <div className="inline-flex items-center gap-1.5 font-mono-tabular text-[11px] text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                              <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              <span>{new Date(log.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="font-mono-tabular text-[10px] text-slate-500 dark:text-slate-500">
                              {log.id}
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

          {/* SECTION: Agent Booth & Customer Support Booth Map */}
          {section === 'booths' && (
            <div className="space-y-6">
              <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        {lang === 'bn'
                          ? 'এজেন্ট, মার্চেন্ট, অ্যাডমিন আইপি জিও-ম্যাপ ও বুথ নেটওয়ার্ক'
                          : 'Agent, Merchant, Admin IP Geo-Map & Booth Network'}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {lang === 'bn'
                        ? 'এজেন্ট (A-), মার্চেন্ট (M-) ও অ্যাডমিন (ADM) লগইন করলে অটো IP লোকেশন ম্যাপে পিন হয় এবং বুথ নেটওয়ার্কের সাথে লাইভ দেখায়।'
                        : 'Agents (A-), Merchants (M-), and Admins auto-locate by IP on login and render live alongside physical cash & support booths.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={syncingAdminIp}
                    onClick={async () => {
                      if (!adminSession) return;
                      const creatorId =
                        adminSession.adminRole === 'main_admin'
                          ? 'ADM-MAIN'
                          : adminSession.adminId || '';
                      if (!creatorId) return;
                      setSyncingAdminIp(true);
                      try {
                        const pin = await syncAutoIpMapLocation({
                          creatorId,
                          creatorRole:
                            adminSession.adminRole === 'main_admin' ? 'admin' : 'second_admin',
                          name:
                            adminSession.adminName ||
                            (adminSession.adminRole === 'main_admin' ? 'Main Admin' : '2nd Admin'),
                          businessName:
                            adminSession.adminRole === 'main_admin'
                              ? 'Acash Main Admin Command'
                              : 'Acash 2nd Admin Desk',
                          phone: adminSession.phone || adminSession.adminEmail,
                          profilePhotoUrl: adminSession.profilePhotoUrl,
                          creatorUid: adminSession.firebaseUid,
                          forceOverrideManualPin: true,
                        });
                        if (pin) {
                          setFeedbackMsg(
                            lang === 'bn'
                              ? `IP লোকেশন সিঙ্ক হয়েছে (${pin.ipAddress} · ${pin.city})`
                              : `IP location synced (${pin.ipAddress} · ${pin.city})`
                          );
                        }
                      } finally {
                        setSyncingAdminIp(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>
                      {syncingAdminIp
                        ? lang === 'bn'
                          ? 'সিঙ্ক হচ্ছে...'
                          : 'Locating IP...'
                        : lang === 'bn'
                          ? 'আমার IP লোকেশন সিঙ্ক করুন'
                          : 'Sync My IP Pin Now'}
                    </span>
                  </button>
                </div>

                {/* Live IP Geolocation Coverage Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {lang === 'bn' ? 'এজেন্ট পিন' : 'Agent Pins'}
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {creatorLocations.filter((l) => l.creatorRole === 'agent').length}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {lang === 'bn' ? 'মার্চেন্ট পিন' : 'Merchant Pins'}
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-violet-600 dark:text-violet-400 mt-0.5">
                      {creatorLocations.filter((l) => l.creatorRole === 'merchant').length}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {lang === 'bn' ? 'অ্যাডমিন পিন' : 'Admin Pins'}
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                      {
                        creatorLocations.filter(
                          (l) => l.creatorRole === 'admin' || l.creatorRole === 'second_admin'
                        ).length
                      }
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-cyan-500" />
                      <span>{lang === 'bn' ? 'অটো-IP পিন' : 'Auto IP Pins'}</span>
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
                      {creatorLocations.filter((l) => l.locationSource === 'ip_auto').length}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {lang === 'bn' ? 'ম্যানুয়াল GPS' : 'Manual GPS'}
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {creatorLocations.filter((l) => l.locationSource === 'manual_pin').length}
                    </div>
                  </div>
                </div>

                <BoothLocatorMap
                  booths={booths}
                  creatorLocations={creatorLocations}
                  lang={lang}
                  embedded
                  showIpDetails
                />
              </div>

              {/* 2nd Admin Registry */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleCreateSecondAdmin}
                  className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#121622] border border-amber-200 dark:border-amber-500/30 p-5 sm:p-6 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>2nd Admin Accounts & Map Access</span>
                    </h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300">
                      Auto-IP + GPS
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Main Admin ({DEFAULT_ADMIN_ALERT_EMAIL}) & 2nd Admins auto-locate by IP on login. Register 2nd Admins below so they can also refine their GPS pin manually.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={new2ndName}
                      onChange={(e) => setNew2ndName(e.target.value)}
                      placeholder="2nd Admin Name"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="tel"
                      required
                      value={new2ndPhone}
                      onChange={(e) => setNew2ndPhone(e.target.value)}
                      placeholder="017XXXXXXXX"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="email"
                      required
                      value={new2ndEmail}
                      onChange={(e) => setNew2ndEmail(e.target.value)}
                      placeholder="second.admin@acash.com"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={new2ndTitle}
                      onChange={(e) => setNew2ndTitle(e.target.value)}
                      placeholder="Regional Title"
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={new2ndPassword}
                    onChange={(e) => setNew2ndPassword(e.target.value)}
                    placeholder="Initial Password (min 6 chars)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={creating2ndAdmin}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors"
                  >
                    {creating2ndAdmin ? 'Creating 2nd Admin...' : 'Register 2nd Admin'}
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Registered 2nd Admins ({secondAdmins.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[260px] overflow-y-auto">
                    {secondAdmins.map((sa) => (
                      <div key={sa.adminId} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {sa.profilePhotoUrl ? (
                            <img
                              src={sa.profilePhotoUrl}
                              alt={sa.name}
                              className="w-9 h-9 rounded-xl object-cover border border-amber-300 dark:border-amber-400/50 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-400/40 flex items-center justify-center text-xs font-bold text-amber-800 dark:text-amber-200 shrink-0">
                              2A
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {sa.name} · <span className="font-mono-tabular text-amber-700 dark:text-amber-300">{sa.adminId}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {sa.email} · 📞 {sa.phone}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
                            sa.mapLocation
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {sa.mapLocation ? `Pinned (${sa.mapLocation.area})` : 'Not pinned yet'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main Admin Password Management (Only visible to Main Admin) */}
              {isCurrentMainAdmin && (
                <form
                  onSubmit={handleChangeMainAdminPassword}
                  className="rounded-3xl bg-white dark:bg-[#121622] border border-indigo-200 dark:border-indigo-500/35 p-5 sm:p-6 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {lang === 'bn'
                            ? 'মেইন এডমিন পাসওয়ার্ড পরিবর্তন'
                            : 'Main Admin Password & Access Security'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {lang === 'bn'
                          ? 'মেইন এডমিন অ্যাকাউন্টের পাসওয়ার্ড যেকোনো সময় পরিবর্তন ও ফায়ারবেসে সিঙ্ক করুন।'
                          : `Update login credentials for Main Admin (${adminSession.adminEmail}). Changes sync immediately with Firestore.`}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                      Main Admin Only
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'বর্তমান পাসওয়ার্ড' : 'Current Password'}
                      </label>
                      <input
                        type="password"
                        required
                        value={currentMainPwd}
                        onChange={(e) => setCurrentMainPwd(e.target.value)}
                        placeholder="Current password"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)' : 'New Password (min 8 chars)'}
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newMainPwd}
                        onChange={(e) => setNewMainPwd(e.target.value)}
                        placeholder="New strong password"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={confirmMainPwd}
                        onChange={(e) => setConfirmMainPwd(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={changingMainPwd || !currentMainPwd || newMainPwd.length < 8 || !confirmMainPwd}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>
                        {changingMainPwd
                          ? lang === 'bn'
                            ? 'আপডেট হচ্ছে...'
                            : 'Updating...'
                          : lang === 'bn'
                            ? 'পাসওয়ার্ড পরিবর্তন করুন'
                            : 'Update Main Password'}
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* Add Booth + Manage Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleSaveNewBooth}
                  className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3.5 shadow-sm"
                >
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'নতুন বুথ যুক্ত করুন' : 'Register New Booth on Map'}
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBoothTypeInput('agent_booth')}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                        boothTypeInput === 'agent_booth'
                          ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-400 text-emerald-700 dark:text-emerald-200'
                          : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Agent Booth (A)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoothTypeInput('support_booth')}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                        boothTypeInput === 'support_booth'
                          ? 'bg-sky-50 dark:bg-sky-500/20 border-sky-400 text-sky-700 dark:text-sky-200'
                          : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Customer Support (S)
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Booth Name</label>
                    <input
                      type="text"
                      required
                      value={boothNameInput}
                      onChange={(e) => setBoothNameInput(e.target.value)}
                      placeholder="e.g. Bashundhara R/A Flagship Booth"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Area</label>
                      <input
                        type="text"
                        required
                        value={boothAreaInput}
                        onChange={(e) => setBoothAreaInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">City</label>
                      <input
                        type="text"
                        required
                        value={boothCityInput}
                        onChange={(e) => setBoothCityInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Street Address</label>
                    <input
                      type="text"
                      required
                      value={boothAddressInput}
                      onChange={(e) => setBoothAddressInput(e.target.value)}
                      placeholder="Block A, Main Road, Dhaka"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Hotline Phone</label>
                      <input
                        type="text"
                        value={boothPhoneInput}
                        onChange={(e) => setBoothPhoneInput(e.target.value)}
                        placeholder="01811XXXXXX"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    {boothTypeInput === 'agent_booth' ? (
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          Linked Agent ID
                        </label>
                        <input
                          type="text"
                          value={boothAgentIdInput}
                          onChange={(e) => setBoothAgentIdInput(e.target.value)}
                          placeholder="A-200001"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Hours</label>
                        <input
                          type="text"
                          value={boothHoursInput}
                          onChange={(e) => setBoothHoursInput(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={boothLatInput}
                        onChange={(e) => setBoothLatInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={boothLngInput}
                        onChange={(e) => setBoothLngInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Services (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={boothServicesInput}
                      onChange={(e) => setBoothServicesInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingBooth}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                  >
                    {savingBooth ? 'Saving to Firestore...' : 'Save Booth to Map'}
                  </button>
                </form>

                <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Booth Directory Controls ({booths.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
                    {booths.map((b) => (
                      <div
                        key={b.boothId}
                        className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                b.boothType === 'agent_booth'
                                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                              }`}
                            >
                              {b.boothType === 'agent_booth' ? 'Agent' : 'Support'}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{b.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {b.area}, {b.city} · {b.phone} · GPS {b.lat.toFixed(4)}, {b.lng.toFixed(4)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(['open', 'busy', 'closed'] as BoothStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                adminToggleBoothStatus(b.boothId, st, adminSession.adminEmail)
                              }
                              className={`px-2 py-1 rounded-lg text-[10px] font-semibold uppercase border transition-colors ${
                                b.status === st
                                  ? st === 'open'
                                    ? 'bg-emerald-50 dark:bg-emerald-500/25 border-emerald-400 text-emerald-700 dark:text-emerald-200'
                                    : st === 'busy'
                                      ? 'bg-amber-50 dark:bg-amber-500/25 border-amber-400 text-amber-800 dark:text-amber-200'
                                      : 'bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-800 dark:text-slate-200'
                                  : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => adminDeleteBooth(b.boothId, adminSession.adminEmail)}
                            className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors"
                            title="Delete Booth"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 9: 2nd Admin Profile & Direct Map Location Picker */}
          {section === 'admin_profile' && !isCurrentMainAdmin && (
            <div className="space-y-6">
              <div className="rounded-3xl bg-white dark:bg-[#121622] border border-amber-200 dark:border-amber-500/35 p-5 sm:p-6 space-y-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>
                        {lang === 'bn'
                          ? '২য় এডমিন প্রোফাইল ও লাইভ ম্যাপ লোকেশন'
                          : '2nd Admin Profile & Direct Map Location'}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Upload your profile picture, verify your contact number, and click directly on the free map to publish your live location to all users.
                    </p>
                  </div>
                  <span className="font-mono-tabular text-xs font-bold text-amber-800 dark:text-amber-200 px-3 py-1 rounded-xl bg-amber-50 dark:bg-[#0B0D14] border border-amber-200 dark:border-amber-500/30">
                    {activeSecondAdmin?.adminId || adminSession.adminId || 'ADM-200001'}
                  </span>
                </div>

                {/* Photo & Contact Info Card */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 items-center">
                  <div className="md:col-span-4 flex items-center gap-3.5">
                    {secondAdminPhotoInput ? (
                      <img
                        src={secondAdminPhotoInput}
                        alt={secondAdminNameInput}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-500 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border-2 border-dashed border-amber-300 dark:border-amber-400/50 flex flex-col items-center justify-center text-amber-700 dark:text-amber-200 shrink-0">
                        <Camera className="w-5 h-5" />
                        <span className="text-[9px] mt-0.5">Photo</span>
                      </div>
                    )}
                    <label className="cursor-pointer px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSecondAdminPhotoChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={secondAdminNameInput}
                        onChange={(e) => setSecondAdminNameInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Contact Number</span>
                        </span>
                      </label>
                      <input
                        type="tel"
                        value={secondAdminPhoneInput}
                        onChange={(e) => setSecondAdminPhoneInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Desk Title</label>
                      <input
                        type="text"
                        value={secondAdminTitleInput}
                        onChange={(e) => setSecondAdminTitleInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <RealLocationPickerMap
                  creatorId={activeSecondAdmin?.adminId || adminSession.adminId || 'ADM-200001'}
                  creatorRole="second_admin"
                  creatorName={secondAdminNameInput || adminSession.adminName}
                  creatorPhone={secondAdminPhoneInput || adminSession.phone || '01799000101'}
                  profilePhotoUrl={secondAdminPhotoInput || undefined}
                  initialValue={
                    activeSecondAdmin?.mapLocation
                      ? {
                          lat: activeSecondAdmin.mapLocation.lat,
                          lng: activeSecondAdmin.mapLocation.lng,
                          address: activeSecondAdmin.mapLocation.address,
                          area: activeSecondAdmin.mapLocation.area,
                          city: activeSecondAdmin.mapLocation.city,
                          isVisible: activeSecondAdmin.mapLocation.isVisible,
                        }
                      : {
                          lat: 23.7509,
                          lng: 90.3935,
                          area: 'Karwan Bazar',
                          city: 'Dhaka',
                          address: '',
                          isVisible: true,
                        }
                  }
                  lang={lang}
                  saving={savingSecondAdmin}
                  onSave={handleSaveSecondAdminLocation}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Disable Account Cause Modal + Automatic Gmail EmailJS Trigger */}
      {disableTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmDisableWithCause}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border border-rose-200 dark:border-rose-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Disable Account ({disableTargetUser.accountId})
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {disableTargetUser.businessName || disableTargetUser.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDisableTargetUser(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-indigo-50 dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 p-3 flex items-center gap-2.5 text-xs text-indigo-800 dark:text-indigo-200">
              <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                The cause you write below will be sent automatically to{' '}
                <strong className="text-slate-900 dark:text-white">{disableTargetUser.email}</strong> via EmailJS.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Quick Cause Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DISABLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDisableCause(preset)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-left transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Disable Cause / Reason (Required)
              </label>
              <textarea
                required
                rows={3}
                value={disableCause}
                onChange={(e) => setDisableCause(e.target.value)}
                placeholder="Write the exact reason for disabling this account..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-rose-300 dark:border-rose-500/35 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setDisableTargetUser(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={disableSubmitting || !disableCause.trim()}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {disableSubmitting ? 'Disabling & Sending Email...' : 'Disable & Notify Gmail'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Disable Selected Accounts Modal + Automatic Gmail EmailJS Trigger */}
      {bulkDisableOpen && selectedActiveUsers.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmBulkDisableWithCause}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border border-rose-200 dark:border-rose-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Bulk Disable {selectedActiveUsers.length} Account(s)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-mono-tabular">
                  {selectedActiveUsers.map((u) => u.accountId).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkDisableOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-indigo-50 dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 p-3 flex items-center gap-2.5 text-xs text-indigo-800 dark:text-indigo-200">
              <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                The cause below will be applied to all{' '}
                <strong className="text-slate-900 dark:text-white">{selectedActiveUsers.length}</strong> selected active
                accounts and sent automatically to each user&apos;s Gmail via EmailJS.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Quick Cause Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DISABLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBulkDisableCause(preset)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-left transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Bulk Disable Cause / Reason (Required)
              </label>
              <textarea
                required
                rows={3}
                value={bulkDisableCause}
                onChange={(e) => setBulkDisableCause(e.target.value)}
                placeholder="Write the exact reason for disabling the selected accounts..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-rose-300 dark:border-rose-500/35 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setBulkDisableOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bulkBusy || !bulkDisableCause.trim()}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {bulkBusy
                  ? 'Disabling & Sending Emails...'
                  : `Disable ${selectedActiveUsers.length} & Notify`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction Delete / Set Pending Confirmation Modal */}
      {txActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmTxAction}
            className={`w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border p-6 space-y-4 shadow-2xl ${
              txActionModal.mode === 'delete'
                ? 'border-rose-200 dark:border-rose-500/40'
                : 'border-amber-200 dark:border-amber-500/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {txActionModal.mode === 'delete'
                    ? lang === 'bn'
                      ? 'লেনদেন স্থায়ীভাবে ডিলিট করুন'
                      : 'Delete Transaction Permanently'
                    : lang === 'bn'
                      ? 'লেনদেন পেন্ডিং (Pending) করুন'
                      : 'Set Transaction to Pending'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-mono-tabular">
                  {txActionModal.tx.txHash} · {formatBdt(txActionModal.tx.amount, lang)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTxActionModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <div>
                <span className="font-semibold">{txActionModal.tx.senderName}</span> (
                {txActionModal.tx.senderId}) →{' '}
                <span className="font-semibold">{txActionModal.tx.receiverName}</span> (
                {txActionModal.tx.receiverId})
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {txActionModal.tx.type.replace(/_/g, ' ').toUpperCase()} · Current status:{' '}
                <span className="font-semibold">{txActionModal.tx.status}</span>
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 text-xs leading-relaxed ${
                txActionModal.mode === 'delete'
                  ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/35 text-rose-800 dark:text-rose-200'
                  : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/35 text-amber-800 dark:text-amber-200'
              }`}
            >
              {txActionModal.mode === 'delete'
                ? lang === 'bn'
                  ? 'এই লেনদেন ডিলিট করলে অ্যাডমিন, গ্রাহক, এজেন্ট এবং মার্চেন্টের সব স্টেটমেন্ট ও PDF রেকর্ড থেকে স্থায়ীভাবে মুছে যাবে।'
                  : 'Deleting removes this transaction permanently from Admin Global Ledger and ALL User, Agent, and Merchant statements & PDFs.'
                : lang === 'bn'
                  ? 'পেন্ডিং করলে লেনদেনটি Pending Admin Approval-এ যাবে এবং কোনো অ্যাকাউন্টে নতুন করে কোনো টাকা ক্রেডিট হবে না (পুনরায় অ্যাপ্রুভ করলেও ডাবল ক্রেডিট হবে না)।'
                  : 'Marking as Pending moves this transaction to Pending Admin Approval with ZERO new credits to any account (re-approving later will also never double-credit).'}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {lang === 'bn' ? 'নোট / কারণ (ঐচ্ছিক)' : 'Audit Note / Reason (Optional)'}
              </label>
              <input
                type="text"
                value={txActionReason}
                onChange={(e) => setTxActionReason(e.target.value)}
                placeholder={
                  txActionModal.mode === 'delete'
                    ? 'e.g. Duplicate test entry or admin removal'
                    : 'e.g. Manual compliance re-check'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setTxActionModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={txActionSubmitting}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50 transition-colors ${
                  txActionModal.mode === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {txActionSubmitting
                  ? 'Processing...'
                  : txActionModal.mode === 'delete'
                    ? lang === 'bn'
                      ? 'সব স্টেটমেন্ট থেকে ডিলিট'
                      : 'Confirm Delete'
                    : lang === 'bn'
                      ? 'পেন্ডিং নিশ্চিত করুন'
                      : 'Confirm Set Pending'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account 360° Inspector Modal (All Details Without PDF Download) */}
      {viewedAccount && (
        <AdminAccountViewModal
          user={viewedAccount}
          allTransactions={transactions}
          feeConfig={feeConfig}
          lang={lang}
          adminEmail={adminSession.adminEmail}
          actionBusy={actionBusyId === viewedAccount.accountId}
          onClose={() => setViewedAccountId(null)}
          onCreditAccount={(accId) => {
            setCreditTarget(accId);
            setSection('treasury');
          }}
          onToggleStatus={(targetUser) => {
            void handleUserStatusButtonClick(targetUser);
          }}
        />
      )}

      {/* Live Account Alert / Platform Broadcast Composer Modal */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSendBroadcastAlert}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#121622] border border-indigo-200 dark:border-indigo-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'অ্যাকাউন্ট পোর্টালে লাইভ অ্যালার্ট পাঠান'
                      : 'Push Live Notification to Accounts'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'রিফ্রেশ ছাড়াই তাৎক্ষণিক পপআপ সব বা নির্দিষ্ট অ্যাকাউন্টে পৌঁছাবে।'
                      : 'Appears instantly as a live toast popup & alert inbox item without page refresh.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBroadcastModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {lang === 'bn' ? 'প্রাপক অ্যাকাউন্ট (অথবা ALL)' : 'Target (ALL or ID / Phone / Email)'}
                </label>
                <input
                  type="text"
                  required
                  value={broadcastTarget}
                  onChange={(e) => setBroadcastTarget(e.target.value)}
                  placeholder="ALL or U-100001 / A- / M-"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {lang === 'bn' ? 'গুরুত্বের ধরন' : 'Alert Severity'}
                </label>
                <select
                  value={broadcastSeverity}
                  onChange={(e) =>
                    setBroadcastSeverity(
                      e.target.value as 'info' | 'success' | 'warning' | 'critical'
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="info">Info Announcement</option>
                  <option value="success">Success / Bonus Notice</option>
                  <option value="warning">Warning / Maintenance</option>
                  <option value="critical">Critical Security Alert</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {lang === 'bn' ? 'শিরোনাম' : 'Alert Title'}
              </label>
              <input
                type="text"
                required
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. Scheduled Maintenance Complete"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {lang === 'bn' ? 'বার্তা' : 'Alert Message'}
              </label>
              <textarea
                required
                rows={3}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Write the message to deliver live to Customer, Agent & Merchant portals..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setBroadcastModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={broadcastBusy}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{broadcastBusy ? 'Pushing...' : 'Push Live Notification'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* In-App Executive Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/65 dark:bg-black/80 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-md rounded-3xl bg-white dark:bg-[#121622] border p-6 space-y-4 shadow-2xl ${
              confirmModal.tone === 'danger'
                ? 'border-rose-200 dark:border-rose-500/40'
                : 'border-amber-200 dark:border-amber-500/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {confirmModal.title}
              </h3>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50 transition-colors ${
                  confirmModal.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {confirmBusy ? 'Processing...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ctrl+K / Cmd+K Quick Command Palette */}
      <AdminCommandPaletteModal
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        users={users}
        transactions={transactions}
        sections={[
          { id: 'overview', label: 'Platform Overview' },
          { id: 'treasury', label: 'Credit Add & Transfer' },
          { id: 'users', label: t('globalUsers', lang) },
          { id: 'approvals', label: `${t('highValueQueue', lang)} (${metrics.pendingHighValue.length})` },
          { id: 'kyc_queue', label: `KYC Queue (${metrics.pendingKycCount})` },
          { id: 'booths', label: 'Live Map & Booths' },
          { id: 'social_engagement', label: 'Social Engagement Management' },
          { id: 'fees', label: t('feeEngine', lang) },
          { id: 'ledger', label: t('globalLedger', lang) },
          { id: 'activity', label: `Activity Log (${activityLogs.length})` },
        ]}
        lang={lang}
        onNavigateSection={(secId) => setSection(secId as AdminSection)}
        onInspectAccount={(accId) => setViewedAccountId(accId)}
        onJumpToLedgerTx={(txHash) => {
          setLedgerSearch(txHash);
          setSection('ledger');
        }}
      />
    </div>
  );
};
