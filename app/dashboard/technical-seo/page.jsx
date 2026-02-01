'use client';

import Link from 'next/link';
import { 
  ImageIcon, 
  ArrowRightLeft,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './technical-seo.module.css';

const toolsConfig = [
  {
    id: 'redirections',
    icon: ArrowRightLeft,
    titleKey: 'tools.redirections.title',
    descriptionKey: 'tools.redirections.description',
    href: '/dashboard/technical-seo/redirections',
    color: 'blue',
  },
  {
    id: 'webp',
    icon: ImageIcon,
    titleKey: 'tools.webp.title',
    descriptionKey: 'tools.webp.description',
    href: '/dashboard/technical-seo/webp-converter',
    color: 'green',
  },
  {
    id: 'siteAudit',
    icon: Activity,
    titleKey: 'tools.siteAudit.title',
    descriptionKey: 'tools.siteAudit.description',
    href: '/dashboard/technical-seo/site-audit',
    color: 'orange',
  },
];

export default function ToolsOverviewPage() {
  const { t } = useLocale();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('tools.overview.title')}</h1>
        <p className={styles.subtitle}>{t('tools.overview.subtitle')}</p>
      </div>
      
      <div className={styles.toolsGrid}>
        {toolsConfig.map((tool) => {
          const Icon = tool.icon;
          return (
            <div key={tool.id} className={`${styles.toolOverviewCard} ${styles[tool.color]}`}>
              <div className={styles.toolOverviewHeader}>
                <div className={`${styles.toolOverviewIcon} ${styles[tool.color]}`}>
                  <Icon />
                </div>
                <h2 className={styles.toolOverviewTitle}>{t(tool.titleKey)}</h2>
              </div>
              <p className={styles.toolOverviewDescription}>{t(tool.descriptionKey)}</p>
              <Link href={tool.href} className={`${styles.toolOverviewButton} ${styles[tool.color]}`}>
                {t('tools.overview.openTool')}
                <ArrowRight className={styles.toolOverviewButtonIcon} />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
