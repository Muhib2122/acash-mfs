import React, { useEffect, useState } from 'react';
import {
  User,
  Store,
  Briefcase,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  Loader2,
  MapPin,
  FileCheck2,
  X,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { AcashUser, Language, ReferralSource, UserGender, UserRole } from '../../types/acash';
import { t } from '../../lib/i18n';
import { sendOtpEmail } from '../../lib/emailjs';
import {
  auth,
  consumeGoogleRedirectResult,
  isLikelyInAppBrowser,
  isRunningInIframe,
  signInWithGoogleSmart,
  signOutFirebase,
  startGoogleRedirectSignIn,
} from '../../lib/firebase';
import {
  authenticateAcashUser,
  checkRegistrationIdentityAvailability,
  findUserByIdentifier,
  formatUserReferralSource,
  getBackendSyncMode,
  recordOtpAbuseEvent,
  registerAcashUser,
  resolveAcashUserForGoogleAuth,
  syncAcashUserToCloud,
} from '../../lib/acashService';
import {
  checkAndRecordOtpSendQuota,
  containsDangerousMarkup,
  createSecurityChallenge,
  sanitizePlainText,
  secureRandomDigits,
  SecurityChallenge,
  timingSafeEqual,
} from '../../lib/securityGuard';
import { BrandLogo } from '../common/BrandLogo';

interface AuthPortalProps {
  lang: Language;
  onAuthenticated: (user: AcashUser) => void;
  onOpenBoothMap?: () => void;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  lang,
  onAuthenticated,
  onOpenBoothMap,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<UserRole>('U');

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gender, setGender] = useState<UserGender | ''>('');
  const [tcaAccepted, setTcaAccepted] = useState(false);
  const [tcaModalOpen, setTcaModalOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [requireLoginOtp, setRequireLoginOtp] = useState(false);
  const [referredByType, setReferredByType] = useState<ReferralSource>('own_app');
  const [referredByAgentIdentifier, setReferredByAgentIdentifier] = useState('');

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpCooldownSec, setOtpCooldownSec] = useState(0);
  const [otpInput, setOtpInput] = useState('');
  const [otpStatusMsg, setOtpStatusMsg] = useState('');
  const [pendingLoginUser, setPendingLoginUser] = useState<AcashUser | null>(null);
  const [newlyCreatedUser, setNewlyCreatedUser] = useState<AcashUser | null>(null);
  const [cloudSynced, setCloudSynced] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);

  // Anti-bot human security challenge on registration
  const [humanChallenge, setHumanChallenge] = useState<SecurityChallenge>(() =>
    createSecurityChallenge(lang)
  );
  const [challengeInput, setChallengeInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleErrorNeedsHelp, setGoogleErrorNeedsHelp] = useState(false);
  const [googleIdentity, setGoogleIdentity] = useState<{
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setHumanChallenge(createSecurityChallenge(lang));
    setChallengeInput('');
  }, [lang]);

  useEffect(() => {
    if (otpCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldownSec]);

  const isValidGmail = (value: string) =>
    /^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/i.test(value.trim());

  const isDirectGoogleVerified = Boolean(
    googleIdentity &&
      auth.currentUser?.emailVerified &&
      auth.currentUser?.uid === googleIdentity.uid &&
      googleIdentity.email.trim().toLowerCase() === email.trim().toLowerCase()
  );

  const applyAuthenticatedGoogleUser = async (fbUser: FirebaseUser) => {
    const fbEmail = (fbUser.email || '').trim().toLowerCase();
    if (!fbEmail) {
      throw new Error('Google account did not provide a verified Gmail address.');
    }

    const matched = await resolveAcashUserForGoogleAuth({
      uid: fbUser.uid,
      email: fbEmail,
      displayName: fbUser.displayName,
      photoURL: fbUser.photoURL,
    });

    if (matched) {
      onAuthenticated(matched);
      return;
    }

    // First-time Google user: MUST complete full info + Gender + TCA (Gmail already directly verified)
    setGoogleIdentity({
      uid: fbUser.uid,
      email: fbEmail,
      displayName: fbUser.displayName || fbEmail.split('@')[0],
      photoURL: fbUser.photoURL || undefined,
    });
    setMode('register');
    setOtpStep(false);
    setName(fbUser.displayName || '');
    setEmail(fbEmail);
    setPin('');
    setGender('');
    setTcaAccepted(false);
  };

  useEffect(() => {
    let active = true;
    const handleRedirectReturn = async () => {
      const outcome = await consumeGoogleRedirectResult('portal');
      if (!active) return;
      if (outcome.error) {
        setError(outcome.error);
        setGoogleErrorNeedsHelp(true);
        return;
      }
      if (outcome.user) {
        setGoogleBusy(true);
        try {
          await applyAuthenticatedGoogleUser(outcome.user);
        } catch (err) {
          if (active) {
            setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
          }
        } finally {
          if (active) setGoogleBusy(false);
        }
      }
    };
    void handleRedirectReturn();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roleOptions: Array<{
    id: UserRole;
    label: string;
    prefix: string;
    icon: React.ElementType;
  }> = [
    {
      id: 'U',
      label: t('roleCustomer', lang),
      prefix: 'U-',
      icon: User,
    },
    {
      id: 'A',
      label: t('roleAgent', lang),
      prefix: 'A-',
      icon: Briefcase,
    },
    {
      id: 'M',
      label: t('roleMerchant', lang),
      prefix: 'M-',
      icon: Store,
    },
  ];

  const handleRoleSwitch = (nextRole: UserRole) => {
    setRole(nextRole);
    setError('');
  };

  const triggerOtpSend = async (targetEmail: string, targetName: string, targetRole: UserRole) => {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    const quota = checkAndRecordOtpSendQuota(normalizedEmail);
    if (!quota.allowed) {
      setOtpCooldownSec(quota.cooldownRemainingSec);
      recordOtpAbuseEvent(normalizedEmail, quota.reason || 'OTP rate limit exceeded.');
      throw new Error(
        lang === 'bn'
          ? `ওটিপি সুরক্ষা সীমা: অনুগ্রহ করে ${quota.cooldownRemainingSec} সেকেন্ড অপেক্ষা করে আবার চেষ্টা করুন।`
          : quota.reason || `Please wait ${quota.cooldownRemainingSec}s before requesting another OTP.`
      );
    }

    const code = secureRandomDigits(6);
    setOtpInput('');
    setOtpAttempts(0);
    setOtpStatusMsg('');

    const roleLabel =
      targetRole === 'U' ? 'Customer (U)' : targetRole === 'A' ? 'Agent (A)' : 'Merchant (M)';
    const res = await sendOtpEmail({
      toEmail: normalizedEmail,
      toName: sanitizePlainText(targetName, 100),
      otp: code,
      roleLabel,
    });

    if (!res.sent) {
      setGeneratedOtp('');
      setOtpExpiresAt(0);
      setOtpStep(false);
      throw new Error(
        lang === 'bn'
          ? `EmailJS থেকে ${normalizedEmail}-এ ভেরিফিকেশন কোড পাঠানো যায়নি (${res.error || 'Delivery failed'})। অনুগ্রহ করে সঠিক Gmail দিন অথবা উপরে "গুগল (Firebase Auth)" ব্যবহার করুন।`
          : `Could not deliver EmailJS OTP to ${normalizedEmail} (${res.error || 'Delivery failed'}). Please verify your Gmail address or use "Continue with Google" above.`
      );
    }

    setGeneratedOtp(code);
    setOtpExpiresAt(Date.now() + 10 * 60 * 1000);
    setOtpCooldownSec(45);
    setOtpStatusMsg(`${t('otpSentTo', lang)} ${normalizedEmail}`);
    setOtpStep(true);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await authenticateAcashUser({
        identifier,
        pin,
      });

      if (requireLoginOtp) {
        setPendingLoginUser(user);
        await triggerOtpSend(user.email, user.name, user.role);
      } else {
        onAuthenticated(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (containsDangerousMarkup(name) || containsDangerousMarkup(businessName)) {
      setError(
        lang === 'bn'
          ? 'নামের ঘরে অনিরাপদ HTML বা স্ক্রিপ্ট অক্ষর ব্যবহার করা যাবে না।'
          : 'Unsafe HTML or script characters are blocked.'
      );
      return;
    }

    if (!sanitizePlainText(name, 120)) {
      setError(lang === 'bn' ? 'পূর্ণ নাম আবশ্যক।' : 'Full name is required.');
      return;
    }
    if ((role === 'A' || role === 'M') && !sanitizePlainText(businessName, 140)) {
      setError(
        lang === 'bn'
          ? 'এজেন্ট বা মার্চেন্ট অ্যাকাউন্টের জন্য ব্যবসা / দোকানের নাম আবশ্যক।'
          : 'Business or Store name is required for Agent/Merchant accounts.'
      );
      return;
    }
    if (!gender) {
      setError(
        lang === 'bn'
          ? 'অনুগ্রহ করে আপনার লিঙ্গ (Male / Female) নির্বাচন করুন — ভয়েস নোটিফিকেশনের জন্য এটি আবশ্যক।'
          : 'Please select your Gender (Male / Female) for personalized transaction voice alerts.'
      );
      return;
    }
    if (!/^01\d{9}$/.test(phone.replace(/\D/g, ''))) {
      setError(
        lang === 'bn'
          ? 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678)।'
          : 'Enter a valid 11-digit Bangladesh mobile number (e.g. 01712345678).'
      );
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidGmail(normalizedEmail)) {
      setError(
        lang === 'bn'
          ? 'অ্যাকাউন্ট খুলতে অবশ্যই একটি সঠিক Gmail ঠিকানা (@gmail.com) দিতে হবে অথবা উপরে গুগল দিয়ে সাইন ইন করতে হবে।'
          : 'A valid Gmail address (@gmail.com) is required for EmailJS OTP or Direct Google sign-up.'
      );
      return;
    }
    if (!/^\d{4,5}$/.test(pin)) {
      setError(
        lang === 'bn'
          ? 'সিকিউরিটি পিন অবশ্যই ৪ বা ৫ সংখ্যার হতে হবে।'
          : 'Security PIN must be 4 or 5 digits.'
      );
      return;
    }

    if (referredByType === 'agent') {
      const refClean = referredByAgentIdentifier.trim();
      if (!refClean) {
        setError(
          lang === 'bn'
            ? 'এজেন্ট রেফারেল আইডি (যেমন A-200001) বা এজেন্ট মোবাইল নম্বর দিন।'
            : 'Please enter the referring Agent ID (e.g. A-200001) or Agent mobile number.'
        );
        return;
      }
      const matched = await findUserByIdentifier(refClean);
      if (matched && matched.role !== 'A') {
        setError('Referral account must be an Acash Agent (A) account.');
        return;
      }
      const digits = refClean.replace(/\D/g, '');
      const upper = refClean.toUpperCase().replace(/\s+/g, '');
      if (!matched && !/^A-?\d{6}$/.test(upper) && !/^(88)?01\d{9}$/.test(digits)) {
        setError('Enter a valid Agent ID (e.g. A-200001) or 11-digit Agent mobile number.');
        return;
      }
    }

    if (!tcaAccepted) {
      setError(
        lang === 'bn'
          ? 'অ্যাকাউন্ট খুলতে শর্তাবলী ও নীতিমালা (TCA) সম্মতি বক্সে টিক দিন।'
          : 'You must agree to the Acash Terms & Conditions Agreement (TCA) before verification.'
      );
      return;
    }

    if (Number(challengeInput.trim()) !== humanChallenge.expectedAnswer) {
      setHumanChallenge(createSecurityChallenge(lang));
      setChallengeInput('');
      setError(
        lang === 'bn'
          ? 'বট সুরক্ষা প্রশ্নের উত্তর সঠিক নয়। নতুন গণিতটি সমাধান করে আবার চেষ্টা করুন।'
          : 'Incorrect security verification answer. Please solve the new math check.'
      );
      return;
    }

    setLoading(true);
    try {
      // Strictly block duplicate Gmail or Phone before OTP or account creation
      await checkRegistrationIdentityAvailability({
        phone,
        email: isDirectGoogleVerified && googleIdentity ? googleIdentity.email : normalizedEmail,
      });

      // Path 1: Direct Gmail via Google Firebase Auth (already email-verified by Google)
      if (isDirectGoogleVerified && googleIdentity) {
        const created = await registerAcashUser({
          role,
          name,
          businessName: role !== 'U' ? businessName : undefined,
          gender,
          termsAcceptedAt: Date.now(),
          phone,
          email: googleIdentity.email.trim().toLowerCase(),
          pin,
          referredByType,
          referredByAgentIdentifier:
            referredByType === 'agent' ? referredByAgentIdentifier : undefined,
          firebaseUid: googleIdentity.uid,
          profilePhotoUrl: googleIdentity.photoURL,
          verificationMethod: 'google_auth',
        });
        setCloudSynced(true);
        setNewlyCreatedUser(created);
      } else {
        // Path 2: EmailJS Gmail OTP Verification (no bypass allowed)
        await triggerOtpSend(normalizedEmail, name.trim(), role);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleErrorNeedsHelp(false);
    setGoogleBusy(true);
    try {
      const outcome = await signInWithGoogleSmart('portal');
      if (outcome.status === 'redirecting') {
        return;
      }
      await applyAuthenticatedGoogleUser(outcome.user);
    } catch (err) {
      setGoogleErrorNeedsHelp(true);
      setError(err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleGoogleRedirectRetry = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      await startGoogleRedirectSignIn('portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google redirect sign-in failed.');
      setGoogleBusy(false);
    }
  };

  const handleVerifyOtpAndFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const targetEmail = (pendingLoginUser ? pendingLoginUser.email : email).trim().toLowerCase();
    if (!otpExpiresAt || Date.now() > otpExpiresAt) {
      setError(
        lang === 'bn'
          ? 'ওটিপি কোডের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে Resend OTP চাপুন।'
          : 'This OTP has expired. Please tap Resend OTP to receive a fresh code.'
      );
      return;
    }

    if (generatedOtp.length !== 6 || !timingSafeEqual(otpInput.trim(), generatedOtp)) {
      const nextAttempts = otpAttempts + 1;
      setOtpAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        setGeneratedOtp('');
        setOtpExpiresAt(0);
        recordOtpAbuseEvent(
          targetEmail,
          `5 consecutive failed OTP verification attempts for ${targetEmail}; active OTP invalidated.`
        );
        setError(
          lang === 'bn'
            ? '৫ বার ভুল ওটিপি দেওয়ায় কোডটি বাতিল করা হয়েছে। অনুগ্রহ করে Resend OTP চাপুন।'
            : '5 wrong OTP attempts detected. Current code invalidated — request a fresh OTP.'
        );
        return;
      }
      setError(
        lang === 'bn'
          ? `ভুল ওটিপি কোড (${5 - nextAttempts} বার বাকি)। আপনার জিমেইল চেক করে সঠিক ৬-সংখ্যার কোড দিন।`
          : `Invalid 6-digit OTP code (${5 - nextAttempts} attempts remaining).`
      );
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login' && pendingLoginUser) {
        onAuthenticated(pendingLoginUser);
      } else {
        if (!gender) {
          throw new Error('Please select Gender before completing registration.');
        }
        if (!tcaAccepted) {
          throw new Error('Terms & Conditions Agreement (TCA) acceptance is required.');
        }
        const created = await registerAcashUser({
          role,
          name,
          businessName: role !== 'U' ? businessName : undefined,
          gender,
          termsAcceptedAt: Date.now(),
          phone,
          email: email.trim().toLowerCase(),
          pin,
          referredByType,
          referredByAgentIdentifier:
            referredByType === 'agent' ? referredByAgentIdentifier : undefined,
          verificationMethod: 'emailjs_otp',
          emailJsOtpVerified: true,
        });
        setCloudSynced(
          getBackendSyncMode() === 'firestore' ||
            Boolean(created.firebaseUid && auth.currentUser?.emailVerified)
        );
        setNewlyCreatedUser(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNewAccountToCloud = async () => {
    if (!newlyCreatedUser) return;
    setError('');
    setSyncingCloud(true);
    try {
      const outcome = await signInWithGoogleSmart('portal');
      if (outcome.status === 'redirecting') {
        return;
      }
      const ok = await syncAcashUserToCloud(newlyCreatedUser, outcome.user.uid);
      if (ok) {
        setNewlyCreatedUser({ ...newlyCreatedUser, firebaseUid: outcome.user.uid });
        setCloudSynced(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google verification cancelled or failed.');
    } finally {
      setSyncingCloud(false);
    }
  };

  if (newlyCreatedUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-5 shadow-xl dark:shadow-none">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {lang === 'bn' ? 'আক্যাশ অ্যাকাউন্ট তৈরি সম্পন্ন!' : 'Acash Account Created!'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'bn'
                ? 'আপনার রোল-নির্ধারিত অ্যাকাউন্ট আইডি সংরক্ষণ করুন'
                : 'Save your newly generated role-prefixed Acash Account ID'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
            <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {newlyCreatedUser.role === 'U'
                ? t('roleCustomer', lang)
                : newlyCreatedUser.role === 'A'
                  ? t('roleAgent', lang)
                  : t('roleMerchant', lang)}
            </div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white">
              {newlyCreatedUser.accountId}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{newlyCreatedUser.email}</div>
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
              <div>
                <span className="text-slate-400">Opened:</span>{' '}
                {new Date(newlyCreatedUser.createdAt).toLocaleString()}
              </div>
              <div>
                <span className="text-slate-400">Referred By:</span>{' '}
                <span className="text-indigo-600 dark:text-indigo-300 font-medium">
                  {formatUserReferralSource(newlyCreatedUser)}
                </span>
              </div>
            </div>
          </div>

          {cloudSynced ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {lang === 'bn'
                ? 'ক্লাউড ডাটাবেসে সেভ হয়েছে — এখন সব পোর্টালে (Admin, Agent, Merchant, User) খুঁজে পাওয়া যাবে।'
                : 'Synced to Acash Cloud — discoverable across all portals & devices.'}
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/35 p-3.5 text-left space-y-2.5">
              <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                {lang === 'bn'
                  ? 'সব পোর্টালে (Admin, Agent, Merchant ও অন্য ডিভাইস) এই অ্যাকাউন্টটি খুঁজে পেতে নিচের বাটনে ক্লিক করে গুগল ভেরিফিকেশন যুক্ত করুন।'
                  : 'To make this account searchable across all portals (Admin, Agent, Merchant & other devices), verify with Google once.'}
              </div>
              <button
                type="button"
                disabled={syncingCloud}
                onClick={handleSyncNewAccountToCloud}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {syncingCloud ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {lang === 'bn'
                    ? 'গুগল ভেরিফাই করে ক্লাউডে সেভ করুন'
                    : 'Verify Google & Sync Across Portals'}
                </span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => onAuthenticated(newlyCreatedUser)}
            className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
          >
            {lang === 'bn' ? 'ড্যাশবোর্ডে প্রবেশ করুন' : 'Enter Dashboard'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
        {/* Left Calm Welcome Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 sm:p-9 shadow-sm dark:shadow-none">
          <div className="space-y-6">
            <BrandLogo size="lg" subtitle={t('tagline', lang)} />

            <div className="space-y-3 pt-2">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
                {lang === 'bn'
                  ? 'নিরাপদ, দ্রুত এবং সহজ ডিজিটাল লেনদেন'
                  : 'Simple, Calm & Secure Digital Wallet'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'bn'
                  ? 'আপনার আক্যাশ অ্যাকাউন্টে প্রবেশ করুন অথবা নতুন অ্যাকাউন্ট তৈরি করে সেন্ড মানি, ক্যাশ-আউট, মোবাইল রিচার্জ ও মার্চেন্ট পেমেন্ট শুরু করুন।'
                  : 'Sign in to your Acash account or register to send money, cash out, pay merchants, and recharge any mobile operator.'}
              </p>
            </div>
          </div>

          {onOpenBoothMap && (
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onOpenBoothMap}
                className="w-full py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {lang === 'bn'
                    ? 'নিকটস্থ এজেন্ট বুথ ও কাস্টমার সাপোর্ট ম্যাপ দেখুন'
                    : 'Explore Agent Booth & Customer Support Map'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Right Interactive Auth Card */}
        <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col justify-center shadow-sm dark:shadow-none">
          {/* Google Sign-In with Firebase Auth */}
          <div className="mb-5">
            {googleIdentity ? (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {googleIdentity.photoURL ? (
                    <img
                      src={googleIdentity.photoURL}
                      alt={googleIdentity.displayName}
                      className="w-9 h-9 rounded-full border border-emerald-300 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200 truncate">
                      Google Verified: {googleIdentity.displayName}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      {googleIdentity.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void signOutFirebase();
                    setGoogleIdentity(null);
                    setEmail('');
                    setError('');
                  }}
                  className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
                >
                  {lang === 'bn' ? 'পরিবর্তন' : 'Switch'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={googleBusy || loading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 rounded-xl bg-slate-50 dark:bg-[#0B0D14] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
                >
                  {googleBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                  ) : (
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
                  )}
                  <span>
                    {lang === 'bn'
                      ? 'গুগল (Firebase Auth) দিয়ে সাইন ইন করুন'
                      : 'Continue with Google (Firebase Auth)'}
                  </span>
                </button>

                {googleErrorNeedsHelp && !isRunningInIframe() && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200">
                    <span>
                      {isLikelyInAppBrowser()
                        ? lang === 'bn'
                          ? 'ইন-অ্যাপ ব্রাউজারে পপআপ ব্লক হলে Chrome/Safari-তে খুলুন অথবা রিডাইরেক্ট ব্যবহার করুন।'
                          : 'In-app browser detected. Open in Chrome/Safari or try Redirect login.'
                        : lang === 'bn'
                          ? 'পপআপ ব্লক হলে গুগল রিডাইরেক্ট চেষ্টা করুন।'
                          : 'Popup blocked? Try Google Redirect sign-in.'}
                    </span>
                    <button
                      type="button"
                      disabled={googleBusy}
                      onClick={handleGoogleRedirectRetry}
                      className="font-semibold text-indigo-700 dark:text-indigo-300 underline"
                    >
                      {lang === 'bn' ? 'Redirect Sign-In' : 'Use Redirect Sign-In'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            <span className="px-3 bg-white dark:bg-[#121622] text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {lang === 'bn' ? 'অথবা আক্যাশ আইডি ও পিন' : 'Or Acash ID & Security PIN'}
            </span>
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
          </div>

          {/* Login / Register Toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setOtpStep(false);
                setError('');
              }}
              className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                mode === 'login'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('login', lang)}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setOtpStep(false);
                setError('');
                setPin('');
              }}
              className={`py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                mode === 'register'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('register', lang)}
            </button>
          </div>

          {!otpStep ? (
            <>
              {/* Role Selector */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('selectRole', lang)}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {roleOptions.map((item) => {
                    const Icon = item.icon;
                    const active = role === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleRoleSwitch(item.id)}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-900 dark:text-white'
                            : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Icon
                            className={`w-4 h-4 ${
                              active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                            }`}
                          />
                          <span className="font-mono-tabular text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                            {item.prefix}
                          </span>
                        </div>
                        <div className="text-xs font-semibold">{item.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {mode === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('accountIdOrPhone', lang)}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={
                          lang === 'bn'
                            ? 'অ্যাকাউন্ট আইডি বা মোবাইল নম্বর (যেমন 017...)'
                            : 'Account ID or Mobile Number (e.g. 017...)'
                        }
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('pinLabel', lang)}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        maxLength={5}
                        inputMode="numeric"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white tracking-widest placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={requireLoginOtp}
                      onChange={(e) => setRequireLoginOtp(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      {lang === 'bn'
                        ? 'লগইনের সময় জিমেইল ওটিপি ২-স্টেপ ভেরিফিকেশন ব্যবহার করুন'
                        : 'Require Gmail 2FA OTP verification via EmailJS on sign in'}
                    </span>
                  </label>

                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>{t('login', lang)}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterStart} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('fullName', lang)}
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Tanvir Ahmed"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {(role === 'A' || role === 'M') && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('businessName', lang)}
                      </label>
                      <input
                        type="text"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder={role === 'A' ? 'e.g. Mirpur Agent Point' : 'e.g. Star Tech BD'}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('phone', lang)}
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="01712345678"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('pinLabel', lang)}
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          maxLength={5}
                          inputMode="numeric"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="4 digits"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('gmail', lang)}
                      </label>
                      <span
                        className={`text-[10px] font-semibold ${
                          isDirectGoogleVerified
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {isDirectGoogleVerified
                          ? lang === 'bn'
                            ? 'ডাইরেক্ট গুগল ভেরিফাইড'
                            : 'Direct Google Verified'
                          : lang === 'bn'
                            ? 'EmailJS OTP আবশ্যক'
                            : 'EmailJS OTP Required'}
                      </span>
                    </div>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        readOnly={isDirectGoogleVerified}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@gmail.com"
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-indigo-500 ${
                          isDirectGoogleVerified
                            ? 'bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-100 cursor-not-allowed'
                            : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500'
                        }`}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {lang === 'bn'
                        ? 'নতুন আইডি শুধুমাত্র Direct Google Auth অথবা EmailJS Gmail OTP-এর মাধ্যমেই তৈরি করা যাবে।'
                        : 'Accounts can only be created via Direct Google Gmail Auth or EmailJS 6-digit Gmail OTP.'}
                    </p>
                  </div>

                  {/* Sex / Gender Info for Opposite-Gender Transaction Voice Alerts */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                      <span>
                        {lang === 'bn' ? 'লিঙ্গ / সেক্স নির্বাচন করুন *' : 'Sex / Gender *'}
                      </span>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                        {lang === 'bn' ? 'ভয়েস নোটিফিকেশন সেটআপ' : 'Voice Alert Profile'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGender('male');
                          setError('');
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                          gender === 'male'
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                        }`}
                      >
                        {lang === 'bn' ? 'পুরুষ (Male)' : 'Male'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGender('female');
                          setError('');
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                          gender === 'female'
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                        }`}
                      >
                        {lang === 'bn' ? 'মহিলা (Female)' : 'Female'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {lang === 'bn'
                        ? 'নারী ব্যবহারকারীরা পুরুষ কণ্ঠে এবং পুরুষ ব্যবহারকারীরা নারী কণ্ঠে লেনদেনের টাকার পরিমাণ সহ ভয়েস নোটিফিকেশন পাবেন।'
                        : 'Female users hear a Male voice alert & Male users hear a Female voice alert with exact transaction amounts.'}
                    </p>
                  </div>

                  {/* Referred By Security Selector (Own App vs Agent Referral) */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                      <span>
                        {lang === 'bn'
                          ? 'রেফারেল উৎস (নিরাপত্তা যাচাই) *'
                          : 'Referred By (Security Tracking) *'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Audit Record</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReferredByType('own_app');
                          setError('');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                          referredByType === 'own_app'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {lang === 'bn' ? 'নিজস্ব অ্যাপ (Self)' : 'Own App (Self)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReferredByType('agent');
                          setError('');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                          referredByType === 'agent'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {lang === 'bn' ? 'এজেন্ট রেফারেল' : 'By Agent Number / ID'}
                      </button>
                    </div>

                    {referredByType === 'agent' && (
                      <div>
                        <input
                          type="text"
                          required
                          value={referredByAgentIdentifier}
                          onChange={(e) => setReferredByAgentIdentifier(e.target.value)}
                          placeholder={
                            lang === 'bn'
                              ? 'এজেন্ট আইডি (A-200001) বা মোবাইল (01811000002)'
                              : 'Agent ID (e.g. A-200001) or Agent Phone (01811000002)'
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Required Terms & Conditions Agreement (TCA) */}
                  <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 space-y-2">
                    <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={tcaAccepted}
                        onChange={(e) => {
                          setTcaAccepted(e.target.checked);
                          if (e.target.checked) setError('');
                        }}
                        className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="leading-relaxed">
                        {lang === 'bn'
                          ? 'আমি আক্যাশ শর্তাবলী, প্রাইভেসি নীতি ও ৫০,০০০+ টাকা AML নিরাপত্তা চুক্তি (TCA) পড়েছি এবং সম্পূর্ণ সম্মত আছি।'
                          : 'I have read and agree to the Acash Terms & Conditions Agreement (TCA), Privacy Policy, Fee Schedule & 50,000+ BDT AML Rules.'}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setTcaModalOpen(true)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pl-6"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'সম্পূর্ণ TCA শর্তাবলী পড়ুন' : 'View Full Terms & Conditions (TCA)'}</span>
                    </button>
                  </div>

                  {/* Anti-Bot Human Security Check */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{humanChallenge.question}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {lang === 'bn' ? 'অটোমেটেড স্প্যাম প্রতিরোধ যাচাই' : 'Anti-Bot Spam Shield'}
                      </div>
                    </div>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={3}
                      value={challengeInput}
                      onChange={(e) => setChallengeInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="?"
                      className="w-20 px-3 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-center font-mono-tabular text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shrink-0"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>
                      {isDirectGoogleVerified
                        ? lang === 'bn'
                          ? 'গুগল ভেরিফাইড অ্যাকাউন্ট তৈরি করুন'
                          : 'Create Account (Direct Google Gmail)'
                        : t('sendOtp', lang)}
                    </span>
                  </button>
                </form>
              )}
            </>
          ) : (
            <form onSubmit={handleVerifyOtpAndFinalize} className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>EmailJS Gmail Verification</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{otpStatusMsg}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {lang === 'bn'
                    ? 'ইনবক্সে না পেলে অবশ্যই Gmail-এর Spam / Promotions ফোল্ডার চেক করুন, অথবা Resend OTP চাপুন।'
                    : 'Check both Inbox and Spam / Promotions folders in Gmail, or tap Resend OTP below.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('otpCode', lang)}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit OTP"
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-center font-mono-tabular text-xl tracking-[0.4em] text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{t('verifyAndContinue', lang)}</span>
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setOtpStep(false)}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {t('back', lang)}
                </button>
                <button
                  type="button"
                  disabled={loading || otpCooldownSec > 0}
                  onClick={async () => {
                    setLoading(true);
                    setError('');
                    try {
                      const targetEmail = pendingLoginUser ? pendingLoginUser.email : email;
                      const targetName = pendingLoginUser ? pendingLoginUser.name : name;
                      const targetRole = pendingLoginUser ? pendingLoginUser.role : role;
                      await triggerOtpSend(targetEmail, targetName, targetRole);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>
                    {otpCooldownSec > 0
                      ? `${t('resendOtp', lang)} (${otpCooldownSec}s)`
                      : t('resendOtp', lang)}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {tcaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 dark:bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-display font-bold text-slate-900 dark:text-white text-base">
                  {lang === 'bn'
                    ? 'আক্যাশ শর্তাবলী ও গ্রাহক চুক্তি (TCA)'
                    : 'Acash Terms & Conditions Agreement (TCA)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTcaModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p>
                <strong>1. Account Identity & Verification:</strong> Every Acash Customer (U-), Agent (A-), and Merchant (M-) account requires accurate personal/business information, a 4/5-digit security PIN, and Email OTP verification—including accounts initiated via Google Sign-In.
              </p>
              <p>
                <strong>2. Dynamic Fee & Settlement Rules:</strong> Service charges for Cash-Out, Merchant Cash-Out, and Send Money follow the live Platform Fee Engine published by Administration. Historical transaction fees remain permanently locked on past ledger records and PDF statements.
              </p>
              <p>
                <strong>3. High-Value AML Compliance (৳50,000+):</strong> Any single transfer of 50,000 BDT or above enters Admin Security Review before final settlement in compliance with Bangladesh Mobile Financial Services anti-money laundering controls.
              </p>
              <p>
                <strong>4. Privacy, Location Pins & Voice Alerts:</strong> Selected profile/sex information is used to personalize opposite-gender transaction voice notifications with transaction amounts. Agents, Merchants, and 2nd Admins who enable map pins consent to showing their business name, photo, phone, and coordinates on the Acash Locator Map.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTcaAccepted(true);
                  setTcaModalOpen(false);
                  setError('');
                }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                {lang === 'bn' ? 'সম্মতি দিন ও বন্ধ করুন' : 'Accept TCA & Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
