'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Newspaper,
  Edit,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  Check,
  X
} from 'lucide-react';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import styles from '../website.module.css';
import adminStyles from '../../admin.module.css';

export default function BlogPostsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);

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

  // Fetch blog posts
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/website-blog');
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      
      setPosts(data.posts || []);
    } catch (e) {
      console.error('Failed to fetch posts:', e);
      flash('error', t('websiteAdmin.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchPosts();
    }
  }, [isSuperAdmin, fetchPosts]);

  const handleDelete = async (slug) => {
    if (!confirm(t('websiteAdmin.blog.confirmDelete'))) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/website-blog/${slug}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete');

      flash('success', t('websiteAdmin.blog.deleteSuccess'));
      fetchPosts();
    } catch (e) {
      console.error(e);
      flash('error', t('websiteAdmin.blog.deleteError'));
    }
  };

  const filteredPosts = posts.filter(post =>
    post.title?.en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isUserLoading && !isSuperAdmin) {
    return null;
  }

  const previewUrl = process.env.NEXT_PUBLIC_GP_WS_URL || 'https://ghostseo.ai';

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
      <div className={adminStyles.pageHeader}>
        <div className={adminStyles.headerTop}>
          <h1 className={adminStyles.pageTitle}>
            <Newspaper className={adminStyles.titleIcon} />
            {t('websiteAdmin.blog.title')}
          </h1>
          <p className={adminStyles.pageSubtitle}>
            {t('websiteAdmin.blog.subtitle')}
          </p>
        </div>

        <Link href="/admin/website/blog/new" className={styles.publishButton}>
          <Plus size={16} />
          {t('websiteAdmin.blog.newPost')}
        </Link>
      </div>

      {/* Toolbar */}
      <div className={styles.blogToolbar}>
        <div className={adminStyles.searchWrapper}>
          <Search className={adminStyles.searchIcon} />
          <input
            type="text"
            placeholder={t('websiteAdmin.blog.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={adminStyles.searchInput}
          />
        </div>

        <button
          onClick={fetchPosts}
          className={styles.actionButton}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? styles.spinning : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Posts Table */}
      {loading ? (
        <div className={styles.loadingState}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>{t('common.loading')}</span>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className={styles.blogTable}>
          <div className={styles.emptyState}>
            <Newspaper size={48} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>
              {searchQuery ? t('websiteAdmin.blog.noResults') : t('websiteAdmin.blog.noResults')}
            </h3>
            <p className={styles.emptyDescription}>
              {searchQuery
                ? t('common.noResults')
                : t('websiteAdmin.blog.createFirst')
              }
            </p>
            {!searchQuery && (
              <Link href="/admin/website/blog/new" className={styles.publishButton}>
                <Plus size={16} />
                {t('websiteAdmin.blog.newPost')}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.blogTable}>
          <div className={styles.blogTableHeader}>
            <span>{t('common.title')} / Slug</span>
            <span>{t('websiteAdmin.blog.locales')}</span>
            <span>{t('websiteAdmin.blog.status')}</span>
            <span>{t('websiteAdmin.blog.actions')}</span>
          </div>

          {filteredPosts.map(post => (
            <div key={post.slug} className={styles.blogTableRow}>
              <div className={styles.blogTitleCell}>
                <span className={styles.blogTitle}>{post.title?.en || post.slug}</span>
                <span className={styles.blogSlug}>/blog/{post.slug}</span>
              </div>

              <div className={styles.blogLocales}>
                {['en', 'he', 'fr'].map(locale => (
                  post.locales?.includes(locale) && (
                    <span key={locale} className={styles.blogLocaleBadge}>
                      {locale}
                    </span>
                  )
                ))}
              </div>

              <div>
                <span className={`${styles.blogStatus} ${post.published ? styles.blogStatusPublished : styles.blogStatusDraft}`}>
                  {post.published ? t('websiteAdmin.blog.published') : t('websiteAdmin.blog.draft')}
                </span>
              </div>

              <div className={styles.blogActions}>
                <a
                  href={`${previewUrl}/blog/${post.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.blogActionBtn}
                  title={t('common.view')}
                >
                  <Eye size={16} />
                </a>
                <Link
                  href={`/admin/website/blog/${post.slug}`}
                  className={styles.blogActionBtn}
                  title={t('websiteAdmin.blog.edit')}
                >
                  <Edit size={16} />
                </Link>
                <button
                  onClick={() => handleDelete(post.slug)}
                  className={styles.blogActionBtn}
                  title={t('websiteAdmin.blog.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
