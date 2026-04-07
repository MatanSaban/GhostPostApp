'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Search, FileText, Twitter, Code } from 'lucide-react';
import styles from './SeoEditor.module.css';

const PAGES = [
  { key: 'home', label: 'Homepage', icon: Globe },
  { key: 'about', label: 'About', icon: FileText },
  { key: 'features', label: 'Features', icon: FileText },
  { key: 'how-it-works', label: 'How It Works', icon: FileText },
  { key: 'pricing', label: 'Pricing', icon: FileText },
  { key: 'contact', label: 'Contact', icon: FileText },
  { key: 'faq', label: 'FAQ', icon: FileText },
  { key: 'blog', label: 'Blog', icon: FileText },
  { key: 'privacy', label: 'Privacy Policy', icon: FileText },
  { key: 'terms', label: 'Terms of Service', icon: FileText }
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
              Search Engine
            </h4>
            
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Title
                <CharCounter current={pageSeo.title?.length || 0} max={70} />
              </label>
              <input
                type="text"
                value={pageSeo.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className={styles.textInput}
                placeholder="Page title for search engines"
              />
            </div>
            
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Description
                <CharCounter current={pageSeo.description?.length || 0} max={160} />
              </label>
              <textarea
                value={pageSeo.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                className={styles.textareaInput}
                rows={3}
                placeholder="Meta description for search results"
              />
            </div>
            
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Canonical URL</label>
                <input
                  type="text"
                  value={pageSeo.canonical || ''}
                  onChange={(e) => handleChange('canonical', e.target.value)}
                  className={styles.textInput}
                  placeholder={`/${pageKey === 'home' ? '' : pageKey}`}
                />
              </div>
              
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Robots</label>
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
              Open Graph
            </h4>
            
            <div className={styles.field}>
              <label className={styles.fieldLabel}>OG Title</label>
              <input
                type="text"
                value={pageSeo.ogTitle || ''}
                onChange={(e) => handleChange('ogTitle', e.target.value)}
                className={styles.textInput}
                placeholder="Leave empty to use page title"
              />
            </div>
            
            <div className={styles.field}>
              <label className={styles.fieldLabel}>OG Description</label>
              <textarea
                value={pageSeo.ogDescription || ''}
                onChange={(e) => handleChange('ogDescription', e.target.value)}
                className={styles.textareaInput}
                rows={2}
                placeholder="Leave empty to use meta description"
              />
            </div>
            
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>OG Image</label>
                <input
                  type="text"
                  value={pageSeo.ogImage || ''}
                  onChange={(e) => handleChange('ogImage', e.target.value)}
                  className={styles.textInput}
                  placeholder="/og/page.png (leave empty for dynamic)"
                />
              </div>
              
              <div className={styles.field}>
                <label className={styles.fieldLabel}>OG Type</label>
                <select
                  value={pageSeo.ogType || 'website'}
                  onChange={(e) => handleChange('ogType', e.target.value)}
                  className={styles.selectInput}
                >
                  {OG_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Twitter */}
          <div className={styles.seoSection}>
            <h4 className={styles.seoSectionTitle}>
              <Twitter size={14} />
              Twitter Card
            </h4>
            
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Card Type</label>
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
              Structured Data (JSON-LD)
            </h4>
            
            <div className={styles.field}>
              <label className={styles.fieldLabel}>JSON-LD</label>
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
                placeholder='{"@context": "https://schema.org", ...}'
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
  const handleChange = (field, value) => {
    onChange({ ...seo, [field]: value });
  };

  return (
    <div className={styles.singlePageEditor}>
      {/* Basic SEO */}
      <div className={styles.seoSection}>
        <h4 className={styles.seoSectionTitle}>
          <Search size={14} />
          Search Engine
        </h4>
        
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Title
            <CharCounter current={seo?.title?.length || 0} max={70} />
          </label>
          <input
            type="text"
            value={seo?.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            className={styles.textInput}
            placeholder="Page title for search engines"
          />
        </div>
        
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Description
            <CharCounter current={seo?.description?.length || 0} max={160} />
          </label>
          <textarea
            value={seo?.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            className={styles.textareaInput}
            rows={3}
            placeholder="Meta description for search results"
          />
        </div>
        
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Canonical URL</label>
            <input
              type="text"
              value={seo?.canonical || ''}
              onChange={(e) => handleChange('canonical', e.target.value)}
              className={styles.textInput}
              placeholder="/page-path"
            />
          </div>
          
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Robots</label>
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
          Open Graph
        </h4>
        
        <div className={styles.field}>
          <label className={styles.fieldLabel}>OG Title</label>
          <input
            type="text"
            value={seo?.ogTitle || ''}
            onChange={(e) => handleChange('ogTitle', e.target.value)}
            className={styles.textInput}
            placeholder="Leave empty to use page title"
          />
        </div>
        
        <div className={styles.field}>
          <label className={styles.fieldLabel}>OG Description</label>
          <textarea
            value={seo?.ogDescription || ''}
            onChange={(e) => handleChange('ogDescription', e.target.value)}
            className={styles.textareaInput}
            rows={2}
            placeholder="Leave empty to use meta description"
          />
        </div>
        
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>OG Image</label>
            <input
              type="text"
              value={seo?.ogImage || ''}
              onChange={(e) => handleChange('ogImage', e.target.value)}
              className={styles.textInput}
              placeholder="/og/page.png (leave empty for dynamic)"
            />
          </div>
          
          <div className={styles.field}>
            <label className={styles.fieldLabel}>OG Type</label>
            <select
              value={seo?.ogType || 'website'}
              onChange={(e) => handleChange('ogType', e.target.value)}
              className={styles.selectInput}
            >
              {OG_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Twitter */}
      <div className={styles.seoSection}>
        <h4 className={styles.seoSectionTitle}>
          <Twitter size={14} />
          Twitter Card
        </h4>
        
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Card Type</label>
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
          Structured Data (JSON-LD)
        </h4>
        
        <div className={styles.field}>
          <label className={styles.fieldLabel}>JSON-LD</label>
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
            placeholder='{"@context": "https://schema.org", ...}'
          />
        </div>
      </div>
    </div>
  );
}

export default function SeoEditor({ seo, onChange, pageId }) {
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
      {PAGES.map(page => (
        <PageSeoEditor
          key={page.key}
          pageKey={page.key}
          pageLabel={page.label}
          seo={seo}
          onChange={handlePageChange}
        />
      ))}
    </div>
  );
}
