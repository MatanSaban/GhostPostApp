'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ImageIcon, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Settings2,
  Play,
  Pause,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from './tools.module.css';

export default function ToolsPage() {
  const { t } = useLocale();
  const { selectedSite } = useSite();
  
  // WebP Tool State
  const [autoConvert, setAutoConvert] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    webp: 0,
    nonWebp: 0,
    loading: true,
  });
  const [converting, setConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({
    current: 0,
    total: 0,
    converted: 0,
    failed: 0,
  });
  const [conversionError, setConversionError] = useState(null);
  const [conversionSuccess, setConversionSuccess] = useState(false);
  
  // Fetch settings on mount
  useEffect(() => {
    if (selectedSite?.id) {
      fetchSettings();
      fetchStats();
    }
  }, [selectedSite?.id]);
  
  const fetchSettings = async () => {
    if (!selectedSite?.id) return;
    
    setIsLoadingSettings(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/settings`);
      if (response.ok) {
        const data = await response.json();
        setAutoConvert(data.autoConvertToWebp ?? false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };
  
  const fetchStats = async () => {
    if (!selectedSite?.id) return;
    
    setStats(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/media-stats`);
      if (response.ok) {
        const data = await response.json();
        setStats({
          total: data.total ?? 0,
          webp: data.webp ?? 0,
          nonWebp: data.nonWebp ?? 0,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };
  
  const handleToggleAutoConvert = async () => {
    if (!selectedSite?.id) return;
    
    const newValue = !autoConvert;
    setIsSavingSettings(true);
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoConvertToWebp: newValue }),
      });
      
      if (response.ok) {
        setAutoConvert(newValue);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };
  
  const handleConvertAll = async () => {
    if (!selectedSite?.id || converting) return;
    
    setConverting(true);
    setConversionError(null);
    setConversionSuccess(false);
    setConversionProgress({ current: 0, total: stats.nonWebp, converted: 0, failed: 0 });
    
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/tools/convert-to-webp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Conversion failed');
      }
      
      const result = await response.json();
      setConversionProgress({
        current: result.total,
        total: result.total,
        converted: result.converted,
        failed: result.failed,
      });
      setConversionSuccess(true);
      
      // Refresh stats
      await fetchStats();
    } catch (error) {
      console.error('Conversion error:', error);
      setConversionError(error.message);
    } finally {
      setConverting(false);
    }
  };
  
  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('tools.title')}</h1>
          <p className={styles.subtitle}>{t('tools.subtitle')}</p>
        </div>
        <div className={styles.noSite}>
          <AlertCircle className={styles.noSiteIcon} />
          <p>{t('tools.selectSite')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('tools.title')}</h1>
        <p className={styles.subtitle}>{t('tools.subtitle')}</p>
      </div>
      
      {/* WebP Conversion Tool */}
      <div className={styles.toolCard}>
        <div className={styles.toolHeader}>
          <div className={styles.toolIcon}>
            <ImageIcon />
          </div>
          <div className={styles.toolInfo}>
            <h2 className={styles.toolTitle}>{t('tools.webp.title')}</h2>
            <p className={styles.toolDescription}>{t('tools.webp.description')}</p>
          </div>
        </div>
        
        {/* Auto Convert Toggle */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <Settings2 className={styles.settingIcon} />
            <div>
              <h3 className={styles.settingTitle}>{t('tools.webp.autoConvert')}</h3>
              <p className={styles.settingDescription}>{t('tools.webp.autoConvertDesc')}</p>
            </div>
          </div>
          <button 
            className={`${styles.toggle} ${autoConvert ? styles.toggleActive : ''}`}
            onClick={handleToggleAutoConvert}
            disabled={isLoadingSettings || isSavingSettings}
          >
            <span className={styles.toggleThumb}>
              {isSavingSettings ? (
                <Loader2 className={styles.toggleLoader} />
              ) : autoConvert ? (
                <Play className={styles.toggleIcon} />
              ) : (
                <Pause className={styles.toggleIcon} />
              )}
            </span>
          </button>
        </div>
        
        {/* Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.total}
            </span>
            <span className={styles.statLabel}>{t('tools.webp.totalImages')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statSuccess}`}>
            <span className={styles.statValue}>
              {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.webp}
            </span>
            <span className={styles.statLabel}>{t('tools.webp.webpImages')}</span>
          </div>
          <div className={`${styles.statCard} ${styles.statWarning}`}>
            <span className={styles.statValue}>
              {stats.loading ? <Loader2 className={styles.statLoader} /> : stats.nonWebp}
            </span>
            <span className={styles.statLabel}>{t('tools.webp.nonWebpImages')}</span>
          </div>
        </div>
        
        {/* Refresh Stats Button */}
        <button 
          className={styles.refreshButton}
          onClick={fetchStats}
          disabled={stats.loading}
        >
          <RefreshCw className={stats.loading ? styles.spinning : ''} />
          {t('tools.webp.refreshStats')}
        </button>
        
        {/* Convert All Button */}
        <div className={styles.actionSection}>
          <button 
            className={styles.convertButton}
            onClick={handleConvertAll}
            disabled={converting || stats.nonWebp === 0 || stats.loading}
          >
            {converting ? (
              <>
                <Loader2 className={styles.spinning} />
                {t('tools.webp.converting')} ({conversionProgress.current}/{conversionProgress.total})
              </>
            ) : (
              <>
                <ImageIcon />
                {t('tools.webp.convertAll')} ({stats.nonWebp})
              </>
            )}
          </button>
          
          {conversionSuccess && (
            <div className={styles.successMessage}>
              <CheckCircle2 />
              {t('tools.webp.conversionComplete', { 
                converted: conversionProgress.converted,
                failed: conversionProgress.failed 
              })}
            </div>
          )}
          
          {conversionError && (
            <div className={styles.errorMessage}>
              <AlertCircle />
              {conversionError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
