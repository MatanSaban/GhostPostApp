'use client';

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
  color = 'purple' 
}) {
  const Icon = iconMap[iconName] || Search;
  const isNeutral = trend === 'neutral';
  const isPositive = trend === 'up';
  const trendClass = isNeutral ? styles.neutral : isPositive ? styles.positive : styles.negative;

  return (
    <div className={`${styles.statsCard} ${styles[color]}`}>
      <div className={styles.statsCardGlow} />
      {badge && <div className={styles.statsCardBadge} data-tooltip={badgeTooltip || undefined}>{badge}</div>}
      <div className={styles.statsCardContent}>
        <div className={styles.statsCardHeader}>
          <div className={`${styles.statsIconWrapper} ${styles[color]}`}>
            <Icon className={`${styles.statsIcon} ${styles[color]}`} />
          </div>
          {trendValue && (
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
        <div className={styles.statsValue}>{value}</div>
        <div className={styles.statsLabel}>{label}</div>
      </div>
    </div>
  );
}

export default StatsCard;
