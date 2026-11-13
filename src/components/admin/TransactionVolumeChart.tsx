import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { AcashTransaction, Language, ThemeMode } from '../../types/acash';
import { formatBdt } from '../../lib/i18n';

interface TransactionVolumeChartProps {
  transactions: AcashTransaction[];
  lang: Language;
  theme?: ThemeMode;
}

type Granularity = 'daily' | 'weekly';
type ChartMode = 'area' | 'bar';

interface VolumePoint {
  key: string;
  label: string;
  fullRange: string;
  settledVolume: number;
  pendingVolume: number;
  txCount: number;
  adminFees: number;
}

function startOfLocalDay(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalWeekMonday(ts: number): Date {
  const d = startOfLocalDay(ts);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function formatDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCompactBdtAxis(val: number): string {
  if (val >= 1_000_000) return `৳${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `৳${(val / 1_000).toFixed(val >= 10_000 ? 0 : 1)}k`;
  return `৳${val}`;
}

export const TransactionVolumeChart: React.FC<TransactionVolumeChartProps> = ({
  transactions,
  lang,
  theme = 'light',
}) => {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [chartMode, setChartMode] = useState<ChartMode>('area');
  const isDark = theme === 'dark';

  const gridStroke = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.28)';
  const axisTickColor = isDark ? '#94a3b8' : '#64748b';
  const axisLineStroke = isDark ? 'rgba(148, 163, 184, 0.22)' : '#e2e8f0';
  const settledStroke = isDark ? '#818cf8' : '#4f46e5';
  const settledBarFill = isDark ? '#6366f1' : '#4f46e5';
  const pendingStroke = isDark ? '#fbbf24' : '#d97706';
  const pendingBarFill = isDark ? '#f59e0b' : '#d97706';
  const cursorStroke = isDark ? 'rgba(129, 140, 248, 0.45)' : 'rgba(79, 70, 229, 0.35)';
  const cursorBarFill = isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(79, 70, 229, 0.08)';

  const chartData = useMemo<VolumePoint[]>(() => {
    const now = Date.now();
    const locale = lang === 'bn' ? 'bn-BD' : 'en-US';

    if (granularity === 'daily') {
      const DAYS = 14;
      const todayStart = startOfLocalDay(now);
      const buckets = new Map<string, VolumePoint>();
      const orderedKeys: string[] = [];

      for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setDate(todayStart.getDate() - i);
        const key = formatDayKey(d);
        const label =
          i === 0
            ? lang === 'bn'
              ? 'আজ'
              : 'Today'
            : d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        const fullRange = d.toLocaleDateString(locale, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        orderedKeys.push(key);
        buckets.set(key, {
          key,
          label,
          fullRange,
          settledVolume: 0,
          pendingVolume: 0,
          txCount: 0,
          adminFees: 0,
        });
      }

      for (const tx of transactions) {
        if (tx.status === 'rejected' || tx.status === 'refunded') continue;
        const key = formatDayKey(startOfLocalDay(tx.createdAt));
        const bucket = buckets.get(key);
        if (!bucket) continue;

        if (tx.status === 'pending_admin_approval') {
          bucket.pendingVolume += tx.amount;
          bucket.txCount += 1;
        } else {
          bucket.settledVolume += tx.amount;
          bucket.txCount += 1;
          bucket.adminFees += tx.feeBreakdown?.adminAmount || 0;
        }
      }

      return orderedKeys.map((k) => {
        const b = buckets.get(k)!;
        return {
          ...b,
          settledVolume: Number(b.settledVolume.toFixed(2)),
          pendingVolume: Number(b.pendingVolume.toFixed(2)),
          adminFees: Number(b.adminFees.toFixed(2)),
        };
      });
    }

    // Weekly granularity: Last 8 calendar weeks (Monday-based)
    const WEEKS = 8;
    const thisWeekStart = startOfLocalWeekMonday(now);
    const buckets = new Map<string, VolumePoint>();
    const orderedKeys: string[] = [];

    for (let i = WEEKS - 1; i >= 0; i--) {
      const wStart = new Date(thisWeekStart);
      wStart.setDate(thisWeekStart.getDate() - i * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);

      const key = formatDayKey(wStart);
      const shortStart = wStart.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      const shortEnd = wEnd.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

      const label = i === 0 ? (lang === 'bn' ? 'এই সপ্তাহ' : 'This Wk') : shortStart;
      const fullRange = `${shortStart} – ${shortEnd}`;

      orderedKeys.push(key);
      buckets.set(key, {
        key,
        label,
        fullRange,
        settledVolume: 0,
        pendingVolume: 0,
        txCount: 0,
        adminFees: 0,
      });
    }

    for (const tx of transactions) {
      if (tx.status === 'rejected' || tx.status === 'refunded') continue;
      const key = formatDayKey(startOfLocalWeekMonday(tx.createdAt));
      const bucket = buckets.get(key);
      if (!bucket) continue;

      if (tx.status === 'pending_admin_approval') {
        bucket.pendingVolume += tx.amount;
        bucket.txCount += 1;
      } else {
        bucket.settledVolume += tx.amount;
        bucket.txCount += 1;
        bucket.adminFees += tx.feeBreakdown?.adminAmount || 0;
      }
    }

    return orderedKeys.map((k) => {
      const b = buckets.get(k)!;
      return {
        ...b,
        settledVolume: Number(b.settledVolume.toFixed(2)),
        pendingVolume: Number(b.pendingVolume.toFixed(2)),
        adminFees: Number(b.adminFees.toFixed(2)),
      };
    });
  }, [transactions, granularity, lang]);

  const summary = useMemo(() => {
    const totalSettled = chartData.reduce((s, p) => s + p.settledVolume, 0);
    const totalPending = chartData.reduce((s, p) => s + p.pendingVolume, 0);
    const totalCount = chartData.reduce((s, p) => s + p.txCount, 0);
    const peakPoint = chartData.reduce<VolumePoint | null>(
      (best, cur) =>
        !best || cur.settledVolume + cur.pendingVolume > best.settledVolume + best.pendingVolume
          ? cur
          : best,
      null
    );
    return { totalSettled, totalPending, totalCount, peakPoint };
  }, [chartData]);

  return (
    <div className="rounded-3xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'রিয়েল-টাইম লেনদেনের ভলিউম'
                : 'Real-Time Transaction Volume'}
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              LIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {granularity === 'daily'
              ? lang === 'bn'
                ? 'গত ১৪ দিনের দৈনিক প্ল্যাটফর্ম কার্যকলাপ ও লেনদেনের প্রবণতা'
                : 'Daily settled & pending AML platform activity across the last 14 days'
              : lang === 'bn'
                ? 'গত ৮ সপ্তাহের সাপ্তাহিক প্ল্যাটফর্ম লেনদেনের প্রবণতা'
                : 'Weekly settled & pending AML platform activity across the last 8 weeks'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Daily / Weekly Granularity Switch */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setGranularity('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                granularity === 'daily'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'bn' ? 'দৈনিক (১৪ দিন)' : 'Daily (14D)'}
            </button>
            <button
              type="button"
              onClick={() => setGranularity('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                granularity === 'weekly'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'bn' ? 'সাপ্তাহিক (৮ সপ্তাহ)' : 'Weekly (8W)'}
            </button>
          </div>

          {/* Area / Bar Mode Switch */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setChartMode('area')}
              title="Area Trend View"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                chartMode === 'area'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Area</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('bar')}
              title="Bar Comparison View"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                chartMode === 'bar'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Bar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Period Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {granularity === 'daily' ? '14-Day Settled Volume' : '8-Week Settled Volume'}
          </div>
          <div className="font-mono-tabular text-base font-bold text-slate-900 dark:text-white mt-0.5">
            {formatBdt(summary.totalSettled, lang)}
          </div>
          {summary.totalPending > 0 && (
            <div className="text-[11px] text-amber-600 dark:text-amber-300 mt-0.5 font-mono-tabular">
              + {formatBdt(summary.totalPending, lang)} pending AML
            </div>
          )}
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {granularity === 'daily' ? '14-Day Transactions' : '8-Week Transactions'}
          </div>
          <div className="font-mono-tabular text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {summary.totalCount} txns
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Excludes rejected & refunded
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0D14] border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {granularity === 'daily' ? 'Peak Day' : 'Peak Week'}
          </div>
          <div className="font-mono-tabular text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {summary.peakPoint
              ? formatBdt(summary.peakPoint.settledVolume + summary.peakPoint.pendingVolume, lang)
              : formatBdt(0, lang)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {summary.peakPoint ? summary.peakPoint.fullRange : 'No activity yet'}
          </div>
        </div>
      </div>

      {/* Recharts Container */}
      <div className="w-full h-[280px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'area' ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="acashSettledGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={settledStroke} stopOpacity={isDark ? 0.45 : 0.28} />
                  <stop offset="65%" stopColor={settledStroke} stopOpacity={isDark ? 0.12 : 0.08} />
                  <stop offset="95%" stopColor={settledStroke} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="acashPendingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pendingStroke} stopOpacity={isDark ? 0.4 : 0.25} />
                  <stop offset="95%" stopColor={pendingStroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={axisTickColor}
                tick={{ fill: axisTickColor }}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: axisLineStroke }}
              />
              <YAxis
                stroke={axisTickColor}
                tick={{ fill: axisTickColor }}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactBdtAxis}
                width={64}
              />
              <Tooltip
                cursor={{ stroke: cursorStroke, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0].payload as VolumePoint;
                  return (
                    <div className="rounded-2xl bg-white/95 dark:bg-[#121622]/95 border border-slate-200 dark:border-slate-700 p-3.5 shadow-xl text-xs space-y-1.5 min-w-[200px]">
                      <div className="font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1.5">
                        {point.fullRange}
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-indigo-600 dark:text-indigo-400">Settled Volume:</span>
                        <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                          {formatBdt(point.settledVolume, lang)}
                        </span>
                      </div>
                      {point.pendingVolume > 0 && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-amber-600 dark:text-amber-300">Pending AML:</span>
                          <span className="font-mono-tabular font-bold text-amber-700 dark:text-amber-200">
                            {formatBdt(point.pendingVolume, lang)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400">Transactions:</span>
                        <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-200">
                          {point.txCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-emerald-600 dark:text-emerald-400">Admin Revenue:</span>
                        <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-300">
                          {formatBdt(point.adminFees, lang)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="settledVolume"
                name="Settled Volume"
                stroke={settledStroke}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#acashSettledGrad)"
                activeDot={{ r: 5, fill: settledStroke, stroke: '#ffffff', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="pendingVolume"
                name="Pending AML"
                stroke={pendingStroke}
                strokeWidth={1.75}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#acashPendingGrad)"
              />
            </AreaChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={axisTickColor}
                tick={{ fill: axisTickColor }}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: axisLineStroke }}
              />
              <YAxis
                stroke={axisTickColor}
                tick={{ fill: axisTickColor }}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactBdtAxis}
                width={64}
              />
              <Tooltip
                cursor={{ fill: cursorBarFill }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0].payload as VolumePoint;
                  return (
                    <div className="rounded-2xl bg-white/95 dark:bg-[#121622]/95 border border-slate-200 dark:border-slate-700 p-3.5 shadow-xl text-xs space-y-1.5 min-w-[200px]">
                      <div className="font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1.5">
                        {point.fullRange}
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-indigo-600 dark:text-indigo-400">Settled Volume:</span>
                        <span className="font-mono-tabular font-bold text-slate-900 dark:text-white">
                          {formatBdt(point.settledVolume, lang)}
                        </span>
                      </div>
                      {point.pendingVolume > 0 && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-amber-600 dark:text-amber-300">Pending AML:</span>
                          <span className="font-mono-tabular font-bold text-amber-700 dark:text-amber-200">
                            {formatBdt(point.pendingVolume, lang)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400">Transactions:</span>
                        <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-200">
                          {point.txCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-emerald-600 dark:text-emerald-400">Admin Revenue:</span>
                        <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-300">
                          {formatBdt(point.adminFees, lang)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="settledVolume" name="Settled Volume" fill={settledBarFill} radius={[6, 6, 0, 0]} />
              <Bar dataKey="pendingVolume" name="Pending AML" fill={pendingBarFill} radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 dark:bg-indigo-500" />
            Settled Volume (BDT)
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 dark:bg-amber-500" />
            Pending 50K+ AML Review
          </span>
        </div>
        <span>Updates automatically on every live transaction</span>
      </div>
    </div>
  );
};
