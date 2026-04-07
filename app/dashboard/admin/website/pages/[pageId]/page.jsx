'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Eye,
  RefreshCw,
  Check,
  X,
  FileText,
  Search,
  Home,
  Users,
  DollarSign,
  Mail,
  HelpCircle,
  Sparkles,
  Route,
  Shield,
  Newspaper,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import { AdminPageSkeleton } from '@/app/dashboard/components';
import LocaleTabs from '../../_components/LocaleTabs';
import ContentEditor from '../../_components/ContentEditor';
import SeoEditor from '../../_components/SeoEditor';
import styles from '../../website.module.css';
import adminStyles from '../../../admin.module.css';

// Page info mapping (icons, paths, and content keys)
// Each page maps to specific keys in the flat JSON dictionary
const PAGE_CONFIG = {
  home: { 
    path: '/', 
    icon: Home,
    // Home page uses these content sections
    contentKeys: ['hero', 'cta']
  },
  about: { 
    path: '/about', 
    icon: Users,
    contentKeys: ['about']
  },
  pricing: { 
    path: '/pricing', 
    icon: DollarSign,
    contentKeys: ['pricing']
  },
  contact: { 
    path: '/contact', 
    icon: Mail,
    contentKeys: ['contact']
  },
  faq: { 
    path: '/faq', 
    icon: HelpCircle,
    contentKeys: ['faq']
  },
  features: { 
    path: '/features', 
    icon: Sparkles,
    contentKeys: ['features']
  },
  howItWorks: { 
    path: '/how-it-works', 
    icon: Route,
    contentKeys: ['howItWorks']
  },
  privacy: { 
    path: '/privacy', 
    icon: Shield,
    contentKeys: ['privacy']
  },
  terms: { 
    path: '/terms', 
    icon: FileText,
    contentKeys: ['terms']
  },
  blog: { 
    path: '/blog', 
    icon: Newspaper,
    contentKeys: ['blog', 'blogPost']
  },
  common: { 
    path: null, 
    icon: FileText,
    // Common includes global sections used across pages
    contentKeys: ['metadata', 'nav', 'footer', 'auth', 'common']
  },
};

// Helper: Extract page-specific content from full dictionary
function extractPageContent(fullContent, pageId) {
  const config = PAGE_CONFIG[pageId];
  if (!config || !fullContent) return {};
  
  const pageContent = {};
  for (const key of config.contentKeys) {
    if (fullContent[key] !== undefined) {
      pageContent[key] = fullContent[key];
    }
  }
  return pageContent;
}

// Helper: Merge page content back into full dictionary
function mergePageContent(fullContent, pageId, pageContent) {
  const config = PAGE_CONFIG[pageId];
  if (!config) return fullContent;
  
  const merged = { ...fullContent };
  for (const key of config.contentKeys) {
    if (pageContent[key] !== undefined) {
      merged[key] = pageContent[key];
    }
  }
  return merged;
}

export default function EditPagePage({ params }) {
  const { pageId } = use(params);
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  
  const [activeLocale, setActiveLocale] = useState('en');
  const [activeTab, setActiveTab] = useState('content');
  
  const [localeData, setLocaleData] = useState({});
  const [draftStatus, setDraftStatus] = useState({});
  
  const [editedContent, setEditedContent] = useState(null);
  const [editedSeo, setEditedSeo] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const pageConfig = PAGE_CONFIG[pageId];
  const pageName = t(`websiteAdmin.pages.${pageId}`);
  const pagePath = pageConfig?.path || t('websiteAdmin.pages.commonPath');

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

  // Fetch data for a locale
  const fetchLocaleData = useCallback(async (locale) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/website-content/${locale}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch');

      setLocaleData(prev => ({ ...prev, [locale]: data }));
      
      // Extract page-specific content using the mapping
      const fullContent = data.contentDraft || data.content;
      const seo = data.seoDraft || data.seo;
      
      // Extract only the sections relevant to this page
      const pageContent = extractPageContent(fullContent, pageId);
      
      setEditedContent(pageContent);
      setEditedSeo(seo?.[pageId] || {});
      setHasChanges(false);
      
      setDraftStatus(prev => ({
        ...prev,
        [locale]: !!(data.contentDraft || data.seoDraft)
      }));
    } catch (e) {
      console.error('Failed to fetch locale data:', e);
      flash('error', t('websiteAdmin.pageEdit.loadError'));
    } finally {
      setLoading(false);
    }
  }, [flash, pageId, t]);

  useEffect(() => {
    if (isSuperAdmin && pageId) {
      fetchLocaleData(activeLocale);
    }
  }, [isSuperAdmin, pageId, activeLocale, fetchLocaleData]);

  const handleLocaleChange = (locale) => {
    if (hasChanges) {
      if (!confirm(t('common.unsavedChanges') || 'You have unsaved changes. Switch locale anyway?')) {
        return;
      }
    }
    setActiveLocale(locale);
    setHasChanges(false);
  };

  const handleContentChange = (newContent) => {
    setEditedContent(newContent);
    setHasChanges(true);
  };

  const handleSeoChange = (newSeo) => {
    setEditedSeo(newSeo);
    setHasChanges(true);
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const currentData = localeData[activeLocale];
      const baseContent = currentData?.contentDraft || currentData?.content || {};
      
      // Merge the edited page content back into the full dictionary
      const fullContent = mergePageContent(baseContent, pageId, editedContent);
      const fullSeo = { ...(currentData?.seoDraft || currentData?.seo || {}), [pageId]: editedSeo };

      const res = await fetch(`/api/admin/website-content/${activeLocale}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fullContent,
          seo: fullSeo,
          saveDraft: true
        })
      });

      if (!res.ok) throw new Error('Failed to save draft');

      flash('success', t('websiteAdmin.pageEdit.draftSaved'));
      setDraftStatus(prev => ({ ...prev, [activeLocale]: true }));
      setHasChanges(false);
      
      // Update local data
      setLocaleData(prev => ({
        ...prev,
        [activeLocale]: {
          ...prev[activeLocale],
          contentDraft: fullContent,
          seoDraft: fullSeo
        }
      }));
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.toast.error'));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    try {
      const currentData = localeData[activeLocale];
      const baseContent = currentData?.contentDraft || currentData?.content || {};
      
      // Merge the edited page content back into the full dictionary
      const fullContent = mergePageContent(baseContent, pageId, editedContent);
      const fullSeo = { ...(currentData?.seoDraft || currentData?.seo || {}), [pageId]: editedSeo };

      const res = await fetch(`/api/admin/website-content/${activeLocale}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fullContent,
          seo: fullSeo,
          saveDraft: false
        })
      });

      if (!res.ok) throw new Error('Failed to publish');

      flash('success', t('websiteAdmin.pageEdit.published'));
      setDraftStatus(prev => ({ ...prev, [activeLocale]: false }));
      setHasChanges(false);
      
      await fetchLocaleData(activeLocale);
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.toast.error'));
    } finally {
      setSaving(false);
    }
  };

  if (isUserLoading || !isSuperAdmin) {
    return <AdminPageSkeleton statsCount={0} columns={2} />;
  }

  if (!pageConfig) {
    return (
      <div className={adminStyles.pageContainer}>
        <p>{t('common.noResults')}</p>
        <Link href="/dashboard/admin/website/pages">{t('websiteAdmin.pageEdit.back')}</Link>
      </div>
    );
  }

  const PageIcon = pageConfig.icon;
  const previewUrl = process.env.NEXT_PUBLIC_GP_WS_URL || 'https://ghostpost.co.il';

  return (
    <div className={adminStyles.pageContainer}>
      {/* Toast */}
      {toast && (
        <div className={`${adminStyles.toast} ${adminStyles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={styles.editorHeader}>
        <div className={styles.editorTitleArea}>
          <h1 className={styles.editorTitle}>
            <PageIcon size={24} />
            {pageName}
          </h1>
          <p className={styles.editorPath}>{pagePath}</p>
        </div>

        <div className={styles.editorActions}>
          <a
            href={`${previewUrl}${pageConfig.path === '/' ? '' : pageConfig.path || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actionButton}
          >
            <ExternalLink size={16} />
            {t('common.view')}
          </a>
          <button
            onClick={saveDraft}
            className={styles.draftButton}
            disabled={saving || !hasChanges}
          >
            <Save size={16} />
            {t('websiteAdmin.pageEdit.saveDraft')}
          </button>
          <button
            onClick={publish}
            className={styles.publishButton}
            disabled={saving}
          >
            {saving ? (
              <>
                <RefreshCw size={16} className={styles.spinning} />
                {t('websiteAdmin.pageEdit.publishing')}
              </>
            ) : (
              <>
                <Eye size={16} />
                {t('websiteAdmin.pageEdit.publish')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Locale Tabs */}
      <div className={styles.localeBar}>
        <LocaleTabs
          activeLocale={activeLocale}
          onChange={handleLocaleChange}
          draftStatus={draftStatus}
        />
        {hasChanges && (
          <span className={styles.unsavedBadge}>{t('common.saving')}</span>
        )}
      </div>

      {/* Content/SEO Tabs */}
      <div className={styles.editorTabs}>
        <button
          className={`${styles.editorTab} ${activeTab === 'content' ? styles.editorTabActive : ''}`}
          onClick={() => setActiveTab('content')}
        >
          <FileText size={16} />
          {t('websiteAdmin.pageEdit.content')}
        </button>
        <button
          className={`${styles.editorTab} ${activeTab === 'seo' ? styles.editorTabActive : ''}`}
          onClick={() => setActiveTab('seo')}
        >
          <Search size={16} />
          {t('websiteAdmin.pageEdit.seo')}
        </button>
      </div>

      {/* Content Area */}
      <div className={styles.editorContent}>
        {loading ? (
          <div className={styles.loadingState}>
            <RefreshCw size={24} className={styles.spinning} />
            <span>{t('common.loading')}</span>
          </div>
        ) : activeTab === 'content' ? (
          <ContentEditor
            content={editedContent}
            onChange={handleContentChange}
            pageId={pageId}
          />
        ) : (
          <SeoEditor
            seo={editedSeo}
            onChange={handleSeoChange}
            pageId={pageId}
          />
        )}
      </div>
    </div>
  );
}
