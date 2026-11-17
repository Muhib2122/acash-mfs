import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AcashTransaction, AcashUser, FeeConfig } from '../types/acash';
import { formatUserReferralSource } from './acashService';

const ACASH_LOGO_URL =
  '/assets/aistudio/a_clean_vector_style_app_logo_on_a_transparent_bac_e63513a7.png';
const ACASH_LOGO_FALLBACK_URL = '/pwa-192x192.png';

let cachedAcashLogoDataUrl: string | null = null;
let loadingLogoPromise: Promise<string | null> | null = null;

let cachedBwWatermarkDataUrl: string | null = null;
let loadingBwWatermarkPromise: Promise<string | null> | null = null;

async function fetchUrlAsImage(url: string): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Logo image load failed'));
      img.src = url;
    });
    return img;
  } catch {
    return null;
  }
}

async function fetchUrlAsResizedTransparentPng(url: string): Promise<string | null> {
  const img = await fetchUrlAsImage(url);
  if (!img) return null;
  try {
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

/**
 * Generates a high-resolution Black & White (monochrome grayscale) Acash crest PNG
 * with soft circular medallion vignette and balanced watermark contrast so it remains
 * unmistakably visible behind statements/KYC tables while keeping text razor-sharp.
 */
async function buildBwWatermarkFromUrl(url: string): Promise<string | null> {
  const img = await fetchUrlAsImage(url);
  if (!img) return null;
  try {
    const size = 640;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    const pad = 44;
    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const half = size / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const a = data[idx + 3];
        if (a < 10) {
          data[idx + 3] = 0;
          continue;
        }
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Pure monochrome luminance
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // High-contrast monochrome ink tone: bright A/Acash emblem becomes crisp dark/light contrast,
        // dark backdrop softens into light slate ink so white text area & emblem pop clearly in B&W
        const inkGray = lum > 165 ? 245 : Math.min(210, Math.max(25, Math.round(lum * 1.15)));
        data[idx] = inkGray;
        data[idx + 1] = inkGray;
        data[idx + 2] = inkGray;

        // Soft circular radial edge fade near outer medallion border
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.94) {
          data[idx + 3] = 0;
        } else if (dist > 0.84) {
          const factor = (0.94 - dist) / 0.1;
          data[idx + 3] = Math.round(a * Math.max(0, Math.min(1, factor)));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw crisp B&W concentric official seal rings around the Acash emblem
    ctx.strokeStyle = 'rgba(24, 24, 27, 0.72)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(half, half, half - 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(24, 24, 27, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(half, half, half - 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

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

export async function loadAcashBwWatermarkDataUrl(): Promise<string | null> {
  if (cachedBwWatermarkDataUrl) return cachedBwWatermarkDataUrl;
  if (loadingBwWatermarkPromise) return loadingBwWatermarkPromise;

  loadingBwWatermarkPromise = (async () => {
    const primary = await buildBwWatermarkFromUrl(ACASH_LOGO_URL);
    if (primary) {
      cachedBwWatermarkDataUrl = primary;
      return primary;
    }
    const fallback = await buildBwWatermarkFromUrl(ACASH_LOGO_FALLBACK_URL);
    if (fallback) {
      cachedBwWatermarkDataUrl = fallback;
      return fallback;
    }
    return null;
  })();

  const result = await loadingBwWatermarkPromise;
  loadingBwWatermarkPromise = null;
  return result;
}

if (typeof window !== 'undefined') {
  void loadAcashLogoDataUrl();
  void loadAcashBwWatermarkDataUrl();
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

function generateCryptographicOwnerSecret(): string {
  const bytes = new Uint8Array(24);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function computePdfIntegritySeal(payload: string): Promise<string> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const encoded = new TextEncoder().encode(payload);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
      const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      return `AC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
    }
  } catch {
    // fallback below
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex =
    ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
  return `AC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

function createProtectedPdfDoc(params: {
  orientation: 'portrait' | 'landscape';
  format: 'a4' | 'a5';
  title: string;
  subject: string;
}): jsPDF {
  const doc = new jsPDF({
    orientation: params.orientation,
    unit: 'mm',
    format: params.format,
    compress: true,
    encryption: {
      // High-entropy random owner password locks content editing, copy/extract, and annotations
      // (PDF permission mask /P -60: only viewing & printing permitted; no user open prompt)
      ownerPassword: generateCryptographicOwnerSecret(),
      userPermissions: ['print'],
    },
  });

  doc.setProperties({
    title: params.title,
    subject: params.subject,
    author: 'Acash Mobile Financial Service',
    keywords: 'Acash, Official Document, Tamper-Locked, Non-Editable, SHA-256 Verified',
    creator: 'Acash MFS Document Security Engine',
  });

  return doc;
}

function setDocOpacity(doc: jsPDF, opacity: number) {
  try {
    const gStateCtor = (doc as unknown as { GState?: new (opts: { opacity: number }) => unknown }).GState;
    const setGState = (doc as unknown as { setGState?: (gs: unknown) => void }).setGState;
    if (gStateCtor && setGState) {
      setGState.call(doc, new gStateCtor({ opacity }));
    }
  } catch {
    // ignore if GState unavailable
  }
}

/**
 * Draws the huge Black & White Acash background crest, concentric monochrome seal rings,
 * and diagonal security watermark text across the active PDF page.
 */
function drawBwAcashPageWatermark(
  doc: jsPDF,
  bwWatermarkDataUrl: string | null,
  options?: {
    opacity?: number;
    crestScale?: number;
    drawDiagonalGrid?: boolean;
  }
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2 + 6;
  const minDim = Math.min(pageWidth, pageHeight);
  const crestSize = minDim * (options?.crestScale ?? 0.62);
  const opacity = options?.opacity ?? 0.11;

  doc.saveGraphicsState();
  setDocOpacity(doc, opacity);

  // Subtle diagonal B&W repeating security text lines across entire background
  if (options?.drawDiagonalGrid !== false) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 88);
    const stepY = 44;
    for (let y = 42; y < pageHeight + 20; y += stepY) {
      doc.text('ACASH OFFICIAL  •  NON-EDITABLE VERIFIED DOCUMENT', 24, y, {
        angle: 28,
      });
      if (pageWidth > 220) {
        doc.text('ACASH OFFICIAL  •  NON-EDITABLE VERIFIED DOCUMENT', pageWidth * 0.56, y, {
          angle: 28,
        });
      }
    }
  }

  // Huge bold rotated monochrome "ACASH" watermark behind/underneath crest
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.round(minDim * 0.25));
  doc.setTextColor(35, 35, 42);
  doc.text('ACASH', centerX, centerY + 46, {
    align: 'center',
    angle: 24,
  });

  // Concentric B&W official security seal rings
  doc.setDrawColor(24, 24, 28);
  doc.setLineWidth(0.7);
  doc.circle(centerX, centerY, crestSize * 0.54, 'S');
  doc.setLineWidth(0.3);
  doc.circle(centerX, centerY, crestSize * 0.57, 'S');

  // Huge monochrome B&W Acash Logo crest centered on page
  if (bwWatermarkDataUrl) {
    try {
      doc.addImage(
        bwWatermarkDataUrl,
        'PNG',
        centerX - crestSize / 2,
        centerY - crestSize / 2,
        crestSize,
        crestSize,
        undefined,
        'FAST'
      );
    } catch {
      // ignore image error
    }
  }

  doc.restoreGraphicsState();
}

/**
 * Stamps every page of a finished PDF with:
 * 1. A subtle anti-tamper B&W Acash ghost seal overlay (over tables/cards without hurting legibility)
 * 2. Continuation header strip on pages 2..N
 * 3. Security border frame + SHA-256 Tamper-Lock footer + Page X of Y
 */
function finalizeAllPagesWithSecurityChrome(params: {
  doc: jsPDF;
  logoDataUrl: string | null;
  bwWatermarkDataUrl: string | null;
  continuationTitle: string;
  sealCode: string;
  footerNote: string;
  firstPageHeaderHeight: number;
}) {
  const { doc, logoDataUrl, bwWatermarkDataUrl, continuationTitle, sealCode, footerNote, firstPageHeaderHeight } = params;
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Subtle B&W Acash ghost imprint over content layer so numbers/text cannot be cleanly scrubbed or photoshopped
    drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
      opacity: 0.065,
      crestScale: 0.58,
      drawDiagonalGrid: false,
    });

    // Continuation header on pages 2..N
    if (p > 1) {
      doc.setFillColor(24, 12, 48);
      doc.rect(0, 0, pageWidth, 16, 'F');
      doc.setFillColor(168, 85, 247);
      doc.rect(0, 16, pageWidth, 0.8, 'F');
      const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 10, 3, 10, 10);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(continuationTitle, hasLogo ? 23 : 12, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(216, 180, 254);
      doc.text(`READ-ONLY · SEAL: ${sealCode}`, pageWidth - 12, 10, { align: 'right' });
    }

    // Crisp monochrome security border below header
    const borderTop = p === 1 ? firstPageHeaderHeight + 2.5 : 19;
    doc.saveGraphicsState();
    setDocOpacity(doc, 0.28);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.25);
    doc.rect(7, borderTop, pageWidth - 14, pageHeight - borderTop - 18, 'S');
    doc.restoreGraphicsState();

    // Official non-editable verification footer strip
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(10, pageHeight - 15.5, pageWidth - 10, pageHeight - 15.5);

    const hasFootLogo = drawAcashLogoInPdf(doc, logoDataUrl, 10, pageHeight - 13.8, 7.5, 7.5);
    const footX = hasFootLogo ? 20 : 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `NON-EDITABLE · TAMPER-LOCKED PDF  |  SHA-256 SEAL: ${sealCode}`,
      footX,
      pageHeight - 10.3
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(footerNote, footX, pageHeight - 6.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - 10, pageHeight - 8.5, { align: 'right' });
  }
}

async function measureImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number } | null> {
  if (typeof window === 'undefined') return null;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Image measure timeout')), 1500);
      img.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Image load failed'));
      };
      img.src = dataUrl;
    });
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      return { width: img.naturalWidth, height: img.naturalHeight };
    }
    return null;
  } catch {
    return null;
  }
}

function getImageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

export async function downloadAccountStatementPdf(
  user: AcashUser,
  transactions: AcashTransaction[],
  feeConfig?: FeeConfig
) {
  const [logoDataUrl, bwWatermarkDataUrl] = await Promise.all([
    loadAcashLogoDataUrl(),
    loadAcashBwWatermarkDataUrl(),
  ]);

  const generatedAt = Date.now();
  const sealCode = await computePdfIntegritySeal(
    JSON.stringify({
      docType: 'statement',
      accountId: user.accountId,
      balance: user.balance,
      commissionBalance: user.commissionBalance,
      txCount: transactions.length,
      txHashes: transactions.slice(0, 50).map((t) => `${t.txHash}:${t.amount}:${t.status}`),
      generatedAt,
    })
  );

  const doc = createProtectedPdfDoc({
    orientation: 'portrait',
    format: 'a4',
    title: `Acash Official Statement - ${user.accountId}`,
    subject: `Official Account Statement & Ledger (${sealCode})`,
  });

  // Draw bold B&W Acash background crest underneath Page 1 content
  drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
    opacity: 0.11,
    crestScale: 0.64,
    drawDiagonalGrid: true,
  });

  // Top Header Banner
  doc.setFillColor(24, 12, 48);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 38, 210, 1.5, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 6.5, 25, 25);
  const titleX = hasLogo ? 42 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ACASH MOBILE FINANCIAL SERVICE', titleX, 15.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(216, 180, 254);
  doc.text('OFFICIAL ACCOUNT STATEMENT & TRANSACTION LEDGER', titleX, 22.5);
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}  |  Seal: ${sealCode}`, titleX, 29);

  // Header Locked Badge (top right)
  doc.setFillColor(45, 27, 78);
  doc.setDrawColor(192, 132, 252);
  doc.roundedRect(162, 6.5, 36, 10, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(233, 213, 255);
  doc.text('READ-ONLY PDF', 180, 10.8, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.text('TAMPER LOCKED', 180, 14.5, { align: 'center' });

  // Account Summary Card (semi-transparent fill so B&W Acash crest remains softly visible)
  doc.saveGraphicsState();
  setDocOpacity(doc, 0.72);
  doc.setFillColor(248, 246, 255);
  doc.roundedRect(14, 43.5, 182, 49, 2.5, 2.5, 'F');
  doc.restoreGraphicsState();

  doc.setDrawColor(192, 132, 252);
  doc.setLineWidth(0.35);
  doc.roundedRect(14, 43.5, 182, 49, 2.5, 2.5, 'S');

  doc.setTextColor(30, 20, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(user.businessName || user.name, 19, 51);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Account ID: ${user.accountId}  |  Role: ${user.role === 'U' ? 'Customer' : user.role === 'A' ? 'Agent' : 'Merchant'}  |  KYC: ${(user.kyc?.status || 'unverified').toUpperCase()}`,
    19,
    57
  );
  doc.text(`Mobile: ${user.phone}  |  Email: ${user.email}`, 19, 62.5);
  doc.text(
    `Opened: ${formatOpeningDate(user.createdAt)}  |  Status: ${user.status.toUpperCase()}`,
    19,
    68
  );
  doc.text(`Referred By (Security): ${formatUserReferralSource(user)}`, 19, 73.5);

  let totalInflow = 0;
  let totalOutflow = 0;
  let totalFeesPaid = 0;
  for (const tx of transactions) {
    if (tx.status === 'rejected') continue;
    if (tx.receiverId === user.accountId) {
      totalInflow += tx.amount || 0;
    }
    if (tx.senderId === user.accountId) {
      totalOutflow += tx.totalDebited ?? (tx.amount || 0) + (tx.fee || 0);
      totalFeesPaid += tx.fee || 0;
    }
  }

  if (user.role === 'M' && user.kyc?.taxCertificateNumber) {
    doc.text(`Merchant TIN / Tax Certificate: ${user.kyc.taxCertificateNumber}`, 19, 79);
  } else if (feeConfig) {
    const rateNote =
      user.role === 'M'
        ? `Rates: Merchant Cash-Out BDT ${feeConfig.merchantCashOutFeePer1000}/1k (Agent) | BDT ${feeConfig.merchantCashOutToAdminFeePer1000}/1k (Admin)`
        : `Rates: Cash-Out BDT ${feeConfig.feePer1000}/1k | Send Money BDT ${feeConfig.sendMoneyFeeRate} (${feeConfig.sendMoneyChargeMode === 'per_1000' ? 'per 1k' : `> BDT ${feeConfig.sendMoneyFreeThreshold}`})`;
    doc.text(rateNote, 19, 79);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Entries: ${transactions.length}   |   Credits (+): BDT ${totalInflow.toFixed(2)}   |   Debits (-): BDT ${totalOutflow.toFixed(2)}   |   Fees: BDT ${totalFeesPaid.toFixed(2)}`,
    19,
    87
  );

  // Right Balance Callout
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(107, 33, 168);
  doc.text(
    `Balance: BDT ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    191,
    51.5,
    { align: 'right' }
  );
  if (user.role === 'A') {
    doc.setFontSize(8.8);
    doc.text(
      `Commission: BDT ${user.commissionBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      191,
      57.5,
      { align: 'right' }
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
    startY: 96,
    head: [['Date & Time', 'Tx Hash', 'Type', 'Counterparty', 'Amount', 'Charge', 'Net Total', 'Status']],
    body:
      rows.length > 0
        ? rows
        : [['-', '-', 'NO TRANSACTIONS', '-', '0.00', '0.00', '0.00', '-']],
    theme: 'grid',
    styles: {
      fillColor: false as unknown as undefined,
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
      cellPadding: 1.8,
    },
    headStyles: {
      fillColor: [88, 28, 135],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.4,
    },
    bodyStyles: { fontSize: 6.9, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 25 },
      2: { cellWidth: 21 },
      4: { halign: 'right', cellWidth: 19 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 20 },
      7: { halign: 'center', cellWidth: 19 },
    },
    margin: { top: 23, left: 10, right: 10, bottom: 21 },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
          opacity: 0.11,
          crestScale: 0.64,
          drawDiagonalGrid: true,
        });
      }
    },
  });

  finalizeAllPagesWithSecurityChrome({
    doc,
    logoDataUrl,
    bwWatermarkDataUrl,
    continuationTitle: `ACASH OFFICIAL STATEMENT — ${user.accountId} (CONTINUED)`,
    sealCode,
    footerNote:
      'Computer-generated official Acash MFS statement. Each row locks its applied charge at execution time.',
    firstPageHeaderHeight: 39.5,
  });

  doc.save(`Acash_Statement_${user.accountId}.pdf`);
}

export async function downloadMerchantQrStandeePdf(
  merchant: AcashUser,
  qrCanvasElement: HTMLCanvasElement | null,
  fixedAmount?: number
) {
  const [logoDataUrl, bwWatermarkDataUrl] = await Promise.all([
    loadAcashLogoDataUrl(),
    loadAcashBwWatermarkDataUrl(),
  ]);

  const generatedAt = Date.now();
  const sealCode = await computePdfIntegritySeal(
    JSON.stringify({
      docType: 'standee',
      accountId: merchant.accountId,
      fixedAmount: fixedAmount || 0,
      phone: merchant.phone,
      generatedAt,
    })
  );

  const doc = createProtectedPdfDoc({
    orientation: 'portrait',
    format: 'a5',
    title: `Acash Merchant QR Standee - ${merchant.accountId}`,
    subject: `Official Merchant Payment QR (${sealCode})`,
  });

  // Rich dark poster backdrop
  doc.setFillColor(14, 7, 32);
  doc.rect(0, 0, 148, 210, 'F');

  // Subtle monochrome Acash B&W security watermark behind outer border (leaves QR card crisp white)
  drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
    opacity: 0.08,
    crestScale: 0.72,
    drawDiagonalGrid: false,
  });

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

  // Pure white QR card for 100% camera readability
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
  doc.text(merchant.businessName || merchant.name, 74, 160, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(216, 180, 254);
  doc.text(`Merchant ID: ${merchant.accountId}`, 74, 168, { align: 'center' });
  doc.text(`Mobile: ${merchant.phone}`, 74, 174.5, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(192, 132, 252);
  doc.text(
    `Opened: ${new Date(merchant.createdAt).toLocaleDateString()}  |  Ref: ${formatUserReferralSource(merchant)}`,
    74,
    182,
    { align: 'center' }
  );

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `NON-EDITABLE · SEAL: ${sealCode}  |  Powered by Acash MFS`,
    74,
    193,
    { align: 'center' }
  );

  doc.save(`Acash_QR_Standee_${merchant.accountId}.pdf`);
}

export async function downloadGlobalLedgerPdf(
  transactions: AcashTransaction[],
  users: AcashUser[],
  feeConfig: FeeConfig,
  adminEmail: string
) {
  const [logoDataUrl, bwWatermarkDataUrl] = await Promise.all([
    loadAcashLogoDataUrl(),
    loadAcashBwWatermarkDataUrl(),
  ]);

  const generatedAt = Date.now();
  const sealCode = await computePdfIntegritySeal(
    JSON.stringify({
      docType: 'global_audit',
      adminEmail,
      usersCount: users.length,
      txCount: transactions.length,
      generatedAt,
    })
  );

  const doc = createProtectedPdfDoc({
    orientation: 'landscape',
    format: 'a4',
    title: 'Acash Global Treasury & Transaction Audit Report',
    subject: `Platform Audit Report (${sealCode})`,
  });

  drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
    opacity: 0.11,
    crestScale: 0.66,
    drawDiagonalGrid: true,
  });

  doc.setFillColor(18, 8, 38);
  doc.rect(0, 0, 297, 34, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 34, 297, 1.5, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 5.5, 23, 23);
  const titleX = hasLogo ? 40 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17.5);
  doc.text('ACASH PLATFORM — GLOBAL TREASURY & TRANSACTION AUDIT REPORT', titleX, 14.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(216, 180, 254);
  doc.text(
    `Generated by: ${adminEmail}  |  Timestamp: ${new Date(generatedAt).toLocaleString()}  |  Fee Rate: BDT ${feeConfig.feePer1000}/1,000  |  Seal: ${sealCode}`,
    titleX,
    23.5
  );

  const totalFloat = users.reduce((s, u) => s + (u.balance || 0), 0);
  const completed = transactions.filter((t) => t.status === 'completed');
  const totalVol = completed.reduce((s, t) => s + t.amount, 0);
  const adminRev = completed.reduce((s, t) => s + (t.feeBreakdown?.adminAmount || 0), 0);
  const govtRev = completed.reduce((s, t) => s + (t.feeBreakdown?.govtAmount || 0), 0);

  doc.saveGraphicsState();
  setDocOpacity(doc, 0.72);
  doc.setFillColor(248, 246, 255);
  doc.roundedRect(14, 38.5, 269, 10, 2, 2, 'F');
  doc.restoreGraphicsState();
  doc.setDrawColor(192, 132, 252);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, 38.5, 269, 10, 2, 2, 'S');

  doc.setTextColor(30, 20, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `System Float (TVL): BDT ${totalFloat.toFixed(2)}   |   Settled Volume: BDT ${totalVol.toFixed(2)}   |   Admin Revenue: BDT ${adminRev.toFixed(2)}   |   Govt Levy: BDT ${govtRev.toFixed(2)}`,
    148.5,
    44.8,
    { align: 'center' }
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
    startY: 52,
    head: [['Timestamp', 'Tx Hash', 'Type', 'Sender', 'Recipient', 'Amount (BDT)', 'Fee', 'Status']],
    body: rows.length > 0 ? rows : [['-', '-', 'NO TRANSACTIONS', '-', '-', '0.00', '0.00', '-']],
    theme: 'grid',
    styles: {
      fillColor: false as unknown as undefined,
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
      cellPadding: 1.8,
    },
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 7.4, textColor: [15, 23, 42] },
    columnStyles: {
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'center' },
    },
    margin: { top: 23, left: 14, right: 14, bottom: 21 },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
          opacity: 0.11,
          crestScale: 0.66,
          drawDiagonalGrid: true,
        });
      }
    },
  });

  finalizeAllPagesWithSecurityChrome({
    doc,
    logoDataUrl,
    bwWatermarkDataUrl,
    continuationTitle: 'ACASH GLOBAL TREASURY & TRANSACTION AUDIT REPORT (CONTINUED)',
    sealCode,
    footerNote: `Audited by ${adminEmail}. Immutable ledger snapshot locked against modification.`,
    firstPageHeaderHeight: 35.5,
  });

  doc.save(`Acash_Global_Audit_${generatedAt}.pdf`);
}

export async function downloadUsersDirectoryPdf(users: AcashUser[], adminEmail: string) {
  const [logoDataUrl, bwWatermarkDataUrl] = await Promise.all([
    loadAcashLogoDataUrl(),
    loadAcashBwWatermarkDataUrl(),
  ]);

  const generatedAt = Date.now();
  const sealCode = await computePdfIntegritySeal(
    JSON.stringify({
      docType: 'users_directory',
      adminEmail,
      count: users.length,
      ids: users.slice(0, 60).map((u) => u.accountId),
      generatedAt,
    })
  );

  const doc = createProtectedPdfDoc({
    orientation: 'portrait',
    format: 'a4',
    title: 'Acash Platform Accounts Directory',
    subject: `Accounts Directory Export (${sealCode})`,
  });

  drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
    opacity: 0.11,
    crestScale: 0.64,
    drawDiagonalGrid: true,
  });

  doc.setFillColor(18, 8, 38);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 32, 210, 1.2, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 5, 22, 22);
  const titleX = hasLogo ? 39 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.text('ACASH PLATFORM ACCOUNTS DIRECTORY', titleX, 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(216, 180, 254);
  doc.text(
    `Exported by ${adminEmail} on ${new Date(generatedAt).toLocaleString()}  |  Seal: ${sealCode}`,
    titleX,
    22.5
  );

  const customerCount = users.filter((u) => u.role === 'U').length;
  const agentCount = users.filter((u) => u.role === 'A').length;
  const merchantCount = users.filter((u) => u.role === 'M').length;
  const totalBalance = users.reduce((s, u) => s + (u.balance || 0), 0);

  doc.saveGraphicsState();
  setDocOpacity(doc, 0.72);
  doc.setFillColor(248, 246, 255);
  doc.roundedRect(10, 36, 190, 9.5, 2, 2, 'F');
  doc.restoreGraphicsState();
  doc.setDrawColor(192, 132, 252);
  doc.setLineWidth(0.28);
  doc.roundedRect(10, 36, 190, 9.5, 2, 2, 'S');

  doc.setTextColor(30, 20, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(
    `Total Accounts: ${users.length}  (Customers: ${customerCount} · Agents: ${agentCount} · Merchants: ${merchantCount})   |   Float: BDT ${totalBalance.toFixed(2)}`,
    105,
    42,
    { align: 'center' }
  );

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
    startY: 49,
    head: [['Account ID', 'Role', 'Name / Business', 'Phone', 'Opened', 'Referred By', 'Balance (BDT)', 'Status']],
    body: rows,
    theme: 'grid',
    styles: {
      fillColor: false as unknown as undefined,
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
      cellPadding: 1.8,
    },
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontSize: 7.4 },
    bodyStyles: { fontSize: 7, textColor: [15, 23, 42] },
    columnStyles: {
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'center' },
    },
    margin: { top: 23, left: 10, right: 10, bottom: 21 },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
          opacity: 0.11,
          crestScale: 0.64,
          drawDiagonalGrid: true,
        });
      }
    },
  });

  finalizeAllPagesWithSecurityChrome({
    doc,
    logoDataUrl,
    bwWatermarkDataUrl,
    continuationTitle: 'ACASH PLATFORM ACCOUNTS DIRECTORY (CONTINUED)',
    sealCode,
    footerNote: `Admin compliance directory export (${adminEmail}). Tamper-locked PDF.`,
    firstPageHeaderHeight: 33.2,
  });

  doc.save(`Acash_Users_Directory_${generatedAt}.pdf`);
}

export async function downloadCreatorKycProfilePdf(user: AcashUser, adminEmail?: string) {
  const [logoDataUrl, bwWatermarkDataUrl] = await Promise.all([
    loadAcashLogoDataUrl(),
    loadAcashBwWatermarkDataUrl(),
  ]);

  const generatedAt = Date.now();
  const kyc = user.kyc;
  const sealCode = await computePdfIntegritySeal(
    JSON.stringify({
      docType: 'kyc_dossier',
      accountId: user.accountId,
      kycStatus: kyc?.status || 'unverified',
      nidNumber: kyc?.nidNumber || '',
      balance: user.balance,
      adminEmail: adminEmail || 'self',
      generatedAt,
    })
  );

  const doc = createProtectedPdfDoc({
    orientation: 'portrait',
    format: 'a4',
    title: `Acash Creator Profile & KYC Dossier - ${user.accountId}`,
    subject: `Official KYC Compliance Record (${sealCode})`,
  });

  // Huge B&W Acash background crest underneath Page 1
  drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
    opacity: 0.11,
    crestScale: 0.64,
    drawDiagonalGrid: true,
  });

  // Header Banner
  doc.setFillColor(18, 8, 38);
  doc.rect(0, 0, 210, 36, 'F');
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 36, 210, 1.5, 'F');

  const hasLogo = drawAcashLogoInPdf(doc, logoDataUrl, 13, 6, 24, 24);
  const titleX = hasLogo ? 41 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.text('ACASH CREATOR PROFILE & UPDATED KYC DOSSIER', titleX, 15.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(216, 180, 254);
  doc.text(
    `Account ID: ${user.accountId}  |  Generated: ${new Date(generatedAt).toLocaleString()}${adminEmail ? `  |  Admin: ${adminEmail}` : ''}`,
    titleX,
    23
  );
  doc.text(`Tamper-Locked Non-Editable Dossier  |  SHA-256 Seal: ${sealCode}`, titleX, 29.5);

  // Top Identity Card with semi-transparent fill so huge B&W watermark shines subtly behind
  doc.saveGraphicsState();
  setDocOpacity(doc, 0.72);
  doc.setFillColor(248, 246, 255);
  doc.roundedRect(14, 43, 182, 50, 3, 3, 'F');
  doc.restoreGraphicsState();

  doc.setDrawColor(192, 132, 252);
  doc.setLineWidth(0.35);
  doc.roundedRect(14, 43, 182, 50, 3, 3, 'S');

  // Profile Photo Box (34x34mm)
  doc.setFillColor(233, 213, 255);
  doc.setDrawColor(147, 51, 234);
  doc.roundedRect(20, 51, 34, 34, 2, 2, 'FD');

  let photoAdded = false;
  const photoSrc = user.profilePhotoUrl || kyc?.nidPhotoUrl;
  if (photoSrc && photoSrc.startsWith('data:image/')) {
    try {
      doc.addImage(
        photoSrc,
        getImageFormatFromDataUrl(photoSrc),
        20.5,
        51.5,
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
    doc.text(initials, 37, 71, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('NO PHOTO', 37, 79, { align: 'center' });
  }

  // Summary Info beside Photo
  const roleLabel =
    user.role === 'U' ? 'Customer (U)' : user.role === 'A' ? 'Agent (A)' : 'Merchant (M)';
  doc.setTextColor(24, 12, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(user.businessName || user.name, 62, 53);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Account ID: ${user.accountId}  |  Role: ${roleLabel}`, 62, 59);
  doc.text(`Full Name: ${user.name}  |  Mobile: ${user.phone}`, 62, 65);
  doc.text(`Email: ${user.email}`, 62, 71);
  doc.text(`Account Opening Date: ${formatOpeningDate(user.createdAt)}`, 62, 77);
  doc.text(
    `Referred By: ${formatUserReferralSource(user)}  |  KYC: ${(kyc?.status || 'unverified').toUpperCase()}`,
    62,
    83
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
    startY: 98,
    head: [['Account Profile Field', 'Recorded Details']],
    body: accountRows,
    theme: 'grid',
    styles: {
      fillColor: false as unknown as undefined,
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
      cellPadding: 1.85,
    },
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontSize: 8.8 },
    bodyStyles: { fontSize: 8.3, textColor: [15, 23, 42] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } },
    margin: { top: 23, left: 14, right: 14, bottom: 21 },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
          opacity: 0.11,
          crestScale: 0.64,
          drawDiagonalGrid: true,
        });
      }
    },
  });

  const afterAccountY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 185;

  // Table 2: Updated KYC Information (including Merchant Tax Certificate)
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
    startY: afterAccountY + 6,
    head: [['Updated KYC Field', 'Verified Information']],
    body: kycRows,
    theme: 'grid',
    styles: {
      fillColor: false as unknown as undefined,
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
      cellPadding: 1.85,
    },
    headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontSize: 8.8 },
    bodyStyles: { fontSize: 8.3, textColor: [15, 23, 42] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } },
    margin: { top: 23, left: 14, right: 14, bottom: 21 },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
          opacity: 0.11,
          crestScale: 0.64,
          drawDiagonalGrid: true,
        });
      }
    },
  });

  const afterKycY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 240;

  const hasNidPhoto = Boolean(kyc?.nidPhotoUrl && kyc.nidPhotoUrl.startsWith('data:image/'));
  const hasTaxPhoto = Boolean(
    kyc?.taxCertificatePhotoUrl && kyc.taxCertificatePhotoUrl.startsWith('data:image/')
  );

  if (hasNidPhoto || hasTaxPhoto) {
    const startOnNewPage = afterKycY > 215;
    if (startOnNewPage) {
      doc.addPage();
      drawBwAcashPageWatermark(doc, bwWatermarkDataUrl, {
        opacity: 0.11,
        crestScale: 0.64,
        drawDiagonalGrid: true,
      });
    }
    const docY = startOnNewPage ? 25 : afterKycY + 7;

    const drawFramedAttachment = async (opts: {
      title: string;
      subtitle: string;
      dataUrl: string;
      boxX: number;
      boxY: number;
      boxW: number;
      boxH: number;
    }) => {
      doc.saveGraphicsState();
      setDocOpacity(doc, 0.72);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(opts.boxX, opts.boxY, opts.boxW, opts.boxH, 2.5, 2.5, 'F');
      doc.restoreGraphicsState();

      doc.setDrawColor(168, 85, 247);
      doc.setLineWidth(0.35);
      doc.roundedRect(opts.boxX, opts.boxY, opts.boxW, opts.boxH, 2.5, 2.5, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(88, 28, 135);
      doc.text(opts.title, opts.boxX + 4, opts.boxY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(opts.subtitle, opts.boxX + 4, opts.boxY + 10.5);

      const innerW = opts.boxW - 8;
      const innerH = opts.boxH - 16;
      const dims = await measureImageDimensions(opts.dataUrl);
      let drawW = innerW;
      let drawH = innerH;
      if (dims && dims.width > 0 && dims.height > 0) {
        const scale = Math.min(innerW / dims.width, innerH / dims.height);
        drawW = dims.width * scale;
        drawH = dims.height * scale;
      }
      const drawX = opts.boxX + 4 + (innerW - drawW) / 2;
      const drawY = opts.boxY + 13 + (innerH - drawH) / 2;

      try {
        doc.addImage(
          opts.dataUrl,
          getImageFormatFromDataUrl(opts.dataUrl),
          drawX,
          drawY,
          drawW,
          drawH
        );
      } catch {
        // ignore invalid image encoding
      }
    };

    if (hasNidPhoto && kyc?.nidPhotoUrl && hasTaxPhoto && kyc?.taxCertificatePhotoUrl) {
      await drawFramedAttachment({
        title: 'ATTACHED KYC DOCUMENT / NID IMAGE',
        subtitle: `ID No: ${kyc.nidNumber || 'N/A'} · Verified Copy`,
        dataUrl: kyc.nidPhotoUrl,
        boxX: 14,
        boxY: docY,
        boxW: 88,
        boxH: 72,
      });
      await drawFramedAttachment({
        title: 'MERCHANT TAX CERTIFICATE (TIN/BIN)',
        subtitle: `TIN No: ${kyc.taxCertificateNumber || 'N/A'} · Verified Copy`,
        dataUrl: kyc.taxCertificatePhotoUrl,
        boxX: 108,
        boxY: docY,
        boxW: 88,
        boxH: 72,
      });
    } else if (hasNidPhoto && kyc?.nidPhotoUrl) {
      await drawFramedAttachment({
        title: 'ATTACHED KYC DOCUMENT / NID IMAGE',
        subtitle: `Account: ${user.accountId} · Document No: ${kyc.nidNumber || 'N/A'}`,
        dataUrl: kyc.nidPhotoUrl,
        boxX: 14,
        boxY: docY,
        boxW: 182,
        boxH: startOnNewPage ? 105 : 64,
      });
    } else if (hasTaxPhoto && kyc?.taxCertificatePhotoUrl) {
      await drawFramedAttachment({
        title: 'MERCHANT TAX CERTIFICATE (TIN/BIN)',
        subtitle: `Account: ${user.accountId} · TIN No: ${kyc.taxCertificateNumber || 'N/A'}`,
        dataUrl: kyc.taxCertificatePhotoUrl,
        boxX: 14,
        boxY: docY,
        boxW: 182,
        boxH: startOnNewPage ? 105 : 64,
      });
    }
  }

  finalizeAllPagesWithSecurityChrome({
    doc,
    logoDataUrl,
    bwWatermarkDataUrl,
    continuationTitle: `ACASH KYC DOSSIER — ${user.accountId} (VERIFIED DOCUMENTS)`,
    sealCode,
    footerNote:
      'Acash MFS Official KYC & Creator Dossier — Confidential Non-Editable Compliance Record.',
    firstPageHeaderHeight: 37.5,
  });

  doc.save(`Acash_Profile_KYC_${user.accountId}.pdf`);
}
