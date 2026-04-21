'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Search, FileText, Twitter, Code } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './SeoEditor.module.css';

const PAGE_KEYS = [
  { key: 'home', icon: Globe },
  { key: 'about', icon: FileText },
  { key: 'features', icon: FileText },
  { key: 'how-it-works', icon: FileText },
  { key: 'pricing', icon: FileText },
  { key: 'contact', icon: FileText },
  { key: 'faq', icon: FileText },
  { key: 'blog', icon: FileText },
  { key: 'privacy', icon: FileText },
  { key: 'terms', icon: FileText }
];

const ROBOTS_OPTIONS = [
  'index, follow',
  'index, nofollow',
  'noindex, follow',
  'noindex, nofollow',
  'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1'
];

const OG_TYPES = ['website', 'article', 'product'];
const TWITTER_CARDS = ['summary', 'summary_large_image'];

function CharCounter({ current, max }) {
  const percentage = (current / max) * 100;
  let color = 'var(--color-text-tertiary)';
  if (percentage > 100) color = 'var(--color-error)';
  else if (percentage > 85) color = 'var(--color-warning)';
  
  return (
    <span className={styles.charCounter} style={{ color }}>
      {current}/{max}
    </span>
  );
}

function PageSeoEditor({ pageKey, pageLabel, seo, onChange }) {
  const { t } = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);

  const pageSeo = seo?.[pageKey] || {};
  
  const handleChange = (field, value) => {
    const newPageSeo = { ...pageSeo, [field]: value };
    onChange(pageKey, newPageSeo);
  };

  return (
    <div className={styles.pageSeo}>
      <div 
        className={styles.pageSeoHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className={styles.pageLabel}>{pageLabel}</span>
        <span className={styles.pageKey}>/{pageKey === 'home' ? '' : pageKey}</span>
      </div>
      
      {isExpanded && (
        <div className={styles.pageSeoContent}>
          {/* Basic SEO */}
          <div className={styles.seoSection}>
            <h4 className={styles.seoSectionTitle}>
              <Search size={14} />
              {t('admin.website.seoEditor.sections.searchEngine')}
            </h4>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                {t('admin.website.seoEditor.fields.title')}
                <CharCounter current={pageSeo.title?.length || 0} max={70} />
              </label>
              <input
                type="text"
                value={pageSeo.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className={styles.textInput}
                placeholder={t('admin.website.seoEditor.placeholders.pageTitle')}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                {t('admin.website.seoEditor.fields.description')}
                <CharCounter current={pageSeo.description?.length || 0} max={160} />
              </label>
              <textarea
                value={pageSeo.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                className={styles.textareaInput}
                rows={3}
                placeholder={t('admin.website.seoEditor.placeholders.metaDescription')}
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.canonicalUrl')}</label>
                <input
                  type="text"
                  value={pageSeo.canonical || ''}
                  onChange={(e) => handleChange('canonical', e.target.value)}
                  className={styles.textInput}
                  placeholder={`/${pageKey === 'home' ? '' : pageKey}`}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.robots')}</label>
                <select
                  value={pageSeo.robots || 'index, follow'}
                  onChange={(e) => handleChange('robots', e.target.value)}
                  className={styles.selectInput}
                >
                  {ROBOTS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Open Graph */}
          <div className={styles.seoSection}>
            <h4 className={styles.seoSectionTitle}>
              <Globe size={14} />
              {t('admin.website.seoEditor.sections.openGraph')}
            </h4>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogTitle')}</label>
              <input
                type="text"
                value={pageSeo.ogTitle || ''}
                onChange={(e) => handleChange('ogTitle', e.target.value)}
                className={styles.textInput}
                placeholder={t('admin.website.seoEditor.placeholders.leaveEmptyForPageTitle')}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogDescription')}</label>
              <textarea
                value={pageSeo.ogDescription || ''}
                onChange={(e) => handleChange('ogDescription', e.target.value)}
                className={styles.textareaInput}
                rows={2}
                placeholder={t('admin.website.seoEditor.placeholders.leaveEmptyForMetaDescription')}
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogImage')}</label>
                <input
                  type="text"
                  value={pageSeo.ogImage || ''}
                  onChange={(e) => handleChange('ogImage', e.target.value)}
                  className={styles.textInput}
                  placeholder={t('admin.website.seoEditor.placeholders.ogImagePath')}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogType')}</label>
                <select
                  value={pageSeo.ogType || 'website'}
                  onChange={(e) => handleChange('ogType', e.target.value)}
                  className={styles.selectInput}
                >
                  {OG_TYPES.map(ogType => (
                    <option key={ogType} value={ogType}>{ogType}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Twitter */}
          <div className={styles.seoSection}>
            <h4 className={styles.seoSectionTitle}>
              <Twitter size={14} />
              {t('admin.website.seoEditor.sections.twitterCard')}
            </h4>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.cardType')}</label>
              <select
                value={pageSeo.twitterCard || 'summary_large_image'}
                onChange={(e) => handleChange('twitterCard', e.target.value)}
                className={styles.selectInput}
              >
                {TWITTER_CARDS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* JSON-LD */}
          <div className={styles.seoSection}>
            <h4 className={styles.seoSectionTitle}>
              <Code size={14} />
              {t('admin.website.seoEditor.sections.structuredData')}
            </h4>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.jsonLd')}</label>
              <textarea
                value={pageSeo.jsonLd ? JSON.stringify(pageSeo.jsonLd, null, 2) : ''}
                onChange={(e) => {
                  try {
                    const parsed = e.target.value ? JSON.parse(e.target.value) : null;
                    handleChange('jsonLd', parsed);
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                className={`${styles.textareaInput} ${styles.codeInput}`}
                rows={6}
                placeholder={t('admin.website.seoEditor.placeholders.jsonLdExample')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Single page SEO editor (when editing one page)
function SinglePageSeoEditor({ seo, onChange }) {
  const { t } = useLocale();
  const handleChange = (field, value) => {
    onChange({ ...seo, [field]: value });
  };

  return (
    <div className={styles.singlePageEditor}>
      {/* Basic SEO */}
      <div className={styles.seoSection}>
        <h4 className={styles.seoSectionTitle}>
          <Search size={14} />
          {t('admin.website.seoEditor.sections.searchEngine')}
        </h4>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {t('admin.website.seoEditor.fields.title')}
            <CharCounter current={seo?.title?.length || 0} max={70} />
          </label>
          <input
            type="text"
            value={seo?.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            className={styles.textInput}
            placeholder={t('admin.website.seoEditor.placeholders.pageTitle')}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {t('admin.website.seoEditor.fields.description')}
            <CharCounter current={seo?.description?.length || 0} max={160} />
          </label>
          <textarea
            value={seo?.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            className={styles.textareaInput}
            rows={3}
            placeholder={t('admin.website.seoEditor.placeholders.metaDescription')}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.canonicalUrl')}</label>
            <input
              type="text"
              value={seo?.canonical || ''}
              onChange={(e) => handleChange('canonical', e.target.value)}
              className={styles.textInput}
              placeholder={t('admin.website.seoEditor.placeholders.pagePath')}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.robots')}</label>
            <select
              value={seo?.robots || 'index, follow'}
              onChange={(e) => handleChange('robots', e.target.value)}
              className={styles.selectInput}
            >
              {ROBOTS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Open Graph */}
      <div className={styles.seoSection}>
        <h4 className={styles.seoSectionTitle}>
          <Globe size={14} />
          {t('admin.website.seoEditor.sections.openGraph')}
        </h4>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogTitle')}</label>
          <input
            type="text"
            value={seo?.ogTitle || ''}
            onChange={(e) => handleChange('ogTitle', e.target.value)}
            className={styles.textInput}
            placeholder={t('admin.website.seoEditor.placeholders.leaveEmptyForPageTitle')}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogDescription')}</label>
          <textarea
            value={seo?.ogDescription || ''}
            onChange={(e) => handleChange('ogDescription', e.target.value)}
            className={styles.textareaInput}
            rows={2}
            placeholder={t('admin.website.seoEditor.placeholders.leaveEmptyForMetaDescription')}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogImage')}</label>
            <input
              type="text"
              value={seo?.ogImage || ''}
              onChange={(e) => handleChange('ogImage', e.target.value)}
              className={styles.textInput}
              placeholder={t('admin.website.seoEditor.placeholders.ogImagePath')}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.ogType')}</label>
            <select
              value={seo?.ogType || 'website'}
              onChange={(e) => handleChange('ogType', e.target.value)}
              className={styles.selectInput}
            >
              {OG_TYPES.map(ogType => (
                <option key={ogType} value={ogType}>{ogType}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Twitter */}
      <div className={styles.seoSection}>
        <h4 className={styles.seoSectionTitle}>
          <Twitter size={14} />
          {t('admin.website.seoEditor.sections.twitterCard')}
        </h4>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.cardType')}</label>
          <select
            value={seo?.twitterCard || 'summary_large_image'}
            onChange={(e) => handleChange('twitterCard', e.target.value)}
            className={styles.selectInput}
          >
            {TWITTER_CARDS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* JSON-LD */}
      <div className={styles.seoSection}>
        <h4 className={styles.seoSectionTitle}>
          <Code size={14} />
          {t('admin.website.seoEditor.sections.structuredData')}
        </h4>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('admin.website.seoEditor.fields.jsonLd')}</label>
          <textarea
            value={seo?.jsonLd ? JSON.stringify(seo.jsonLd, null, 2) : ''}
            onChange={(e) => {
              try {
                const parsed = e.target.value ? JSON.parse(e.target.value) : null;
                handleChange('jsonLd', parsed);
              } catch {
                // Invalid JSON, don't update
              }
            }}
            className={`${styles.textareaInput} ${styles.codeInput}`}
            rows={6}
            placeholder={t('admin.website.seoEditor.placeholders.jsonLdExample')}
          />
        </div>
      </div>
    </div>
  );
}

export default function SeoEditor({ seo, onChange, pageId }) {
  const { t } = useLocale();

  // Single page mode
  if (pageId) {
    return (
      <div className={styles.editor}>
        <SinglePageSeoEditor seo={seo} onChange={onChange} />
      </div>
    );
  }

  // Full mode - all pages
  const handlePageChange = (pageKey, pageSeo) => {
    const newSeo = { ...seo, [pageKey]: pageSeo };
    onChange(newSeo);
  };

  return (
    <div className={styles.editor}>
      {PAGE_KEYS.map(page => (
        <PageSeoEditor
          key={page.key}
          pageKey={page.key}
          pageLabel={t(`admin.website.seoEditor.pages.${page.key}`)}
          seo={seo}
          onChange={handlePageChange}
        />
      ))}
    </div>
  );
}
