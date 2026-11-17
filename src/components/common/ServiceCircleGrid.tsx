import React from 'react';

export type ServiceCircleTone =
  | 'rose'
  | 'emerald'
  | 'cyan'
  | 'amber'
  | 'violet'
  | 'indigo'
  | 'sky'
  | 'pink';

export interface ServiceCircleItem {
  id: string;
  label: string;
  icon: React.ElementType;
  tone: ServiceCircleTone;
  onClick: () => void;
  active?: boolean;
  highlightTag?: string;
}

const TONE_CLASSES: Record<ServiceCircleTone, { circle: string; icon: string; ring: string }> = {
  rose: {
    circle: 'bg-rose-50/90 dark:bg-rose-950/55 border-rose-200/80 dark:border-rose-800/60',
    icon: 'text-rose-500 dark:text-rose-400',
    ring: 'ring-rose-500/35 border-rose-400',
  },
  emerald: {
    circle: 'bg-emerald-50/90 dark:bg-emerald-950/55 border-emerald-200/80 dark:border-emerald-800/60',
    icon: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500/35 border-emerald-400',
  },
  cyan: {
    circle: 'bg-cyan-50/90 dark:bg-cyan-950/55 border-cyan-200/80 dark:border-cyan-800/60',
    icon: 'text-cyan-600 dark:text-cyan-400',
    ring: 'ring-cyan-500/35 border-cyan-400',
  },
  amber: {
    circle: 'bg-amber-50/90 dark:bg-amber-950/55 border-amber-200/80 dark:border-amber-800/60',
    icon: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500/35 border-amber-400',
  },
  violet: {
    circle: 'bg-violet-50/90 dark:bg-violet-950/55 border-violet-200/80 dark:border-violet-800/60',
    icon: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500/35 border-violet-400',
  },
  indigo: {
    circle: 'bg-indigo-50/90 dark:bg-indigo-950/55 border-indigo-200/80 dark:border-indigo-800/60',
    icon: 'text-indigo-600 dark:text-indigo-400',
    ring: 'ring-indigo-500/35 border-indigo-400',
  },
  sky: {
    circle: 'bg-sky-50/90 dark:bg-sky-950/55 border-sky-200/80 dark:border-sky-800/60',
    icon: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-500/35 border-sky-400',
  },
  pink: {
    circle: 'bg-pink-50/90 dark:bg-pink-950/55 border-pink-200/80 dark:border-pink-800/60',
    icon: 'text-pink-600 dark:text-pink-400',
    ring: 'ring-pink-500/35 border-pink-400',
  },
};

interface ServiceCircleGridProps {
  items: ServiceCircleItem[];
  compact?: boolean;
}

export const ServiceCircleGrid: React.FC<ServiceCircleGridProps> = ({
  items,
  compact = false,
}) => {
  return (
    <div
      className={`grid grid-cols-4 ${
        compact ? 'gap-x-1.5 gap-y-3.5 sm:gap-x-3 sm:gap-y-4' : 'gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-5'
      }`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const palette = TONE_CLASSES[item.tone];
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="group min-h-[44px] flex flex-col items-center justify-start text-center gap-1.5 sm:gap-2 px-0.5 py-1 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-transform duration-150 active:scale-95 cursor-pointer"
          >
            <div
              className={`relative ${
                compact ? 'w-12 h-12 sm:w-13 sm:h-13' : 'w-13 h-13 sm:w-14 sm:h-14'
              } rounded-full border flex items-center justify-center transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-sm ${
                palette.circle
              } ${item.active ? `ring-2 ${palette.ring}` : ''}`}
            >
              <Icon className={`${compact ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-5.5 h-5.5 sm:w-6 sm:h-6'} stroke-[1.9] ${palette.icon}`} />
              {item.highlightTag && (
                <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded-md bg-rose-600 text-white text-[8px] font-bold leading-none shadow-xs">
                  {item.highlightTag}
                </span>
              )}
            </div>
            <span
              className={`text-[11px] sm:text-xs font-medium leading-[1.25] text-slate-700 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white max-w-[78px] sm:max-w-[92px] break-words line-clamp-2 ${
                item.active ? 'font-bold text-slate-950 dark:text-white' : ''
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
