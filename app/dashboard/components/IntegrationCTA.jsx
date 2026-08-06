import Link from 'next/link';
import { Settings } from 'lucide-react';
import styles from './IntegrationCTA.module.css';

export function IntegrationCTA({ icon: Icon, svgIcon, title, description, ctaLabel, href = '/dashboard/settings?tab=integrations' }) {
  return (
    <div className={styles.integrationCta}>
      <div className={styles.integrationCtaIcon}>
        {svgIcon || (Icon && <Icon size={24} />)}
      </div>
      <div className={styles.integrationCtaText}>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <Link href={href} className={styles.integrationCtaBtn}>
        <Settings size={14} />
        {ctaLabel}
      </Link>
    </div>
  );
}

export default IntegrationCTA;
