'use client';

import { useState } from 'react';
import { Eye, EyeOff, Globe, Share2, Twitter, Facebook } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../edit.module.css';

export function SEOFields({ seoData, onChange }) {
  const { t } = useLocale();
  const [activeSection, setActiveSection] = useState('general');

  const handleChange = (field, value) => {
    onChange({
      ...seoData,
      [field]: value,
    });
  };

  const handleNestedChange = (parent, field, value) => {
    onChange({
      ...seoData,
      [parent]: {
        ...(seoData?.[parent] || {}),
        [field]: value,
      },
    });
  };

  const sections = [
    { id: 'general', label: t('entities.edit.seo.general'), icon: Globe },
    { id: 'social', label: t('entities.edit.seo.social'), icon: Share2 },
    { id: 'advanced', label: t('entities.edit.seo.advanced'), icon: Eye },
  ];

  if (!seoData) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{t('entities.edit.seo.title')}</h3>
        </div>
        <div className={styles.cardContent}>
          <p style={{ color: 'var(--muted-foreground)' }}>
            {t('entities.edit.seo.noData')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.seoSection}>
      {/* SEO Plugin Info */}
      {seoData.plugin && (
        <div className={styles.card}>
          <div className={styles.cardContent} style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                fontSize: '0.75rem', 
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {t('entities.edit.seo.plugin')}:
              </span>
              <span style={{ 
                fontSize: '0.875rem', 
                fontWeight: 500,
                color: 'var(--foreground)',
                textTransform: 'capitalize',
              }}>
                {seoData.plugin} {seoData.version && `v${seoData.version}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className={styles.tabs} style={{ borderBottom: 'none', marginBottom: '-0.5rem' }}>
        {sections.map(section => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              className={`${styles.tab} ${activeSection === section.id ? styles.activeTab : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <Icon />
              {section.label}
            </button>
          );
        })}
      </div>

      {/* General SEO */}
      {activeSection === 'general' && (
        <>
          {/* SEO Preview */}
          <div className={styles.seoPreview}>
            <div className={styles.seoPreviewTitle}>
              {seoData.title || t('entities.edit.seo.noTitle')}
            </div>
            <div className={styles.seoPreviewUrl}>
              example.com › page-slug
            </div>
            <div className={styles.seoPreviewDescription}>
              {seoData.description || t('entities.edit.seo.noDescription')}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardContent}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* SEO Title */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.metaTitle')}
                  </label>
                  <input
                    type="text"
                    value={seoData.title || ''}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className={styles.textInput}
                    placeholder={t('entities.edit.seo.metaTitlePlaceholder')}
                  />
                  <span className={styles.fieldDescription}>
                    {(seoData.title?.length || 0)} / 60 {t('common.characters')}
                  </span>
                </div>

                {/* Meta Description */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.metaDescription')}
                  </label>
                  <textarea
                    value={seoData.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className={styles.textareaInput}
                    placeholder={t('entities.edit.seo.metaDescriptionPlaceholder')}
                    rows={3}
                  />
                  <span className={styles.fieldDescription}>
                    {(seoData.description?.length || 0)} / 160 {t('common.characters')}
                  </span>
                </div>

                {/* Focus Keyword */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.focusKeyword')}
                  </label>
                  <input
                    type="text"
                    value={seoData.focusKeyword || ''}
                    onChange={(e) => handleChange('focusKeyword', e.target.value)}
                    className={styles.textInput}
                    placeholder={t('entities.edit.seo.focusKeywordPlaceholder')}
                  />
                </div>

                {/* Canonical URL */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.canonicalUrl')}
                  </label>
                  <input
                    type="url"
                    value={seoData.canonical || ''}
                    onChange={(e) => handleChange('canonical', e.target.value)}
                    className={styles.textInput}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Social SEO */}
      {activeSection === 'social' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Open Graph */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <Facebook style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                Open Graph (Facebook)
              </h3>
            </div>
            <div className={styles.cardContent}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.ogTitle')}
                  </label>
                  <input
                    type="text"
                    value={seoData.og?.title || ''}
                    onChange={(e) => handleNestedChange('og', 'title', e.target.value)}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.ogDescription')}
                  </label>
                  <textarea
                    value={seoData.og?.description || ''}
                    onChange={(e) => handleNestedChange('og', 'description', e.target.value)}
                    className={styles.textareaInput}
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.ogImage')}
                  </label>
                  <input
                    type="url"
                    value={seoData.og?.image || ''}
                    onChange={(e) => handleNestedChange('og', 'image', e.target.value)}
                    className={styles.textInput}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Twitter Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <Twitter style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                Twitter Card
              </h3>
            </div>
            <div className={styles.cardContent}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.twitterTitle')}
                  </label>
                  <input
                    type="text"
                    value={seoData.twitter?.title || ''}
                    onChange={(e) => handleNestedChange('twitter', 'title', e.target.value)}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.twitterDescription')}
                  </label>
                  <textarea
                    value={seoData.twitter?.description || ''}
                    onChange={(e) => handleNestedChange('twitter', 'description', e.target.value)}
                    className={styles.textareaInput}
                    rows={2}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {t('entities.edit.seo.twitterImage')}
                  </label>
                  <input
                    type="url"
                    value={seoData.twitter?.image || ''}
                    onChange={(e) => handleNestedChange('twitter', 'image', e.target.value)}
                    className={styles.textInput}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced SEO */}
      {activeSection === 'advanced' && (
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Robots Index */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {t('entities.edit.seo.indexing')}
                </label>
                <div className={styles.toggleField}>
                  <div 
                    className={`${styles.toggle} ${seoData.robots?.index !== false ? styles.active : ''}`}
                    onClick={() => handleNestedChange('robots', 'index', !seoData.robots?.index)}
                  />
                  <div className={styles.toggleLabels}>
                    <span>{seoData.robots?.index !== false ? t('entities.edit.seo.indexYes') : t('entities.edit.seo.indexNo')}</span>
                    <span className={styles.toggleOffLabel}>
                      {t('entities.edit.seo.indexDescription')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Robots Follow */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {t('entities.edit.seo.following')}
                </label>
                <div className={styles.toggleField}>
                  <div 
                    className={`${styles.toggle} ${seoData.robots?.follow !== false ? styles.active : ''}`}
                    onClick={() => handleNestedChange('robots', 'follow', !seoData.robots?.follow)}
                  />
                  <div className={styles.toggleLabels}>
                    <span>{seoData.robots?.follow !== false ? t('entities.edit.seo.followYes') : t('entities.edit.seo.followNo')}</span>
                    <span className={styles.toggleOffLabel}>
                      {t('entities.edit.seo.followDescription')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
