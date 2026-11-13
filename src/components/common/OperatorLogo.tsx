import React from 'react';
import { OperatorId } from '../../types/acash';

export interface OperatorMeta {
  id: OperatorId;
  name: string;
  bnName: string;
  prefixes: string[];
  logoSrc: string;
  accentBg: string;
  accentBorder: string;
  textColor: string;
}

export const OPERATORS: OperatorMeta[] = [
  {
    id: 'gp',
    name: 'Grameenphone',
    bnName: 'গ্রামীণফোন',
    prefixes: ['017', '013'],
    logoSrc: '/assets/operators/gp.png',
    accentBg: 'bg-sky-500/15',
    accentBorder: 'border-sky-400/50',
    textColor: 'text-sky-600 dark:text-sky-300',
  },
  {
    id: 'robi',
    name: 'Robi',
    bnName: 'রবি',
    prefixes: ['018'],
    logoSrc: '/assets/operators/robi.png',
    accentBg: 'bg-rose-500/15',
    accentBorder: 'border-rose-400/50',
    textColor: 'text-rose-600 dark:text-rose-300',
  },
  {
    id: 'banglalink',
    name: 'Banglalink',
    bnName: 'বাংলালিংক',
    prefixes: ['019', '014'],
    logoSrc: '/assets/operators/banglalink.png',
    accentBg: 'bg-orange-500/15',
    accentBorder: 'border-orange-400/50',
    textColor: 'text-orange-600 dark:text-orange-300',
  },
  {
    id: 'airtel',
    name: 'Airtel',
    bnName: 'এয়ারটেল',
    prefixes: ['016'],
    logoSrc: '/assets/operators/airtel.png',
    accentBg: 'bg-red-500/15',
    accentBorder: 'border-red-400/50',
    textColor: 'text-red-600 dark:text-red-300',
  },
  {
    id: 'teletalk',
    name: 'Teletalk',
    bnName: 'টেলিটক',
    prefixes: ['015'],
    logoSrc: '/assets/operators/teletalk.png',
    accentBg: 'bg-emerald-500/15',
    accentBorder: 'border-emerald-400/50',
    textColor: 'text-emerald-600 dark:text-emerald-300',
  },
];

export function detectOperatorFromPhone(phone: string): OperatorId | null {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('880') ? digits.slice(2) : digits;
  if (normalized.length < 3) return null;
  const prefix = normalized.slice(0, 3);
  const found = OPERATORS.find((op) => op.prefixes.includes(prefix));
  return found ? found.id : null;
}

export const OperatorLogo: React.FC<{ operator: OperatorId; size?: number }> = ({
  operator,
  size = 34,
}) => {
  const meta = OPERATORS.find((op) => op.id === operator) || OPERATORS[0];
  const boxWidth = Math.round(size * 1.25);

  return (
    <div
      style={{ width: boxWidth, height: size }}
      className="rounded-xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center p-1 shrink-0 overflow-hidden"
    >
      <img
        src={meta.logoSrc}
        alt={meta.name}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    </div>
  );
};
