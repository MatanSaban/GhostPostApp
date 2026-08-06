import Link from 'next/link';
import { Settings } from 'lucide-react';
import styles from './LockedSection.module.css';

// Wraps a dashboard section: renders children when unlocked, otherwise a
// blurred placeholder (matching the section's loading skeleton) with a
// centered connect-integration overlay.
export function LockedSection({ locked, children, placeholder, icon, title, description, ctaLabel, href = '/dashboard/settings?tab=integrations' }) {
  if (!locked) return children;
  return (
    <div className={styles.lockedSection}>
      <div className={styles.lockedPlaceholder} aria-hidden="true">
        {placeholder}
      </div>
      <div className={styles.lockedOverlay}>
        <div className={styles.lockedIcon}>{icon}</div>
        <h4 className={styles.lockedTitle}>{title}</h4>
        <p className={styles.lockedDescription}>{description}</p>
        <Link href={href} className={styles.lockedCtaBtn}>
          <Settings size={14} />
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

export default LockedSection;
