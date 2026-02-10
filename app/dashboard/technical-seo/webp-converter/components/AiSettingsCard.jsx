'use client';

import { Wand2, Sparkles, Loader2, Pause, ExternalLink, Trash2, Info, ChevronUp, ChevronDown } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../technical-seo.module.css';

export default function AiSettingsCard({
  aiSettings,
  isLoadingAiSettings,
  isSavingAiSettings,
  onUpdateAiSettings,
  imageRedirects,
  showRedirects,
  onToggleRedirects,
  onClearRedirects,
  onOpenModal,
  statsLoading,
}) {
  const { t } = useLocale();
  
  return (
    <>
      {/* AI Settings */}
      <div className={styles.aiSettings}>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <Wand2 className={styles.settingIcon} />
            <div>
              <h3 className={styles.settingTitle}>{t('tools.ai.autoOptimize')}</h3>
              <p className={styles.settingDescription}>{t('tools.ai.autoOptimizeDesc')}</p>
            </div>
          </div>
          <button 
            className={`${styles.toggle} ${aiSettings.enabled ? styles.toggleActive : ''}`}
            onClick={() => onUpdateAiSettings({ ...aiSettings, enabled: !aiSettings.enabled })}
            disabled={isLoadingAiSettings || isSavingAiSettings}
          >
            <span className={styles.toggleThumb}>
              {isSavingAiSettings ? (
                <Loader2 className={styles.toggleLoader} />
              ) : aiSettings.enabled ? (
                <Sparkles className={styles.toggleIcon} />
              ) : (
                <Pause className={styles.toggleIcon} />
              )}
            </span>
          </button>
        </div>
        
        {aiSettings.enabled && (
          <div className={styles.aiSubSettings}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={aiSettings.auto_filename}
                onChange={(e) => onUpdateAiSettings({ ...aiSettings, auto_filename: e.target.checked })}
                disabled={isSavingAiSettings}
              />
              <span>{t('tools.ai.autoFilename')}</span>
            </label>
            
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={aiSettings.auto_alt_text}
                onChange={(e) => onUpdateAiSettings({ ...aiSettings, auto_alt_text: e.target.checked })}
                disabled={isSavingAiSettings}
              />
              <span>{t('tools.ai.autoAltText')}</span>
            </label>
            
            <div className={styles.languageSelect}>
              <label>{t('tools.ai.language')}</label>
              <select 
                value={aiSettings.language}
                onChange={(e) => onUpdateAiSettings({ ...aiSettings, language: e.target.value })}
                disabled={isSavingAiSettings}
              >
                <option value="en">English</option>
                <option value="he">עברית</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </div>
        )}
      </div>
      
      {/* Redirects Display */}
      {imageRedirects.length > 0 && (
        <div className={styles.redirectsSection}>
          <button 
            className={styles.historyToggle}
            onClick={onToggleRedirects}
          >
            <ExternalLink />
            {t('tools.ai.imageRedirects')} ({imageRedirects.length})
            {showRedirects ? <ChevronUp /> : <ChevronDown />}
          </button>
          
          {showRedirects && (
            <div className={styles.redirectsList}>
              <div className={styles.historyInfo}>
                <Info className={styles.historyInfoIcon} />
                <span>{t('tools.ai.redirectsInfo')}</span>
              </div>
              {imageRedirects.slice(0, 10).map(([oldPath, redirect]) => (
                <div key={oldPath} className={styles.redirectItem}>
                  <span className={styles.redirectOld}>{oldPath}</span>
                  <span className={styles.redirectArrow}>→</span>
                  <span className={styles.redirectNew}>{redirect.target}</span>
                </div>
              ))}
              {imageRedirects.length > 10 && (
                <div className={styles.redirectsMore}>
                  +{imageRedirects.length - 10} {t('tools.ai.moreRedirects')}
                </div>
              )}
              <button 
                className={styles.clearQueueButton}
                onClick={onClearRedirects}
              >
                <Trash2 />
                {t('tools.ai.clearRedirects')}
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Optimize Button */}
      <div className={styles.actionSection}>
        <button 
          className={`${styles.convertButton} ${styles.aiButton}`}
          onClick={onOpenModal}
          disabled={statsLoading}
        >
          <Sparkles />
          {t('tools.ai.optimizeImages')}
        </button>
      </div>
    </>
  );
}
