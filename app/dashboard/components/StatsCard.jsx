'use client';

import { 
  TrendingUp, 
  TrendingDown,
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
  Calendar,
  Clock,
  Sparkles,
  Zap,
  RefreshCw,
  Settings
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
  Calendar,
  Clock,
  Sparkles,
  Zap,
  RefreshCw,
  Settings,
  TrendingUp,
  TrendingDown,
};

export function StatsCard({ 
  iconName, 
  value, 
  label, 
  trend, 
  trendValue, 
  color = 'purple' 
}) {
  const Icon = iconMap[iconName] || Search;
  const isPositive = trend === 'up';

  return (
    <div className={`${styles.statsCard} ${styles[color]}`}>
      <div className={styles.statsCardGlow} />
      <div className={styles.statsCardContent}>
        <div className={styles.statsCardHeader}>
          <div className={`${styles.statsIconWrapper} ${styles[color]}`}>
            <Icon className={`${styles.statsIcon} ${styles[color]}`} />
          </div>
          {trendValue && (
            <div className={`${styles.statsTrend} ${isPositive ? styles.positive : styles.negative}`}>
              {isPositive ? (
                <TrendingUp className={styles.trendIcon} />
              ) : (
                <TrendingDown className={styles.trendIcon} />
              )}
              <span>{trendValue}</span>
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
