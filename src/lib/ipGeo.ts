export interface IpGeoLocationResult {
  ip: string;
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
  isp: string;
  address: string;
  detectedAt: number;
  isFallback?: boolean;
}

const SESSION_CACHE_KEY = 'acash_ip_geo_cache_v1';
const CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readCachedIpGeo(): IpGeoLocationResult | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IpGeoLocationResult;
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      Date.now() - (parsed.detectedAt || 0) < CACHE_TTL_MS
    ) {
      return parsed;
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

function writeCachedIpGeo(result: IpGeoLocationResult): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(result));
  } catch {
    // Ignore storage write errors
  }
}

export async function detectIpGeolocation(forceRefresh = false): Promise<IpGeoLocationResult> {
  if (!forceRefresh) {
    const cached = readCachedIpGeo();
    if (cached) return cached;
  }

  // Provider 1: ipwho.is (HTTPS, CORS enabled, no key required)
  const p1 = await fetchJsonWithTimeout('https://ipwho.is/', 3500);
  if (p1 && p1.success !== false && typeof p1.latitude === 'number' && typeof p1.longitude === 'number') {
    const city = String(p1.city || 'Dhaka');
    const region = String(p1.region || p1.city || 'Dhaka Division');
    const country = String(p1.country || 'Bangladesh');
    const conn = p1.connection && typeof p1.connection === 'object' ? (p1.connection as Record<string, unknown>) : {};
    const isp = String(conn.isp || conn.org || 'Broadband / Mobile ISP');
    const res: IpGeoLocationResult = {
      ip: String(p1.ip || 'Detected IP'),
      lat: Number(p1.latitude),
      lng: Number(p1.longitude),
      city,
      region,
      country,
      isp,
      address: `${region}, ${city}, ${country} (IP Auto-Detected)`,
      detectedAt: Date.now(),
    };
    writeCachedIpGeo(res);
    return res;
  }

  // Provider 2: ipapi.co
  const p2 = await fetchJsonWithTimeout('https://ipapi.co/json/', 3500);
  if (p2 && typeof p2.latitude === 'number' && typeof p2.longitude === 'number') {
    const city = String(p2.city || 'Dhaka');
    const region = String(p2.region || p2.city || 'Dhaka');
    const country = String(p2.country_name || p2.country || 'Bangladesh');
    const isp = String(p2.org || 'Internet Service Provider');
    const res: IpGeoLocationResult = {
      ip: String(p2.ip || 'Detected IP'),
      lat: Number(p2.latitude),
      lng: Number(p2.longitude),
      city,
      region,
      country,
      isp,
      address: `${region}, ${city}, ${country} (IP Auto-Detected)`,
      detectedAt: Date.now(),
    };
    writeCachedIpGeo(res);
    return res;
  }

  // Provider 3: freeipapi.com
  const p3 = await fetchJsonWithTimeout('https://freeipapi.com/api/json', 3500);
  if (p3 && typeof p3.latitude === 'number' && typeof p3.longitude === 'number') {
    const city = String(p3.cityName || 'Dhaka');
    const region = String(p3.regionName || city || 'Dhaka');
    const country = String(p3.countryName || 'Bangladesh');
    const res: IpGeoLocationResult = {
      ip: String(p3.ipAddress || 'Detected IP'),
      lat: Number(p3.latitude),
      lng: Number(p3.longitude),
      city,
      region,
      country,
      isp: String(p3.asnOrganization || 'Public Network'),
      address: `${region}, ${city}, ${country} (IP Auto-Detected)`,
      detectedAt: Date.now(),
    };
    writeCachedIpGeo(res);
    return res;
  }

  // Resilient Dhaka Central fallback when running offline/isolated sandbox without external network access
  const fallback: IpGeoLocationResult = {
    ip: '103.0.0.1 (Local Network)',
    lat: 23.7808 + (Math.random() - 0.5) * 0.012,
    lng: 90.4071 + (Math.random() - 0.5) * 0.012,
    city: 'Dhaka',
    region: 'Gulshan / Motijheel',
    country: 'Bangladesh',
    isp: 'Acash Network Gateway',
    address: 'Dhaka Central Network Node (IP Fallback)',
    detectedAt: Date.now(),
    isFallback: true,
  };
  writeCachedIpGeo(fallback);
  return fallback;
}
