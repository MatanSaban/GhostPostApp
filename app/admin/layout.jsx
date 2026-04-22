'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield,
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  FileStack,
  Package,
  Ticket,
  Bot,
  MessageSquarePlus,
  Zap,
  Languages,
  Link2,
  Globe,
  HelpCircle,
  LifeBuoy,
  Eye,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { DashboardHeader } from '@/app/dashboard/components/DashboardHeader';
import { ImpersonationBanner } from '@/app/components/ImpersonationBanner';
import { PageMeta } from '@/app/components/PageMeta';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from '@/app/dashboard/dashboard.module.css';

const SECTIONS = [
  {
    titleKey: 'admin.nav.sections.overview',
    items: [
      { icon: LayoutDashboard, labelKey: 'admin.nav.overview', path: '/admin' },
    ],
  },
  {
    titleKey: 'admin.nav.sections.billing',
    items: [
      { icon: Building2, labelKey: 'nav.admin.accounts', path: '/admin/accounts' },
      { icon: Users, labelKey: 'nav.admin.users', path: '/admin/users' },
      { icon: CreditCard, labelKey: 'nav.admin.subscriptions', path: '/admin/subscriptions' },
      { icon: FileStack, labelKey: 'nav.admin.plans', path: '/admin/plans' },
      { icon: Package, labelKey: 'nav.admin.addons', path: '/admin/addons' },
      { icon: Ticket, labelKey: 'nav.admin.coupons', path: '/admin/coupons' },
    ],
  },
  {
    titleKey: 'admin.nav.sections.contentOps',
    items: [
      { icon: Bot, labelKey: 'nav.admin.interviewFlow', path: '/admin/interview-flow' },
      { icon: MessageSquarePlus, labelKey: 'nav.admin.pushQuestions', path: '/admin/push-questions' },
      { icon: Zap, labelKey: 'nav.admin.botActions', path: '/admin/bot-actions' },
    ],
  },
  {
    titleKey: 'admin.nav.sections.system',
    items: [
      { icon: Languages, labelKey: 'nav.admin.translations', path: '/admin/translations' },
      { icon: Link2, labelKey: 'nav.admin.backlinks', path: '/admin/backlinks' },
      { icon: Globe, labelKey: 'nav.admin.website', path: '/admin/website' },
      { icon: HelpCircle, labelKey: 'nav.admin.faq', path: '/admin/faq' },
      { icon: LifeBuoy, labelKey: 'nav.admin.support', path: '/admin/support' },
      { icon: Eye, labelKey: 'nav.admin.impersonation', path: '/admin/impersonation' },
    ],
  },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { user, isSuperAdmin, isLoading: isUserLoading, clearUser } = useUser();
  const [openSections, setOpenSections] = useState(() => SECTIONS.reduce((m, s) => (m[s.titleKey] = true, m), {}));

  useEffect(() => {
    if (!isUserLoading && (!user || !isSuperAdmin)) {
      router.replace('/dashboard');
    }
  }, [user, isSuperAdmin, isUserLoading, router]);

  if (isUserLoading || !user || !isSuperAdmin) return null;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    clearUser();
    router.push('/auth/login');
  };

  const toggleSection = (key) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className={styles.dashboardContainer}>
      <PageMeta />
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <Shield className={styles.logoIcon} style={{ color: '#7b2cbf' }} />
          <span className={styles.logoText}>{t('admin.nav.title')}</span>
        </div>

        <nav className={styles.navigation}>
          {SECTIONS.map((section) => {
            const isOpen = openSections[section.titleKey];
            return (
              <div key={section.titleKey} className={styles.navGroup}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.titleKey)}
                  className={`${styles.navItem} ${styles.navGroupToggle}`}
                  style={{ opacity: 0.7, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  <span className={styles.navLabel}>{t(section.titleKey)}</span>
                  <ChevronDown className={`${styles.navChevron} ${isOpen ? styles.navChevronOpen : ''}`} size={14} />
                </button>
                {isOpen && (
                  <div className={styles.navGroupItemsInner}>
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.path === '/admin'
                        ? pathname === '/admin'
                        : pathname === item.path || pathname.startsWith(item.path + '/');
                      return (
                        <Link
                          key={item.path}
                          href={item.path}
                          className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                        >
                          <Icon className={styles.navIcon} />
                          <span className={styles.navLabel}>{t(item.labelKey)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={styles.logoutSection}>
          <Link href="/dashboard" className={styles.logoutButton} style={{ marginBottom: '0.5rem' }}>
            <LayoutDashboard className={styles.navIcon} />
            <span>{t('admin.nav.exitToDashboard')}</span>
          </Link>
          <button onClick={handleLogout} className={styles.logoutButton}>
            <LogOut className={styles.navIcon} />
            <span>{t('auth.logout')}</span>
          </button>
        </div>
      </aside>

      <main className={styles.mainContent}>
        <ImpersonationBanner />
        <DashboardHeader variant="admin" />
        <div className={styles.contentArea}>
          <div className={`${styles.pageContainer} ${styles.pageIn}`}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
