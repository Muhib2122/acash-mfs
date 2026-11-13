import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Crosshair,
  Globe2,
  MapPin,
  Search,
  Layers,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { CreatorMapRole, Language } from '../../types/acash';

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

const QUICK_AREAS = [
  { area: 'Dhanmondi', city: 'Dhaka', lat: 23.7516, lng: 90.3742 },
  { area: 'Gulshan-2', city: 'Dhaka', lat: 23.7949, lng: 90.4144 },
  { area: 'Motijheel', city: 'Dhaka', lat: 23.7285, lng: 90.4152 },
  { area: 'Mirpur-10', city: 'Dhaka', lat: 23.8069, lng: 90.3687 },
  { area: 'Uttara', city: 'Dhaka', lat: 23.8682, lng: 90.3996 },
  { area: 'Agrabad', city: 'Chattogram', lat: 22.3239, lng: 91.8124 },
];

export interface RealLocationValue {
  lat: number;
  lng: number;
  address: string;
  area: string;
  city: string;
  isVisible: boolean;
}

interface RealLocationPickerMapProps {
  creatorId: string;
  creatorRole: CreatorMapRole;
  creatorName: string;
  creatorPhone: string;
  profilePhotoUrl?: string;
  initialValue?: Partial<RealLocationValue>;
  lang: Language;
  saving?: boolean;
  onSave: (value: RealLocationValue) => Promise<void> | void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPickerMarkerIcon(
  role: CreatorMapRole,
  name: string,
  profilePhotoUrl?: string
): L.DivIcon {
  const accent =
    role === 'agent' ? '#10B981' : role === 'merchant' ? '#D946EF' : '#38BDF8';
  const initials = escapeHtml(
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('') || 'AC'
  );
  const inner = profilePhotoUrl
    ? `<img src="${escapeHtml(profilePhotoUrl)}" alt="" style="width:38px;height:38px;border-radius:9999px;object-fit:cover;display:block;" />`
    : `<div style="width:38px;height:38px;border-radius:9999px;background:#0F172A;color:#FFFFFF;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">${initials}</div>`;

  return L.divIcon({
    className: 'acash-picker-marker',
    iconSize: [46, 54],
    iconAnchor: [23, 50],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 10px rgba(15,23,42,0.28));">
        <div style="padding:2.5px;border-radius:9999px;background:${accent};border:2px solid #FFFFFF;">
          ${inner}
        </div>
        <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${accent};margin-top:-2px;"></div>
      </div>
    `,
  });
}

export const RealLocationPickerMap: React.FC<RealLocationPickerMapProps> = ({
  creatorId,
  creatorRole,
  creatorName,
  creatorPhone,
  profilePhotoUrl,
  initialValue,
  lang,
  saving = false,
  onSave,
}) => {
  const [lat, setLat] = useState<number>(initialValue?.lat ?? 23.7561);
  const [lng, setLng] = useState<number>(initialValue?.lng ?? 90.3755);
  const [address, setAddress] = useState<string>(initialValue?.address ?? '');
  const [area, setArea] = useState<string>(initialValue?.area ?? 'Dhaka');
  const [city, setCity] = useState<string>(initialValue?.city ?? 'Dhaka');
  const [isVisible, setIsVisible] = useState<boolean>(initialValue?.isVisible ?? true);
  const [tileMode, setTileMode] = useState<TileLayerMode>('street');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [statusHint, setStatusHint] = useState('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const reverseGeocode = async (nextLat: number, nextLng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${nextLat}&lon=${nextLng}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const addr = data?.address || {};
      const detectedArea =
        addr.suburb || addr.neighbourhood || addr.quarter || addr.road || addr.town || area;
      const detectedCity = addr.city || addr.state_district || addr.county || city;
      if (detectedArea) setArea(String(detectedArea));
      if (detectedCity) setCity(String(detectedCity).replace(/\s*District$/i, ''));
      if (data?.display_name) {
        setAddress(String(data.display_name).slice(0, 220));
      }
    } catch {
      // Keep manual or existing address if reverse geocode is unavailable
    }
  };

  const movePinTo = (nextLat: number, nextLng: number, fetchAddress = true) => {
    const cleanLat = Number(nextLat.toFixed(6));
    const cleanLng = Number(nextLng.toFixed(6));
    setLat(cleanLat);
    setLng(cleanLng);
    if (markerRef.current) {
      markerRef.current.setLatLng([cleanLat, cleanLng]);
    }
    if (mapRef.current) {
      mapRef.current.panTo([cleanLat, cleanLng], { animate: true });
    }
    if (fetchAddress) {
      void reverseGeocode(cleanLat, cleanLng);
    }
  };

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: true,
    });

    const initialTiles = TILE_URLS[tileMode];
    const layer = L.tileLayer(initialTiles.url, {
      attribution: initialTiles.attribution,
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = layer;

    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: buildPickerMarkerIcon(creatorRole, creatorName, profilePhotoUrl),
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      movePinTo(pos.lat, pos.lng, true);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      movePinTo(e.latlng.lat, e.latlng.lng, true);
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Ensure Leaflet measures container properly inside modals/tabs
    setTimeout(() => map.invalidateSize(), 180);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker icon when photo or name changes
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setIcon(buildPickerMarkerIcon(creatorRole, creatorName, profilePhotoUrl));
    }
  }, [creatorRole, creatorName, profilePhotoUrl]);

  // Switch tile layer
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

  const handleUseMyGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatusHint(
        lang === 'bn'
          ? 'জিপিএস পাওয়া যায়নি — ম্যাপে ক্লিক করে অবস্থান বাছাই করুন।'
          : 'GPS unavailable — click directly on the map to place your pin.'
      );
      return;
    }
    setStatusHint(lang === 'bn' ? 'রিয়েল জিপিএস অবস্থান নেওয়া হচ্ছে...' : 'Detecting real GPS location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        movePinTo(pos.coords.latitude, pos.coords.longitude, true);
        mapRef.current?.setZoom(16);
        setStatusHint(
          lang === 'bn'
            ? `জিপিএস পিন সেট হয়েছে (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
            : `GPS location pinned (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}). Drag pin to fine-tune.`
        );
      },
      () => {
        setStatusHint(
          lang === 'bn'
            ? 'জিপিএস অনুমতি মেলেনি — ম্যাপে ক্লিক বা ড্র্যাগ করে সঠিক স্থান দিন।'
            : 'Location permission declined — click directly on the map or drag the pin.'
        );
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleSearchPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setStatusHint('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
          `${q}, Bangladesh`
        )}`,
        { headers: { Accept: 'application/json' } }
      );
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        const hit = list[0];
        const nextLat = Number(hit.lat);
        const nextLng = Number(hit.lon);
        movePinTo(nextLat, nextLng, false);
        mapRef.current?.setZoom(15);
        setAddress(String(hit.display_name || q).slice(0, 220));
        setArea(q.split(',')[0].trim().slice(0, 80));
        setStatusHint(`Moved pin to ${hit.display_name?.split(',').slice(0, 2).join(',') || q}`);
      } else {
        setStatusHint('No matching place found — try clicking directly on the map.');
      }
    } catch {
      setStatusHint('Map search unavailable — click directly on the map or use quick area buttons.');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSave({
      lat,
      lng,
      address: address.trim() || `${area}, ${city}`,
      area: area.trim() || 'Dhaka',
      city: city.trim() || 'Dhaka',
      isVisible,
    });
  };

  const roleBadgeLabel =
    creatorRole === 'agent'
      ? 'Agent Pin'
      : creatorRole === 'merchant'
        ? 'Merchant Pin'
        : '2nd Admin Pin';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Live Public Map Card Preview */}
      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {profilePhotoUrl ? (
            <img
              src={profilePhotoUrl}
              alt={creatorName}
              className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {creatorName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">{creatorName}</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                {roleBadgeLabel}
              </span>
            </div>
            <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 mt-0.5">
              ID: {creatorId} · Phone: {creatorPhone}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsVisible((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
            isVisible
              ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{isVisible ? 'Visible on Public Map' : 'Hidden from Map'}</span>
        </button>
      </div>

      {/* Search Bar & GPS */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSearchPlace(e);
              }
            }}
            placeholder={
              lang === 'bn'
                ? 'এলাকা বা রাস্তার নাম লিখুন (যেমন: Banani, Dhaka)...'
                : 'Search street, area, or city (e.g. Banani, Dhaka)...'
            }
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          type="button"
          disabled={searching}
          onClick={handleSearchPlace}
          className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
        >
          {searching ? 'Searching...' : 'Find Place'}
        </button>
        <button
          type="button"
          onClick={handleUseMyGps}
          className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold text-indigo-700 dark:text-indigo-200 inline-flex items-center gap-1.5 transition-colors"
        >
          <Crosshair className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
          <span>{lang === 'bn' ? 'আমার রিয়েল জিপিএস' : 'Use My GPS'}</span>
        </button>
      </div>

      {/* Quick BD Hubs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Quick jump:</span>
        {QUICK_AREAS.map((preset) => (
          <button
            key={preset.area}
            type="button"
            onClick={() => {
              setArea(preset.area);
              setCity(preset.city);
              movePinTo(preset.lat, preset.lng, true);
              mapRef.current?.setZoom(15);
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {preset.area}
          </button>
        ))}
      </div>

      {/* Interactive Free Leaflet Map */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0B0D14]">
        <div className="absolute top-2.5 right-2.5 z-[500] flex items-center gap-1 bg-white/90 dark:bg-[#121622]/90 backdrop-blur-md p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
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

        <div ref={mapContainerRef} className="w-full h-[270px] sm:h-[310px]" />

        <div className="px-3.5 py-2 bg-white dark:bg-[#121622] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {lang === 'bn'
                ? 'ম্যাপে সরাসরি ক্লিক করুন অথবা পিন ড্র্যাগ করে রিয়েল লোকেশন সেট করুন'
                : 'Click anywhere on the map or drag your pin to set exact real location'}
            </span>
          </span>
          <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
      </div>

      {statusHint && (
        <div className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 text-xs text-indigo-700 dark:text-indigo-200 flex items-center gap-2">
          <Globe2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>{statusHint}</span>
        </div>
      )}

      {/* Address & Area Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
            Area / Thana
          </label>
          <input
            type="text"
            required
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. Dhanmondi"
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
            City
          </label>
          <input
            type="text"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Dhaka"
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
            Coordinates (Lat, Lng)
          </label>
          <input
            type="text"
            readOnly
            value={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
            className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs font-mono-tabular text-slate-600 dark:text-slate-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
          {lang === 'bn'
            ? 'পূর্ণ ঠিকানা (ম্যাপে প্রদর্শিত হবে)'
            : 'Full Address / Landmark (Shown to Users on Map)'}
        </label>
        <input
          type="text"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Shop / Counter / Office Address"
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>
          {saving
            ? 'Saving Location to Live Map...'
            : lang === 'bn'
              ? 'ম্যাপে রিয়েল লোকেশন সংরক্ষণ করুন'
              : 'Save Real Location Directly to Map'}
        </span>
      </button>
    </form>
  );
};
