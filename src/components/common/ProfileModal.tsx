import React, { useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileBadge2,
  KeyRound,
  ShieldCheck,
  Upload,
  User as UserIcon,
  X,
  FileText,
  MapPin,
} from 'lucide-react';
import { AcashTransaction, AcashUser, FeeConfig, Language, UserGender } from '../../types/acash';
import {
  changeUserSecurityPin,
  formatUserReferralSource,
  saveUserMapLocation,
  updateUserGender,
  updateUserKyc,
  updateUserProfilePhoto,
} from '../../lib/acashService';
import {
  downloadAccountStatementPdf,
  downloadCreatorKycProfilePdf,
} from '../../lib/pdfGenerator';
import { RealLocationPickerMap, RealLocationValue } from './RealLocationPickerMap';

export type ProfileTab = 'photo' | 'kyc' | 'pin' | 'location';

interface ProfileModalProps {
  user: AcashUser;
  transactions: AcashTransaction[];
  feeConfig?: FeeConfig;
  lang: Language;
  initialTab?: ProfileTab;
  onClose: () => void;
}

async function compressImageToDataUrl(file: File, maxDim = 320, quality = 0.82): Promise<string> {
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
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  transactions,
  feeConfig,
  lang,
  initialTab = 'photo',
  onClose,
}) => {
  const canSetMapLocation = user.role === 'A' || user.role === 'M';
  const [tab, setTab] = useState<ProfileTab>(
    initialTab === 'location' && !canSetMapLocation ? 'photo' : initialTab
  );
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // KYC form state
  const [name, setName] = useState(user.name);
  const [businessName, setBusinessName] = useState(user.businessName || '');
  const [nidNumber, setNidNumber] = useState(user.kyc?.nidNumber || '');
  const [dateOfBirth, setDateOfBirth] = useState(user.kyc?.dateOfBirth || '');
  const [address, setAddress] = useState(user.kyc?.address || '');
  const [occupation, setOccupation] = useState(user.kyc?.occupation || '');
  const [nomineeName, setNomineeName] = useState(user.kyc?.nomineeName || '');
  const [nomineePhone, setNomineePhone] = useState(user.kyc?.nomineePhone || '');
  const [nidPhotoUrl, setNidPhotoUrl] = useState(user.kyc?.nidPhotoUrl || '');
  const [taxCertificateNumber, setTaxCertificateNumber] = useState(
    user.kyc?.taxCertificateNumber || ''
  );
  const [taxCertificatePhotoUrl, setTaxCertificatePhotoUrl] = useState(
    user.kyc?.taxCertificatePhotoUrl || ''
  );

  // PIN form state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 320, 0.84);
      await updateUserProfilePhoto(user.accountId, dataUrl);
      setStatusMsg(
        lang === 'bn'
          ? 'প্রোফাইল ছবি সফলভাবে আপলোড হয়েছে।'
          : 'Profile photo uploaded and saved.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleNidPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 480, 0.8);
      setNidPhotoUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'NID image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleTaxCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 480, 0.8);
      setTaxCertificatePhotoUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tax Certificate image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      await updateUserKyc({
        accountId: user.accountId,
        name,
        businessName: user.role !== 'U' ? businessName : undefined,
        kyc: {
          nidNumber,
          dateOfBirth,
          address,
          occupation,
          nomineeName,
          nomineePhone,
          nidPhotoUrl: nidPhotoUrl || undefined,
          ...(user.role === 'M'
            ? {
                taxCertificateNumber: taxCertificateNumber.trim(),
                taxCertificatePhotoUrl: taxCertificatePhotoUrl || undefined,
              }
            : {}),
        },
      });
      setStatusMsg(
        lang === 'bn'
          ? 'কেওয়াইসি তথ্য সফলভাবে আপডেট করা হয়েছে!'
          : 'KYC profile updated and verified successfully!'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'KYC update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (newPin !== confirmPin) {
      setErrorMsg(lang === 'bn' ? 'নতুন পিন দুটি মিলছে না।' : 'New PIN and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      await changeUserSecurityPin(user.accountId, currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setStatusMsg(
        lang === 'bn'
          ? 'সিকিউরিটি পিন সফলভাবে পরিবর্তন হয়েছে।'
          : 'Security PIN changed successfully.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PIN change failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMapLocation = async (loc: RealLocationValue) => {
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      await saveUserMapLocation({
        accountId: user.accountId,
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address,
        area: loc.area,
        city: loc.city,
        isVisible: loc.isVisible,
      });
      setStatusMsg(
        lang === 'bn'
          ? 'আপনার রিয়েল লোকেশন লাইভ ম্যাপে সেভ হয়েছে — এখন সব ইউজার দেখতে পাবেন!'
          : 'Your real location is live on the Acash Map with your Name, Photo & Creator Number!'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save map location.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenderChange = async (nextGender: UserGender) => {
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      await updateUserGender(user.accountId, nextGender);
      setStatusMsg(
        lang === 'bn'
          ? `লিঙ্গ (${nextGender === 'female' ? 'মহিলা' : 'পুরুষ'}) আপডেট হয়েছে — এখন ${nextGender === 'female' ? 'পুরুষ কণ্ঠে' : 'নারী কণ্ঠে'} ভয়েস নোটিফিকেশন পাবেন।`
          : `Gender set to ${nextGender}. Transaction voice alerts will now play in a ${nextGender === 'female' ? 'Male' : 'Female'} voice.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update gender.');
    } finally {
      setBusy(false);
    }
  };

  const roleLabel =
    user.role === 'U'
      ? lang === 'bn'
        ? 'গ্রাহক (U)'
        : 'Customer (U)'
      : user.role === 'A'
        ? lang === 'bn'
          ? 'এজেন্ট (A)'
          : 'Agent (A)'
        : lang === 'bn'
          ? 'মার্চেন্ট (M)'
          : 'Merchant (M)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#0E121D]">
          <div className="flex items-center gap-3">
            {user.profilePhotoUrl ? (
              <img
                src={user.profilePhotoUrl}
                alt={user.name}
                className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'প্রোফাইল, পিন ও কেওয়াইসি' : 'Creator Profile, PIN & KYC'}
              </h3>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-mono-tabular">
                {user.accountId} · {roleLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="px-6 pt-4">
          <div
            className={`grid gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 ${
              canSetMapLocation ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setTab('photo');
                setErrorMsg('');
                setStatusMsg('');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'photo'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'ছবি ও তথ্য' : 'Photo & Info'}</span>
            </button>
            {canSetMapLocation && (
              <button
                type="button"
                onClick={() => {
                  setTab('location');
                  setErrorMsg('');
                  setStatusMsg('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  tab === 'location'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'ম্যাপ লোকেশন' : 'Map Location'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTab('kyc');
                setErrorMsg('');
                setStatusMsg('');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'kyc'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileBadge2 className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'কেওয়াইসি আপডেট' : 'Update KYC'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('pin');
                setErrorMsg('');
                setStatusMsg('');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'pin'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'পিন পরিবর্তন' : 'Change PIN'}</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35 text-xs text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/35 text-xs text-rose-700 dark:text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: Profile Photo & Overview */}
          {tab === 'photo' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                {user.profilePhotoUrl ? (
                  <img
                    src={user.profilePhotoUrl}
                    alt={user.name}
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-indigo-500/50 shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border-2 border-dashed border-indigo-300 dark:border-indigo-500/40 flex flex-col items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
                    <UserIcon className="w-8 h-8" />
                    <span className="text-[10px] mt-1">No Photo</span>
                  </div>
                )}

                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {user.businessName || user.name}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {user.email} · <span className="font-mono-tabular">{user.phone}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <label className="cursor-pointer px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {busy
                          ? 'Uploading...'
                          : lang === 'bn'
                            ? 'প্রোফাইল ছবি আপলোড করুন'
                            : 'Upload Profile Picture'}
                      </span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {lang === 'bn' ? 'সেক্স / লিঙ্গ (ভয়েস নোটিফিকেশন প্রোফাইল)' : 'Sex / Gender (Transaction Voice Alert Profile)'}
                  </div>
                  <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                    {user.gender === 'female'
                      ? lang === 'bn'
                        ? 'ভয়েস: পুরুষ কণ্ঠ'
                        : 'Plays Male Voice'
                      : lang === 'bn'
                        ? 'ভয়েস: নারী কণ্ঠ'
                        : 'Plays Female Voice'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleGenderChange('male')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                      (user.gender || 'male') === 'male'
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lang === 'bn' ? 'পুরুষ (Male)' : 'Male'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleGenderChange('female')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                      user.gender === 'female'
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lang === 'bn' ? 'মহিলা (Female)' : 'Female'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400">Account Opening Date</div>
                  <div className="mt-1 font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {new Date(user.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400">Referred By (Security)</div>
                  <div className="mt-1 font-semibold text-indigo-700 dark:text-indigo-300">
                    {formatUserReferralSource(user)}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400">KYC Status</div>
                  <div className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{(user.kyc?.status || 'unverified').toUpperCase()}</span>
                  </div>
                  {user.kyc?.updatedAt && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Updated: {new Date(user.kyc.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400">NID / Passport</div>
                  <div className="mt-1 font-mono-tabular font-semibold text-slate-900 dark:text-white">
                    {user.kyc?.nidNumber || 'Not submitted yet'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {user.kyc?.address || 'Update KYC tab to add address'}
                  </div>
                </div>
                {user.role === 'M' && (
                  <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Merchant Tax Certificate (TIN / BIN)</div>
                      <div className="mt-0.5 font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {user.kyc?.taxCertificateNumber || 'Not submitted yet'}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                        user.kyc?.taxCertificatePhotoUrl
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                      }`}
                    >
                      {user.kyc?.taxCertificatePhotoUrl
                        ? 'Tax Certificate Image Attached'
                        : 'Upload in Update KYC'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => downloadAccountStatementPdf(user, transactions, feeConfig)}
                  className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{lang === 'bn' ? 'স্টেটমেন্ট পিডিএফ' : 'Download Statement PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadCreatorKycProfilePdf(user)}
                  className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <FileBadge2 className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'কেওয়াইসি ও ছবি পিডিএফ' : 'Download KYC & Pic PDF'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Update KYC */}
          {tab === 'kyc' && (
            <form onSubmit={handleSaveKyc} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'পূর্ণ নাম' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {user.role !== 'U' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {lang === 'bn' ? 'ব্যবসা / প্রতিষ্ঠানের নাম' : 'Business / Store Name'}
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'এনআইডি / পাসপোর্ট নম্বর *' : 'NID / Passport Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={nidNumber}
                    onChange={(e) => setNidNumber(e.target.value)}
                    placeholder="e.g. 1998261900123"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'জন্ম তারিখ' : 'Date of Birth'}
                  </label>
                  <input
                    type="date"
                    required
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'বর্তমান ঠিকানা' : 'Present Address'}
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House, Road, Thana, District"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'পেশা / ব্যবসার ধরন' : 'Occupation / Category'}
                  </label>
                  <input
                    type="text"
                    required
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="e.g. Software / Retail"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'নমিনির নাম' : 'Nominee Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={nomineeName}
                    onChange={(e) => setNomineeName(e.target.value)}
                    placeholder="Nominee full name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'নমিনির মোবাইল' : 'Nominee Mobile'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={nomineePhone}
                    onChange={(e) => setNomineePhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'এনআইডি / ডকুমেন্ট ছবি (ঐচ্ছিক)' : 'NID / Document Image (Optional)'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {nidPhotoUrl ? 'Document image attached for Admin KYC PDF.' : 'Attach front photo of NID or Trade License.'}
                  </div>
                </div>
                <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{nidPhotoUrl ? 'Replace Image' : 'Upload NID Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleNidPhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Merchant-Specific Tax Certificate Section alongside normal KYC */}
              {user.role === 'M' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-indigo-200 dark:border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        {lang === 'bn'
                          ? 'মার্চেন্ট ট্যাক্স সার্টিফিকেট (TIN / BIN) *'
                          : 'Merchant Tax Certificate Section (TIN / BIN) *'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Required for Merchant business tax compliance verification.
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {lang === 'bn'
                        ? 'টিন / ট্যাক্স সার্টিফিকেট নম্বর *'
                        : 'TIN / Tax Certificate Number *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={taxCertificateNumber}
                      onChange={(e) => setTaxCertificateNumber(e.target.value)}
                      placeholder="e.g. TIN-592018471203"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {lang === 'bn' ? 'ট্যাক্স সার্টিফিকেট কপি আপলোড' : 'Tax Certificate Copy (Image)'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {taxCertificatePhotoUrl
                          ? 'Tax Certificate image attached for Admin KYC PDF.'
                          : 'Upload clear photo/scan of your Tax Certificate.'}
                      </div>
                    </div>
                    <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {taxCertificatePhotoUrl ? 'Replace Tax Cert' : 'Upload Tax Certificate'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleTaxCertUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {busy
                  ? 'Saving KYC...'
                  : lang === 'bn'
                    ? 'কেওয়াইসি তথ্য সংরক্ষণ করুন'
                    : 'Save & Update KYC'}
              </button>
            </form>
          )}

          {/* TAB 3: Change Security PIN */}
          {tab === 'pin' && (
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {lang === 'bn' ? 'বর্তমান পিন' : 'Current Security PIN'}
                </label>
                <input
                  type="password"
                  required
                  maxLength={5}
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white tracking-widest focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {lang === 'bn' ? 'নতুন পিন (৪-৫ সংখ্যা)' : 'New PIN (4-5 Digits)'}
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={5}
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white tracking-widest focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {lang === 'bn' ? 'নতুন পিন নিশ্চিত করুন' : 'Confirm New PIN'}
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={5}
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white tracking-widest focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || currentPin.length < 4 || newPin.length < 4}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {busy
                  ? 'Updating PIN...'
                  : lang === 'bn'
                    ? 'নিরাপত্তা পিন পরিবর্তন করুন'
                    : 'Update Security PIN'}
              </button>
            </form>
          )}

          {/* TAB 4: Direct-on-Map Location Picker (Agents & Merchants Only) */}
          {tab === 'location' && canSetMapLocation && (
            <RealLocationPickerMap
              creatorId={user.accountId}
              creatorRole={user.role === 'A' ? 'agent' : 'merchant'}
              creatorName={user.businessName || user.name}
              creatorPhone={user.phone}
              profilePhotoUrl={user.profilePhotoUrl}
              initialValue={
                user.mapLocation
                  ? {
                      lat: user.mapLocation.lat,
                      lng: user.mapLocation.lng,
                      address: user.mapLocation.address,
                      area: user.mapLocation.area,
                      city: user.mapLocation.city,
                      isVisible: user.mapLocation.isVisible,
                    }
                  : {
                      address: user.kyc?.address || '',
                      area: 'Dhaka',
                      city: 'Dhaka',
                      lat: 23.7561,
                      lng: 90.3755,
                      isVisible: true,
                    }
              }
              lang={lang}
              saving={busy}
              onSave={handleSaveMapLocation}
            />
          )}
        </div>
      </div>
    </div>
  );
};
