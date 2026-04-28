'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Save,
  RefreshCw,
  Check,
  X,
  Download,
  Upload,
  Globe
} from 'lucide-react';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import { AdminPageSkeleton } from '@/app/dashboard/components';
import styles from '../website.module.css';
import adminStyles from '../../admin.module.css';

export default function WebsiteSettingsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [settings, setSettings] = useState({
    siteUrl: 'https://ghostseo.ai',
    twitterHandle: '',
    defaultOgImage: '/og/default.png',
    defaultRobots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    siteName: {
      en: 'GhostSEO',
      he: 'GhostSEO',
      fr: 'GhostSEO'
    }
  });

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  const flash = useCallback((type, msg) => setToast({ type, msg }), []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/website-content/seo');
      const data = await res.json();

      if (res.ok && data) {
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchSettings();
    }
  }, [isSuperAdmin, fetchSettings]);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSiteNameChange = (locale, value) => {
    setSettings(prev => ({
      ...prev,
      siteName: { ...prev.siteName, [locale]: value }
    }));
    setHasChanges(true);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/website-content/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!res.ok) throw new Error('Failed to save');

      flash('success', t('websiteAdmin.settings.saved'));
      setHasChanges(false);
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.settings.error'));
    } finally {
      setSaving(false);
    }
  };

  // Export all locale data
  const handleExport = async () => {
    try {
      const locales = ['en', 'he', 'fr'];
      const exportData = { settings };

      for (const locale of locales) {
        const res = await fetch(`/api/admin/website-content/${locale}`);
        const data = await res.json();
        exportData[locale] = {
          content: data.content,
          seo: data.seo
        };
      }

      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gp-ws-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash('success', t('websiteAdmin.toast.saved'));
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.toast.error'));
    }
  };

  // Import all locale data
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importData = JSON.parse(e.target.result);

          // Import settings
          if (importData.settings) {
            await fetch('/api/admin/website-content/seo', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(importData.settings)
            });
          }

          // Import locale data
          for (const locale of ['en', 'he', 'fr']) {
            if (importData[locale]) {
              await fetch(`/api/admin/website-content/${locale}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: importData[locale].content,
                  seo: importData[locale].seo,
                  saveDraft: false
                })
              });
            }
          }

          flash('success', t('websiteAdmin.toast.saved'));
          fetchSettings();
        } catch {
          flash('error', t('websiteAdmin.toast.error'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (isUserLoading || !isSuperAdmin) {
    return <AdminPageSkeleton statsCount={0} columns={2} />;
  }

  return (
    <div className={`${adminStyles.pageContainer} ${styles.settingsPage}`}>
      {/* Toast */}
      {toast && (
        <div className={`${adminStyles.toast} ${adminStyles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={adminStyles.pageHeader}>
        <div className={adminStyles.headerTop}>
          <h1 className={adminStyles.pageTitle}>
            <Settings className={adminStyles.titleIcon} />
            {t('websiteAdmin.settings.title')}
          </h1>
          <p className={adminStyles.pageSubtitle}>
            {t('websiteAdmin.settings.subtitle')}
          </p>
        </div>

        <div className={styles.editorActions}>
          <button onClick={handleExport} className={styles.actionButton}>
            <Download size={16} />
            {t('websiteAdmin.settings.exportAll')}
          </button>
          <button onClick={handleImport} className={styles.actionButton}>
            <Upload size={16} />
            {t('websiteAdmin.settings.importAll')}
          </button>
          <button
            onClick={saveSettings}
            className={styles.publishButton}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <>
                <RefreshCw size={16} className={styles.spinning} />
                {t('websiteAdmin.settings.saving')}
              </>
            ) : (
              <>
                <Save size={16} />
                {t('websiteAdmin.settings.saveChanges')}
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>{t('common.loading')}</span>
        </div>
      ) : (
        <>
          {/* General Settings */}
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>
              <Globe size={18} />
              {t('websiteAdmin.settings.general')}
            </h3>
            <div className={styles.settingsGrid}>
              <div className={styles.settingField}>
                <label>{t('websiteAdmin.settings.siteUrl')}</label>
                <input
                  type="url"
                  value={settings.siteUrl}
                  onChange={(e) => handleChange('siteUrl', e.target.value)}
                  className={styles.settingInput}
                />
                <small style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                  {t('websiteAdmin.settings.siteUrlHint')}
                </small>
              </div>
              <div className={styles.settingField}>
                <label>{t('websiteAdmin.settings.twitterHandle')}</label>
                <input
                  type="text"
                  value={settings.twitterHandle}
                  onChange={(e) => handleChange('twitterHandle', e.target.value)}
                  placeholder="@ghostpost"
                  className={styles.settingInput}
                />
                <small style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                  {t('websiteAdmin.settings.twitterHint')}
                </small>
              </div>
            </div>
          </div>

          {/* Site Name by Language */}
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>{t('websiteAdmin.settings.siteName')}</h3>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9375rem', marginBottom: '1rem' }}>
              {t('websiteAdmin.settings.siteNameByLocale')}
            </p>
            <div className={styles.settingsGrid}>
              <div className={styles.settingField}>
                <label>🇺🇸 {t('websiteAdmin.locales.en')}</label>
                <input
                  type="text"
                  value={settings.siteName?.en || ''}
                  onChange={(e) => handleSiteNameChange('en', e.target.value)}
                  className={styles.settingInput}
                />
              </div>
              <div className={styles.settingField}>
                <label>🇮🇱 {t('websiteAdmin.locales.he')}</label>
                <input
                  type="text"
                  value={settings.siteName?.he || ''}
                  onChange={(e) => handleSiteNameChange('he', e.target.value)}
                  className={styles.settingInput}
                />
              </div>
              <div className={styles.settingField}>
                <label>🇫🇷 {t('websiteAdmin.locales.fr')}</label>
                <input
                  type="text"
                  value={settings.siteName?.fr || ''}
                  onChange={(e) => handleSiteNameChange('fr', e.target.value)}
                  className={styles.settingInput}
                />
              </div>
            </div>
          </div>

          {/* SEO Defaults */}
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>{t('websiteAdmin.settings.seoDefaults')}</h3>
            <div className={styles.settingsGrid}>
              <div className={styles.settingField}>
                <label>{t('websiteAdmin.settings.defaultOgImage')}</label>
                <input
                  type="text"
                  value={settings.defaultOgImage}
                  onChange={(e) => handleChange('defaultOgImage', e.target.value)}
                  placeholder="/og/default.png"
                  className={styles.settingInput}
                />
                <small style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                  {t('websiteAdmin.settings.defaultOgImageHint')}
                </small>
              </div>
              <div className={styles.settingField}>
                <label>{t('websiteAdmin.settings.defaultRobots')}</label>
                <input
                  type="text"
                  value={settings.defaultRobots}
                  onChange={(e) => handleChange('defaultRobots', e.target.value)}
                  className={styles.settingInput}
                />
                <small style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                  {t('websiteAdmin.settings.defaultRobotsHint')}
                </small>
              </div>
            </div>
          </div>

          {/* Footer with save button */}
          <div className={styles.settingsFooter}>
            {hasChanges && (
              <span className={styles.unsavedBadge}>{t('common.saving')}</span>
            )}
            <button
              onClick={() => fetchSettings()}
              className={styles.actionButton}
              disabled={loading}
            >
              <RefreshCw size={16} />
              {t('common.refresh')}
            </button>
            <button
              onClick={saveSettings}
              className={styles.publishButton}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <>
                  <RefreshCw size={16} className={styles.spinning} />
                  {t('websiteAdmin.settings.saving')}
                </>
              ) : (
                <>
                  <Save size={16} />
                  {t('websiteAdmin.settings.saveChanges')}
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
