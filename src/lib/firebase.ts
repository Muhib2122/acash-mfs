import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const FIREBASE_CONFIG = firebaseConfig;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const GOOGLE_REDIRECT_SCOPE_KEY = 'acash_google_redirect_scope_v1';

// Ensure Firebase Auth persists across browser refreshes & closures
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Handled gracefully if browser storage is restricted
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('missing or insufficient permissions') || msg.includes('permission-denied');
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isLikelyInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|BytedanceWebview|musical_ly|; wv\)/i.test(ua);
}

function getFirebaseErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code?: unknown }).code || '');
  }
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/\((auth\/[a-z0-9-]+)\)/i);
  return match ? match[1] : '';
}

export function formatFirebaseAuthError(err: unknown): string {
  const code = getFirebaseErrorCode(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
  const projectId = firebaseConfig.projectId;

  if (code === 'auth/unauthorized-domain') {
    return `Firebase Unauthorized Domain (${host}): Add "${host}" in Firebase Console -> Project "${projectId}" -> Authentication -> Settings -> Authorized domains.`;
  }
  if (code === 'auth/popup-blocked') {
    return isLikelyInAppBrowser()
      ? 'In-app browser blocked the Google Sign-In popup. Tap the 3-dot menu and choose "Open in Chrome / Browser", or use EmailJS Gmail OTP below.'
      : 'Google Sign-In popup was blocked by your browser. Please allow popups or try again.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'This browser/webview blocked Google Auth. Open this site in Chrome or Safari, or create your account using EmailJS Gmail OTP.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google Sign-In window was closed before finishing verification.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Google Sign-In request was interrupted. Please try again.';
  }
  return err instanceof Error ? err.message : 'Google Sign-In failed.';
}

export type GoogleSignInOutcome =
  | { status: 'authenticated'; user: FirebaseUser }
  | { status: 'redirecting' };

export async function signInWithGoogleSmart(
  scope: 'portal' | 'admin' = 'portal'
): Promise<GoogleSignInOutcome> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { status: 'authenticated', user: result.user };
  } catch (err) {
    const code = getFirebaseErrorCode(err);
    const shouldTryRedirect =
      !isRunningInIframe() &&
      (code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment');

    if (shouldTryRedirect) {
      try {
        sessionStorage.setItem(GOOGLE_REDIRECT_SCOPE_KEY, scope);
      } catch {
        // ignore storage limits
      }
      await signInWithRedirect(auth, googleProvider);
      return { status: 'redirecting' };
    }

    throw new Error(formatFirebaseAuthError(err));
  }
}

export async function startGoogleRedirectSignIn(
  scope: 'portal' | 'admin' = 'portal'
): Promise<void> {
  if (isRunningInIframe()) {
    throw new Error('Redirect sign-in is disabled inside preview frames. Use popup sign-in.');
  }
  try {
    sessionStorage.setItem(GOOGLE_REDIRECT_SCOPE_KEY, scope);
  } catch {
    // ignore storage limits
  }
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    throw new Error(formatFirebaseAuthError(err));
  }
}

export async function consumeGoogleRedirectResult(
  expectedScope?: 'portal' | 'admin'
): Promise<{ user: FirebaseUser | null; error?: string }> {
  let storedScope: string | null = null;
  try {
    storedScope = sessionStorage.getItem(GOOGLE_REDIRECT_SCOPE_KEY);
  } catch {
    storedScope = null;
  }

  if (expectedScope && storedScope && storedScope !== expectedScope) {
    return { user: null };
  }

  try {
    const result = await getRedirectResult(auth);
    let resolvedUser = result?.user ?? null;
    if (!resolvedUser && storedScope) {
      try {
        await auth.authStateReady();
        if (auth.currentUser?.emailVerified) {
          resolvedUser = auth.currentUser;
        }
      } catch {
        // ignore fallback hydration failure
      }
    }
    if (storedScope) {
      try {
        sessionStorage.removeItem(GOOGLE_REDIRECT_SCOPE_KEY);
      } catch {
        // ignore
      }
    }
    return { user: resolvedUser };
  } catch (err) {
    try {
      sessionStorage.removeItem(GOOGLE_REDIRECT_SCOPE_KEY);
    } catch {
      // ignore
    }
    return { user: null, error: formatFirebaseAuthError(err) };
  }
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    throw new Error(formatFirebaseAuthError(err));
  }
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signout cleanup failure
  }
}

export function subscribeToFirebaseAuth(
  callback: (user: FirebaseUser | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function ensureFirebaseAuthSession(): Promise<FirebaseUser | null> {
  try {
    await auth.authStateReady();
  } catch {
    // ignore auth hydration fallback
  }
  return auth.currentUser;
}

async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

export async function testFirestoreConnection(): Promise<boolean> {
  return testConnection();
}

void testConnection();
