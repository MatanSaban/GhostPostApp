'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Globe,
  ExternalLink,
  FileText,
  Newspaper,
  Settings,
  ArrowRight
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminPageSkeleton } from '@/app/dashboard/components';
import styles from './website.module.css';
import adminStyles from '../admin.module.css';

// Section cards config (icons and colors only - text from translations)
const SECTION_CONFIG = {
  pages: { icon: FileText, color: 'var(--primary)' },
  blog: { icon: Newspaper, color: 'var(--success, #22c55e)' },
  settings: { icon: Settings, color: 'var(--warning, #f59e0b)' }
};

export default function WebsiteContentPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  if (isUserLoading || !isSuperAdmin) {
    return <AdminPageSkeleton statsCount={0} columns={3} />;
  }

  const previewUrl = process.env.NEXT_PUBLIC_GP_WS_URL || 'https://ghostpost.co.il';

  // Build sections with translations
  const sections = Object.entries(SECTION_CONFIG).map(([id, config]) => ({
    id,
    href: `/dashboard/admin/website/${id}`,
    icon: config.icon,
    color: config.color,
    title: t(`websiteAdmin.sections.${id}.title`),
    description: t(`websiteAdmin.sections.${id}.description`)
  }));

  return (
    <div className={adminStyles.pageContainer}>
      {/* Header */}
      <div className={adminStyles.pageHeader}>
        <div className={adminStyles.headerTop}>
          <h1 className={adminStyles.pageTitle}>
            <Globe className={adminStyles.titleIcon} />
            {t('websiteAdmin.title')}
          </h1>
          <p className={adminStyles.pageSubtitle}>
            {t('websiteAdmin.subtitle')}
          </p>
        </div>

        <a 
          href={previewUrl}
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.previewLink}
        >
          <ExternalLink size={16} />
          {t('websiteAdmin.visitWebsite')}
        </a>
      </div>

      {/* Section Cards */}
      <div className={styles.sectionGrid}>
        {sections.map(section => (
          <Link 
            key={section.id}
            href={section.href}
            className={styles.sectionCard}
          >
            <div 
              className={styles.sectionIcon}
              style={{ '--section-color': section.color }}
            >
              <section.icon size={24} />
            </div>
            <div className={styles.sectionContent}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <p className={styles.sectionDescription}>{section.description}</p>
            </div>
            <ArrowRight size={20} className={styles.sectionArrow} />
          </Link>
        ))}
      </div>
    </div>
  );
}
