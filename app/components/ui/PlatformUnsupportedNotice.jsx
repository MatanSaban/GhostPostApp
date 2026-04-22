'use client';

import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './PlatformUnsupportedNotice.module.css';

/**
 * Renders when a feature isn't available for the active site's CMS platform.
 * Use it in pages/sections gated via `useCapabilities()` so merchants on
 * Shopify (or a future platform) don't see a broken WP-only experience.
 *
 * Props:
 *   feature      — display name of the feature (e.g. "WebP Converter")
 *   platform     — the active site's platform (e.g. "shopify")
 *   reason       — optional sentence explaining why it's unsupported
 *   showBackButton — whether to render the "Go to dashboard" CTA
 */
export function PlatformUnsupportedNotice({
  feature,
  platform,
  reason,
  showBackButton = true,
}) {
  const router = useRouter();
  const { t } = useLocale();

  const title = feature
    ? t('platform.unsupportedTitle', { feature }) || `${feature} isn't available for this site`
    : t('platform.unsupportedTitleGeneric') || "This feature isn't available for this site";

  const platformLabel = platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1)
    : null;

  const description =
    reason ||
    (platformLabel
      ? t('platform.unsupportedReason', { platform: platformLabel }) ||
        `This tool targets WordPress-specific capabilities, so it's disabled for ${platformLabel} sites.`
      : t('platform.unsupportedReasonGeneric') ||
        "This tool isn't supported on the current site's platform.");

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <Info className={styles.icon} />
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {showBackButton && (
          <button
            className={styles.button}
            onClick={() => router.push('/dashboard')}
          >
            {t('errors.goToDashboard') || 'Go to dashboard'}
          </button>
        )}
      </div>
    </div>
  );
}

export default PlatformUnsupportedNotice;
