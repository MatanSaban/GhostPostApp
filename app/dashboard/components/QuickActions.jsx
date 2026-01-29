'use client';

import Link from 'next/link';
import { FileText, Target, Activity } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../page.module.css';

const iconMap = {
  FileText,
  Target,
  Activity,
};

export function QuickActions({ actions }) {
  return (
    <div className={styles.quickActions}>
      {actions.map((action, index) => {
        const Icon = iconMap[action.iconName] || FileText;
        return (
          <Link 
            key={index} 
            href={action.href}
            className={styles.quickActionItem}
          >
            <Icon size={20} />
            <span>{action.label}</span>
            <ArrowIcon size={16} className={styles.quickActionArrow} />
          </Link>
        );
      })}
    </div>
  );
}
