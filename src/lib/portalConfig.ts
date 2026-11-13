export type PortalMode = 'unified' | 'admin';
export type PortalEnvMode = 'auto' | 'unified' | 'admin';

export function getPortalEnvMode(): PortalEnvMode {
  const raw = (import.meta.env.VITE_PORTAL_MODE || 'auto').trim().toLowerCase();
  if (raw === 'unified') return 'unified';
  if (raw === 'admin') return 'admin';
  return 'auto';
}

export function isPortalLocked(): boolean {
  return getPortalEnvMode() !== 'auto';
}

export function getExternalAdminPortalUrl(): string {
  return (import.meta.env.VITE_ADMIN_PORTAL_URL || '').trim();
}

export function getExternalUserPortalUrl(): string {
  return (import.meta.env.VITE_USER_PORTAL_URL || '').trim();
}

export function detectInitialPortalMode(): PortalMode {
  const envMode = getPortalEnvMode();
  if (envMode === 'unified') return 'unified';
  if (envMode === 'admin') return 'admin';

  if (typeof window === 'undefined') return 'unified';
  if (window.__ACASH_PORTAL_ENTRY__ === 'admin') return 'admin';

  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  if (path.startsWith('/admin') || params.get('app') === 'admin') {
    return 'admin';
  }
  return 'unified';
}
