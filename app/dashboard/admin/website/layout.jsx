'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { FileText, Newspaper, Settings, Globe } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './layout.module.css';

// Navigation config - labels from translations
const NAV_ITEMS = [
  { href: '/dashboard/admin/website/pages', key: 'pages', icon: FileText },
  { href: '/dashboard/admin/website/blog', key: 'blog', icon: Newspaper },
  { href: '/dashboard/admin/website/settings', key: 'settings', icon: Settings },
];

export default function WebsiteLayout({ children }) {
  const pathname = usePathname();
  const { t } = useLocale();
 
  // Determine active nav item
  const getIsActive = (href) => {
    if (href === '/dashboard/admin/website/pages') {
      return pathname === href || pathname.startsWith('/dashboard/admin/website/pages/');
    }
    if (href === '/dashboard/admin/website/blog') {
      return pathname === href || pathname.startsWith('/dashboard/admin/website/blog/');
    }
    return pathname === href;
  };

  // Don't show nav on main landing page
  const isLandingPage = pathname === '/dashboard/admin/website';

  return (
    <div className={styles.websiteLayout}>
      {!isLandingPage && (
        <nav className={styles.subNav}>
          <Link href="/dashboard/admin/website" className={styles.backLink}>
            <Globe size={18} />
            <span>{t('websiteAdmin.title')}</span>
          </Link>
          <div className={styles.navDivider} />
          <div className={styles.navItems}>
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${getIsActive(item.href) ? styles.active : ''}`}
              >
                <item.icon size={16} />
                <span>{t(`websiteAdmin.sections.${item.key}.title`)}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
      {children}
    </div>
  );
}
