import {
  AcashUser,
  BiometricActionAuthorizationProof,
  BiometricHighValueMode,
  BiometricPreferences,
  BiometricTxAuthorizationProof,
  TransactionType,
  UserRole,
  WebAuthnCredentialRecord,
} from '../types/acash';

export interface WebAuthnCapability {
  supported: boolean;
  platformAvailable: boolean;
  inEmbeddedFrame: boolean;
  defaultDeviceLabel: string;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

export function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function detectDefaultBiometricDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Device Biometric Passkey';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad Face ID or Touch ID';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac Touch ID Passkey';
  if (/Android/i.test(ua)) return 'Android Fingerprint / Face Unlock';
  if (/Windows/i.test(ua)) return 'Windows Hello Biometrics';
  if (/CrOS/i.test(ua)) return 'Chromebook Screen Lock / Biometrics';
  return 'Device Biometric Passkey';
}

export function sanitizeBiometricDeviceLabelForDisplay(label?: string | null): string {
  const cleaned = (label || '').trim();
  if (!cleaned || /^\d{3,6}$/.test(cleaned)) {
    return 'Device Biometric Passkey';
  }
  return cleaned.slice(0, 64);
}

export async function detectWebAuthnCapability(): Promise<WebAuthnCapability> {
  const defaultDeviceLabel = detectDefaultBiometricDeviceLabel();
  if (typeof window === 'undefined') {
    return {
      supported: false,
      platformAvailable: false,
      inEmbeddedFrame: false,
      defaultDeviceLabel,
    };
  }

  let inEmbeddedFrame = false;
  try {
    inEmbeddedFrame = window.self !== window.top;
  } catch {
    inEmbeddedFrame = true;
  }

  const supported =
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials?.create) &&
    Boolean(navigator.credentials?.get) &&
    Boolean(globalThis.crypto?.subtle);

  if (!supported) {
    return {
      supported: false,
      platformAvailable: false,
      inEmbeddedFrame,
      defaultDeviceLabel,
    };
  }

  let platformAvailable = false;
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      platformAvailable =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    platformAvailable = false;
  }

  return {
    supported,
    platformAvailable,
    inEmbeddedFrame,
    defaultDeviceLabel,
  };
}

function getEffectiveRpId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname;
  if (!host) return undefined;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return undefined;
  return host;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SubtleCrypto is unavailable.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', toExactArrayBuffer(bytes));
  return new Uint8Array(digest);
}

// ============================================================
// MINIMAL CBOR PARSER FOR COSE PUBLIC KEY FALLBACK EXTRACTION
// ============================================================
function decodeCborValue(
  buf: Uint8Array,
  offset: number
): { value: unknown; nextOffset: number } {
  const first = buf[offset++];
  const major = first >> 5;
  const info = first & 0x1f;

  const readUint = (lenInfo: number): number => {
    if (lenInfo < 24) return lenInfo;
    if (lenInfo === 24) return buf[offset++];
    if (lenInfo === 25) {
      const v = (buf[offset] << 8) | buf[offset + 1];
      offset += 2;
      return v;
    }
    if (lenInfo === 26) {
      const v =
        ((buf[offset] << 24) >>> 0) +
        (buf[offset + 1] << 16) +
        (buf[offset + 2] << 8) +
        buf[offset + 3];
      offset += 4;
      return v;
    }
    throw new Error('Unsupported CBOR integer length');
  };

  if (major === 0) return { value: readUint(info), nextOffset: offset };
  if (major === 1) return { value: -1 - readUint(info), nextOffset: offset };
  if (major === 2) {
    const len = readUint(info);
    const slice = buf.slice(offset, offset + len);
    return { value: slice, nextOffset: offset + len };
  }
  if (major === 3) {
    const len = readUint(info);
    const slice = buf.slice(offset, offset + len);
    return { value: new TextDecoder().decode(slice), nextOffset: offset + len };
  }
  if (major === 4) {
    const len = readUint(info);
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const res = decodeCborValue(buf, offset);
      arr.push(res.value);
      offset = res.nextOffset;
    }
    return { value: arr, nextOffset: offset };
  }
  if (major === 5) {
    const len = readUint(info);
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < len; i++) {
      const k = decodeCborValue(buf, offset);
      const v = decodeCborValue(buf, k.nextOffset);
      map.set(k.value, v.value);
      offset = v.nextOffset;
    }
    return { value: map, nextOffset: offset };
  }
  if (major === 7) {
    if (info === 20) return { value: false, nextOffset: offset };
    if (info === 21) return { value: true, nextOffset: offset };
    if (info === 22) return { value: null, nextOffset: offset };
  }
  throw new Error(`Unsupported CBOR major type ${major}`);
}

function encodeDerLength(len: number): number[] {
  if (len < 128) return [len];
  const bytes: number[] = [];
  let tmp = len;
  while (tmp > 0) {
    bytes.unshift(tmp & 0xff);
    tmp >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function encodeDerSequence(content: number[]): Uint8Array {
  return new Uint8Array([0x30, ...encodeDerLength(content.length), ...content]);
}

function encodeDerBitString(bytes: Uint8Array): number[] {
  return [0x03, ...encodeDerLength(bytes.length + 1), 0x00, ...Array.from(bytes)];
}

function encodeDerInteger(unsignedBytes: Uint8Array): number[] {
  let start = 0;
  while (start < unsignedBytes.length - 1 && unsignedBytes[start] === 0) {
    start++;
  }
  const trimmed = Array.from(unsignedBytes.slice(start));
  if (trimmed[0] >= 0x80) {
    trimmed.unshift(0x00);
  }
  return [0x02, ...encodeDerLength(trimmed.length), ...trimmed];
}

function extractSpkiFromAttestationObject(attestationObjectBuf: ArrayBuffer): {
  publicKeySpki: string;
  algorithm: number;
  signCount: number;
} {
  const decoded = decodeCborValue(new Uint8Array(attestationObjectBuf), 0).value as Map<
    unknown,
    unknown
  >;
  const authData = decoded.get('authData');
  if (!(authData instanceof Uint8Array) || authData.length < 55) {
    throw new Error('Malformed WebAuthn authenticator data.');
  }

  const signCount =
    ((authData[33] << 24) >>> 0) +
    (authData[34] << 16) +
    (authData[35] << 8) +
    authData[36];

  const flags = authData[32];
  const hasAttestedCred = (flags & 0x40) !== 0;
  if (!hasAttestedCred) {
    throw new Error('Authenticator did not return attested credential data.');
  }

  const credIdLen = (authData[53] << 8) | authData[54];
  const coseOffset = 55 + credIdLen;
  const coseKey = decodeCborValue(authData, coseOffset).value as Map<unknown, unknown>;
  const kty = coseKey.get(1);
  const alg = Number(coseKey.get(3) ?? -7);

  // EC2 P-256 (kty=2, alg=-7)
  if (kty === 2 && alg === -7) {
    const x = coseKey.get(-2);
    const y = coseKey.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
      throw new Error('Invalid ES256 EC public key coordinates.');
    }
    const rawPoint = new Uint8Array(65);
    rawPoint[0] = 0x04;
    rawPoint.set(x, 1);
    rawPoint.set(y, 33);

    // ASN.1 AlgorithmIdentifier for id-ecPublicKey (1.2.840.10045.2.1) + prime256v1 (1.2.840.10045.3.1.7)
    const ecAlgId = [
      0x30, 0x13,
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    ];
    const spki = encodeDerSequence([...ecAlgId, ...encodeDerBitString(rawPoint)]);
    return {
      publicKeySpki: bytesToBase64Url(spki),
      algorithm: -7,
      signCount,
    };
  }

  // RSA (kty=3, alg=-257)
  if (kty === 3 && alg === -257) {
    const n = coseKey.get(-1);
    const e = coseKey.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) {
      throw new Error('Invalid RS256 public key parameters.');
    }
    const rsaPubSeq = encodeDerSequence([...encodeDerInteger(n), ...encodeDerInteger(e)]);
    const rsaAlgId = [
      0x30, 0x0d,
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
      0x05, 0x00,
    ];
    const spki = encodeDerSequence([...rsaAlgId, ...encodeDerBitString(rsaPubSeq)]);
    return {
      publicKeySpki: bytesToBase64Url(spki),
      algorithm: -257,
      signCount,
    };
  }

  throw new Error(`Unsupported WebAuthn public key algorithm (${alg}).`);
}

function readSignCountFromAuthData(authData: Uint8Array): number {
  if (authData.length < 37) return 0;
  return (
    ((authData[33] << 24) >>> 0) +
    (authData[34] << 16) +
    (authData[35] << 8) +
    authData[36]
  );
}

/**
 * Converts ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s })
 * to raw IEEE P1363 64-byte (r || s) required by Web Crypto ECDSA verify.
 */
export function derEcdsaSignatureToRawP1363(
  derSig: Uint8Array,
  coordBytes = 32
): Uint8Array {
  // Already raw P1363?
  if (derSig.length === coordBytes * 2 && derSig[0] !== 0x30) {
    return derSig;
  }
  let pos = 0;
  if (derSig[pos++] !== 0x30) {
    throw new Error('Invalid DER ECDSA signature header.');
  }
  const seqLen = derSig[pos++];
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f;
    pos += lenBytes;
  }
  if (derSig[pos++] !== 0x02) {
    throw new Error('Invalid DER ECDSA r integer marker.');
  }
  const rLen = derSig[pos++];
  const rSlice = derSig.slice(pos, pos + rLen);
  pos += rLen;

  if (derSig[pos++] !== 0x02) {
    throw new Error('Invalid DER ECDSA s integer marker.');
  }
  const sLen = derSig[pos++];
  const sSlice = derSig.slice(pos, pos + sLen);

  const out = new Uint8Array(coordBytes * 2);
  const copyInt = (src: Uint8Array, destOffset: number) => {
    let start = 0;
    while (start < src.length && src[start] === 0x00 && src.length - start > coordBytes) {
      start++;
    }
    const trimmed = src.slice(start);
    if (trimmed.length > coordBytes) {
      throw new Error('ECDSA coordinate exceeds curve size.');
    }
    out.set(trimmed, destOffset + (coordBytes - trimmed.length));
  };

  copyInt(rSlice, 0);
  copyInt(sSlice, coordBytes);
  return out;
}

function mapWebAuthnError(err: unknown): Error {
  if (err instanceof DOMException || err instanceof Error) {
    const name = err instanceof DOMException ? err.name : err.name || '';
    const msg = err.message || '';
    if (/permissions policy|publickey-credentials|not enabled in this document/i.test(msg)) {
      return new Error(
        'Device biometrics prompt is blocked inside this embedded preview frame. Open the portal directly in your browser tab or use Security PIN confirmation.'
      );
    }
    if (name === 'NotAllowedError') {
      return new Error(
        'Biometric verification was cancelled, timed out, or dismissed on your device.'
      );
    }
    if (name === 'InvalidStateError') {
      return new Error('This device biometric passkey is already registered on your account.');
    }
    if (name === 'SecurityError') {
      return new Error(
        'WebAuthn requires a secure HTTPS / localhost origin matching this domain.'
      );
    }
    if (name === 'NotSupportedError') {
      return new Error('This device or browser does not support platform biometric passkeys.');
    }
    return new Error(msg || 'Biometric authentication failed.');
  }
  return new Error('Biometric authentication failed.');
}

/**
 * Prompts the customer's device biometrics (Touch ID, Face ID, Android Biometric, Windows Hello)
 * via W3C WebAuthn to register a hardware-backed passkey for transaction confirmation.
 */
export async function registerCustomerBiometricPasskey(params: {
  accountId: string;
  userEmailOrPhone: string;
  displayName: string;
  deviceLabel?: string;
  existingCredentialIds?: string[];
}): Promise<WebAuthnCredentialRecord> {
  const cap = await detectWebAuthnCapability();
  if (!cap.supported) {
    throw new Error('WebAuthn biometrics is not supported on this browser or device.');
  }

  const challenge = new Uint8Array(32);
  globalThis.crypto.getRandomValues(challenge);
  const rpId = getEffectiveRpId();
  const userHandle = new TextEncoder().encode(params.accountId);

  const excludeCredentials: PublicKeyCredentialDescriptor[] = (
    params.existingCredentialIds || []
  ).map((id) => ({
    type: 'public-key',
    id: toExactArrayBuffer(base64UrlToBytes(id)),
  }));

  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: {
          name: 'Acash Mobile Finance',
          ...(rpId ? { id: rpId } : {}),
        },
        user: {
          id: toExactArrayBuffer(userHandle),
          name: params.userEmailOrPhone || params.accountId,
          displayName: params.displayName || params.accountId,
        },
        challenge: toExactArrayBuffer(challenge),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256 (P-256)
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          requireResidentKey: false,
          userVerification: 'required',
        },
        excludeCredentials,
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!cred) {
      throw new Error('No biometric passkey credential returned by device.');
    }

    const response = cred.response as AuthenticatorAttestationResponse;
    const credentialId = bytesToBase64Url(new Uint8Array(cred.rawId));
    const transports =
      typeof response.getTransports === 'function' ? response.getTransports() : ['internal'];

    let publicKeySpki = '';
    let algorithm = -7;
    let signCount = 0;

    try {
      const authDataBytes =
        typeof response.getAuthenticatorData === 'function'
          ? new Uint8Array(response.getAuthenticatorData())
          : null;
      if (authDataBytes) {
        signCount = readSignCountFromAuthData(authDataBytes);
      }
    } catch {
      // fall back to attestationObject
    }

    if (
      typeof response.getPublicKey === 'function' &&
      typeof response.getPublicKeyAlgorithm === 'function'
    ) {
      const spkiBuf = response.getPublicKey();
      const algNum = response.getPublicKeyAlgorithm();
      if (spkiBuf && (algNum === -7 || algNum === -257)) {
        publicKeySpki = bytesToBase64Url(new Uint8Array(spkiBuf));
        algorithm = algNum;
      }
    }

    if (!publicKeySpki) {
      const parsed = extractSpkiFromAttestationObject(response.attestationObject);
      publicKeySpki = parsed.publicKeySpki;
      algorithm = parsed.algorithm;
      signCount = parsed.signCount;
    }

    return {
      credentialId,
      publicKeySpki,
      algorithm,
      deviceLabel: sanitizeBiometricDeviceLabelForDisplay(params.deviceLabel || cap.defaultDeviceLabel),
      transports,
      signCount,
      createdAt: Date.now(),
    };
  } catch (err) {
    throw mapWebAuthnError(err);
  }
}

/**
 * Triggers the native OS biometric prompt (fingerprint / face recognition) bound to the exact
 * transaction context (account, type, amount, recipient), then verifies the cryptographic proof.
 */
export async function authorizeTransactionWithBiometrics(params: {
  accountId: string;
  txType: TransactionType;
  amount: number;
  target: string;
  credentials: WebAuthnCredentialRecord[];
}): Promise<BiometricTxAuthorizationProof> {
  const cap = await detectWebAuthnCapability();
  if (!cap.supported) {
    throw new Error('WebAuthn biometrics is not supported on this browser.');
  }
  if (!params.credentials || params.credentials.length === 0) {
    throw new Error('No biometric passkey enrolled on this account.');
  }

  const nonceBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(nonceBytes);
  const nonceHex = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const cleanTarget = (params.target || '').trim().toUpperCase();
  const bindingRaw = `acash-webauthn-tx-v1|${params.accountId}|${params.txType}|${params.amount.toFixed(2)}|${cleanTarget}|${nonceHex}`;
  const challengeBytes = await sha256(new TextEncoder().encode(bindingRaw));
  const challengeBase64Url = bytesToBase64Url(challengeBytes);

  const rpId = getEffectiveRpId() || window.location.hostname || 'localhost';

  const allowCredentials: PublicKeyCredentialDescriptor[] = params.credentials.map((c) => ({
    type: 'public-key',
    id: toExactArrayBuffer(base64UrlToBytes(c.credentialId)),
    ...(c.transports && c.transports.length > 0
      ? { transports: c.transports as AuthenticatorTransport[] }
      : {}),
  }));

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: toExactArrayBuffer(challengeBytes),
        rpId,
        allowCredentials,
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification did not return a signed assertion.');
    }

    const resp = assertion.response as AuthenticatorAssertionResponse;
    const proof: BiometricTxAuthorizationProof = {
      credentialId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
      challengeBase64Url,
      authenticatorDataBase64Url: bytesToBase64Url(new Uint8Array(resp.authenticatorData)),
      clientDataJsonBase64Url: bytesToBase64Url(new Uint8Array(resp.clientDataJSON)),
      signatureBase64Url: bytesToBase64Url(new Uint8Array(resp.signature)),
      rpId,
      verifiedAt: Date.now(),
      txBindingContext: {
        accountId: params.accountId,
        txType: params.txType,
        amount: Number(params.amount.toFixed(2)),
        target: cleanTarget,
      },
    };

    const verifyRes = await verifyBiometricTransactionProof({
      proof,
      enrolledCredentials: params.credentials,
      expectedAccountId: params.accountId,
      expectedTxType: params.txType,
      expectedAmount: params.amount,
      expectedOrigin: window.location.origin,
    });

    if (!verifyRes.valid) {
      throw new Error(verifyRes.reason || 'Cryptographic biometric signature verification failed.');
    }

    return proof;
  } catch (err) {
    throw mapWebAuthnError(err);
  }
}

/**
 * Cryptographically verifies a WebAuthn AuthenticatorAssertionResponse against the user's
 * enrolled SPKI public key, challenge, RP ID hash, User Presence + User Verification flags,
 * signature, and replay signCount.
 */
export async function verifyBiometricTransactionProof(params: {
  proof: BiometricTxAuthorizationProof;
  enrolledCredentials: WebAuthnCredentialRecord[];
  expectedAccountId: string;
  expectedTxType: TransactionType;
  expectedAmount: number;
  expectedOrigin?: string;
  maxAgeMs?: number;
}): Promise<{
  valid: boolean;
  reason?: string;
  matchedCredentialId?: string;
  nextSignCount?: number;
}> {
  const { proof } = params;
  const maxAgeMs = params.maxAgeMs ?? 90_000;

  if (!proof || !proof.credentialId || !proof.signatureBase64Url) {
    return { valid: false, reason: 'Missing WebAuthn biometric assertion payload.' };
  }

  if (Date.now() - proof.verifiedAt > maxAgeMs || proof.verifiedAt - Date.now() > 15_000) {
    return { valid: false, reason: 'Biometric authorization expired. Please scan again.' };
  }

  if (
    proof.txBindingContext.accountId !== params.expectedAccountId ||
    proof.txBindingContext.txType !== params.expectedTxType ||
    Math.abs(proof.txBindingContext.amount - Number(params.expectedAmount.toFixed(2))) > 0.01
  ) {
    return {
      valid: false,
      reason: 'Biometric assertion does not match transaction details.',
    };
  }

  const cred = params.enrolledCredentials.find((c) => c.credentialId === proof.credentialId);
  if (!cred) {
    return { valid: false, reason: 'Biometric credential is not registered on this account.' };
  }

  // 1. Validate clientDataJSON
  let clientData: { type?: string; challenge?: string; origin?: string };
  const clientDataBytes = base64UrlToBytes(proof.clientDataJsonBase64Url);
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  } catch {
    return { valid: false, reason: 'Malformed WebAuthn clientDataJSON.' };
  }

  if (clientData.type !== 'webauthn.get') {
    return { valid: false, reason: 'Invalid WebAuthn ceremony type.' };
  }
  if (clientData.challenge !== proof.challengeBase64Url) {
    return { valid: false, reason: 'WebAuthn challenge mismatch.' };
  }
  if (params.expectedOrigin && clientData.origin !== params.expectedOrigin) {
    return { valid: false, reason: 'WebAuthn origin verification failed.' };
  }

  // 2. Validate authenticatorData (rpIdHash, UP + UV flags, signCount)
  const authDataBytes = base64UrlToBytes(proof.authenticatorDataBase64Url);
  if (authDataBytes.length < 37) {
    return { valid: false, reason: 'Malformed authenticatorData.' };
  }

  const expectedRpIdHash = await sha256(new TextEncoder().encode(proof.rpId));
  for (let i = 0; i < 32; i++) {
    if (authDataBytes[i] !== expectedRpIdHash[i]) {
      return { valid: false, reason: 'WebAuthn RP ID hash verification failed.' };
    }
  }

  const flags = authDataBytes[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    return {
      valid: false,
      reason: 'Biometric user verification (UV flag) was not satisfied by device.',
    };
  }

  const newSignCount = readSignCountFromAuthData(authDataBytes);
  if (cred.signCount > 0 && newSignCount > 0 && newSignCount <= cred.signCount) {
    return {
      valid: false,
      reason: 'Authenticator signature counter anomaly detected.',
    };
  }

  // 3. Verify cryptographic signature over authenticatorData || SHA-256(clientDataJSON)
  if (!globalThis.crypto?.subtle) {
    return { valid: false, reason: 'Web Crypto SubtleCrypto is unavailable.' };
  }

  try {
    const clientDataHash = await sha256(clientDataBytes);
    const signedPayload = new Uint8Array(authDataBytes.length + clientDataHash.length);
    signedPayload.set(authDataBytes, 0);
    signedPayload.set(clientDataHash, authDataBytes.length);

    const spkiBytes = base64UrlToBytes(cred.publicKeySpki);
    const sigBytes = base64UrlToBytes(proof.signatureBase64Url);

    if (cred.algorithm === -7) {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        toExactArrayBuffer(spkiBytes),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const rawSig = derEcdsaSignatureToRawP1363(sigBytes, 32);
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        toExactArrayBuffer(rawSig),
        toExactArrayBuffer(signedPayload)
      );
      if (!ok) {
        return { valid: false, reason: 'Invalid ECDSA biometric signature.' };
      }
    } else if (cred.algorithm === -257) {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        toExactArrayBuffer(spkiBytes),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        toExactArrayBuffer(sigBytes),
        toExactArrayBuffer(signedPayload)
      );
      if (!ok) {
        return { valid: false, reason: 'Invalid RSA biometric signature.' };
      }
    } else {
      return { valid: false, reason: `Unsupported credential algorithm: ${cred.algorithm}` };
    }
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Biometric signature verification threw error.',
    };
  }

  return {
    valid: true,
    matchedCredentialId: cred.credentialId,
    nextSignCount: newSignCount,
  };
}

/**
 * Triggers native OS biometrics to authorize any sensitive setting change or admin operation,
 * bound cryptographically to subjectId + actionName + random nonce.
 */
export async function authorizeSensitiveActionWithBiometrics(params: {
  subjectId: string;
  actionName: string;
  credentials: WebAuthnCredentialRecord[];
}): Promise<BiometricActionAuthorizationProof> {
  const cap = await detectWebAuthnCapability();
  if (!cap.supported) {
    throw new Error('WebAuthn biometrics is not supported on this browser.');
  }
  if (!params.credentials || params.credentials.length === 0) {
    throw new Error('No biometric passkey enrolled.');
  }

  const nonceBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(nonceBytes);
  const nonceHex = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const cleanAction = (params.actionName || 'sensitive_action').trim();
  const bindingRaw = `acash-webauthn-action-v1|${params.subjectId}|${cleanAction}|${nonceHex}`;
  const challengeBytes = await sha256(new TextEncoder().encode(bindingRaw));
  const challengeBase64Url = bytesToBase64Url(challengeBytes);
  const rpId = getEffectiveRpId() || window.location.hostname || 'localhost';

  const allowCredentials: PublicKeyCredentialDescriptor[] = params.credentials.map((c) => ({
    type: 'public-key',
    id: toExactArrayBuffer(base64UrlToBytes(c.credentialId)),
    ...(c.transports && c.transports.length > 0
      ? { transports: c.transports as AuthenticatorTransport[] }
      : {}),
  }));

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: toExactArrayBuffer(challengeBytes),
        rpId,
        allowCredentials,
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification did not return a signed assertion.');
    }

    const resp = assertion.response as AuthenticatorAssertionResponse;
    const proof: BiometricActionAuthorizationProof = {
      credentialId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
      subjectId: params.subjectId,
      actionName: cleanAction,
      signedAt: Date.now(),
      challengeBase64Url,
      authenticatorDataBase64Url: bytesToBase64Url(new Uint8Array(resp.authenticatorData)),
      clientDataJsonBase64Url: bytesToBase64Url(new Uint8Array(resp.clientDataJSON)),
      signatureBase64Url: bytesToBase64Url(new Uint8Array(resp.signature)),
      rpId,
    };

    const verifyRes = await verifyBiometricActionProof({
      proof,
      enrolledCredentials: params.credentials,
      expectedSubjectId: params.subjectId,
      expectedActionName: cleanAction,
      expectedOrigin: window.location.origin,
    });

    if (!verifyRes.valid) {
      throw new Error(verifyRes.reason || 'Cryptographic biometric signature verification failed.');
    }

    return proof;
  } catch (err) {
    throw mapWebAuthnError(err);
  }
}

export async function verifyBiometricActionProof(params: {
  proof: BiometricActionAuthorizationProof;
  enrolledCredentials: WebAuthnCredentialRecord[];
  expectedSubjectId: string;
  expectedActionName: string;
  expectedOrigin?: string;
  maxAgeMs?: number;
}): Promise<{
  valid: boolean;
  reason?: string;
  matchedCredentialId?: string;
  nextSignCount?: number;
}> {
  const { proof } = params;
  const maxAgeMs = params.maxAgeMs ?? 90_000;

  if (!proof || !proof.credentialId || !proof.signatureBase64Url) {
    return { valid: false, reason: 'Missing WebAuthn biometric assertion payload.' };
  }

  if (Date.now() - proof.signedAt > maxAgeMs || proof.signedAt - Date.now() > 15_000) {
    return { valid: false, reason: 'Biometric authorization expired. Please scan again.' };
  }

  if (
    proof.subjectId !== params.expectedSubjectId ||
    proof.actionName !== params.expectedActionName
  ) {
    return {
      valid: false,
      reason: 'Biometric assertion does not match this action context.',
    };
  }

  const cred = params.enrolledCredentials.find((c) => c.credentialId === proof.credentialId);
  if (!cred) {
    return { valid: false, reason: 'Biometric credential is not registered on this account.' };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  const clientDataBytes = base64UrlToBytes(proof.clientDataJsonBase64Url);
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  } catch {
    return { valid: false, reason: 'Malformed WebAuthn clientDataJSON.' };
  }

  if (clientData.type !== 'webauthn.get') {
    return { valid: false, reason: 'Invalid WebAuthn ceremony type.' };
  }
  if (clientData.challenge !== proof.challengeBase64Url) {
    return { valid: false, reason: 'WebAuthn challenge mismatch.' };
  }
  if (params.expectedOrigin && clientData.origin !== params.expectedOrigin) {
    return { valid: false, reason: 'WebAuthn origin verification failed.' };
  }

  const authDataBytes = base64UrlToBytes(proof.authenticatorDataBase64Url);
  if (authDataBytes.length < 37) {
    return { valid: false, reason: 'Malformed authenticatorData.' };
  }

  const expectedRpIdHash = await sha256(new TextEncoder().encode(proof.rpId));
  for (let i = 0; i < 32; i++) {
    if (authDataBytes[i] !== expectedRpIdHash[i]) {
      return { valid: false, reason: 'WebAuthn RP ID hash verification failed.' };
    }
  }

  const flags = authDataBytes[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    return {
      valid: false,
      reason: 'Biometric user verification (UV flag) was not satisfied by device.',
    };
  }

  const newSignCount = readSignCountFromAuthData(authDataBytes);
  if (cred.signCount > 0 && newSignCount > 0 && newSignCount <= cred.signCount) {
    return {
      valid: false,
      reason: 'Authenticator signature counter anomaly detected.',
    };
  }

  if (!globalThis.crypto?.subtle) {
    return { valid: false, reason: 'Web Crypto SubtleCrypto is unavailable.' };
  }

  try {
    const clientDataHash = await sha256(clientDataBytes);
    const signedPayload = new Uint8Array(authDataBytes.length + clientDataHash.length);
    signedPayload.set(authDataBytes, 0);
    signedPayload.set(clientDataHash, authDataBytes.length);

    const spkiBytes = base64UrlToBytes(cred.publicKeySpki);
    const sigBytes = base64UrlToBytes(proof.signatureBase64Url);

    if (cred.algorithm === -7) {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        toExactArrayBuffer(spkiBytes),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const rawSig = derEcdsaSignatureToRawP1363(sigBytes, 32);
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        toExactArrayBuffer(rawSig),
        toExactArrayBuffer(signedPayload)
      );
      if (!ok) {
        return { valid: false, reason: 'Invalid ECDSA biometric signature.' };
      }
    } else if (cred.algorithm === -257) {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        toExactArrayBuffer(spkiBytes),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        toExactArrayBuffer(sigBytes),
        toExactArrayBuffer(signedPayload)
      );
      if (!ok) {
        return { valid: false, reason: 'Invalid RSA biometric signature.' };
      }
    } else {
      return { valid: false, reason: `Unsupported credential algorithm: ${cred.algorithm}` };
    }
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Biometric signature verification threw error.',
    };
  }

  return {
    valid: true,
    matchedCredentialId: cred.credentialId,
    nextSignCount: newSignCount,
  };
}

// ============================================================
// BIOMETRIC POLICY & QUICK DEVICE LOGIN HELPERS
// ============================================================

export const DEFAULT_BIOMETRIC_PREFS: BiometricPreferences = {
  enabled: true,
  highValueThreshold: 10000,
  highValueMode: 'replace',
  quickUnlockEnabled: true,
  biometricTxCount: 0,
};

export function normalizeBiometricPrefs(
  prefs?: Partial<BiometricPreferences>
): BiometricPreferences {
  const rawThreshold = Number(prefs?.highValueThreshold);
  const highValueThreshold =
    Number.isFinite(rawThreshold) && rawThreshold >= 500 && rawThreshold <= 500000
      ? Math.round(rawThreshold)
      : DEFAULT_BIOMETRIC_PREFS.highValueThreshold;
  const highValueMode: BiometricHighValueMode =
    prefs?.highValueMode === 'augment' ? 'augment' : 'replace';

  return {
    enabled: prefs?.enabled !== false,
    highValueThreshold,
    highValueMode,
    quickUnlockEnabled: prefs?.quickUnlockEnabled !== false,
    ...(typeof prefs?.lastVerifiedAt === 'number'
      ? { lastVerifiedAt: prefs.lastVerifiedAt }
      : {}),
    biometricTxCount:
      typeof prefs?.biometricTxCount === 'number' && prefs.biometricTxCount >= 0
        ? Math.floor(prefs.biometricTxCount)
        : 0,
  };
}

export interface BiometricTxPolicyDecision {
  prefs: BiometricPreferences;
  effectiveThreshold: number;
  isHighValueForBio: boolean;
  isPlatformAmlHighValue: boolean;
  shouldPrioritizeBiometrics: boolean;
  requireAugmentStep: boolean;
}

export function resolveBiometricPolicyForAmount(params: {
  user: Pick<AcashUser, 'biometricPrefs' | 'webauthnCredentials'>;
  amount: number;
  platformHighValueThreshold: number;
  biometricsReady: boolean;
}): BiometricTxPolicyDecision {
  const prefs = normalizeBiometricPrefs(params.user.biometricPrefs);
  const platformLimit = Math.max(500, Number(params.platformHighValueThreshold) || 50000);
  const effectiveThreshold = prefs.enabled
    ? Math.min(prefs.highValueThreshold, platformLimit)
    : platformLimit;
  const numericAmount = Number(params.amount) || 0;
  const isHighValueForBio = prefs.enabled && numericAmount >= effectiveThreshold;
  const isPlatformAmlHighValue = numericAmount >= platformLimit;
  const shouldPrioritizeBiometrics = params.biometricsReady && prefs.enabled;
  const requireAugmentStep =
    params.biometricsReady &&
    prefs.enabled &&
    isHighValueForBio &&
    prefs.highValueMode === 'augment';

  return {
    prefs,
    effectiveThreshold,
    isHighValueForBio,
    isPlatformAmlHighValue,
    shouldPrioritizeBiometrics,
    requireAugmentStep,
  };
}

export interface BiometricLoginProof {
  accountId: string;
  credentialId: string;
  challengeBase64Url: string;
  authenticatorDataBase64Url: string;
  clientDataJsonBase64Url: string;
  signatureBase64Url: string;
  rpId: string;
  verifiedAt: number;
}

export async function verifyBiometricLoginProof(params: {
  proof: BiometricLoginProof;
  enrolledCredentials: WebAuthnCredentialRecord[];
  expectedAccountId: string;
  expectedOrigin?: string;
  maxAgeMs?: number;
}): Promise<{
  valid: boolean;
  reason?: string;
  matchedCredentialId?: string;
  nextSignCount?: number;
}> {
  const { proof } = params;
  const maxAgeMs = params.maxAgeMs ?? 90_000;

  if (!proof || !proof.credentialId || !proof.signatureBase64Url) {
    return { valid: false, reason: 'Missing WebAuthn biometric login assertion.' };
  }
  if (proof.accountId !== params.expectedAccountId) {
    return { valid: false, reason: 'Biometric assertion account mismatch.' };
  }
  if (Date.now() - proof.verifiedAt > maxAgeMs || proof.verifiedAt - Date.now() > 15_000) {
    return { valid: false, reason: 'Biometric sign-in prompt expired. Please scan again.' };
  }

  const cred = params.enrolledCredentials.find((c) => c.credentialId === proof.credentialId);
  if (!cred) {
    return { valid: false, reason: 'Passkey is not registered on this account.' };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  const clientDataBytes = base64UrlToBytes(proof.clientDataJsonBase64Url);
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  } catch {
    return { valid: false, reason: 'Malformed WebAuthn clientDataJSON.' };
  }

  if (clientData.type !== 'webauthn.get') {
    return { valid: false, reason: 'Invalid WebAuthn ceremony type.' };
  }
  if (clientData.challenge !== proof.challengeBase64Url) {
    return { valid: false, reason: 'WebAuthn challenge mismatch.' };
  }
  if (params.expectedOrigin && clientData.origin !== params.expectedOrigin) {
    return { valid: false, reason: 'WebAuthn origin verification failed.' };
  }

  const authDataBytes = base64UrlToBytes(proof.authenticatorDataBase64Url);
  if (authDataBytes.length < 37) {
    return { valid: false, reason: 'Malformed authenticatorData.' };
  }

  const expectedRpIdHash = await sha256(new TextEncoder().encode(proof.rpId));
  for (let i = 0; i < 32; i++) {
    if (authDataBytes[i] !== expectedRpIdHash[i]) {
      return { valid: false, reason: 'WebAuthn RP ID hash verification failed.' };
    }
  }

  const flags = authDataBytes[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    return {
      valid: false,
      reason: 'Biometric user verification (UV flag) was not satisfied.',
    };
  }

  const newSignCount = readSignCountFromAuthData(authDataBytes);
  if (cred.signCount > 0 && newSignCount > 0 && newSignCount <= cred.signCount) {
    return {
      valid: false,
      reason: 'Authenticator signature counter anomaly detected.',
    };
  }

  if (!globalThis.crypto?.subtle) {
    return { valid: false, reason: 'Web Crypto SubtleCrypto is unavailable.' };
  }

  try {
    const clientDataHash = await sha256(clientDataBytes);
    const signedPayload = new Uint8Array(authDataBytes.length + clientDataHash.length);
    signedPayload.set(authDataBytes, 0);
    signedPayload.set(clientDataHash, authDataBytes.length);

    const spkiBytes = base64UrlToBytes(cred.publicKeySpki);
    const sigBytes = base64UrlToBytes(proof.signatureBase64Url);

    if (cred.algorithm === -7) {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        toExactArrayBuffer(spkiBytes),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const rawSig = derEcdsaSignatureToRawP1363(sigBytes, 32);
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        toExactArrayBuffer(rawSig),
        toExactArrayBuffer(signedPayload)
      );
      if (!ok) return { valid: false, reason: 'Invalid ECDSA biometric signature.' };
    } else if (cred.algorithm === -257) {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        toExactArrayBuffer(spkiBytes),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const ok = await globalThis.crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        toExactArrayBuffer(sigBytes),
        toExactArrayBuffer(signedPayload)
      );
      if (!ok) return { valid: false, reason: 'Invalid RSA biometric signature.' };
    } else {
      return { valid: false, reason: `Unsupported credential algorithm: ${cred.algorithm}` };
    }
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Biometric login verification failed.',
    };
  }

  return {
    valid: true,
    matchedCredentialId: cred.credentialId,
    nextSignCount: newSignCount,
  };
}

export async function authorizeLoginWithBiometrics(params: {
  accountId: string;
  credentials: WebAuthnCredentialRecord[];
}): Promise<{
  credentialId: string;
  verifiedAt: number;
  nextSignCount?: number;
}> {
  const cap = await detectWebAuthnCapability();
  if (!cap.supported) {
    throw new Error('WebAuthn biometrics is not supported on this browser.');
  }
  if (!params.credentials || params.credentials.length === 0) {
    throw new Error('No biometric passkey enrolled on this account.');
  }

  const nonceBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(nonceBytes);
  const nonceHex = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const bindingRaw = `acash-webauthn-login-v1|${params.accountId}|${nonceHex}`;
  const challengeBytes = await sha256(new TextEncoder().encode(bindingRaw));
  const challengeBase64Url = bytesToBase64Url(challengeBytes);
  const rpId = getEffectiveRpId() || window.location.hostname || 'localhost';

  const allowCredentials: PublicKeyCredentialDescriptor[] = params.credentials.map((c) => ({
    type: 'public-key',
    id: toExactArrayBuffer(base64UrlToBytes(c.credentialId)),
    ...(c.transports && c.transports.length > 0
      ? { transports: c.transports as AuthenticatorTransport[] }
      : {}),
  }));

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: toExactArrayBuffer(challengeBytes),
        rpId,
        allowCredentials,
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification did not return a signed assertion.');
    }

    const resp = assertion.response as AuthenticatorAssertionResponse;
    const proof: BiometricLoginProof = {
      accountId: params.accountId,
      credentialId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
      challengeBase64Url,
      authenticatorDataBase64Url: bytesToBase64Url(new Uint8Array(resp.authenticatorData)),
      clientDataJsonBase64Url: bytesToBase64Url(new Uint8Array(resp.clientDataJSON)),
      signatureBase64Url: bytesToBase64Url(new Uint8Array(resp.signature)),
      rpId,
      verifiedAt: Date.now(),
    };

    const verifyRes = await verifyBiometricLoginProof({
      proof,
      enrolledCredentials: params.credentials,
      expectedAccountId: params.accountId,
      expectedOrigin: window.location.origin,
    });

    if (!verifyRes.valid) {
      throw new Error(verifyRes.reason || 'Cryptographic biometric verification failed.');
    }

    return {
      credentialId: verifyRes.matchedCredentialId || proof.credentialId,
      verifiedAt: proof.verifiedAt,
      nextSignCount: verifyRes.nextSignCount,
    };
  } catch (err) {
    throw mapWebAuthnError(err);
  }
}

export interface BiometricQuickHint {
  accountId: string;
  name: string;
  role: UserRole;
  deviceLabel: string;
  updatedAt: number;
}

const BIO_QUICK_HINTS_KEY = 'acash_bio_quick_hints_v1';

export function getBiometricQuickHints(): BiometricQuickHint[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(BIO_QUICK_HINTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is BiometricQuickHint =>
        Boolean(h && typeof h.accountId === 'string' && typeof h.name === 'string')
    );
  } catch {
    return [];
  }
}

export function syncBiometricQuickHint(user: Pick<AcashUser, 'accountId' | 'name' | 'businessName' | 'role' | 'webauthnCredentials' | 'biometricPrefs'>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const creds = user.webauthnCredentials || [];
    const prefs = normalizeBiometricPrefs(user.biometricPrefs);
    const current = getBiometricQuickHints().filter((h) => h.accountId !== user.accountId);
    if (creds.length > 0 && prefs.enabled && prefs.quickUnlockEnabled) {
      current.unshift({
        accountId: user.accountId,
        name: user.businessName || user.name,
        role: user.role,
        deviceLabel: sanitizeBiometricDeviceLabelForDisplay(
          creds[0]?.deviceLabel || detectDefaultBiometricDeviceLabel()
        ),
        updatedAt: Date.now(),
      });
    }
    window.localStorage.setItem(BIO_QUICK_HINTS_KEY, JSON.stringify(current.slice(0, 4)));
  } catch {
    // ignore storage quota errors
  }
}

export function removeBiometricQuickHint(accountId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = getBiometricQuickHints().filter((h) => h.accountId !== accountId);
    window.localStorage.setItem(BIO_QUICK_HINTS_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

