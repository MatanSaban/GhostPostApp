'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  TrendingUp, 
  TrendingDown,
  Minus,
  Search,
  Target,
  BarChart2,
  Users,
  FileText,
  ArrowUpRight,
  Link,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Clock,
  Sparkles,
  Zap,
  RefreshCw,
  Settings,
  Database,
  FileEdit,
  MousePointer,
  Eye,
  Info,
  X,
} from 'lucide-react';
import styles from './shared.module.css';

const iconMap = {
  Search,
  Target,
  BarChart2,
  Users,
  FileText,
  ArrowUpRight,
  Link,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Clock,
  Sparkles,
  Zap,
  RefreshCw,
  Settings,
  TrendingUp,
  TrendingDown,
  Database,
  FileEdit,
  MousePointer,
  Eye,
};

export function StatsCard({ 
  iconName, 
  value, 
  label, 
  trend, 
  trendValue, 
  trendLabel,
  trendTooltip,
  badge,
  badgeTooltip,
  description,
  fullDescription,
  gotItLabel,
  loading = false,
  color = 'purple' 
}) {
  const Icon = iconMap[iconName] || Search;
  const isNeutral = trend === 'neutral';
  const isPositive = trend === 'up';
  const trendClass = isNeutral ? styles.neutral : isPositive ? styles.positive : styles.negative;
  const [showPopup, setShowPopup] = useState(false);

  const handleInfoClick = (e) => {
    e.stopPropagation();
    if (fullDescription) {
      setShowPopup(true);
    }
  };

  return (
    <div className={`${styles.statsCard} ${styles[color]} ${loading ? styles.loading : ''}`}>
      <div className={styles.statsCardGlow} />
      {badge && <div className={styles.statsCardBadge} data-tooltip={badgeTooltip || undefined}>{badge}</div>}
      <div className={styles.statsCardContent}>
        <div className={styles.statsCardHeader}>
          <div className={`${styles.statsIconWrapper} ${styles[color]}`}>
            <Icon className={`${styles.statsIcon} ${styles[color]}`} />
          </div>
          {loading ? (
            <div className={styles.skeletonTrend}>
              <div className={styles.skeletonTrendValue} />
              <div className={styles.skeletonTrendLabel} />
            </div>
          ) : trendValue && (
            <div
              className={`${styles.statsTrendWrap} ${trendTooltip ? styles.hasTooltip : ''}`}
              data-tooltip={trendTooltip || undefined}
            >
              <div className={`${styles.statsTrend} ${trendClass}`}>
                {isNeutral ? (
                  <>
                    <Minus className={styles.trendIcon} />
                    <span>{trendValue}</span>
                  </>
                ) : isPositive ? (
                  <>
                    <TrendingUp className={styles.trendIcon} />
                    <span>{trendValue}</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className={styles.trendIcon} />
                    <span>{trendValue}</span>
                  </>
                )}
              </div>
              {trendLabel && (
                <div className={styles.statsTrendLabel}>{trendLabel}</div>
              )}
            </div>
          )}
        </div>
        {loading ? (
          <div className={styles.skeletonValue} />
        ) : (
          <div className={styles.statsValue}>{value}</div>
        )}
        <div className={styles.statsLabelRow}>
          <span className={styles.statsLabel}>{label}</span>
          {description && (
            <span 
              className={`${styles.statsInfoIcon} ${styles.hasTooltip} ${fullDescription ? styles.clickable : ''}`} 
              data-tooltip={description}
              onClick={handleInfoClick}
            >
              <Info size={14} />
            </span>
          )}
        </div>
      </div>

      {/* KPI Info Popup */}
      {showPopup && fullDescription && typeof document !== 'undefined' && createPortal(
        <div className={styles.kpiPopupOverlay} onClick={() => setShowPopup(false)}>
          <div className={styles.kpiPopup} onClick={(e) => e.stopPropagation()}>
            <button className={styles.kpiPopupClose} onClick={() => setShowPopup(false)}>
              <X size={18} />
            </button>
            <div className={styles.kpiPopupHeader}>
              <div className={`${styles.kpiPopupIconBadge} ${styles[color]}`}>
                <Icon size={22} />
              </div>
              <h3 className={styles.kpiPopupTitle}>{fullDescription.title}</h3>
            </div>
            <div className={styles.kpiPopupSection}>
              <p className={styles.kpiPopupDescription}>{fullDescription.description}</p>
            </div>
            <div className={styles.kpiPopupSection}>
              <p className={styles.kpiPopupDetails}>{fullDescription.details}</p>
            </div>
            <button className={styles.kpiPopupDismiss} onClick={() => setShowPopup(false)}>
              {gotItLabel || 'Got it'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default StatsCard;
