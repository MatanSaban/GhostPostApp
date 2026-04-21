'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Save,
  Eye,
  RefreshCw,
  Check,
  X,
  Trash2,
  ExternalLink,
  Newspaper
} from 'lucide-react';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import { AdminPageSkeleton } from '@/app/dashboard/components';
import LocaleTabs from '../../_components/LocaleTabs';
import styles from '../../website.module.css';
import adminStyles from '../../../admin.module.css';

export default function EditBlogPostPage({ params }) {
  const { slug } = use(params);
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeLocale, setActiveLocale] = useState('en');
  const [hasChanges, setHasChanges] = useState(false);

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

  // Fetch post data
  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/website-blog/${slug}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch');

      setPostData(data);
      setHasChanges(false);
    } catch (e) {
      console.error('Failed to fetch post:', e);
      flash('error', t('websiteAdmin.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [slug, flash]);

  useEffect(() => {
    if (isSuperAdmin && slug) {
      fetchPost();
    }
  }, [isSuperAdmin, slug, fetchPost]);

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
    setHasChanges(true);
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
    setHasChanges(true);
  };

  const handleGlobalChange = (field, value) => {
    setPostData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/website-blog/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...postData, published: false })
      });

      if (!res.ok) throw new Error('Failed to save');

      flash('success', t('websiteAdmin.toast.draftSaved'));
      setHasChanges(false);
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
      const res = await fetch(`/api/admin/website-blog/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...postData, published: true })
      });

      if (!res.ok) throw new Error('Failed to publish');

      flash('success', t('websiteAdmin.blogEdit.updated'));
      setHasChanges(false);
      setPostData(prev => ({ ...prev, published: true }));
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.toast.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('websiteAdmin.blog.confirmDelete'))) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/website-blog/${slug}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete');

      flash('success', t('websiteAdmin.blog.deleteSuccess'));
      router.push('/admin/website/blog');
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.blog.deleteError'));
    }
  };

  if (isUserLoading || !isSuperAdmin) {
    return <AdminPageSkeleton statsCount={0} columns={2} />;
  }

  if (loading) {
    return (
      <div className={adminStyles.pageContainer}>
        <div className={styles.loadingState}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  const currentContent = postData.content?.[activeLocale] || {};
  const currentSeo = postData.seo?.[activeLocale] || {};
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
            <Newspaper size={24} />
            {postData.content?.en?.title || slug}
          </h1>
          <p className={styles.editorPath}>/blog/{slug}</p>
        </div>

        <div className={styles.editorActions}>
          <a
            href={`${previewUrl}/blog/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actionButton}
          >
            <ExternalLink size={16} />
            {t('common.view')}
          </a>
          <button
            onClick={handleDelete}
            className={styles.actionButton}
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 size={16} />
            {t('websiteAdmin.blog.delete')}
          </button>
          <button
            onClick={saveDraft}
            className={styles.draftButton}
            disabled={saving || !hasChanges}
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
                {postData.published ? t('common.save') : t('websiteAdmin.blogEdit.publish')}
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
        {hasChanges && (
          <span className={styles.unsavedBadge}>{t('common.saving')}</span>
        )}
      </div>

      {/* Editor Content */}
      <div className={styles.editorContent}>
        <div className={styles.settingsEditor}>
          {/* Global Fields */}
          <h3 className={styles.settingsTitle}>{t('websiteAdmin.blogEdit.slug')}</h3>
          <div className={styles.settingsGrid}>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blogEdit.slug')} (URL)</label>
              <input
                type="text"
                value={postData.slug}
                disabled
                className={styles.settingInput}
                style={{ opacity: 0.6 }}
              />
              <small style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                {t('websiteAdmin.blogEdit.slugPlaceholder')}
              </small>
            </div>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blogEdit.featuredImage')}</label>
              <input
                type="text"
                value={postData.featuredImage || ''}
                onChange={(e) => handleGlobalChange('featuredImage', e.target.value)}
                placeholder="/blog/featured.jpg"
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.blog.status')}</label>
              <span className={`${styles.blogStatus} ${postData.published ? styles.blogStatusPublished : styles.blogStatusDraft}`}>
                {postData.published ? t('websiteAdmin.blog.published') : t('websiteAdmin.blog.draft')}
              </span>
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
                value={currentContent.title || ''}
                onChange={(e) => handleContentChange('title', e.target.value)}
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('common.author') || 'Author'}</label>
              <input
                type="text"
                value={currentContent.author || ''}
                onChange={(e) => handleContentChange('author', e.target.value)}
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('common.date')}</label>
              <input
                type="date"
                value={currentContent.date || ''}
                onChange={(e) => handleContentChange('date', e.target.value)}
                className={styles.settingInput}
              />
            </div>
          </div>
          
          <div className={styles.settingField} style={{ marginTop: '1rem' }}>
            <label>{t('websiteAdmin.blogEdit.excerpt')}</label>
            <textarea
              value={currentContent.excerpt || ''}
              onChange={(e) => handleContentChange('excerpt', e.target.value)}
              rows={3}
              className={styles.settingInput}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className={styles.settingField} style={{ marginTop: '1rem' }}>
            <label>{t('websiteAdmin.blogEdit.content')}</label>
            <textarea
              value={currentContent.body || ''}
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
                value={currentSeo.title || ''}
                onChange={(e) => handleSeoChange('title', e.target.value)}
                className={styles.settingInput}
              />
            </div>
            <div className={styles.settingField}>
              <label>{t('websiteAdmin.seo.ogImage')}</label>
              <input
                type="text"
                value={currentSeo.ogImage || ''}
                onChange={(e) => handleSeoChange('ogImage', e.target.value)}
                placeholder="/og/blog-post.png"
                className={styles.settingInput}
              />
            </div>
          </div>
          
          <div className={styles.settingField} style={{ marginTop: '1rem' }}>
            <label>{t('websiteAdmin.blogEdit.metaDescription')}</label>
            <textarea
              value={currentSeo.description || ''}
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
