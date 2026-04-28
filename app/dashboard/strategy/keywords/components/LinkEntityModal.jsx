'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, Check } from 'lucide-react';
import { useTranslation, useLocale } from '@/app/context/locale-context';
import styles from './LinkEntityModal.module.css';

/**
 * Modal for linking a keyword to an existing SiteEntity - page, post,
 * category, or any custom type the user has populated for their site.
 *
 * Props:
 *   isOpen    boolean
 *   onClose   () => void
 *   siteId    string - the current site
 *   keyword   { id, keyword } - keyword being linked
 *   onLinked  (keywordId, entity) => void - called with { id, title, url, entityTypeSlug, entityTypeName, entityTypeLabels }
 */
export function LinkEntityModal({ isOpen, onClose, siteId, keyword, onLinked }) {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [entities, setEntities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('__all__');
  const [linkingId, setLinkingId] = useState(null);
  const closeBtnRef = useRef(null);

  // Fetch entities once per open. Uses the existing /api/entities endpoint
  // which returns every entity across every enabled type for the site.
  const fetchEntities = useCallback(async () => {
    if (!siteId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/entities?siteId=${siteId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load entities');
      setEntities(Array.isArray(data.entities) ? data.entities : []);
    } catch (err) {
      console.error('[LinkEntityModal] load failed:', err);
      setError(err.message || 'Failed to load entities');
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchEntities();
  }, [isOpen, fetchEntities]);

  // Reset filters when closing so next open starts fresh.
  useEffect(() => {
    if (isOpen) return;
    setSearch('');
    setTypeFilter('__all__');
    setLinkingId(null);
    setError(null);
  }, [isOpen]);

  // Scroll-lock + focus close button on open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(focusTimer);
    };
  }, [isOpen]);

  // Esc closes (unless actively linking - don't interrupt the request).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && !linkingId) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, linkingId, onClose]);

  // Build the list of unique entity types available for filtering.
  const typeOptions = useMemo(() => {
    const map = new Map();
    for (const e of entities) {
      const slug = e.entityType?.slug || 'unknown';
      if (!map.has(slug)) {
        map.set(slug, {
          slug,
          name: e.entityType?.name || slug,
          labels: e.entityType?.labels || null,
        });
      }
    }
    return Array.from(map.values());
  }, [entities]);

  // Prefer the per-locale label when the site owner provided one.
  const labelForType = (opt) => {
    const fromLabels =
      opt?.labels?.[locale] ||
      opt?.labels?.[locale?.toLowerCase()] ||
      opt?.labels?.[locale?.toUpperCase?.()];
    return fromLabels || opt?.name || opt?.slug || '';
  };

  const filteredEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entities.filter((e) => {
      if (typeFilter !== '__all__' && (e.entityType?.slug || 'unknown') !== typeFilter) return false;
      if (!q) return true;
      return (
        (e.title || '').toLowerCase().includes(q) ||
        (e.url || '').toLowerCase().includes(q) ||
        (e.slug || '').toLowerCase().includes(q)
      );
    });
  }, [entities, search, typeFilter]);

  const handleLink = async (entity) => {
    if (!entity?.url || !keyword?.id) return;
    setLinkingId(entity.id);
    setError(null);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId: keyword.id, url: entity.url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to link entity');
      }
      onLinked?.(keyword.id, {
        id: entity.id,
        title: entity.title,
        url: entity.url,
        entityTypeSlug: entity.entityType?.slug || null,
        entityTypeName: entity.entityType?.name || null,
        entityTypeLabels: entity.entityType?.labels || null,
      });
      onClose();
    } catch (err) {
      console.error('[LinkEntityModal] link failed:', err);
      setError(err.message || 'Failed to link entity');
    } finally {
      setLinkingId(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !linkingId) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{t('keywordStrategy.linkModal.title')}</h2>
            {keyword?.keyword && (
              <div className={styles.keywordTag}>
                <span className={styles.keywordLabel}>{t('keywordStrategy.linkModal.keyword')}:</span>
                <span className={styles.keywordValue}>{keyword.keyword}</span>
              </div>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={!!linkingId}
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <p className={styles.subtitle}>{t('keywordStrategy.linkModal.subtitle')}</p>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('keywordStrategy.linkModal.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {typeOptions.length > 1 && (
            <div className={styles.filters}>
              <button
                type="button"
                className={`${styles.filterChip} ${typeFilter === '__all__' ? styles.filterChipActive : ''}`}
                onClick={() => setTypeFilter('__all__')}
              >
                {t('keywordStrategy.linkModal.allTypes')}
              </button>
              {typeOptions.map((opt) => (
                <button
                  key={opt.slug}
                  type="button"
                  className={`${styles.filterChip} ${typeFilter === opt.slug ? styles.filterChipActive : ''}`}
                  onClick={() => setTypeFilter(opt.slug)}
                >
                  {labelForType(opt)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.emptyState}>
              <Loader2 size={24} className={styles.spinner} />
              <p>{t('keywordStrategy.linkModal.loading')}</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <p className={styles.errorText}>{error}</p>
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className={styles.emptyState}>
              <p>{entities.length === 0
                ? t('keywordStrategy.linkModal.emptySite')
                : t('keywordStrategy.linkModal.empty')}</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {filteredEntities.map((entity) => {
                const typeSlug = entity.entityType?.slug;
                const typeName = labelForType({ ...entity.entityType }) || typeSlug;
                const isLinking = linkingId === entity.id;
                return (
                  <li key={entity.id}>
                    <button
                      type="button"
                      className={styles.entityRow}
                      onClick={() => handleLink(entity)}
                      disabled={!!linkingId}
                    >
                      <div className={styles.entityBody}>
                        <div className={styles.entityTitle}>{entity.title || entity.slug}</div>
                        {entity.url && (
                          <div className={styles.entityUrl} dir="ltr">{entity.url}</div>
                        )}
                      </div>
                      <div className={styles.entityMeta}>
                        {typeName && <span className={styles.typeBadge}>{typeName}</span>}
                        {isLinking
                          ? <Loader2 size={14} className={styles.spinner} />
                          : <Check size={14} className={styles.linkIcon} />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onClose}
            disabled={!!linkingId}
          >
            {t('keywordStrategy.linkModal.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
