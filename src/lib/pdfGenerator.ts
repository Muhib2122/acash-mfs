import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AcashTransaction, AcashUser, FeeConfig } from '../types/acash';
import { formatUserReferralSource } from './acashService';

const ACASH_LOGO_URL =
  '/assets/aistudio/a_clean_vector_style_app_logo_on_a_transparent_bac_e63513a7.png';
const ACASH_LOGO_FALLBACK_URL = '/pwa-192x192.png';

let cachedAcashLogoDataUrl: string | null = null;
let loadingLogoPromise: Promise<string | null> | null = null;

async function fetchUrlAsResizedTransparentPng(url: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Logo image load failed'));
      img.src = url;
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function loadAcashLogoDataUrl(): Promise<string | null> {
  if (cachedAcashLogoDataUrl) return cachedAcashLogoDataUrl;
  if (loadingLogoPromise) return loadingLogoPromise;

  loadingLogoPromise = (async () => {
    const primary = await fetchUrlAsResizedTransparentPng(ACASH_LOGO_URL);
    if (primary) {
      cachedAcashLogoDataUrl = primary;
      return primary;
    }
    const fallback = await fetchUrlAsResizedTransparentPng(ACASH_LOGO_FALLBACK_URL);
    if (fallback) {
      cachedAcashLogoDataUrl = fallback;
      return fallback;
    }
    return null;
  })();

  const result = await loadingLogoPromise;
  loadingLogoPromise = null;
  return result;
}

if (typeof window !== 'undefined') {
  void loadAcashLogoDataUrl();
}

function drawAcashLogoInPdf(
  doc: jsPDF,
  logoDataUrl: string | null,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  if (!logoDataUrl) return false;
  try {
    doc.addImage(logoDataUrl, 'PNG', x, y, w, h, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
}

function formatOpeningDate(ts: number): string {
  return ts ? new Date(ts).toLocaleString() : 'N/A';
}

export async function downloadAccountStatementPdf(
  user: AcashUser,
  transactions: AcashTransaction[],
  feeConfig?: FeeConfig
) {
  const logoDataUrl = await loadAcashLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(24, 12, 48);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 38, 210, 1.5, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 6.5, 25, 25);
  const titleX = hasLogo ? 42 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('ACASH MOBILE FINANCIAL SERVICE', titleX, 16.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(216, 180, 254);
  doc.text('OFFICIAL ACCOUNT STATEMENT & TRANSACTION LEDGER', titleX, 23.5);
  doc.text(`Generated: ${new Date().toLocaleString()}`, titleX, 29.5);

  doc.setFillColor(248, 246, 255);
  doc.setDrawColor(216, 180, 254);
  doc.roundedRect(14, 44, 182, 46, 2, 2, 'FD');

  doc.setTextColor(30, 20, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(user.businessName || user.name, 20, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Account ID: ${user.accountId}  |  Role: ${user.role === 'U' ? 'Customer' : user.role === 'A' ? 'Agent' : 'Merchant'}`,
    20,
    58
  );
  doc.text(`Mobile: ${user.phone}  |  Email: ${user.email}`, 20, 63.5);
  doc.text(
    `Account Opening Date: ${formatOpeningDate(user.createdAt)}  |  Status: ${user.status.toUpperCase()}`,
    20,
    69
  );
  doc.text(`Referred By (Security): ${formatUserReferralSource(user)}`, 20, 74.5);

  const totalFeesPaid = transactions
    .filter((tx) => tx.senderId === user.accountId && tx.status !== 'rejected')
    .reduce((sum, tx) => sum + (tx.fee || 0), 0);

  if (user.role === 'M' && user.kyc?.taxCertificateNumber) {
    doc.text(`Merchant TIN / Tax Certificate: ${user.kyc.taxCertificateNumber}`, 20, 80);
  } else if (feeConfig) {
    const rateNote =
      user.role === 'M'
        ? `Current Merchant Cash-Out: BDT ${feeConfig.merchantCashOutFeePer1000}/1k (Agent) | BDT ${feeConfig.merchantCashOutToAdminFeePer1000}/1k (Admin)`
        : `Current Rates: Cash-Out BDT ${feeConfig.feePer1000}/1k | Send Money BDT ${feeConfig.sendMoneyFeeRate} (${feeConfig.sendMoneyChargeMode === 'per_1000' ? 'per 1k' : `> BDT ${feeConfig.sendMoneyFreeThreshold}`})`;
    doc.text(rateNote, 20, 80);
  }
  doc.text(
    `Statement Entries: ${transactions.length}  |  Total Charges Paid: BDT ${totalFeesPaid.toFixed(2)}`,
    20,
    85.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(107, 33, 168);
  doc.text(
    `Balance: BDT ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    132,
    53
  );
  if (user.role === 'A') {
    doc.setFontSize(9);
    doc.text(
      `Commission: BDT ${user.commissionBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      132,
      59
    );
  }

  const rows = transactions.map((tx) => {
    const isIncoming = tx.receiverId === user.accountId;
    const sign = isIncoming ? '+' : '-';
    const counterparty = isIncoming
      ? `${tx.senderName} (${tx.senderId})`
      : tx.type === 'mobile_recharge' && tx.operator
        ? `${tx.receiverName} [${tx.operator.toUpperCase()}]`
        : `${tx.receiverName} (${tx.receiverId})`;
    const agentEarned =
      user.role === 'A' &&
      tx.status === 'completed' &&
      (tx.type === 'cash_in' || tx.type === 'cash_out' || tx.type === 'merchant_cash_out')
        ? tx.feeBreakdown?.agentAmount || 0
        : 0;
    const netAmount = isIncoming
      ? tx.amount + agentEarned
      : tx.totalDebited ?? tx.amount + (tx.fee || 0);
    const rateTag =
      tx.fee > 0 && tx.feeBreakdown?.ratePer1000
        ? tx.feeBreakdown.chargeMode === 'flat'
          ? ' (Flat)'
          : ` (@${tx.feeBreakdown.ratePer1000}/1k)`
        : '';

    return [
      new Date(tx.createdAt).toLocaleString(),
      tx.txHash,
      tx.type.replace(/_/g, ' ').toUpperCase(),
      counterparty,
      `${sign} ${tx.amount.toFixed(2)}`,
      `${tx.fee.toFixed(2)}${rateTag}`,
      `${sign} ${netAmount.toFixed(2)}`,
      tx.status.replace(/_/g, ' ').toUpperCase(),
    ];
  });

  autoTable(doc, {
    startY: 94,
    head: [['Date & Time', 'Tx Hash', 'Type', 'Counterparty', 'Amount', 'Charge', 'Net Total', 'Status']],
    body:
      rows.length > 0
        ? rows
        : [['-', '-', 'NO TRANSACTIONS', '-', '0.00', '0.00', '0.00', '-']],
    theme: 'grid',
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    margin: { left: 10, right: 10 },
  });

  const pageHeight = doc.internal.pageSize.height;
  drawAcashLogoInPdf(doc, logoDataUrl, 14, pageHeight - 16, 8, 8);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'This is a computer-generated official statement from Acash MFS. Each row locks its applied charge at execution time.',
    hasLogo ? 24 : 14,
    pageHeight - 10.5
  );

  doc.save(`Acash_Statement_${user.accountId}.pdf`);
}

export async function downloadMerchantQrStandeePdf(
  merchant: AcashUser,
  qrCanvasElement: HTMLCanvasElement | null,
  fixedAmount?: number
) {
  const logoDataUrl = await loadAcashLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });

  doc.setFillColor(14, 7, 32);
  doc.rect(0, 0, 148, 210, 'F');
  doc.setDrawColor(168, 85, 247);
  doc.setLineWidth(1.2);
  doc.roundedRect(8, 8, 132, 194, 6, 6, 'S');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 40, 13.5, 16, 16);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Acash Pay', hasLogo ? 82 : 74, 24.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(216, 180, 254);
  doc.text('SCAN WITH ACASH APP TO PAY INSTANTLY', 74, 34.5, { align: 'center' });

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(26, 44, 96, 102, 5, 5, 'F');

  if (qrCanvasElement) {
    const imgData = qrCanvasElement.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 34, 52, 80, 80);
  } else {
    doc.setTextColor(88, 28, 135);
    doc.setFontSize(12);
    doc.text(merchant.accountId, 74, 92, { align: 'center' });
  }

  doc.setTextColor(24, 12, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    fixedAmount && fixedAmount > 0 ? `FIXED AMOUNT: BDT ${fixedAmount.toFixed(2)}` : 'MERCHANT QR CODE',
    74,
    140,
    { align: 'center' }
  );

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(merchant.businessName || merchant.name, 74, 162, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(216, 180, 254);
  doc.text(`Merchant ID: ${merchant.accountId}`, 74, 170, { align: 'center' });
  doc.text(`Mobile: ${merchant.phone}`, 74, 177, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(192, 132, 252);
  doc.text(
    `Opened: ${new Date(merchant.createdAt).toLocaleDateString()}  |  Ref: ${formatUserReferralSource(merchant)}`,
    74,
    184,
    { align: 'center' }
  );

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Powered by Acash Mobile Financial Service', 74, 194, { align: 'center' });

  doc.save(`Acash_QR_Standee_${merchant.accountId}.pdf`);
}

export async function downloadGlobalLedgerPdf(
  transactions: AcashTransaction[],
  users: AcashUser[],
  feeConfig: FeeConfig,
  adminEmail: string
) {
  const logoDataUrl = await loadAcashLogoDataUrl();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(18, 8, 38);
  doc.rect(0, 0, 297, 34, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 34, 297, 1.5, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 5.5, 23, 23);
  const titleX = hasLogo ? 40 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ACASH PLATFORM — GLOBAL TREASURY & TRANSACTION AUDIT REPORT', titleX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(216, 180, 254);
  doc.text(
    `Generated by: ${adminEmail}  |  Timestamp: ${new Date().toLocaleString()}  |  Fee Rate: BDT ${feeConfig.feePer1000}/1,000`,
    titleX,
    24
  );

  const totalFloat = users.reduce((s, u) => s + (u.balance || 0), 0);
  const completed = transactions.filter((t) => t.status === 'completed');
  const totalVol = completed.reduce((s, t) => s + t.amount, 0);
  const adminRev = completed.reduce((s, t) => s + (t.feeBreakdown?.adminAmount || 0), 0);
  const govtRev = completed.reduce((s, t) => s + (t.feeBreakdown?.govtAmount || 0), 0);

  doc.setTextColor(30, 20, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `System Float (TVL): BDT ${totalFloat.toFixed(2)}   |   Settled Volume: BDT ${totalVol.toFixed(2)}   |   Admin Revenue: BDT ${adminRev.toFixed(2)}   |   Govt Levy: BDT ${govtRev.toFixed(2)}`,
    14,
    43
  );

  const rows = transactions.map((tx) => [
    new Date(tx.createdAt).toLocaleString(),
    tx.txHash,
    tx.type.replace(/_/g, ' ').toUpperCase(),
    `${tx.senderName} (${tx.senderId})`,
    `${tx.receiverName} (${tx.receiverId})`,
    tx.amount.toFixed(2),
    tx.fee.toFixed(2),
    tx.status.replace(/_/g, ' ').toUpperCase(),
  ]);

  autoTable(doc, {
    startY: 48,
    head: [['Timestamp', 'Tx Hash', 'Type', 'Sender', 'Recipient', 'Amount (BDT)', 'Fee', 'Status']],
    body: rows.length > 0 ? rows : [['-', '-', 'NO TRANSACTIONS', '-', '-', '0.00', '0.00', '-']],
    theme: 'grid',
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`Acash_Global_Audit_${Date.now()}.pdf`);
}

export async function downloadUsersDirectoryPdf(users: AcashUser[], adminEmail: string) {
  const logoDataUrl = await loadAcashLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(18, 8, 38);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 32, 210, 1.2, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 5, 22, 22);
  const titleX = hasLogo ? 39 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ACASH PLATFORM ACCOUNTS DIRECTORY', titleX, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(216, 180, 254);
  doc.text(`Exported by ${adminEmail} on ${new Date().toLocaleString()}`, titleX, 23);

  const rows = users.map((u) => [
    u.accountId,
    u.role === 'U' ? 'Customer' : u.role === 'A' ? 'Agent' : 'Merchant',
    u.businessName || u.name,
    u.phone,
    new Date(u.createdAt).toLocaleDateString(),
    formatUserReferralSource(u),
    u.balance.toFixed(2),
    u.status.toUpperCase(),
  ]);

  autoTable(doc, {
    startY: 38,
    head: [['Account ID', 'Role', 'Name / Business', 'Phone', 'Opened', 'Referred By', 'Balance (BDT)', 'Status']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`Acash_Users_Directory_${Date.now()}.pdf`);
}

function getImageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

export async function downloadCreatorKycProfilePdf(user: AcashUser, adminEmail?: string) {
  const logoDataUrl = await loadAcashLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header Banner
  doc.setFillColor(18, 8, 38);
  doc.rect(0, 0, 210, 36, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 36, 210, 1.5, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 6, 24, 24);
  const titleX = hasLogo ? 41 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16.5);
  doc.text('ACASH CREATOR PROFILE & UPDATED KYC DOSSIER', titleX, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(216, 180, 254);
  doc.text(
    `Account ID: ${user.accountId}  |  Generated: ${new Date().toLocaleString()}${adminEmail ? `  |  Admin: ${adminEmail}` : ''}`,
    titleX,
    24.5
  );

  // Top Identity Card with Profile Picture
  doc.setFillColor(248, 246, 255);
  doc.setDrawColor(216, 180, 254);
  doc.roundedRect(14, 44, 182, 50, 3, 3, 'FD');

  // Profile Photo Box (34x34mm)
  doc.setFillColor(233, 213, 255);
  doc.setDrawColor(147, 51, 234);
  doc.roundedRect(20, 52, 34, 34, 2, 2, 'FD');

  let photoAdded = false;
  if (user.profilePhotoUrl && user.profilePhotoUrl.startsWith('data:image/')) {
    try {
      doc.addImage(
        user.profilePhotoUrl,
        getImageFormatFromDataUrl(user.profilePhotoUrl),
        20.5,
        52.5,
        33,
        33
      );
      photoAdded = true;
    } catch {
      photoAdded = false;
    }
  }
  if (!photoAdded) {
    doc.setTextColor(88, 28, 135);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const initials = (user.name || 'U')
      .split(' ')
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    doc.text(initials, 37, 72, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('NO PHOTO', 37, 80, { align: 'center' });
  }

  // Summary Info beside Photo
  const roleLabel =
    user.role === 'U' ? 'Customer (U)' : user.role === 'A' ? 'Agent (A)' : 'Merchant (M)';
  doc.setTextColor(24, 12, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(user.businessName || user.name, 62, 54);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Account ID: ${user.accountId}  |  Role: ${roleLabel}`, 62, 60);
  doc.text(`Full Name: ${user.name}  |  Mobile: ${user.phone}`, 62, 66);
  doc.text(`Email: ${user.email}`, 62, 72);
  doc.text(`Account Opening Date: ${formatOpeningDate(user.createdAt)}`, 62, 78);
  doc.text(
    `Referred By: ${formatUserReferralSource(user)}  |  KYC: ${(user.kyc?.status || 'unverified').toUpperCase()}`,
    62,
    84
  );

  // Table 1: Full Account & Financial Information
  const accountRows: Array<[string, string]> = [
    ['Account ID', user.accountId],
    ['Role', roleLabel],
    ['Account Opening Date', formatOpeningDate(user.createdAt)],
    ['Referred By (Security)', formatUserReferralSource(user)],
    ['Account Holder Name', user.name],
    ['Business / Store Name', user.businessName || 'N/A'],
    ['Gender / Sex', user.gender ? user.gender.toUpperCase() : 'N/A'],
    ['Mobile Number', user.phone],
    ['Gmail / Email Address', user.email],
    ['Current Wallet Balance', `BDT ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    [
      'Commission Wallet',
      `BDT ${(user.commissionBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    ],
    ['Account Status', user.status.toUpperCase()],
    ['Disable Cause (If Any)', user.disableReason || 'None'],
    ['Last Active', new Date(user.lastActiveAt).toLocaleString()],
  ];

  autoTable(doc, {
    startY: 100,
    head: [['Account Profile Field', 'Recorded Details']],
    body: accountRows,
    theme: 'grid',
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    margin: { left: 14, right: 14 },
  });

  const afterAccountY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 185;

  // Table 2: Updated KYC Information (including Merchant Tax Certificate)
  const kyc = user.kyc;
  const kycRows: Array<[string, string]> = [
    ['KYC Status', (kyc?.status || 'UNVERIFIED').toUpperCase()],
    ['KYC Last Updated', kyc?.updatedAt ? new Date(kyc.updatedAt).toLocaleString() : 'Not updated yet'],
    ['NID / Passport Number', kyc?.nidNumber || 'Not submitted'],
    ['Date of Birth', kyc?.dateOfBirth || 'Not submitted'],
    ['Present Address', kyc?.address || 'Not submitted'],
    ['Occupation / Business Type', kyc?.occupation || 'Not submitted'],
    ['Nominee Name', kyc?.nomineeName || 'Not submitted'],
    ['Nominee Phone', kyc?.nomineePhone || 'Not submitted'],
  ];

  if (user.role === 'M' || kyc?.taxCertificateNumber) {
    kycRows.push([
      'Merchant TIN / Tax Certificate No.',
      kyc?.taxCertificateNumber || 'Not submitted',
    ]);
  }

  autoTable(doc, {
    startY: afterAccountY + 7,
    head: [['Updated KYC Field', 'Verified Information']],
    body: kycRows,
    theme: 'grid',
    headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    margin: { left: 14, right: 14 },
  });

  const afterKycY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 240;

  const hasNidPhoto = Boolean(kyc?.nidPhotoUrl && kyc.nidPhotoUrl.startsWith('data:image/'));
  const hasTaxPhoto = Boolean(
    kyc?.taxCertificatePhotoUrl && kyc.taxCertificatePhotoUrl.startsWith('data:image/')
  );

  if (hasNidPhoto || hasTaxPhoto) {
    const docY = afterKycY > 225 ? 20 : afterKycY + 8;
    if (afterKycY > 225) doc.addPage();

    if (hasNidPhoto && kyc?.nidPhotoUrl) {
      try {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(88, 28, 135);
        doc.text('ATTACHED KYC DOCUMENT / NID IMAGE', 14, docY);
        doc.addImage(
          kyc.nidPhotoUrl,
          getImageFormatFromDataUrl(kyc.nidPhotoUrl),
          14,
          docY + 4,
          78,
          46
        );
      } catch {
        // ignore invalid image encoding
      }
    }

    if (hasTaxPhoto && kyc?.taxCertificatePhotoUrl) {
      try {
        const taxX = hasNidPhoto ? 104 : 14;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(88, 28, 135);
        doc.text('MERCHANT TAX CERTIFICATE (TIN/BIN)', taxX, docY);
        doc.addImage(
          kyc.taxCertificatePhotoUrl,
          getImageFormatFromDataUrl(kyc.taxCertificatePhotoUrl),
          taxX,
          docY + 4,
          78,
          46
        );
      } catch {
        // ignore invalid image encoding
      }
    }
  }

  const pageHeight = doc.internal.pageSize.height;
  drawAcashLogoInPdf(doc, logoDataUrl, 14, pageHeight - 16, 8, 8);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Acash MFS Official KYC & Creator Dossier — Confidential Compliance Record.',
    hasLogo ? 24 : 14,
    pageHeight - 10.5
  );

  doc.save(`Acash_Profile_KYC_${user.accountId}.pdf`);
}
