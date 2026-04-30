'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Eye,
  RefreshCw,
  Check,
  X,
  FileText,
  Search,
  Image,
  Newspaper
} from 'lucide-react';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import LocaleTabs from '../../_components/LocaleTabs';
import styles from '../../website.module.css';
import adminStyles from '../../../admin.module.css';

export default function NewBlogPostPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeLocale, setActiveLocale] = useState('en');

  // Post data per locale
  const [postData, setPostData] = useState({
    slug: '',
    published: false,
    content: {
      en: { title: '', excerpt: '', body: '', author: '', date: '' },
      he: { title: '', excerpt: '', body: '', author: '', date: '' },
      fr: { title: '', excerpt: '', body: '', author: '', date: '' }
    },
    seo: {
      en: { title: '', description: '', ogImage: '' },
      he: { title: '', description: '', ogImage: '' },
      fr: { title: '', description: '', ogImage: '' }
    },
    featuredImage: ''
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

  const handleContentChange = (field, value) => {
    setPostData(prev => ({
      ...prev,
      content: {
        ...prev.content,
        [activeLocale]: {
          ...prev.content[activeLocale],
          [field]: value
        }
      }
    }));
  };

  const handleSeoChange = (field, value) => {
    setPostData(prev => ({
      ...prev,
      seo: {
        ...prev.seo,
        [activeLocale]: {
          ...prev.seo[activeLocale],
          [field]: value
        }
      }
    }));
  };

  const handleGlobalChange = (field, value) => {
    setPostData(prev => ({ ...prev, [field]: value }));
  };

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const saveDraft = async () => {
    if (!postData.slug) {
      flash('error', t('websiteAdmin.blogEdit.slug') + ' is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/website-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...postData, published: false })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      flash('success', t('websiteAdmin.toast.draftSaved'));
      router.push(`/admin/website/blog/${postData.slug}`);
    } catch (e) {
      console.error(e);
      flash('error', e.message || t('websiteAdmin.blogEdit.error'));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!postData.slug) {
      flash('error', t('websiteAdmin.blogEdit.slug') + ' is required');
      return;
    }

    if (!postData.content.en.title) {
      flash('error', t('websiteAdmin.blogEdit.title') + ' is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/website-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...postData, published: true })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');

      flash('success', t('websiteAdmin.blogEdit.created'));
      router.push('/admin/website/blog');
    } catch (e) {
      console.error(e);
      flash('error', e.message || t('websiteAdmin.blogEdit.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isUserLoading && !isSuperAdmin) {
    return null;
  }

  const currentContent = postData.content[activeLocale];
  const currentSeo = postData.seo[activeLocale];

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
            <Newspaper size={24} />
            {t('websiteAdmin.blogEdit.newPost')}
          </h1>
        </div>

        <div className={styles.editorActions}>
          <button
            onClick={saveDraft}
            className={styles.draftButton}
            disabled={saving}
          >
            <Save size={16} />
            {t('websiteAdmin.blogEdit.saveDraft')}
          </button>
          <button
            onClick={publish}
            className={styles.publishButton}
            disabled={saving}
          >
            {saving ? (
              <>
                <RefreshCw size={16} className={styles.spinning} />
                {t('websiteAdmin.blogEdit.saving')}
              </>
            ) : (
              <>
                <Eye size={16} />
                {t('websiteAdmin.blogEdit.publish')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Locale Tabs */}
      <div className={styles.localeBar}>
        <LocaleTabs
          activeLocale={activeLocale}
          onChange={setActiveLocale}
          draftStatus={{}}
        />
      </div>

      {/* Editor Content */}
      <div className={styles.editorContent}>
        <div className={styles.settingsEditor}>
          {/* Global Fields (slug, featured image) */}
          <h3 className={styles.settingsTitle}>{t('websiteAdmin.blogEdit.slug')}</h3>
          <div className={styles.settingsGrid}>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blogEdit.slug')} (URL)</label>
              <input
                type="text"
                value={postData.slug}
                onChange={(e) => handleGlobalChange('slug', generateSlug(e.target.value))}
                placeholder={t('websiteAdmin.blogEdit.slugPlaceholder')}
                className={styles.settingInput}
              />
              <small style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                /blog/{postData.slug || 'my-blog-post'}
              </small>
            </div>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blogEdit.featuredImage')}</label>
              <input
                type="text"
                value={postData.featuredImage}
                onChange={(e) => handleGlobalChange('featuredImage', e.target.value)}
                placeholder="/blog/featured.jpg"
                className={styles.settingInput}
              />
            </div>
          </div>

          {/* Content Fields */}
          <h3 className={styles.settingsTitle} style={{ marginTop: '2rem' }}>
            {t('websiteAdmin.blogEdit.content')} ({activeLocale.toUpperCase()})
          </h3>
          <div className={styles.settingsGrid}>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blogEdit.title')}</label>
              <input
                type="text"
                value={currentContent.title}
                onChange={(e) => handleContentChange('title', e.target.value)}
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('common.author') || 'Author'}</label>
              <input
                type="text"
                value={currentContent.author}
                onChange={(e) => handleContentChange('author', e.target.value)}
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('common.date')}</label>
              <input
                type="date"
                value={currentContent.date}
                onChange={(e) => handleContentChange('date', e.target.value)}
                className={styles.settingInput}
              />
            </div>
          </div>
          
          <div className={styles.settingField} style={{ marginTop: '1rem' }}>
            <label>{t('websiteAdmin.blogEdit.excerpt')}</label>
            <textarea
              value={currentContent.excerpt}
              onChange={(e) => handleContentChange('excerpt', e.target.value)}
              rows={3}
              className={styles.settingInput}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className={styles.settingField} style={{ marginTop: '1rem' }}>
            <label>{t('websiteAdmin.blogEdit.content')}</label>
            <textarea
              value={currentContent.body}
              onChange={(e) => handleContentChange('body', e.target.value)}
              rows={15}
              className={styles.settingInput}
              style={{ resize: 'vertical', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          {/* SEO Fields */}
          <h3 className={styles.settingsTitle} style={{ marginTop: '2rem' }}>
            {t('websiteAdmin.blogEdit.seo')} ({activeLocale.toUpperCase()})
          </h3>
          <div className={styles.settingsGrid}>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blogEdit.metaTitle')}</label>
              <input
                type="text"
                value={currentSeo.title}
                onChange={(e) => handleSeoChange('title', e.target.value)}
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.seo.ogImage')}</label>
              <input
                type="text"
                value={currentSeo.ogImage}
                onChange={(e) => handleSeoChange('ogImage', e.target.value)}
                placeholder="/og/blog-post.png"
                className={styles.settingInput}
              />
            </div>
          </div>
          
          <div className={styles.settingField} style={{ marginTop: '1rem' }}>
            <label>{t('websiteAdmin.blogEdit.metaDescription')}</label>
            <textarea
              value={currentSeo.description}
              onChange={(e) => handleSeoChange('description', e.target.value)}
              rows={3}
              className={styles.settingInput}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
