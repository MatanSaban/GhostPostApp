'use client';

import { 
  Sparkles, 
  Plus, 
  RefreshCw, 
  Zap, 
  Send, 
  Download,
  Upload,
  Settings,
  Search
} from 'lucide-react';
import styles from './shared.module.css';

const iconMap = {
  Sparkles,
  Plus,
  RefreshCw,
  Zap,
  Send,
  Download,
  Upload,
  Settings,
  Search,
};

export function PrimaryActionButton({ children, iconName = 'Sparkles', onClick, className = '' }) {
  const Icon = iconMap[iconName] || Sparkles;
  
  return (
    <button 
      className={`${styles.primaryActionButton} ${className}`}
      onClick={onClick}
    >
      <span className={styles.primaryActionButtonBg} />
      <span className={styles.primaryActionButtonGlow} />
      <span className={styles.primaryActionButtonContent}>
        <Icon size={18} />
        <span>{children}</span>
      </span>
    </button>
  );
}

export default PrimaryActionButton;
