import React, { useState } from 'react';
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
import { AcashUser, Language, ReferralSource, UserGender, UserRole } from '../../types/acash';
import { t } from '../../lib/i18n';
import { sendOtpEmail } from '../../lib/emailjs';
import { signInWithGooglePopup } from '../../lib/firebase';
import {
  authenticateAcashUser,
  findUserByIdentifier,
  formatUserReferralSource,
  registerAcashUser,
  resolveAcashUserForGoogleAuth,
} from '../../lib/acashService';
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
  const [identifier, setIdentifier] = useState('U-100001');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gender, setGender] = useState<UserGender | ''>('');
  const [tcaAccepted, setTcaAccepted] = useState(false);
  const [tcaModalOpen, setTcaModalOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('1234');
  const [requireLoginOtp, setRequireLoginOtp] = useState(false);
  const [referredByType, setReferredByType] = useState<ReferralSource>('own_app');
  const [referredByAgentIdentifier, setReferredByAgentIdentifier] = useState('');

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpStatusMsg, setOtpStatusMsg] = useState('');
  const [pendingLoginUser, setPendingLoginUser] = useState<AcashUser | null>(null);
  const [newlyCreatedUser, setNewlyCreatedUser] = useState<AcashUser | null>(null);

  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleIdentity, setGoogleIdentity] = useState<{
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
  } | null>(null);
  const [error, setError] = useState('');

  const roleOptions: Array<{
    id: UserRole;
    label: string;
    prefix: string;
    sandboxId: string;
    icon: React.ElementType;
  }> = [
    {
      id: 'U',
      label: t('roleCustomer', lang),
      prefix: 'U-',
      sandboxId: 'U-100001',
      icon: User,
    },
    {
      id: 'A',
      label: t('roleAgent', lang),
      prefix: 'A-',
      sandboxId: 'A-200001',
      icon: Briefcase,
    },
    {
      id: 'M',
      label: t('roleMerchant', lang),
      prefix: 'M-',
      sandboxId: 'M-300001',
      icon: Store,
    },
  ];

  const handleRoleSwitch = (nextRole: UserRole) => {
    setRole(nextRole);
    setError('');
    if (mode === 'login') {
      const currentIsDefault =
        identifier === '' ||
        identifier === 'U-100001' ||
        identifier === 'A-200001' ||
        identifier === 'M-300001';
      if (currentIsDefault) {
        const match = roleOptions.find((r) => r.id === nextRole);
        if (match) setIdentifier(match.sandboxId);
      }
    }
  };

  const triggerOtpSend = async (targetEmail: string, targetName: string, targetRole: UserRole) => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(code);
    setOtpInput('');
    setOtpStatusMsg('');

    const roleLabel =
      targetRole === 'U' ? 'Customer (U)' : targetRole === 'A' ? 'Agent (A)' : 'Merchant (M)';
    const res = await sendOtpEmail({
      toEmail: targetEmail,
      toName: targetName,
      otp: code,
      roleLabel,
    });

    if (res.sent) {
      setOtpStatusMsg(`${t('otpSentTo', lang)} ${targetEmail}`);
    } else {
      setOtpStatusMsg(
        lang === 'bn'
          ? `ইমেইল ডেলিভারি সীমাবদ্ধ (${res.error})। স্যান্ডবক্স কোড: ${code}`
          : `EmailJS notice (${res.error}). Fallback verification code: ${code}`
      );
    }
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

    if (!name.trim()) {
      setError(lang === 'bn' ? 'পূর্ণ নাম আবশ্যক।' : 'Full name is required.');
      return;
    }
    if ((role === 'A' || role === 'M') && !businessName.trim()) {
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
    if (!email.includes('@')) {
      setError(
        lang === 'bn'
          ? 'ওটিপি ভেরিফিকেশনের জন্য একটি সঠিক জিমেইল ঠিকানা দিন।'
          : 'Enter a valid Gmail address for OTP verification.'
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

    setLoading(true);
    try {
      // Always require Email verification code (even when signing up after Google Sign-In)
      await triggerOtpSend(email.trim().toLowerCase(), name.trim(), role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      const fbUser = await signInWithGooglePopup();
      const fbEmail = (fbUser.email || '').trim().toLowerCase();
      if (!fbEmail) {
        throw new Error('Google account did not provide a verified email address.');
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

      // First-time Google user: MUST complete full info + Gender + TCA + 6-digit verification code
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleVerifyOtpAndFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (otpInput.trim() !== generatedOtp) {
      setError(lang === 'bn' ? 'ভুল ওটিপি কোড। আবার চেষ্টা করুন।' : 'Invalid 6-digit OTP code.');
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
          email,
          pin,
          referredByType,
          referredByAgentIdentifier:
            referredByType === 'agent' ? referredByAgentIdentifier : undefined,
          ...(googleIdentity && googleIdentity.email.toLowerCase() === email.trim().toLowerCase()
            ? { firebaseUid: googleIdentity.uid, profilePhotoUrl: googleIdentity.photoURL }
            : {}),
        });
        setNewlyCreatedUser(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSandboxLogin = async (accountId: string) => {
    setError('');
    setLoading(true);
    try {
      const user = await findUserByIdentifier(accountId);
      if (!user) throw new Error('Account could not be loaded.');
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick login failed.');
    } finally {
      setLoading(false);
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
        {/* Left Editorial / Product Architecture Panel */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 sm:p-9 shadow-sm dark:shadow-none">
          <div className="space-y-6">
            <BrandLogo size="lg" subtitle={t('tagline', lang)} />

            <div className="space-y-3 pt-1">
              <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
                {lang === 'bn'
                  ? 'একটি ইউনিফাইড প্ল্যাটফর্মে গ্রাহক, এজেন্ট ও মার্চেন্ট সেবা'
                  : 'Unified Mobile Finance for Customers, Agents & Merchants'}
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                {lang === 'bn'
                  ? 'রিয়েল-টাইম ফায়ারবেস সেটেলমেন্ট, জিমেইল ওটিপি নিরাপত্তা এবং ট্যাপ-অ্যান্ড-হোল্ড অথরাইজেশন সহ আধুনিক ফাইন্যান্সিয়াল প্ল্যাটফর্ম।'
                  : 'Real-time Firebase ledger settlements, Gmail OTP verification via EmailJS, interactive Tap & Hold authorization, and bilingual EN/বাংলা controls.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Role Prefixes (U · A · M)
                </div>
                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  {lang === 'bn'
                    ? 'প্রতিটি অ্যাকাউন্টের জন্য স্বয়ংক্রিয় রোল-ভিত্তিক ইউনিক আইডি'
                    : 'Automatic U- Customer, A- Agent & M- Merchant identity prefixes'}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  50,000+ BDT AML Gate
                </div>
                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  {lang === 'bn'
                    ? 'উচ্চ-মূল্যের লেনদেন সরাসরি অ্যাডমিন সিকিউরিটি রিভিউতে যায়'
                    : 'High-value transfers route automatically to Admin Security Review'}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Smart Telecom & QR
                </div>
                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  {lang === 'bn'
                    ? 'জিপি, রবি, বাংলালিংক, এয়ারটেল ও টেলিটক প্রিফিক্স অটো-ডিটেকশন'
                    : 'Auto-prefix detection for GP, Robi, Banglalink, Airtel & Teletalk + Dynamic QR'}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Direct Google & Gmail OTP
                </div>
                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  {lang === 'bn'
                    ? 'ফায়ারবেস গুগল সাইন-ইন এবং ইমেইলজেএস জিমেইল ওটিপি ভেরিফিকেশন'
                    : 'Firebase Google Auth plus EmailJS Gmail OTP verification on sign-up'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Sandbox Demo Access & Booth Map */}
          <div className="mt-7 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
                {t('quickDemoAccess', lang)} (1-Click Sign In · PIN: 1234)
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {roleOptions.map((item) => (
                  <button
                    key={item.sandboxId}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickSandboxLogin(item.sandboxId)}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-left transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{item.label}</div>
                    <div className="font-mono-tabular text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {item.sandboxId}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {onOpenBoothMap && (
              <button
                type="button"
                onClick={onOpenBoothMap}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {lang === 'bn'
                    ? 'নিকটস্থ এজেন্ট বুথ ও কাস্টমার সাপোর্ট ম্যাপ দেখুন'
                    : 'Explore Agent Booth & Customer Support Map'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Right Interactive Auth Card */}
        <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col justify-center shadow-sm dark:shadow-none">
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
                  onClick={() => setGoogleIdentity(null)}
                  className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
                >
                  Switch
                </button>
              </div>
            ) : (
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
                if (!identifier) setIdentifier('U-100001');
                if (!pin) setPin('1234');
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
                        placeholder="U-100001, A-200001, M-300001, or 017..."
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
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('gmail', lang)}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@gmail.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
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
                      {googleIdentity && googleIdentity.email.toLowerCase() === email.trim().toLowerCase()
                        ? lang === 'bn'
                          ? 'ভেরিফিকেশন কোড পাঠান ও গুগল সাইন-আপ সম্পন্ন করুন'
                          : 'Send Verification Code & Complete Google Sign-Up'
                        : t('sendOtp', lang)}
                    </span>
                  </button>
                </form>
              )}
            </>
          ) : (
            <form onSubmit={handleVerifyOtpAndFinalize} className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>EmailJS Gmail Verification</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{otpStatusMsg}</p>
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
                  onClick={() => {
                    const targetEmail = pendingLoginUser ? pendingLoginUser.email : email;
                    const targetName = pendingLoginUser ? pendingLoginUser.name : name;
                    triggerOtpSend(targetEmail, targetName, role);
                  }}
                  className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('resendOtp', lang)}</span>
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
