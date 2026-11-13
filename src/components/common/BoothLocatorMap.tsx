import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Search,
  Clock,
  Phone,
  Headphones,
  Briefcase,
  Store,
  Shield,
  CheckCircle2,
  Copy,
  X,
  ArrowUpRight,
  Crosshair,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { AcashBooth, AcashMapLocation, Language } from '../../types/acash';

type DirectoryFilter = 'all' | 'agent' | 'merchant' | 'support_admin' | 'open_only';
type TileLayerMode = 'street' | 'clean' | 'satellite';

const TILE_URLS: Record<TileLayerMode, { url: string; attribution: string }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  clean: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri World Imagery',
  },
};

export interface UnifiedMapEntry {
  uid: string;
  source: 'creator' | 'booth';
  category: 'agent' | 'merchant' | 'second_admin' | 'agent_booth' | 'support_booth';
  name: string;
  businessName?: string;
  creatorId: string; // e.g. A-200001, M-300001, ADM-200001, BTH-AGT-01
  phone: string;
  profilePhotoUrl?: string;
  area: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  status: 'open' | 'busy' | 'closed';
  hours?: string;
  services: string[];
  queueWaitMinutes?: number;
  cashLiquidityLevel?: string;
  agentAccountId?: string;
  updatedAt: number;
  distanceKm: number | null;
}

interface BoothLocatorMapProps {
  booths: AcashBooth[];
  creatorLocations?: AcashMapLocation[];
  lang: Language;
  onSelectAgentForCashOut?: (agentAccountId: string, label: string) => void;
  onSelectMerchantForPay?: (merchantAccountId: string, label: string) => void;
  initialFilter?: DirectoryFilter;
  embedded?: boolean;
}

interface BoothLocatorModalProps extends BoothLocatorMapProps {
  onClose: () => void;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCategoryAccent(cat: UnifiedMapEntry['category'], status: UnifiedMapEntry['status']): string {
  if (status === 'closed') return '#64748B';
  switch (cat) {
    case 'agent':
    case 'agent_booth':
      return '#10B981'; // Emerald
    case 'merchant':
      return '#D946EF'; // Fuchsia
    case 'second_admin':
      return '#F59E0B'; // Amber
    case 'support_booth':
    default:
      return '#38BDF8'; // Sky
  }
}

function getCategoryShortBadge(cat: UnifiedMapEntry['category']): string {
  switch (cat) {
    case 'agent':
      return 'AG';
    case 'merchant':
      return 'MC';
    case 'second_admin':
      return '2A';
    case 'agent_booth':
      return 'AB';
    case 'support_booth':
      return 'CS';
  }
}

function getCategoryLabel(cat: UnifiedMapEntry['category'], lang: Language): string {
  if (lang === 'bn') {
    switch (cat) {
      case 'agent':
        return 'এজেন্ট (প্রোফাইল পিন)';
      case 'merchant':
        return 'মার্চেন্ট (প্রোফাইল পিন)';
      case 'second_admin':
        return '২য় এডমিন ডেস্ক';
      case 'agent_booth':
        return 'অফিশিয়াল এজেন্ট বুথ';
      case 'support_booth':
        return 'কাস্টমার সাপোর্ট বুথ';
    }
  }
  switch (cat) {
    case 'agent':
      return 'Agent Live Location';
    case 'merchant':
      return 'Merchant Live Location';
    case 'second_admin':
      return '2nd Admin Desk';
    case 'agent_booth':
      return 'Agent Booth';
    case 'support_booth':
      return 'Customer Support Booth';
  }
}

function buildEntryMarkerIcon(entry: UnifiedMapEntry, isSelected: boolean): L.DivIcon {
  const accent = getCategoryAccent(entry.category, entry.status);
  const badge = getCategoryShortBadge(entry.category);
  const size = isSelected ? 48 : 38;
  const imgSize = isSelected ? 40 : 30;
  const initials = escapeHtml(
    entry.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('') || badge
  );

  const avatarHtml = entry.profilePhotoUrl
    ? `<img src="${escapeHtml(entry.profilePhotoUrl)}" alt="" style="width:${imgSize}px;height:${imgSize}px;border-radius:9999px;object-fit:cover;display:block;" />`
    : `<div style="width:${imgSize}px;height:${imgSize}px;border-radius:9999px;background:#0F172A;color:#FFFFFF;font-weight:700;font-size:${isSelected ? 13 : 11}px;display:flex;align-items:center;justify-content:center;">${initials}</div>`;

  return L.divIcon({
    className: 'acash-live-marker',
    iconSize: [size, size + 14],
    iconAnchor: [size / 2, size + 10],
    popupAnchor: [0, -(size + 6)],
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 10px rgba(15,23,42,0.28));transform:${isSelected ? 'scale(1.06)' : 'scale(1)'};">
        <div style="padding:2.5px;border-radius:9999px;background:${accent};border:2px solid #FFFFFF;box-shadow:${isSelected ? `0 0 0 3px ${accent}44` : 'none'};">
          ${avatarHtml}
        </div>
        <span style="position:absolute;top:-4px;right:-6px;background:#0F172A;color:#FFFFFF;border:1.5px solid ${accent};font-size:9px;font-weight:700;padding:1px 4px;border-radius:9999px;line-height:1.1;">
          ${badge}
        </span>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${accent};margin-top:-2px;"></div>
      </div>
    `,
  });
}

export const BoothLocatorMap: React.FC<BoothLocatorMapProps> = ({
  booths,
  creatorLocations = [],
  lang,
  onSelectAgentForCashOut,
  onSelectMerchantForPay,
  initialFilter = 'all',
  embedded = false,
}) => {
  const [filter, setFilter] = useState<DirectoryFilter>(initialFilter);
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [tileMode, setTileMode] = useState<TileLayerMode>('street');
  const [selectedUid, setSelectedUid] = useState<string>('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const allEntries = useMemo<UnifiedMapEntry[]>(() => {
    const creatorItems: UnifiedMapEntry[] = creatorLocations
      .filter((loc) => loc.isVisible)
      .map((loc) => ({
        uid: `CREATOR:${loc.creatorId}`,
        source: 'creator',
        category: loc.creatorRole,
        name: loc.name,
        businessName: loc.businessName,
        creatorId: loc.creatorId,
        phone: loc.phone,
        profilePhotoUrl: loc.profilePhotoUrl,
        area: loc.area,
        city: loc.city,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
        status: 'open',
        hours: 'Live Creator Profile Pin',
        services:
          loc.creatorRole === 'agent'
            ? ['Cash-In', 'Cash-Out', 'Verified Agent']
            : loc.creatorRole === 'merchant'
              ? ['Merchant Payment', 'Store Checkout', 'QR Pay']
              : ['2nd Admin Help', 'Verification Desk', 'Regional Support'],
        agentAccountId: loc.creatorRole === 'agent' ? loc.creatorId : undefined,
        updatedAt: loc.updatedAt,
        distanceKm: userCoords ? haversineKm(userCoords.lat, userCoords.lng, loc.lat, loc.lng) : null,
      }));

    const boothItems: UnifiedMapEntry[] = booths.map((b) => ({
      uid: `BOOTH:${b.boothId}`,
      source: 'booth',
      category: b.boothType,
      name: b.name,
      creatorId: b.agentAccountId || b.boothId,
      phone: b.phone,
      area: b.area,
      city: b.city,
      address: b.address,
      lat: b.lat,
      lng: b.lng,
      status: b.status,
      hours: b.hours,
      services: b.services,
      queueWaitMinutes: b.queueWaitMinutes,
      cashLiquidityLevel: b.cashLiquidityLevel,
      agentAccountId: b.agentAccountId,
      updatedAt: b.updatedAt,
      distanceKm: userCoords ? haversineKm(userCoords.lat, userCoords.lng, b.lat, b.lng) : null,
    }));

    return [...creatorItems, ...boothItems];
  }, [creatorLocations, booths, userCoords]);

  const filteredEntries = useMemo<UnifiedMapEntry[]>(() => {
    const q = search.trim().toLowerCase();
    const list = allEntries.filter((entry) => {
      if (openOnly && entry.status === 'closed') return false;
      if (filter === 'agent' && entry.category !== 'agent' && entry.category !== 'agent_booth') {
        return false;
      }
      if (filter === 'merchant' && entry.category !== 'merchant') {
        return false;
      }
      if (
        filter === 'support_admin' &&
        entry.category !== 'second_admin' &&
        entry.category !== 'support_booth'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        (entry.businessName || '').toLowerCase().includes(q) ||
        entry.creatorId.toLowerCase().includes(q) ||
        entry.phone.toLowerCase().includes(q) ||
        entry.area.toLowerCase().includes(q) ||
        entry.city.toLowerCase().includes(q) ||
        entry.address.toLowerCase().includes(q)
      );
    });

    if (userCoords) {
      list.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    }
    return list;
  }, [allEntries, filter, openOnly, search, userCoords]);

  const selectedEntry = useMemo<UnifiedMapEntry | null>(() => {
    return (
      filteredEntries.find((e) => e.uid === selectedUid) ||
      allEntries.find((e) => e.uid === selectedUid) ||
      filteredEntries[0] ||
      null
    );
  }, [filteredEntries, allEntries, selectedUid]);

  const counts = useMemo(() => {
    return {
      total: allEntries.length,
      agents: allEntries.filter((e) => e.category === 'agent' || e.category === 'agent_booth').length,
      merchants: allEntries.filter((e) => e.category === 'merchant').length,
      supportAdmin: allEntries.filter(
        (e) => e.category === 'second_admin' || e.category === 'support_booth'
      ).length,
    };
  }, [allEntries]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.777, 90.399],
      zoom: 12,
      zoomControl: true,
    });

    const cfg = TILE_URLS[tileMode];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch tile layers cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      tileLayerRef.current.removeFrom(map);
    }
    const cfg = TILE_URLS[tileMode];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [tileMode]);

  // Render markers on Leaflet layer
  useEffect(() => {
    const layerGroup = markersLayerRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();

    if (userCoords) {
      L.circleMarker([userCoords.lat, userCoords.lng], {
        radius: 9,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: '#3B82F6',
        fillOpacity: 1,
      })
        .bindPopup('<div style="font-size:12px;font-weight:700;">Your Live GPS Location</div>')
        .addTo(layerGroup);
    }

    for (const entry of filteredEntries) {
      const isSelected = selectedEntry?.uid === entry.uid;
      const marker = L.marker([entry.lat, entry.lng], {
        icon: buildEntryMarkerIcon(entry, isSelected),
        zIndexOffset: isSelected ? 500 : 0,
      });

      const avatarImg = entry.profilePhotoUrl
        ? `<img src="${escapeHtml(entry.profilePhotoUrl)}" alt="" style="width:36px;height:36px;border-radius:10px;object-fit:cover;border:1px solid rgba(99,102,241,0.35);" />`
        : `<div style="width:36px;height:36px;border-radius:10px;background:#4F46E5;color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;">${escapeHtml(getCategoryShortBadge(entry.category))}</div>`;

      const popupHtml = `
        <div class="acash-popup-card" style="min-width:210px;font-family:Inter,sans-serif;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            ${avatarImg}
            <div>
              <div class="acash-popup-title" style="font-size:12px;font-weight:700;">${escapeHtml(entry.businessName || entry.name)}</div>
              <div class="acash-popup-sub" style="font-size:11px;">${escapeHtml(entry.name)}</div>
            </div>
          </div>
          <div style="font-size:11px;color:#6366F1;font-weight:700;margin-bottom:4px;">
            ${escapeHtml(getCategoryLabel(entry.category, lang))}
          </div>
          <div class="acash-popup-sub" style="font-size:11px;font-family:monospace;">
            ID: ${escapeHtml(entry.creatorId)} · ${escapeHtml(entry.phone)}
          </div>
          <div class="acash-popup-muted" style="font-size:11px;margin-top:4px;">
            ${escapeHtml(entry.address)}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        setSelectedUid(entry.uid);
      });
      marker.addTo(layerGroup);
    }
  }, [filteredEntries, selectedEntry, userCoords, lang]);

  const handleSelectEntry = (entry: UnifiedMapEntry) => {
    setSelectedUid(entry.uid);
    if (mapRef.current) {
      mapRef.current.flyTo([entry.lat, entry.lng], 15, { duration: 0.65 });
    }
  };

  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const fallback = { lat: 23.7561, lng: 90.3755 };
      setUserCoords(fallback);
      mapRef.current?.flyTo([fallback.lat, fallback.lng], 14, { duration: 0.65 });
      setGpsStatus(
        lang === 'bn'
          ? 'জিপিএস অনুপলব্ধ — ঢাকা কেন্দ্রীয় অবস্থান দেখানো হচ্ছে।'
          : 'GPS unavailable — centered on Central Dhaka (Dhanmondi).'
      );
      return;
    }
    setGpsStatus(lang === 'bn' ? 'অবস্থান নির্ণয় করা হচ্ছে...' : 'Detecting your GPS location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        mapRef.current?.flyTo([coords.lat, coords.lng], 14, { duration: 0.7 });
        setGpsStatus(
          lang === 'bn'
            ? `জিপিএস সংযুক্ত (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
            : `GPS active (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) — sorted by nearest`
        );
      },
      () => {
        const fallback = { lat: 23.7561, lng: 90.3755 };
        setUserCoords(fallback);
        mapRef.current?.flyTo([fallback.lat, fallback.lng], 13, { duration: 0.65 });
        setGpsStatus(
          lang === 'bn'
            ? 'লোকেশন অনুমতি মেলেনি — কেন্দ্রীয় ঢাকা থেকে দূরত্ব দেখানো হচ্ছে।'
            : 'Location permission declined — showing distances from Central Dhaka.'
        );
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleCopyEntry = (entry: UnifiedMapEntry) => {
    const text = `${entry.businessName || entry.name} (${entry.name})\nRole: ${getCategoryLabel(entry.category, 'en')}\nCreator ID: ${entry.creatorId}\nPhone: ${entry.phone}\nAddress: ${entry.address}\nGPS: ${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(entry.uid);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              filter === 'all'
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'bn' ? `সব (${counts.total})` : `All (${counts.total})`}
          </button>

          <button
            type="button"
            onClick={() => setFilter('agent')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
              filter === 'agent'
                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              {lang === 'bn' ? `এজেন্ট (${counts.agents})` : `Agents & Booths (${counts.agents})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('merchant')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
              filter === 'merchant'
                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>
              {lang === 'bn' ? `মার্চেন্ট (${counts.merchants})` : `Merchants (${counts.merchants})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('support_admin')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
              filter === 'support_admin'
                ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>
              {lang === 'bn'
                ? `২য় এডমিন ও সাপোর্ট (${counts.supportAdmin})`
                : `2nd Admin & Support (${counts.supportAdmin})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setOpenOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              openOnly
                ? 'bg-sky-50 dark:bg-sky-500/15 border-sky-500/50 text-sky-700 dark:text-sky-300'
                : 'bg-slate-50 dark:bg-[#0B0D14] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'bn' ? 'শুধু খোলা' : 'Open Now'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === 'bn'
                  ? 'নাম, নম্বর, এলাকা বা আইডি খুঁজুন...'
                  : 'Search name, number, ID, area...'
              }
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={handleLocateMe}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
            <span>{lang === 'bn' ? 'আমার লোকেশন' : 'Locate Me'}</span>
          </button>
        </div>
      </div>

      {gpsStatus && (
        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 px-3.5 py-2 text-xs text-indigo-700 dark:text-indigo-200 flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>{gpsStatus}</span>
        </div>
      )}

      {/* Split Live Map + Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="relative rounded-2xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-none">
            {/* Tile Mode Switcher */}
            <div className="absolute top-3 right-3 z-[500] flex items-center gap-1 bg-white/90 dark:bg-[#121622]/90 backdrop-blur-md p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ml-1.5 mr-0.5" />
              {(['street', 'clean', 'satellite'] as TileLayerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTileMode(mode)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold capitalize transition-colors ${
                    tileMode === mode
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Real Interactive Leaflet Map */}
            <div ref={mapContainerRef} className="w-full h-[340px] sm:h-[420px]" />

            {/* Legend */}
            <div className="px-4 py-2.5 bg-white dark:bg-[#121622] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-3.5">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span>Agent</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
                  <span>Merchant</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  <span>2nd Admin</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                  <span>Support Booth</span>
                </span>
              </div>
              <span className="text-slate-500 dark:text-slate-400">OpenStreetMap · Live Pins</span>
            </div>
          </div>

          {/* Selected Location Detail Card (Name, Pic, Creator Number, Address, Actions) */}
          {selectedEntry && (
            <div className="rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3 shadow-sm dark:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  {selectedEntry.profilePhotoUrl ? (
                    <img
                      src={selectedEntry.profilePhotoUrl}
                      alt={selectedEntry.name}
                      className="w-14 h-14 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center shrink-0 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      {getCategoryShortBadge(selectedEntry.category)}
                    </div>
                  )}

                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                          selectedEntry.category === 'agent' ||
                          selectedEntry.category === 'agent_booth'
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                            : selectedEntry.category === 'merchant'
                              ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
                              : selectedEntry.category === 'second_admin'
                                ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                                : 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30'
                        }`}
                      >
                        {getCategoryLabel(selectedEntry.category, lang)}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-indigo-700 dark:text-indigo-300 font-bold bg-slate-50 dark:bg-[#0B0D14] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                        {selectedEntry.creatorId}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {selectedEntry.businessName || selectedEntry.name}
                    </h3>
                    {selectedEntry.businessName && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                        Creator: {selectedEntry.name}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedEntry.address}</p>
                  </div>
                </div>

                {selectedEntry.distanceKm !== null && (
                  <div className="text-right shrink-0">
                    <div className="font-mono-tabular text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedEntry.distanceKm.toFixed(1)} km
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">away</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>{lang === 'bn' ? 'ক্রিয়েটর নম্বর' : 'Creator Number'}</span>
                  </div>
                  <div className="font-mono-tabular text-slate-900 dark:text-slate-100 font-bold mt-0.5">
                    {selectedEntry.phone}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>Area / City</span>
                  </div>
                  <div className="text-slate-900 dark:text-slate-100 font-medium mt-0.5 truncate">
                    {selectedEntry.area}, {selectedEntry.city}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">GPS Coordinates</div>
                  <div className="font-mono-tabular text-slate-900 dark:text-slate-100 font-medium mt-0.5">
                    {selectedEntry.lat.toFixed(4)}, {selectedEntry.lng.toFixed(4)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedEntry.services.map((srv) => (
                    <span
                      key={srv}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300"
                    >
                      {srv}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`https://www.google.com/maps?q=${selectedEntry.lat},${selectedEntry.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-indigo-700 dark:text-sky-300 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Directions</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopyEntry(selectedEntry)}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                  >
                    {copiedKey === selectedEntry.uid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    )}
                    <span>
                      {copiedKey === selectedEntry.uid
                        ? lang === 'bn'
                          ? 'কপি হয়েছে!'
                          : 'Copied!'
                        : lang === 'bn'
                          ? 'নম্বর ও ঠিকানা কপি'
                          : 'Copy Info'}
                    </span>
                  </button>

                  {(selectedEntry.category === 'agent' || selectedEntry.category === 'agent_booth') &&
                    (selectedEntry.agentAccountId || selectedEntry.creatorId.startsWith('A-')) &&
                    onSelectAgentForCashOut && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectAgentForCashOut(
                            selectedEntry.agentAccountId || selectedEntry.creatorId,
                            selectedEntry.businessName || selectedEntry.name
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'ক্যাশ-আউট করুন' : 'Cash Out Here'}</span>
                      </button>
                    )}

                  {selectedEntry.category === 'merchant' && onSelectMerchantForPay && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectMerchantForPay(
                          selectedEntry.creatorId,
                          selectedEntry.businessName || selectedEntry.name
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{lang === 'bn' ? 'পেমেন্ট করুন' : 'Pay Merchant'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Directory List with Name, Pic & Creator Number */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden max-h-[640px] shadow-sm dark:shadow-none">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#0E121D]">
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>
                {lang === 'bn'
                  ? `লাইভ লোকেশন তালিকা (${filteredEntries.length})`
                  : `Live Map Directory (${filteredEntries.length})`}
              </span>
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {embedded ? 'Live Synced' : 'Click pin or card'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'আপনার অনুসন্ধানের সাথে কোনো লোকেশন পাওয়া যায়নি।'
                  : 'No pinned locations match your filters.'}
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = selectedEntry?.uid === entry.uid;
                return (
                  <button
                    key={entry.uid}
                    type="button"
                    onClick={() => handleSelectEntry(entry)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {entry.profilePhotoUrl ? (
                        <img
                          src={entry.profilePhotoUrl}
                          alt={entry.name}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 mt-0.5"
                        />
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                            entry.category === 'agent' || entry.category === 'agent_booth'
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                              : entry.category === 'merchant'
                                ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
                                : entry.category === 'second_admin'
                                  ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                                  : 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30'
                          }`}
                        >
                          {entry.category === 'agent' || entry.category === 'agent_booth' ? (
                            <Briefcase className="w-4 h-4" />
                          ) : entry.category === 'merchant' ? (
                            <Store className="w-4 h-4" />
                          ) : entry.category === 'second_admin' ? (
                            <Shield className="w-4 h-4" />
                          ) : (
                            <Headphones className="w-4 h-4" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {entry.businessName || entry.name}
                          </div>
                          {entry.distanceKm !== null && (
                            <span className="font-mono-tabular text-[10px] text-indigo-600 dark:text-sky-300 shrink-0 font-semibold">
                              {entry.distanceKm.toFixed(1)} km
                            </span>
                          )}
                        </div>

                        {entry.businessName && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                            {entry.name}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {entry.area}, {entry.city}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              entry.category === 'agent' || entry.category === 'agent_booth'
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : entry.category === 'merchant'
                                  ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                                  : entry.category === 'second_admin'
                                    ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            }`}
                          >
                            {entry.category === 'agent'
                              ? 'AGENT'
                              : entry.category === 'merchant'
                                ? 'MERCHANT'
                                : entry.category === 'second_admin'
                                  ? '2ND ADMIN'
                                  : entry.category === 'agent_booth'
                                    ? 'AGENT BOOTH'
                                    : 'SUPPORT'}
                          </span>
                          <span className="font-mono-tabular text-[10px] text-slate-700 dark:text-slate-300 font-medium">
                            {entry.creatorId}
                          </span>
                          <span className="font-mono-tabular text-[10px] text-emerald-700 dark:text-emerald-300">
                            {entry.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const BoothLocatorModal: React.FC<BoothLocatorModalProps> = ({
  onClose,
  ...props
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-6xl rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-[#0E121D]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {props.lang === 'bn'
                  ? 'আক্যাশ লাইভ ম্যাপ (এজেন্ট, মার্চেন্ট, ২য় এডমিন ও বুথ)'
                  : 'Acash Live Map (Agents, Merchants, 2nd Admins & Booths)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {props.lang === 'bn'
                  ? 'নাম, ছবি ও ক্রিয়েটর নম্বরসহ কাছাকাছি এজেন্ট, মার্চেন্ট, ২য় এডমিন এবং কাস্টমার সাপোর্ট বুথ দেখুন।'
                  : 'Browse real map locations with creator name, profile photo, ID & phone number across Bangladesh.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Close map modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 max-h-[82vh] overflow-y-auto">
          <BoothLocatorMap {...props} />
        </div>
      </div>
    </div>
  );
};
