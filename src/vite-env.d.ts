/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_MODE?: 'auto' | 'unified' | 'admin';
  readonly VITE_ADMIN_PORTAL_URL?: string;
  readonly VITE_USER_PORTAL_URL?: string;
  readonly VITE_MOBILE_APK_URL?: string;
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  readonly VITE_EMAILJS_TEMPLATE_ID?: string;
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __ACASH_PORTAL_ENTRY__?: 'unified' | 'admin';
}
