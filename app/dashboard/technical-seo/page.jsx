import Link from 'next/link';
import { 
  ImageIcon, 
  ArrowRightLeft,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import { PageHeader } from '../components';
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

export default async function ToolsOverviewPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        title={t('tools.overview.title')}
        subtitle={t('tools.overview.subtitle')}
      />
      
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
    </>
  );
}
