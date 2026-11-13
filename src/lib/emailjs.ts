import emailjs from '@emailjs/browser';

export const EMAILJS_CONFIG = {
  serviceId: 'service_2zwawxd',
  templateId: 'template_8qgrwb9',
  publicKey: 'Q-1BGbDCPvnx_pHQo',
};

let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    initialized = true;
  }
}

export interface SendEmailResult {
  sent: boolean;
  error?: string;
}

export async function sendOtpEmail(params: {
  toEmail: string;
  toName: string;
  otp: string;
  roleLabel: string;
}): Promise<SendEmailResult> {
  ensureInitialized();

  const templateParams = {
    to_email: params.toEmail,
    email: params.toEmail,
    user_email: params.toEmail,
    to_name: params.toName || 'Acash User',
    name: params.toName || 'Acash User',
    otp: params.otp,
    passcode: params.otp,
    code: params.otp,
    role: params.roleLabel,
    app_name: 'Acash MFS',
    message: `Your Acash ${params.roleLabel} verification OTP is ${params.otp}. It expires in 10 minutes. Never share this code with anyone.`,
  };

  try {
    await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'EmailJS delivery failed';
    console.warn('EmailJS OTP error:', message);
    return { sent: false, error: message };
  }
}

export async function sendAccountStatusEmail(params: {
  toEmail: string;
  toName: string;
  accountId: string;
  status: 'disabled' | 'active';
  reason: string;
}): Promise<SendEmailResult> {
  ensureInitialized();

  const subjectLine =
    params.status === 'disabled'
      ? `Acash Security Alert: Account ${params.accountId} Disabled`
      : `Acash Notice: Account ${params.accountId} Re-Enabled`;

  const bodyMessage =
    params.status === 'disabled'
      ? `Dear ${params.toName}, your Acash account (${params.accountId}) has been disabled by Platform Administration. Reason: ${params.reason}. Contact Acash Compliance if you believe this is an error.`
      : `Dear ${params.toName}, your Acash account (${params.accountId}) has been re-enabled by Platform Administration. Note: ${params.reason}.`;

  const templateParams = {
    to_email: params.toEmail,
    email: params.toEmail,
    user_email: params.toEmail,
    to_name: params.toName || 'Acash User',
    name: params.toName || 'Acash User',
    subject: subjectLine,
    otp: params.status === 'disabled' ? 'ACCOUNT DISABLED' : 'ACCOUNT ACTIVE',
    passcode: params.accountId,
    code: params.accountId,
    role: params.accountId,
    app_name: 'Acash MFS Security',
    reason: params.reason,
    message: bodyMessage,
  };

  try {
    await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'EmailJS delivery failed';
    console.warn('EmailJS Account Status alert error:', message);
    return { sent: false, error: message };
  }
}

async function sendGenericNotificationEmail(params: {
  toEmail: string;
  toName: string;
  subject: string;
  badgeCode: string;
  roleLabel: string;
  message: string;
}): Promise<SendEmailResult> {
  if (!params.toEmail || !params.toEmail.includes('@')) {
    return { sent: false, error: 'Invalid recipient email' };
  }
  ensureInitialized();

  const templateParams = {
    to_email: params.toEmail,
    email: params.toEmail,
    user_email: params.toEmail,
    to_name: params.toName || 'Acash User',
    name: params.toName || 'Acash User',
    subject: params.subject,
    otp: params.badgeCode,
    passcode: params.badgeCode,
    code: params.badgeCode,
    role: params.roleLabel,
    app_name: 'Acash MFS',
    message: params.message,
  };

  try {
    await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'EmailJS delivery failed';
    console.warn(`EmailJS error (${params.toEmail}):`, message);
    return { sent: false, error: message };
  }
}

export async function sendAccountCreatedEmails(params: {
  userEmail: string;
  adminEmail: string;
  accountId: string;
  userName: string;
  roleLabel: string;
  phone: string;
  referredByLabel?: string;
  openedAt?: string;
}): Promise<{ userResult: SendEmailResult; adminResult: SendEmailResult }> {
  const refNote = params.referredByLabel ? ` Referred By: ${params.referredByLabel}.` : '';
  const openedNote = params.openedAt ? ` Opened: ${params.openedAt}.` : '';
  const [userResult, adminResult] = await Promise.all([
    sendGenericNotificationEmail({
      toEmail: params.userEmail,
      toName: params.userName,
      subject: `Welcome to Acash! Account ${params.accountId} Created`,
      badgeCode: params.accountId,
      roleLabel: params.roleLabel,
      message: `Congratulations ${params.userName}! Your Acash ${params.roleLabel} account (${params.accountId}) linked to mobile ${params.phone} is now active.${openedNote}${refNote}`,
    }),
    sendGenericNotificationEmail({
      toEmail: params.adminEmail,
      toName: 'Acash Admin',
      subject: `Acash Admin Alert: New Account Opened (${params.accountId})`,
      badgeCode: params.accountId,
      roleLabel: params.roleLabel,
      message: `New Acash ${params.roleLabel} account opened. ID: ${params.accountId}, Name: ${params.userName}, Mobile: ${params.phone}, Creator Email: ${params.userEmail}.${openedNote}${refNote}`,
    }),
  ]);
  return { userResult, adminResult };
}

export async function sendHighValuePendingEmails(params: {
  senderEmail: string;
  senderName: string;
  senderId: string;
  adminEmail: string;
  receiverName: string;
  receiverId: string;
  amount: number;
  txType: string;
  txHash: string;
}): Promise<{ userResult: SendEmailResult; adminResult: SendEmailResult }> {
  const formattedAmt = `BDT ${params.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const cleanType = params.txType.replace(/_/g, ' ').toUpperCase();

  const [userResult, adminResult] = await Promise.all([
    sendGenericNotificationEmail({
      toEmail: params.senderEmail,
      toName: params.senderName,
      subject: `Acash Security Review: High-Value Transaction Pending (${params.txHash})`,
      badgeCode: params.txHash,
      roleLabel: cleanType,
      message: `Dear ${params.senderName}, your high-value ${cleanType} of ${formattedAmt} to ${params.receiverName} (${params.receiverId}) has been placed under mandatory 50,000+ BDT Admin AML review. Tx Hash: ${params.txHash}.`,
    }),
    sendGenericNotificationEmail({
      toEmail: params.adminEmail,
      toName: 'Acash Compliance Admin',
      subject: `URGENT AML Approval Required: ${formattedAmt} (${params.txHash})`,
      badgeCode: params.txHash,
      roleLabel: cleanType,
      message: `High-value transaction (>= 50,000 BDT) awaiting Admin approval. Type: ${cleanType}, Amount: ${formattedAmt}, Sender: ${params.senderName} (${params.senderId}, ${params.senderEmail}), Recipient: ${params.receiverName} (${params.receiverId}), Tx Hash: ${params.txHash}.`,
    }),
  ]);
  return { userResult, adminResult };
}

export async function sendHighValueDecisionEmails(params: {
  decision: 'approved' | 'rejected';
  senderEmail: string;
  senderName: string;
  senderId: string;
  receiverName: string;
  receiverId: string;
  adminEmail: string;
  approvedBy: string;
  amount: number;
  txType: string;
  txHash: string;
  reason?: string;
}): Promise<{ userResult: SendEmailResult; adminResult: SendEmailResult }> {
  const formattedAmt = `BDT ${params.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const cleanType = params.txType.replace(/_/g, ' ').toUpperCase();
  const isApproved = params.decision === 'approved';

  const userSubject = isApproved
    ? `Acash Approved: Transaction ${params.txHash} Settled`
    : `Acash Rejected & Refunded: Transaction ${params.txHash}`;

  const userMsg = isApproved
    ? `Good news ${params.senderName}! Your high-value ${cleanType} of ${formattedAmt} to ${params.receiverName} (${params.receiverId}) has been APPROVED and settled by Admin (${params.approvedBy}). Tx Hash: ${params.txHash}.`
    : `Notice ${params.senderName}: Your high-value ${cleanType} of ${formattedAmt} to ${params.receiverName} (${params.receiverId}) was REJECTED by Admin (${params.approvedBy}). Reason: ${params.reason || 'AML Security Review'}. Your debited funds have been refunded to your wallet. Tx Hash: ${params.txHash}.`;

  const adminSubject = isApproved
    ? `Admin Audit: Approved ${formattedAmt} (${params.txHash})`
    : `Admin Audit: Rejected ${formattedAmt} (${params.txHash})`;

  const adminMsg = isApproved
    ? `Confirmation: Transaction ${params.txHash} (${cleanType}, ${formattedAmt}) from ${params.senderName} (${params.senderId}) to ${params.receiverName} (${params.receiverId}) was APPROVED by ${params.approvedBy}.`
    : `Confirmation: Transaction ${params.txHash} (${cleanType}, ${formattedAmt}) from ${params.senderName} (${params.senderId}) was REJECTED and refunded by ${params.approvedBy}. Reason: ${params.reason || 'AML Security Review'}.`;

  const [userResult, adminResult] = await Promise.all([
    sendGenericNotificationEmail({
      toEmail: params.senderEmail,
      toName: params.senderName,
      subject: userSubject,
      badgeCode: isApproved ? 'APPROVED' : 'REJECTED',
      roleLabel: cleanType,
      message: userMsg,
    }),
    sendGenericNotificationEmail({
      toEmail: params.adminEmail,
      toName: 'Acash Admin',
      subject: adminSubject,
      badgeCode: isApproved ? 'APPROVED' : 'REJECTED',
      roleLabel: cleanType,
      message: adminMsg,
    }),
  ]);
  return { userResult, adminResult };
}

