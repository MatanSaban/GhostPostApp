'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Users,
  DollarSign,
  Mail,
  HelpCircle,
  Sparkles,
  Route,
  Shield,
  FileText,
  ArrowRight,
  Newspaper
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminPageSkeleton } from '@/app/dashboard/components';
import styles from '../website.module.css';
import adminStyles from '../../admin.module.css';

// Page config - icons and paths only, names from translations
const PAGE_CONFIG = [
  { id: 'home', path: '/', icon: Home },
  { id: 'about', path: '/about', icon: Users },
  { id: 'pricing', path: '/pricing', icon: DollarSign },
  { id: 'contact', path: '/contact', icon: Mail },
  { id: 'faq', path: '/faq', icon: HelpCircle },
  { id: 'features', path: '/features', icon: Sparkles },
  { id: 'howItWorks', path: '/how-it-works', icon: Route },
  { id: 'privacy', path: '/privacy', icon: Shield },
  { id: 'terms', path: '/terms', icon: FileText },
  { id: 'blog', path: '/blog', icon: Newspaper },
  { id: 'common', path: null, icon: FileText },
];

export default function WebsitePagesPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading } = useUser();

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isLoading, router]);

  if (isLoading || !isSuperAdmin) {
    return <AdminPageSkeleton statsCount={0} columns={3} />;
  }

  return (
    <div className={adminStyles.pageContainer}>
      <div className={adminStyles.pageHeader}>
        <div className={adminStyles.headerTop}>
          <h1 className={adminStyles.pageTitle}>
            <FileText className={adminStyles.titleIcon} />
            {t('websiteAdmin.pages.title')}
          </h1>
          <p className={adminStyles.pageSubtitle}>
            {t('websiteAdmin.pages.subtitle')}
          </p>
        </div>
      </div>

      <div className={styles.pagesGrid}>
        {PAGE_CONFIG.map(page => (
          <Link
            key={page.id}
            href={`/admin/website/pages/${page.id}`}
            className={styles.pageCard}
          >
            <div className={styles.pageIcon}>
              <page.icon size={20} />
            </div>
            <div className={styles.pageInfo}>
              <h3 className={styles.pageName}>{t(`websiteAdmin.pages.${page.id}`)}</h3>
              <p className={styles.pagePath}>
                {page.path || t('websiteAdmin.pages.commonPath')}
              </p>
            </div>
            <ArrowRight size={18} className={styles.pageArrow} />
          </Link>
        ))}
      </div>
    </div>
  );
}
