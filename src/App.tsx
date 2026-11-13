import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck, Globe, User as UserIcon, MapPin, Sun, Moon, Smartphone } from 'lucide-react';
import {
  AcashBooth,
  AcashMapLocation,
  AcashSession,
  AcashTransaction,
  AcashUser,
  AdminActivityLog,
  AdminNotification,
  AdminSession,
  FeeConfig,
  Language,
  MainTreasuryVault,
  SecondAdminProfile,
  ThemeMode,
} from './types/acash';
import {
  DEFAULT_FEE_CONFIG,
  DEFAULT_TREASURY_VAULT,
  ensureDefaultPlatformData,
  subscribeToAdminActivityLogs,
  subscribeToAdminNotifications,
  subscribeToAllTransactions,
  subscribeToAllUsers,
  subscribeToBooths,
  subscribeToFeeConfig,
  subscribeToMapLocations,
  subscribeToSecondAdmins,
  subscribeToTreasuryVault,
  subscribeToUser,
  subscribeToUserTransactions,
} from './lib/acashService';
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
import { useOnlineStatus } from './hooks/usePWAInstall';
import { initSoundboxAudioUnlock } from './lib/soundbox';

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

  const [paymentIntent, setPaymentIntent] = useState<{
    to: string;
    amount?: number;
    note?: string;
  } | null>(readPaymentIntentFromUrl);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab>('photo');
  const [boothMapOpen, setBoothMapOpen] = useState(false);
  const [getAppOpen, setGetAppOpen] = useState(false);
  const isOnline = useOnlineStatus();

  // Sync Dark/Light root class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

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
    return () => {
      unsubAuth();
      unsubFee();
      unsubBooths();
      unsubMapLocations();
      unsubSecondAdmins();
    };
  }, []);

  // Unlock Web Audio & Voice Speech synthesis on first user gesture
  useEffect(() => {
    initSoundboxAudioUnlock();
  }, []);

  // Real-time subscription for logged-in Unified App user (never auto-logout on refresh)
  useEffect(() => {
    if (!userSession) {
      setCurrentUser(null);
      setUserTransactions([]);
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

    return () => {
      window.clearTimeout(bootFallbackTimer);
      unsubUser();
      unsubTxs();
    };
  }, [userSession]);

  // Real-time subscriptions for Separate Admin App
  useEffect(() => {
    if (appMode !== 'admin' || !adminSession) return;
    const unsubUsers = subscribeToAllUsers(setAllUsers);
    const unsubTxs = subscribeToAllTransactions(setAllTransactions);
    const unsubNotifs = subscribeToAdminNotifications(setAdminNotifications);
    const unsubActivity = subscribeToAdminActivityLogs(setActivityLogs);
    const unsubVault = subscribeToTreasuryVault(setTreasuryVault);
    return () => {
      unsubUsers();
      unsubTxs();
      unsubNotifs();
      unsubActivity();
      unsubVault();
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

  const handleUserAuthenticated = (user: AcashUser) => {
    const session: AcashSession = {
      accountId: user.accountId,
      role: user.role,
      email: user.email,
      ...(user.firebaseUid ? { firebaseUid: user.firebaseUid } : {}),
      loggedInAt: Date.now(),
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
  };

  const handleUserLogout = () => {
    try {
      localStorage.removeItem(USER_SESSION_KEY);
      localStorage.removeItem(USER_SNAPSHOT_KEY);
    } catch {
      // ignore
    }
    void signOutFirebase();
    setProfileOpen(false);
    setUserSession(null);
    setCurrentUser(null);
  };

  const handleAdminLogin = (session: AdminSession) => {
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
    setAdminSession(session);
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
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0D14] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 overflow-x-hidden">
      {/* Calm 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0B0D14]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
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
                  ? 'কাস্টমার, এজেন্ট ও মার্চেন্ট পোর্টাল'
                  : 'Customer, Agent & Merchant'
            }
          />

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Get Mobile App */}
            <button
              type="button"
              onClick={() => setGetAppOpen(true)}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
              title={lang === 'bn' ? 'মোবাইল অ্যাপ নিন' : 'Get App'}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>{lang === 'bn' ? 'অ্যাপ নিন' : 'Get App'}</span>
            </button>

            {/* Agent & Support Booth Map */}
            <button
              type="button"
              onClick={() => setBoothMapOpen(true)}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title={lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map'}
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">
                {lang === 'bn' ? 'বুথ ম্যাপ' : 'Booth Map'}
              </span>
            </button>

            {/* Light / Dark Mode Switch */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
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

            {/* Bilingual Switch EN | বাংলা */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>{lang === 'en' ? 'EN | বাংলা' : 'বাংলা | EN'}</span>
            </button>

            {/* Switch / Link to Separate Admin Website (Hidden when standalone Unified domain has no external Admin URL) */}
            {externalAdminUrl ? (
              <a
                href={externalAdminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{t('switchToAdmin', lang)}</span>
                <span className="sm:hidden">Admin</span>
              </a>
            ) : !portalLocked ? (
              <button
                type="button"
                onClick={() => switchAppMode('admin')}
                className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{t('switchToAdmin', lang)}</span>
                <span className="sm:hidden">Admin</span>
              </button>
            ) : null}

            {currentUser && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setProfileInitialTab('photo');
                    setProfileOpen(true);
                  }}
                  className="min-h-[40px] pl-1.5 pr-2.5 sm:pr-3 rounded-xl bg-slate-100 dark:bg-[#121622] border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  {currentUser.profilePhotoUrl ? (
                    <img
                      src={currentUser.profilePhotoUrl}
                      alt={currentUser.name}
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
                  className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-xs font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  title={t('logout', lang)}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="hidden lg:inline">{t('logout', lang)}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {currentUser && profileOpen && (
        <ProfileModal
          user={currentUser}
          transactions={userTransactions}
          feeConfig={feeConfig}
          lang={lang}
          initialTab={profileInitialTab}
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
          />
        )}
      </main>
    </div>
  );
}
