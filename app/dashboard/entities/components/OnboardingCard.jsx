'use client';

import { useState } from 'react';
import { 
  Plug, 
  RefreshCw, 
  Download, 
  Loader2, 
  CheckCircle, 
  ArrowRight,
  FileText,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './OnboardingCard.module.css';

/**
 * OnboardingCard - A reusable component for guiding users through setup steps
 * 
 * @param {string} variant - 'connect' | 'connectNonWP' | 'sync' | 'empty' | 'success'
 * @param {function} onPrimaryAction - Handler for primary button
 * @param {function} onSecondaryAction - Handler for secondary button (optional)
 * @param {boolean} isLoading - Show loading state on primary button
 * @param {string} entityTypeName - Name of the entity type (e.g., "Pages", "Posts")
 * @param {object} site - The current site object
 */
export function OnboardingCard({
  variant = 'connect',
  onPrimaryAction,
  onSecondaryAction,
  isLoading = false,
  entityTypeName = '',
  site = null,
}) {
  const { t } = useLocale();

  const configs = {
    // WordPress site - Plugin not connected - need to install
    connect: {
      icon: Plug,
      iconColor: 'orange',
      title: t('entities.onboarding.connect.title'),
      description: t('entities.onboarding.connect.description'),
      primaryLabel: t('entities.onboarding.connect.downloadPlugin'),
      primaryIcon: Download,
      secondaryLabel: t('entities.onboarding.connect.viewInstructions'),
      secondaryIcon: ExternalLink,
      showSteps: true,
      steps: [
        t('entities.onboarding.connect.step1'),
        t('entities.onboarding.connect.step2'),
        t('entities.onboarding.connect.step3'),
      ],
    },
    // Non-WordPress site - use crawl/scan instead
    connectNonWP: {
      icon: Globe,
      iconColor: 'blue',
      title: t('entities.onboarding.connectNonWP.title'),
      description: t('entities.onboarding.connectNonWP.description'),
      primaryLabel: t('entities.onboarding.connectNonWP.scanWebsite'),
      primaryIcon: RefreshCw,
      secondaryLabel: null,
      showSteps: false,
    },
    // Plugin connected but no content synced yet
    sync: {
      icon: RefreshCw,
      iconColor: 'blue',
      title: t('entities.onboarding.sync.title'),
      description: t('entities.onboarding.sync.description', { entityName: entityTypeName }),
      primaryLabel: t('entities.onboarding.sync.syncNow'),
      primaryIcon: RefreshCw,
      secondaryLabel: null,
      showSteps: false,
    },
    // Synced but no content of this type exists on WordPress
    empty: {
      icon: FileText,
      iconColor: 'gray',
      title: t('entities.onboarding.empty.title', { entityName: entityTypeName }),
      description: t('entities.onboarding.empty.description', { entityName: entityTypeName }),
      primaryLabel: t('entities.onboarding.empty.syncAgain'),
      primaryIcon: RefreshCw,
      secondaryLabel: null,
      showSteps: false,
    },
    // Sync completed successfully
    success: {
      icon: CheckCircle,
      iconColor: 'green',
      title: t('entities.onboarding.success.title'),
      description: t('entities.onboarding.success.description', { entityName: entityTypeName }),
      primaryLabel: null,
      showSteps: false,
    },
  };

  const config = configs[variant] || configs.connect;
  const IconComponent = config.icon;
  const PrimaryIconComponent = config.primaryIcon;
  const SecondaryIconComponent = config.secondaryIcon;

  return (
    <div className={styles.onboardingCard}>
      <div className={`${styles.iconWrapper} ${styles[config.iconColor]}`}>
        <IconComponent className={styles.icon} />
      </div>

      <div className={styles.content}>
        <h3 className={styles.title}>{config.title}</h3>
        <p className={styles.description}>{config.description}</p>

        {config.showSteps && config.steps && (
          <ol className={styles.steps}>
            {config.steps.map((step, index) => (
              <li key={index} className={styles.step}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <span className={styles.stepText}>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className={styles.actions}>
        {config.primaryLabel && (
          <button 
            className={styles.primaryButton}
            onClick={onPrimaryAction}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className={styles.spinningIcon} />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <>
                {PrimaryIconComponent && <PrimaryIconComponent />}
                <span>{config.primaryLabel}</span>
              </>
            )}
          </button>
        )}
        
        {config.secondaryLabel && onSecondaryAction && (
          <button 
            className={styles.secondaryButton}
            onClick={onSecondaryAction}
          >
            {SecondaryIconComponent && <SecondaryIconComponent />}
            <span>{config.secondaryLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
