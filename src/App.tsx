import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LogOut,
  ShieldCheck,
  Globe,
  User as UserIcon,
  MapPin,
  Sun,
  Moon,
  Smartphone,
  Bell,
  Volume2,
  MoreVertical,
  X,
} from 'lucide-react';
import {
  AcashBooth,
  AcashMapLocation,
  AcashSession,
  AcashTransaction,
  AcashUser,
  AccountNotification,
  AdminActivityLog,
  AdminNotification,
  AdminSession,
  CustomGiftCardRecord,
  FeeConfig,
  GiftCardCatalogPolicy,
  Language,
  MainTreasuryVault,
  PortalThemeConfig,
  SecondAdminProfile,
  SecurityEventRecord,
  SecurityPolicyConfig,
  ThemeMode,
} from './types/acash';
import {
  DEFAULT_FEE_CONFIG,
  DEFAULT_GIFT_CARD_POLICY,
  DEFAULT_TREASURY_VAULT,
  ensureDefaultPlatformData,
  isAccountNotificationRead,
  markAccountNotificationRead,
  markAllAccountNotificationsRead,
  markGiftCardState,
  purgeExpiredUserGiftCards,
  recordSessionTamperEvent,
  subscribeToAccountNotifications,
  subscribeToAdminActivityLogs,
  subscribeToAdminNotifications,
  subscribeToAllTransactions,
  subscribeToAllUsers,
  subscribeToBooths,
  subscribeToCustomGiftCards,
  subscribeToFeeConfig,
  subscribeToGiftCardPolicy,
  subscribeToMapLocations,
  subscribeToPortalTheme,
  subscribeToSecondAdmins,
  subscribeToSecurityEvents,
  subscribeToSecurityPolicy,
  subscribeToTreasuryVault,
  subscribeToUser,
  subscribeToUserTransactions,
  syncAutoIpMapLocation,
} from './lib/acashService';
import {
  DEFAULT_SECURITY_POLICY,
  signSessionPayload,
  verifySessionPayload,
} from './lib/securityGuard';
import {
  dispatchSystemNotification,
  getDeviceAlertStatus,
  requestNativeAlertGestureAccess,
  triggerHapticGesture,
} from './lib/deviceAlerts';
import {
  DEFAULT_PORTAL_THEME_CONFIG,
  PortalThemeProvider,
  getPortalThemeDefinition,
} from './lib/portalThemes';
import {
  signOutFirebase,
  subscribeToFirebaseAuth,
  testFirestoreConnection,
} from './lib/firebase';
import {
  detectInitialPortalMode,
  getExternalAdminPortalUrl,
  getExternalUserPortalUrl,
  isPortalLocked,
} from './lib/portalConfig';
import { t } from './lib/i18n';
import { BrandLogo } from './components/common/BrandLogo';
import { AuthPortal } from './components/auth/AuthPortal';
import { CustomerPanel } from './components/customer/CustomerPanel';
import { AgentPanel } from './components/agent/AgentPanel';
import { MerchantPanel } from './components/merchant/MerchantPanel';
import { AdminApp } from './components/admin/AdminApp';
import { ProfileModal, ProfileTab } from './components/common/ProfileModal';
import { BoothLocatorModal } from './components/common/BoothLocatorMap';
import { GetAppModal } from './components/common/GetAppModal';
import {
  AccountNotificationModal,
  LiveAccountToastStack,
  LiveToastItem,
} from './components/common/AccountNotificationCenter';
import { MobileBottomNav } from './components/common/MobileBottomNav';
import { TransactionReceiptModal } from './components/common/TransactionReceiptModal';
import { GiftCardReceiverOverlay } from './components/common/GiftCardExperience';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { initSoundboxAudioUnlock, playNotificationChime } from './lib/soundbox';

const USER_SESSION_KEY = 'acash_user_session_v1';
const USER_SNAPSHOT_KEY = 'acash_user_snapshot_v1';
const ADMIN_SESSION_KEY = 'acash_admin_session_v1';
const LANG_KEY = 'acash_lang_v1';
const THEME_KEY = 'acash_theme_v1';

function buildCompactUserSnapshot(user: AcashUser): AcashUser {
  return {
    ...user,
    ...(user.kyc
      ? {
          kyc: {
            ...user.kyc,
            nidPhotoUrl: undefined,
            taxCertificatePhotoUrl: undefined,
          },
        }
      : {}),
    ...(user.profilePhotoUrl && user.profilePhotoUrl.length > 24000
      ? { profilePhotoUrl: undefined }
      : {}),
  };
}

function readCachedUserSnapshot(expectedAccountId?: string): AcashUser | null {
  if (!expectedAccountId) return null;
  try {
    const raw = localStorage.getItem(USER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AcashUser;
    if (parsed && parsed.accountId === expectedAccountId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedUserSnapshot(user: AcashUser): void {
  try {
    localStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(buildCompactUserSnapshot(user)));
  } catch {
    // ignore storage limits
  }
}

function readPaymentIntentFromUrl(): { to: string; amount?: number; note?: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const payTo = params.get('payTo');
  if (!payTo) return null;
  const amt = Number(params.get('amount') || 0);
  const note = params.get('note') || undefined;
  return {
    to: payTo.toUpperCase(),
    amount: amt > 0 ? amt : undefined,
    note,
  };
}

export default function App() {
  const [appMode, setAppMode] = useState<'unified' | 'admin'>(detectInitialPortalMode);
  const portalLocked = isPortalLocked();
  const externalAdminUrl = getExternalAdminPortalUrl();
  const externalUserUrl = getExternalUserPortalUrl();
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'bn' ? 'bn' : 'en';
    } catch {
      return 'en';
    }
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [userSession, setUserSession] = useState<AcashSession | null>(() => {
    try {
      const raw = localStorage.getItem(USER_SESSION_KEY);
      return raw ? (JSON.parse(raw) as AcashSession) : null;
    } catch {
      return null;
    }
  });

  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      return raw ? (JSON.parse(raw) as AdminSession) : null;
    } catch {
      return null;
    }
  });

  const [currentUser, setCurrentUser] = useState<AcashUser | null>(() =>
    readCachedUserSnapshot(userSession?.accountId)
  );
  const [userBootLoading, setUserBootLoading] = useState<boolean>(
    () => Boolean(userSession) && !readCachedUserSnapshot(userSession?.accountId)
  );
  const [userTransactions, setUserTransactions] = useState<AcashTransaction[]>([]);
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(DEFAULT_FEE_CONFIG);

  // Admin & Network shared real-time streams
  const [allUsers, setAllUsers] = useState<AcashUser[]>([]);
  const [allTransactions, setAllTransactions] = useState<AcashTransaction[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([]);
  const [booths, setBooths] = useState<AcashBooth[]>([]);
  const [mapLocations, setMapLocations] = useState<AcashMapLocation[]>([]);
  const [secondAdmins, setSecondAdmins] = useState<SecondAdminProfile[]>([]);
  const [treasuryVault, setTreasuryVault] = useState<MainTreasuryVault>(DEFAULT_TREASURY_VAULT);
  const [portalThemeConfig, setPortalThemeConfig] = useState<PortalThemeConfig>(
    DEFAULT_PORTAL_THEME_CONFIG
  );
  const [customGiftCards, setCustomGiftCards] = useState<CustomGiftCardRecord[]>([]);
  const [giftCardPolicy, setGiftCardPolicy] = useState<GiftCardCatalogPolicy>(
    DEFAULT_GIFT_CARD_POLICY
  );
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicyConfig>(
    DEFAULT_SECURITY_POLICY
  );
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRecord[]>([]);
  const [deviceAlertStatus, setDeviceAlertStatus] = useState(() => getDeviceAlertStatus());
  const [alertBannerDismissed, setAlertBannerDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const ipSyncedAccountRef = useRef<string | null>(null);

  const [paymentIntent, setPaymentIntent] = useState<{
    to: string;
    amount?: number;
    note?: string;
  } | null>(readPaymentIntentFromUrl);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab>('photo');
  const [boothMapOpen, setBoothMapOpen] = useState(false);
  const [getAppOpen, setGetAppOpen] = useState(false);
  const [accountNotifications, setAccountNotifications] = useState<AccountNotification[]>([]);
  const [liveToasts, setLiveToasts] = useState<LiveToastItem[]>([]);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [notifReceiptTx, setNotifReceiptTx] = useState<AcashTransaction | null>(null);
  const [activeGiftOverlayTx, setActiveGiftOverlayTx] = useState<{
    tx: AcashTransaction;
    initialOpened: boolean;
  } | null>(null);
  const [dismissedGiftIds, setDismissedGiftIds] = useState<Set<string>>(() => new Set());
  const openedGiftIdsRef = useRef<Set<string>>(new Set());
  const [qrTriggerCount, setQrTriggerCount] = useState(0);
  const seenNotifsRef = useRef<Set<string> | null>(null);
  const isOnline = useOnlineStatus();

  const effectiveTheme: ThemeMode =
    appMode === 'unified' && portalThemeConfig.surfacePreference !== 'user_choice'
      ? portalThemeConfig.surfacePreference
      : theme;

  const activePortalTheme = useMemo(
    () => getPortalThemeDefinition(portalThemeConfig.presetId),
    [portalThemeConfig.presetId]
  );

  // Sync Dark/Light root class
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [effectiveTheme, theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Sync browser back/forward navigation & document title
  useEffect(() => {
    document.title =
      appMode === 'admin'
        ? 'Acash Admin — Executive Command Portal'
        : 'Acash — Customer, Agent & Merchant Portal';
  }, [appMode]);

  useEffect(() => {
    const onPopState = () => {
      setAppMode(detectInitialPortalMode());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Boot Firestore, Firebase Auth readiness, FeeConfig & Booth Network subscriptions
  useEffect(() => {
    testFirestoreConnection();
    ensureDefaultPlatformData();
    const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
      if (fbUser && fbUser.emailVerified) {
        void ensureDefaultPlatformData();
      }
    });
    const unsubFee = subscribeToFeeConfig(setFeeConfig);
    const unsubBooths = subscribeToBooths(setBooths);
    const unsubMapLocations = subscribeToMapLocations(setMapLocations);
    const unsubSecondAdmins = subscribeToSecondAdmins(setSecondAdmins);
    const unsubPortalTheme = subscribeToPortalTheme(setPortalThemeConfig);
    const unsubCustomGiftCards = subscribeToCustomGiftCards(setCustomGiftCards);
    const unsubGiftCardPolicy = subscribeToGiftCardPolicy(setGiftCardPolicy);
    const unsubSecurityPolicy = subscribeToSecurityPolicy(setSecurityPolicy);
    void purgeExpiredUserGiftCards();
    const purgeTimer = window.setInterval(() => {
      void purgeExpiredUserGiftCards();
    }, 60 * 1000);
    return () => {
      window.clearInterval(purgeTimer);
      unsubAuth();
      unsubFee();
      unsubBooths();
      unsubMapLocations();
      unsubSecondAdmins();
      unsubPortalTheme();
      unsubCustomGiftCards();
      unsubGiftCardPolicy();
      unsubSecurityPolicy();
    };
  }, []);

  // Unlock Web Audio & Voice Speech synthesis on first user gesture + sync alert status
  useEffect(() => {
    initSoundboxAudioUnlock();
    const onGesture = () => {
      window.setTimeout(() => {
        setDeviceAlertStatus(getDeviceAlertStatus());
      }, 150);
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });
    window.addEventListener('touchstart', onGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      window.removeEventListener('touchstart', onGesture);
    };
  }, []);

  // Cryptographic integrity check on local sessions (never logs out on normal refresh or host migration)
  useEffect(() => {
    let cancelled = false;
    if (userSession) {
      if (!userSession.integritySig) {
        void signSessionPayload({
          id: userSession.accountId,
          role: userSession.role,
          email: userSession.email,
          loggedInAt: userSession.loggedInAt,
        }).then((sig) => {
          if (cancelled) return;
          const upgraded: AcashSession = { ...userSession, integritySig: sig };
          try {
            localStorage.setItem(USER_SESSION_KEY, JSON.stringify(upgraded));
          } catch {
            // ignore
          }
          setUserSession(upgraded);
        });
      } else {
        void verifySessionPayload({
          id: userSession.accountId,
          role: userSession.role,
          email: userSession.email,
          loggedInAt: userSession.loggedInAt,
          integritySig: userSession.integritySig,
        }).then((valid) => {
          if (!cancelled && !valid) {
            recordSessionTamperEvent(userSession.accountId, 'account');
            handleUserLogout();
          }
        });
      }
    }
    if (adminSession) {
      if (!adminSession.integritySig) {
        void signSessionPayload({
          id: adminSession.adminEmail,
          role: adminSession.adminRole,
          email: adminSession.adminEmail,
          loggedInAt: adminSession.loggedInAt,
        }).then((sig) => {
          if (cancelled) return;
          const upgraded: AdminSession = { ...adminSession, integritySig: sig };
          try {
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(upgraded));
          } catch {
            // ignore
          }
          setAdminSession(upgraded);
        });
      } else {
        void verifySessionPayload({
          id: adminSession.adminEmail,
          role: adminSession.adminRole,
          email: adminSession.adminEmail,
          loggedInAt: adminSession.loggedInAt,
          integritySig: adminSession.integritySig,
        }).then((valid) => {
          if (!cancelled && !valid) {
            recordSessionTamperEvent(adminSession.adminEmail, 'admin');
            handleAdminLogout();
          }
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [
    userSession?.accountId,
    userSession?.loggedInAt,
    userSession?.integritySig,
    adminSession?.adminEmail,
    adminSession?.loggedInAt,
    adminSession?.integritySig,
  ]);

  // Real-time subscription for logged-in Unified App user (never auto-logout on refresh)
  useEffect(() => {
    seenNotifsRef.current = null;
    if (!userSession) {
      setCurrentUser(null);
      setUserTransactions([]);
      setAccountNotifications([]);
      setLiveToasts([]);
      setUserBootLoading(false);
      return;
    }

    const cached = readCachedUserSnapshot(userSession.accountId);
    if (cached) {
      setCurrentUser((prev) => prev || cached);
      setUserBootLoading(false);
    } else {
      setUserBootLoading(true);
    }

    const bootFallbackTimer = window.setTimeout(() => {
      setUserBootLoading(false);
    }, 3500);

    const unsubUser = subscribeToUser(userSession.accountId, (u) => {
      if (u) {
        saveCachedUserSnapshot(u);
        setCurrentUser(u);
        setUserBootLoading(false);
      }
    });

    const unsubTxs = subscribeToUserTransactions(userSession.accountId, setUserTransactions);

    const unsubNotifs = subscribeToAccountNotifications(userSession.accountId, (notifs) => {
      setAccountNotifications(notifs);
      if (seenNotifsRef.current === null) {
        seenNotifsRef.current = new Set(notifs.map((n) => n.id));
        return;
      }
      const newlyArrived: AccountNotification[] = [];
      for (const n of notifs) {
        if (!seenNotifsRef.current.has(n.id)) {
          seenNotifsRef.current.add(n.id);
          if (!isAccountNotificationRead(n, userSession.accountId)) {
            newlyArrived.push(n);
          }
        }
      }
      if (newlyArrived.length > 0) {
        const lead = newlyArrived[0];
        playNotificationChime(
          lead.severity === 'critical' || lead.severity === 'warning' ? 'alert' : 'credit'
        );
        triggerHapticGesture(
          lead.severity === 'critical'
            ? 'alert'
            : lead.severity === 'warning'
              ? 'warning'
              : 'success'
        );
        void dispatchSystemNotification({
          title: lead.title,
          body: lead.message,
          tag: `acash-acct-${lead.id}`,
          severity: lead.severity,
        });

        const items: LiveToastItem[] = newlyArrived.slice(0, 3).map((n) => ({
          id: `toast-${n.id}`,
          notifId: n.id,
          title: n.title,
          message: n.message,
          severity: n.severity,
          txId: n.txId,
          createdAt: n.createdAt,
        }));
        setLiveToasts((prev) => [...items, ...prev].slice(0, 4));
        items.forEach((item) => {
          window.setTimeout(() => {
            setLiveToasts((prev) => prev.filter((tItem) => tItem.id !== item.id));
          }, 6500);
        });
      }
    });

    return () => {
      window.clearTimeout(bootFallbackTimer);
      unsubUser();
      unsubTxs();
      unsubNotifs();
    };
  }, [userSession]);

  // Automatic IP geolocation pin sync for Agents (A-) & Merchants (M-) on session entry
  useEffect(() => {
    if (!currentUser) {
      ipSyncedAccountRef.current = null;
      return;
    }
    if (currentUser.role !== 'A' && currentUser.role !== 'M') return;
    if (ipSyncedAccountRef.current === currentUser.accountId) return;
    ipSyncedAccountRef.current = currentUser.accountId;
    void syncAutoIpMapLocation({
      creatorId: currentUser.accountId,
      creatorRole: currentUser.role === 'A' ? 'agent' : 'merchant',
      name: currentUser.name,
      businessName: currentUser.businessName,
      phone: currentUser.phone,
      profilePhotoUrl: currentUser.profilePhotoUrl,
      creatorUid: currentUser.firebaseUid,
    });
  }, [currentUser]);

  const unreadNotifCount = useMemo(() => {
    if (!currentUser) return 0;
    return accountNotifications.filter((n) => !isAccountNotificationRead(n, currentUser.accountId))
      .length;
  }, [accountNotifications, currentUser]);

  // Automatic full-screen festival celebration for incoming unopened Gift Cards
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'U') {
      setActiveGiftOverlayTx(null);
      return;
    }
    if (activeGiftOverlayTx) return;
    const nextUnopened = userTransactions.find(
      (tx) =>
        tx.type === 'send_money' &&
        tx.status === 'completed' &&
        tx.receiverId === currentUser.accountId &&
        Boolean(tx.giftCard) &&
        !tx.giftCard?.openedAt &&
        !tx.giftCard?.skippedAt &&
        !dismissedGiftIds.has(tx.txId) &&
        !openedGiftIdsRef.current.has(tx.txId)
    );
    if (nextUnopened) {
      playNotificationChime('credit');
      triggerHapticGesture('success');
      void dispatchSystemNotification({
        title:
          lang === 'bn'
            ? 'নতুন উৎসব গিফট কার্ড এসেছে!'
            : 'New Festive Gift Card Received!',
        body: `${nextUnopened.senderName} sent ৳${nextUnopened.amount.toLocaleString()} with a gift card`,
        tag: `acash-gift-${nextUnopened.txId}`,
        severity: 'success',
      });
      setActiveGiftOverlayTx({ tx: nextUnopened, initialOpened: false });
    }
  }, [currentUser, userTransactions, dismissedGiftIds, activeGiftOverlayTx, lang]);

  // Real-time subscriptions for Separate Admin App
  useEffect(() => {
    if (appMode !== 'admin' || !adminSession) return;
    const unsubUsers = subscribeToAllUsers(setAllUsers);
    const unsubTxs = subscribeToAllTransactions(setAllTransactions);
    const unsubNotifs = subscribeToAdminNotifications(setAdminNotifications);
    const unsubActivity = subscribeToAdminActivityLogs(setActivityLogs);
    const unsubVault = subscribeToTreasuryVault(setTreasuryVault);
    const unsubSecEvents = subscribeToSecurityEvents(setSecurityEvents);
    return () => {
      unsubUsers();
      unsubTxs();
      unsubNotifs();
      unsubActivity();
      unsubVault();
      unsubSecEvents();
    };
  }, [appMode, adminSession]);

  const toggleLanguage = () => {
    setLang((prev) => {
      const next = prev === 'en' ? 'bn' : 'en';
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const switchAppMode = (target: 'unified' | 'admin') => {
    if (portalLocked) return;
    setAppMode(target);
    try {
      const url = target === 'admin' ? '/admin' : '/';
      window.history.pushState({}, '', url);
    } catch {
      // ignore in restricted iframes
    }
  };

  const handleUserAuthenticated = async (user: AcashUser) => {
    const loggedInAt = Date.now();
    const integritySig = await signSessionPayload({
      id: user.accountId,
      role: user.role,
      email: user.email,
      loggedInAt,
    });
    const session: AcashSession = {
      accountId: user.accountId,
      role: user.role,
      email: user.email,
      ...(user.firebaseUid ? { firebaseUid: user.firebaseUid } : {}),
      loggedInAt,
      integritySig,
    };
    try {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
    saveCachedUserSnapshot(user);
    setUserSession(session);
    setCurrentUser(user);
    setUserBootLoading(false);
    triggerHapticGesture('success');
  };

  const handleUserLogout = () => {
    try {
      localStorage.removeItem(USER_SESSION_KEY);
      localStorage.removeItem(USER_SNAPSHOT_KEY);
    } catch {
      // ignore
    }
    void signOutFirebase();
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setActiveGiftOverlayTx(null);
    setDismissedGiftIds(new Set());
    openedGiftIdsRef.current = new Set();
    setUserSession(null);
    setCurrentUser(null);
  };

  const handleAdminLogin = async (session: AdminSession) => {
    const integritySig = await signSessionPayload({
      id: session.adminEmail,
      role: session.adminRole,
      email: session.adminEmail,
      loggedInAt: session.loggedInAt,
    });
    const signedSession: AdminSession = {
      ...session,
      integritySig,
    };
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(signedSession));
    } catch {
      // ignore
    }
    setAdminSession(signedSession);
    triggerHapticGesture('success');
  };

  const handleAdminLogout = () => {
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // ignore
    }
    void signOutFirebase();
    setAdminSession(null);
  };

  if (appMode === 'admin') {
    return (
      <AdminApp
        lang={lang}
        theme={theme}
        onToggleLang={toggleLanguage}
        onToggleTheme={toggleTheme}
        onSwitchToUnifiedApp={() => switchAppMode('unified')}
        portalLocked={portalLocked}
        externalUserPortalUrl={externalUserUrl}
        adminSession={adminSession}
        onAdminLogin={handleAdminLogin}
        onAdminLogout={handleAdminLogout}
        users={allUsers}
        transactions={allTransactions}
        notifications={adminNotifications}
        activityLogs={activityLogs}
        booths={booths}
        creatorLocations={mapLocations}
        secondAdmins={secondAdmins}
        feeConfig={feeConfig}
        treasuryVault={treasuryVault}
        customGiftCards={customGiftCards}
        giftCardPolicy={giftCardPolicy}
        portalTheme={portalThemeConfig}
        securityEvents={securityEvents}
        securityPolicy={securityPolicy}
      />
    );
  }

  return (
    <PortalThemeProvider config={portalThemeConfig}>
      <div className={`min-h-screen ${activePortalTheme.pageAmbientClass} text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 overflow-x-hidden`}>
        {/* Responsive 3-Zone Top Bar — never clips Logout on phones/PWAs */}
        <header className={`sticky top-0 z-30 bg-white/95 dark:bg-[#0B0D14]/95 backdrop-blur-md border-b ${activePortalTheme.headerAccentBg}`}>
          <div className="max-w-7xl mx-auto px-2.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3">
            <div className="min-w-0 flex-1">
              <BrandLogo
                size="sm"
                subtitle={
                  currentUser
                    ? `${
                        currentUser.role === 'U'
                          ? t('roleCustomer', lang)
                          : currentUser.role === 'A'
                            ? t('roleAgent', lang)
                            : t('roleMerchant', lang)
                      } · ${currentUser.accountId}`
                    : lang === 'bn'
                      ? 'কাস্টমার, এজেন্ট ও মার্চেন্ট'
                      : 'Customer, Agent & Merchant'
                }
              />
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Get Mobile App */}
              <button
                type="button"
                onClick={() => setGetAppOpen(true)}
                className={`${
                  currentUser ? 'hidden md:inline-flex' : 'inline-flex'
                } min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl ${activePortalTheme.headerBtnBg} text-xs font-semibold text-white items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs`}
                title={lang === 'bn' ? 'মোবাইল অ্যাপ নিন' : 'Get App'}
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span className={currentUser ? 'inline' : 'hidden sm:inline'}>
                  {lang === 'bn' ? 'অ্যাপ নিন' : 'Get App'}
                </span>
              </button>

              {/* Agent & Support Booth Map (desktop bar; on mobile accessible via Bottom Nav & Menu) */}
              <button
                type="button"
                onClick={() => setBoothMapOpen(true)}
                className="hidden md:inline-flex min-h-[40px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-xs font-semibold text-emerald-700 dark:text-emerald-300 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                title={lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map'}
              >
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map'}</span>
              </button>

              {/* Light / Dark Mode Switch */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                className="min-h-[38px] min-w-[38px] sm:min-h-[40px] sm:min-w-[40px] px-2 sm:px-2.5 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600" />
                )}
                <span className="hidden xl:inline">
                  {theme === 'dark'
                    ? lang === 'bn'
                      ? 'লাইট'
                      : 'Light'
                    : lang === 'bn'
                      ? 'ডার্ক'
                      : 'Dark'}
                </span>
              </button>

              {/* Bilingual Switch */}
              <button
                type="button"
                onClick={toggleLanguage}
                className="min-h-[38px] sm:min-h-[40px] px-2 sm:px-3 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0"
                title="Switch Language (English / বাংলা)"
              >
                <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 hidden sm:inline" />
                <span className="sm:hidden">{lang === 'en' ? 'বাং' : 'EN'}</span>
                <span className="hidden sm:inline">{lang === 'en' ? 'EN | বাংলা' : 'বাংলা | EN'}</span>
              </button>

              {/* Switch / Link to Separate Admin Website (desktop bar or logged-out view) */}
              {externalAdminUrl ? (
                <a
                  href={externalAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${
                    currentUser ? 'hidden md:inline-flex' : 'inline-flex'
                  } min-h-[38px] sm:min-h-[40px] px-2 sm:px-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-300 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{t('switchToAdmin', lang)}</span>
                  <span className="sm:hidden">Admin</span>
                </a>
              ) : !portalLocked ? (
                <button
                  type="button"
                  onClick={() => switchAppMode('admin')}
                  className={`${
                    currentUser ? 'hidden md:inline-flex' : 'inline-flex'
                  } min-h-[38px] sm:min-h-[40px] px-2 sm:px-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-300 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{t('switchToAdmin', lang)}</span>
                  <span className="sm:hidden">Admin</span>
                </button>
              ) : null}

              {currentUser && (
                <>
                  {/* Compact Mobile Menu for secondary links (Get App, Booth Map, Admin, Profile) */}
                  <div className="relative md:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen((prev) => !prev)}
                      aria-label={lang === 'bn' ? 'মেনু' : 'Quick Menu'}
                      className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {mobileMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl p-2 space-y-1 z-50">
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setProfileInitialTab('photo');
                            setProfileOpen(true);
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-left"
                        >
                          <UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>{lang === 'bn' ? 'প্রোফাইল, ২FA ও কেওয়াইসি' : 'Profile, 2FA & KYC'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setBoothMapOpen(true);
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-left"
                        >
                          <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{lang === 'bn' ? 'বুথ ও এজেন্ট ম্যাপ' : 'Booth & Agent Map'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setGetAppOpen(true);
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-left"
                        >
                          <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>{lang === 'bn' ? 'মোবাইল অ্যাপ ডাউনলোড' : 'Get Mobile App'}</span>
                        </button>
                        {externalAdminUrl ? (
                          <a
                            href={externalAdminUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setMobileMenuOpen(false)}
                            className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 flex items-center gap-2.5 text-left"
                          >
                            <ShieldCheck className="w-4 h-4 shrink-0" />
                            <span>{t('switchToAdmin', lang)}</span>
                          </a>
                        ) : !portalLocked ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMobileMenuOpen(false);
                              switchAppMode('admin');
                            }}
                            className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 flex items-center gap-2.5 text-left"
                          >
                            <ShieldCheck className="w-4 h-4 shrink-0" />
                            <span>{t('switchToAdmin', lang)}</span>
                          </button>
                        ) : null}
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-1 mt-1">
                          <button
                            type="button"
                            onClick={handleUserLogout}
                            className="w-full min-h-[40px] px-3 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 flex items-center gap-2.5 text-left"
                          >
                            <LogOut className="w-4 h-4 shrink-0" />
                            <span>{t('logout', lang)}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setNotifModalOpen(true)}
                    aria-label={lang === 'bn' ? 'লাইভ অ্যালার্ট' : 'Live Notifications'}
                    title={lang === 'bn' ? 'লাইভ অ্যালার্ট' : 'Live Notifications'}
                    className="relative min-h-[38px] min-w-[38px] sm:min-h-[40px] sm:min-w-[40px] px-2 sm:px-2.5 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="hidden lg:inline">
                      {lang === 'bn' ? 'অ্যালার্ট' : 'Alerts'}
                    </span>
                    {unreadNotifCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center font-mono-tabular">
                        {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileInitialTab('photo');
                      setProfileOpen(true);
                    }}
                    className="hidden sm:inline-flex min-h-[40px] pl-1.5 pr-2.5 sm:pr-3 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    {currentUser.profilePhotoUrl ? (
                      <img
                        src={currentUser.profilePhotoUrl}
                        alt={currentUser.name}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                        <UserIcon className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
                      </span>
                    )}
                    <span className="hidden md:inline">
                      {lang === 'bn' ? 'প্রোফাইল ও কেওয়াইসি' : 'Profile & KYC'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUserLogout}
                    className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-xs font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    title={t('logout', lang)}
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>{t('logout', lang)}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

      {portalThemeConfig.bannerEnabled &&
        (portalThemeConfig.customBannerBn || portalThemeConfig.customBannerEn) && (
          <div
            className={`bg-gradient-to-r ${activePortalTheme.bannerGradientClass} text-white px-4 py-2 text-center text-xs font-semibold shadow-xs`}
          >
            {lang === 'bn'
              ? portalThemeConfig.customBannerBn || portalThemeConfig.customBannerEn
              : portalThemeConfig.customBannerEn || portalThemeConfig.customBannerBn}
          </div>
        )}

      {currentUser &&
        !alertBannerDismissed &&
        (deviceAlertStatus.notificationPermission === 'default' ||
          !deviceAlertStatus.audioUnlocked) && (
          <div className="bg-indigo-50/95 dark:bg-indigo-950/60 border-b border-indigo-200 dark:border-indigo-500/30 px-4 py-2">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-100">
                <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>
                  {lang === 'bn'
                    ? 'ফোন ও পিসিতে লাইভ নোটিফিকেশন ও সাউন্ড জেসচার অ্যাক্সেস চালু করুন'
                    : 'Enable live Phone/PC OS notifications, sound chimes & haptic alerts'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    await requestNativeAlertGestureAccess(lang);
                    setDeviceAlertStatus(getDeviceAlertStatus());
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Bell className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {lang === 'bn' ? 'অ্যালার্ট ও সাউন্ড চালু করুন' : 'Enable Alerts & Sound'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAlertBannerDismissed(true)}
                  aria-label="Dismiss"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

      {currentUser && profileOpen && (
        <ProfileModal
          user={currentUser}
          transactions={userTransactions}
          feeConfig={feeConfig}
          lang={lang}
          initialTab={profileInitialTab}
          onLogout={handleUserLogout}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {boothMapOpen && (
        <BoothLocatorModal
          booths={booths}
          creatorLocations={mapLocations}
          lang={lang}
          onClose={() => setBoothMapOpen(false)}
          onSelectAgentForCashOut={
            currentUser?.role === 'U'
              ? (agentAccountId, boothName) => {
                  setPaymentIntent({
                    to: agentAccountId,
                    note: `Cash Out at ${boothName}`,
                  });
                  setBoothMapOpen(false);
                }
              : undefined
          }
          onSelectMerchantForPay={
            currentUser?.role === 'U'
              ? (merchantAccountId, merchantName) => {
                  setPaymentIntent({
                    to: merchantAccountId,
                    note: `Payment to ${merchantName}`,
                  });
                  setBoothMapOpen(false);
                }
              : undefined
          }
        />
      )}

      {getAppOpen && (
        <GetAppModal lang={lang} onClose={() => setGetAppOpen(false)} />
      )}

      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
          {lang === 'bn'
            ? 'অফলাইন মোড — ক্যাশড ডেটা দেখানো হচ্ছে'
            : 'Offline Mode — Cached wallet data active'}
        </div>
      )}

      {currentUser && (
        <LiveAccountToastStack
          toasts={liveToasts}
          lang={lang}
          onDismiss={(id) => setLiveToasts((prev) => prev.filter((item) => item.id !== id))}
          onOpenDetails={(toast) => {
            if (toast.notifId) {
              void markAccountNotificationRead(toast.notifId, currentUser.accountId);
            }
            setLiveToasts((prev) => prev.filter((item) => item.id !== toast.id));
            if (toast.txId) {
              const found = userTransactions.find((tx) => tx.txId === toast.txId);
              if (found) {
                setNotifReceiptTx(found);
                return;
              }
            }
            setNotifModalOpen(true);
          }}
        />
      )}

      {currentUser && notifModalOpen && (
        <AccountNotificationModal
          accountId={currentUser.accountId}
          notifications={accountNotifications}
          transactions={userTransactions}
          lang={lang}
          onClose={() => setNotifModalOpen(false)}
          onMarkRead={(notifId) => {
            void markAccountNotificationRead(notifId, currentUser.accountId);
          }}
          onMarkAllRead={() => {
            void markAllAccountNotificationsRead(currentUser.accountId);
          }}
          onOpenReceipt={(tx) => {
            setNotifModalOpen(false);
            setNotifReceiptTx(tx);
          }}
        />
      )}

      {currentUser && notifReceiptTx && (
        <TransactionReceiptModal
          tx={notifReceiptTx}
          currentAccountId={currentUser.accountId}
          lang={lang}
          onClose={() => setNotifReceiptTx(null)}
          onOpenGiftCard={(giftTx) => {
            setNotifReceiptTx(null);
            setActiveGiftOverlayTx({ tx: giftTx, initialOpened: true });
          }}
        />
      )}

      {currentUser && activeGiftOverlayTx && activeGiftOverlayTx.tx.giftCard && (
        <GiftCardReceiverOverlay
          key={activeGiftOverlayTx.tx.txId}
          tx={activeGiftOverlayTx.tx}
          lang={lang}
          customCards={customGiftCards}
          giftCardPolicy={giftCardPolicy}
          initialOpened={activeGiftOverlayTx.initialOpened}
          onOpened={(txId) => {
            openedGiftIdsRef.current.add(txId);
            void markGiftCardState(txId, 'opened');
          }}
          onSkip={(txId) => {
            const alreadyOpened =
              activeGiftOverlayTx.initialOpened ||
              openedGiftIdsRef.current.has(txId) ||
              Boolean(activeGiftOverlayTx.tx.giftCard?.openedAt);
            setDismissedGiftIds((prev) => {
              const next = new Set(prev);
              next.add(txId);
              return next;
            });
            setActiveGiftOverlayTx(null);
            if (!alreadyOpened) {
              void markGiftCardState(txId, 'skipped');
            }
          }}
          onViewReceipt={(receiptTx) => {
            setDismissedGiftIds((prev) => {
              const next = new Set(prev);
              next.add(receiptTx.txId);
              return next;
            });
            setActiveGiftOverlayTx(null);
            setNotifReceiptTx(receiptTx);
          }}
        />
      )}

      <main className="flex-1">
        {userBootLoading ? (
          <div className="max-w-7xl mx-auto px-6 py-24 text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {lang === 'bn' ? 'সেশন পুনরুদ্ধার করা হচ্ছে...' : 'Restoring persistent Acash session...'}
            </p>
          </div>
        ) : !currentUser ? (
          <AuthPortal
            lang={lang}
            onAuthenticated={handleUserAuthenticated}
            onOpenBoothMap={() => setBoothMapOpen(true)}
          />
        ) : currentUser.role === 'U' ? (
          <CustomerPanel
            user={currentUser}
            transactions={userTransactions}
            feeConfig={feeConfig}
            lang={lang}
            initialPaymentIntent={paymentIntent}
            onClearPaymentIntent={() => setPaymentIntent(null)}
            onOpenBoothMap={() => setBoothMapOpen(true)}
            onOpenNotifications={() => setNotifModalOpen(true)}
            onOpenBiometricSettings={() => {
              setProfileInitialTab('pin');
              setProfileOpen(true);
            }}
            unreadNotifications={unreadNotifCount}
            externalQrSignal={qrTriggerCount}
            customGiftCards={customGiftCards}
            giftCardPolicy={giftCardPolicy}
          />
        ) : currentUser.role === 'A' ? (
          <AgentPanel
            user={currentUser}
            transactions={userTransactions}
            feeConfig={feeConfig}
            lang={lang}
            onOpenMapLocationPicker={() => {
              setProfileInitialTab('location');
              setProfileOpen(true);
            }}
            onOpenNotifications={() => setNotifModalOpen(true)}
            unreadNotifications={unreadNotifCount}
            externalQrSignal={qrTriggerCount}
          />
        ) : (
          <MerchantPanel
            user={currentUser}
            transactions={userTransactions}
            feeConfig={feeConfig}
            lang={lang}
            onOpenMapLocationPicker={() => {
              setProfileInitialTab('location');
              setProfileOpen(true);
            }}
            onOpenNotifications={() => setNotifModalOpen(true)}
            unreadNotifications={unreadNotifCount}
            externalQrSignal={qrTriggerCount}
          />
        )}
      </main>

      {currentUser && (
        <MobileBottomNav
          role={currentUser.role}
          lang={lang}
          unreadNotifications={unreadNotifCount}
          onHome={() => {
            triggerHapticGesture('tap');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenBoothMap={() => {
            triggerHapticGesture('tap');
            setBoothMapOpen(true);
          }}
          onPrimaryQr={() => {
            triggerHapticGesture('tap');
            setQrTriggerCount((c) => c + 1);
          }}
          onOpenNotifications={() => {
            triggerHapticGesture('tap');
            setNotifModalOpen(true);
          }}
          onOpenProfile={() => {
            triggerHapticGesture('tap');
            setProfileInitialTab('photo');
            setProfileOpen(true);
          }}
        />
      )}
      </div>
    </PortalThemeProvider>
  );
}
