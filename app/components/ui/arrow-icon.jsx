'use client';

import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';

export function ArrowIcon({ className, size }) {
  const { isRtl } = useLocale();
  const Icon = isRtl ? ArrowLeft : ArrowRight;
  return <Icon className={className} size={size} />;
}
