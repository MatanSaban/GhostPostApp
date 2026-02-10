import Link from 'next/link';
import { 
  Search,
  Calendar,
  Sparkles,
  Users,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import styles from './strategy.module.css';

const strategyFeaturesConfig = [
  {
    id: 'siteProfile',
    icon: MessageSquare,
    titleKey: 'strategy.siteProfile.title',
    descriptionKey: 'strategy.siteProfile.cardDescription',
    href: '/dashboard/strategy/site-profile',
    color: 'teal',
  },
  {
    id: 'keywords',
    icon: Search,
    titleKey: 'strategy.keywords.title',
    descriptionKey: 'strategy.keywords.cardDescription',
    href: '/dashboard/strategy/keywords',
    color: 'purple',
  },
  {
    id: 'contentPlanner',
    icon: Calendar,
    titleKey: 'strategy.contentPlanner.title',
    descriptionKey: 'strategy.contentPlanner.cardDescription',
    href: '/dashboard/strategy/content-planner',
    color: 'blue',
  },
  {
    id: 'aiWizard',
    icon: Sparkles,
    titleKey: 'strategy.aiWizard.title',
    descriptionKey: 'strategy.aiWizard.cardDescription',
    href: '/dashboard/strategy/ai-content-wizard',
    color: 'lightBlue',
  },
  {
    id: 'competitorAnalysis',
    icon: Users,
    titleKey: 'strategy.competitorAnalysis.title',
    descriptionKey: 'strategy.competitorAnalysis.cardDescription',
    href: '/dashboard/strategy/competitors',
    color: 'orange',
  },
];

export default async function StrategyOverviewPage() {
  const t = await getTranslations();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('strategy.overview.title')}</h1>
        <p className={styles.subtitle}>{t('strategy.overview.subtitle')}</p>
      </div>
      
      <div className={styles.featuresGrid}>
        {strategyFeaturesConfig.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.id} className={`${styles.featureCard} ${styles[feature.color]}`}>
              <div className={styles.featureHeader}>
                <div className={`${styles.featureIcon} ${styles[feature.color]}`}>
                  <Icon />
                </div>
                <h2 className={styles.featureTitle}>{t(feature.titleKey)}</h2>
              </div>
              <p className={styles.featureDescription}>{t(feature.descriptionKey)}</p>
              <Link href={feature.href} className={`${styles.featureButton} ${styles[feature.color]}`}>
                {t('strategy.overview.openFeature')}
                <ArrowRight className={styles.featureButtonIcon} />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
